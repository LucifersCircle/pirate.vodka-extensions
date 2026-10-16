import {
  PaperbackInterceptor,
  type Chapter,
  type ChapterDetails,
  type Request,
  type Response,
  type SourceManga,
  type SearchResultItem,
  type DiscoverSectionItem,
  type TestLogger,
} from "@paperback/types";
import { expect } from "chai";
import { TestSuite, registerDefaultTests } from "./suite.js";
import { Kagane, type KaganeImplementation } from "../Kagane/main.js";
import sourceInfo from "../Kagane/pbconfig.js";
import { API_URL, CONTENT_LANGUAGES_KEY, HOME_SECTION_METADATA_ID, SHOW_SUBTITLE_TYPE_KEY, SHOW_SUBTITLE_RATING_KEY } from "../Kagane/implementations/shared/models.js";
import type { TagDto } from "../Kagane/implementations/shared/models.js";
import type { SearchFilterValue } from "@paperback/types/lib/compat/0.8";
import { appendListingSubtitle } from "../Kagane/implementations/shared/listing-subtitle.js";
import { CUSTOM_HIDDEN_TAGS_KEY } from "../Kagane/implementations/shared/tag-options.js";

type Capture = [Response, ArrayBuffer];
class Probe extends PaperbackInterceptor {
  readonly captures = new Map<string, Capture>();
  readonly firstDetails = new Map<string, Capture>();
  override async interceptRequest(request: Request): Promise<Request> {
    return request;
  }
  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (request.url.startsWith(`${API_URL}/api/v2/`) && response.status === 200)
      this.captures.set(request.url, [response, data]);
    if (response.status === 200 && /^\/api\/v2\/series\/[^/]+$/.test(new globalThis.URL(request.url).pathname) && !this.firstDetails.has(request.url))
      this.firstDetails.set(request.url, [response, data]);
    return data;
  }
}

// Compare with the exact first detail response consumed by the native detail call.
export function assertKaganePublicationStatus(manga: SourceManga, capture: Capture) {
  const raw = JSON.parse(Application.arrayBufferToUTF8String(capture[1]));
  const expectedLabel = (value: unknown) => {
    const entry = typeof value === "string" ? [
      ["ongoing", "Ongoing"], ["completed", "Completed"],
      ["hiatus", "Hiatus"], ["abandoned", "Cancelled"],
    ].find(([name]) => name === value.trim().toLowerCase()) : undefined;
    return entry?.[1] ?? "Unknown";
  };
  expect(manga.mangaInfo.status, "native publication status").to.equal(expectedLabel(raw.publication_status));
  const upload = expectedLabel(raw.upload_status);
  expect(manga.mangaInfo.additionalInfo?.["Upload status"], "explicit upload progress").to.equal(upload === "Unknown" ? undefined : upload);
}

// Use only the already-resolved native reader URLs. No new manifest or metadata
// request, no Range, and no signed URL in diagnostics or returned evidence.
export async function assertKaganeReaderImageBytes(sourceManga: SourceManga, chapter: Chapter, reader: ChapterDetails) {
  expect(chapter.sourceManga === sourceManga, "original native chapter reference").to.equal(true);
  expect(reader.id === chapter.chapterId && reader.mangaId === sourceManga.mangaId, "native reader identity").to.equal(true);
  if (!("pages" in reader) || !Array.isArray(reader.pages) || !reader.pages.length)
    throw new Error("Kagane native reader has no image pages");
  const pages = reader.pages;
  const evidence: Array<{ page: number; bytes: number; format: string; contentLength?: number }> = [];
  for (const url of new Set([pages[0], pages[pages.length - 1]])) {
    const page = pages.indexOf(url) + 1, label = `Kagane reader page ${page}`;
    expect(typeof url === "string" && url.startsWith("https://"), `${label} native URL`).to.equal(true);
    let pair: [Response, ArrayBuffer];
    try { pair = await Application.scheduleRequest({ url, method: "GET" }); }
    catch { throw new Error(`${label} image request failed`); }
    const [response, data] = pair;
    expect(response.status === 200, `${label} HTTP status`).to.equal(true);
    const header = (name: string) => Object.entries(response.headers).find(([key]) => key.toLowerCase() === name)?.[1]?.trim();
    expect(/^image\//i.test(header("content-type") ?? ""), `${label} image MIME`).to.equal(true);
    const bytes = new Uint8Array(data), magic = String.fromCharCode(...bytes.slice(0, 16));
    expect(bytes.length, `${label} complete body bytes`).to.be.greaterThan(1024);
    const length = header("content-length"), encoding = header("content-encoding")?.toLowerCase();
    const identity = !encoding || encoding === "identity";
    const contentLength = length !== undefined && /^\d+$/.test(length) && Number.isSafeInteger(Number(length)) ? Number(length) : undefined;
    if (length !== undefined) expect(contentLength !== undefined, `${label} valid Content-Length`).to.equal(true);
    if (contentLength !== undefined && identity) expect(bytes.length, `${label} Content-Length completion`).to.equal(contentLength);
    let format: string;
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      format = "JPEG";
      expect(Array.from(bytes.slice(-2)), `${label} JPEG EOI`).to.deep.equal([0xff, 0xd9]);
    } else if (magic.startsWith("\x89PNG\r\n\x1a\n")) {
      format = "PNG";
      expect(Array.from(bytes.slice(-12)), `${label} PNG final IEND`).to.deep.equal([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
    } else if (magic.startsWith("GIF87a") || magic.startsWith("GIF89a")) {
      format = "GIF";
      expect(bytes[bytes.length - 1], `${label} GIF trailer`).to.equal(0x3b);
    } else if (magic.startsWith("RIFF") && magic.slice(8, 12) === "WEBP") {
      format = "WebP";
      expect(new DataView(data).getUint32(4, true) + 8, `${label} WebP complete file`).to.equal(bytes.length);
    } else if ((bytes[0] === 0xff && bytes[1] === 0x0a) || magic.startsWith("\0\0\0\x0cJXL \r\n\x87\n") || /^....ftypavi[fs]/s.test(magic)) {
      format = /^....ftypavi[fs]/s.test(magic) ? "AVIF" : "JPEG XL";
      expect(identity && contentLength !== undefined, `${label} complete transfer evidence`).to.equal(true);
    } else throw new Error(`${label} unsupported image signature`);
    evidence.push({ page, bytes: bytes.length, format, ...(contentLength !== undefined ? { contentLength } : {}) });
  }
  return evidence;
}

// Actual taxonomy/search response seeds, replayed only at the native request edge.
export async function assertKaganeTagFilters(tags: TagDto[], capture: Capture) {
  const source = Kagane as typeof Kagane & KaganeImplementation;
  const statusFilter = (await source.getSearchFilters()).find((filter) => filter.id === "statuses");
  if (statusFilter?.type !== "multiselect") throw new Error("Missing native upload-status filter");
  expect(statusFilter.title).to.equal("Upload Status");
  expect(statusFilter.options).to.deep.equal([
    { id: "Ongoing", value: "Ongoing" }, { id: "Completed", value: "Completed" },
    { id: "Abandoned", value: "Cancelled" }, { id: "Hiatus", value: "Hiatus" },
  ]);
  const tag = tags.find((entry) => /^[A-Za-z][A-Za-z ]+$/.test(entry.tag_name));
  if (!tag) throw new Error("No actual Kagane tag seed");
  const nameIds = tags.filter((entry) => entry.tag_name.trim().toLowerCase() === tag.tag_name.trim().toLowerCase()).map((entry) => entry.id);
  const schedule = Application.scheduleRequest;
  const saved = Application.getState(CUSTOM_HIDDEN_TAGS_KEY);
  Application.setState([], CUSTOM_HIDDEN_TAGS_KEY);
  const bodies: Array<Record<string, { values: string[]; exclude?: string[] }>> = [];
  Application.scheduleRequest = async (request) => {
    if (!request.url.includes("/api/v2/search/series")) return schedule(request);
    if (typeof request.body !== "string") throw new Error("Kagane search body must be JSON text");
    bodies.push(JSON.parse(request.body));
    const raw = JSON.parse(Application.arrayBufferToUTF8String(capture[1]));
    return [capture[0], new TextEncoder().encode(JSON.stringify({ ...raw, last: true })).buffer as ArrayBuffer];
  };
  const search = (metadata: unknown) => source.getSearchResults({ title: "", metadata: metadata as SearchFilterValue[] });
  try {
    await search([{ id: "statuses", value: { Completed: "included" } }]);
    expect(bodies.at(-1)?.upload_status, "saved upload-status request field").to.deep.equal(["Completed"]);
    expect(bodies.at(-1)?.publication_status, "no silently substituted publication filter").to.equal(undefined);
    for (const metadata of [
      [{ id: "tags_text", value: "__kagane_unknown_filter__" }],
      [{ id: "tags_text", value: "-__kagane_unknown_filter__" }],
      [{ id: "tags_text", value: `${tag.id}, __kagane_unknown_filter__` }],
      [{ id: "tags_text", value: "-" }], [{ id: "tags_text", value: {} }],
      [{ id: "tags", value: { __stale_tag__: "included" } }],
      [{ id: "tags", value: { __stale_tag__: "excluded" } }],
      [{ id: "tags", value: null }], [{ id: "tags", value: [] }],
      [{ id: "tags", value: { [tag.id]: "unknown" } }],
      [{ id: "tags_match_all", value: "unknown" }],
    ]) {
      const before = bodies.length;
      let error: unknown;
      try { await search(metadata); } catch (caught) { error = caught; }
      expect(String(error)).to.match(/(?:Unknown|Invalid) Kagane tag/);
      expect(bodies.length).to.equal(before);
    }
    for (const [metadata, values, exclude] of [
      [[{ id: "tags_text", value: tag.id }], [tag.id], undefined],
      [[{ id: "tags_text", value: `-${tag.id}` }], [], [tag.id]],
      [[{ id: "tags", value: { [tag.id]: "included" } }], nameIds, undefined],
      [[{ id: "tags_text", value: tag.tag_name.toUpperCase() }], nameIds, undefined],
    ] as const) {
      await search(metadata);
      expect(bodies.at(-1)?.tags.values).to.deep.equal(values);
      expect(bodies.at(-1)?.tags.exclude).to.deep.equal(exclude);
    }
    for (const metadata of [undefined, [], [{ id: "tags", value: {} }], [{ id: "tags_text", value: " , , " }]]) {
      await search(metadata);
      expect(bodies.at(-1)?.tags).to.equal(undefined);
    }
    Application.setState(["__stale_saved_tag__"], CUSTOM_HIDDEN_TAGS_KEY);
    const before = bodies.length;
    let error: unknown;
    try { await search([]); } catch (caught) { error = caught; }
    expect(String(error)).to.match(/Unknown Kagane tag/);
    expect(bodies.length).to.equal(before);
  } finally {
    Application.scheduleRequest = schedule;
    Application.setState(saved, CUSTOM_HIDDEN_TAGS_KEY);
  }
}

// Inspect the exact consumed bulk field, not a second probe or locally sorted
// copy. Ties are valid; unrated rows are omitted from rating comparisons,
// never coerced to zero. Chapter counts must be present nonnegative integers.
export function assertKaganeNumericSortOrder(capture: Capture, items: SearchResultItem[], field: "current_books" | "rating", ascending: boolean) {
  const raw = JSON.parse(Application.arrayBufferToUTF8String(capture[1])) as {
    content: Array<{ series_id: string; current_books?: number; rating?: number | null }>;
  };
  expect(raw.content.length, "native numeric sort sample").to.be.greaterThan(1);
  const values = raw.content.map((book) => book[field]);
  expect(values.every((value) => field === "rating" && value == null || typeof value === "number" && Number.isFinite(value) && value >= 0 && (field === "rating" ? value <= 100 : Number.isInteger(value))), `valid native ${field} values`).to.equal(true);
  const numeric = values.filter((value): value is number => typeof value === "number");
  expect(numeric.length, "insufficient numeric sort observations").to.be.greaterThan(1);
  expect(numeric.every((value, index) => index === 0 || (ascending ? numeric[index - 1] <= value : numeric[index - 1] >= value)), `${field} ${ascending ? "ascending" : "descending"}, allowing ties`).to.equal(true);
  const ids = new Set(items.map((item) => item.mangaId));
  expect(items.map((item) => item.mangaId), "native filtered result order").to.deep.equal(
    raw.content.filter((book) => ids.has(book.series_id)).map((book) => book.series_id),
  );
}

// Replay this run's unchanged actual search response at the native request edge.
// Saved-sort checks add no provider calls and never change search filters/body.
export async function assertKaganeSavedSorts(capture: Capture, source = Kagane as typeof Kagane & KaganeImplementation) {
  const sections = await source.getDiscoverSections();
  expect(sections.map(({ id, title }) => [id, title])).to.deep.equal([
    ["popular", "Popular"], ["trending", "Popularity"], ["latest", "Latest Updates"],
    ["recently-added", "Recently Added"], ["genres", "Genres"],
  ]);
  const popularity = sections.find((section) => section.id === "trending")!;
  const chips = await source.getDiscoverSectionItems(popularity);
  expect(chips.metadata).to.equal(undefined);
  expect(chips.items).to.deep.equal([
    ["Today", "avg_views_today,desc"], ["This Week", "avg_views_week,desc"],
    ["This Month", "avg_views_month,desc"], ["All Time", "avg_views,desc"],
  ].map(([name, sort]) => ({
    type: "genresCarouselItem", name,
    searchQuery: { title: "", metadata: [{ id: HOME_SECTION_METADATA_ID, value: sort }] },
  })));
  const options = await source.getSortingOptions();
  expect(options.map((option) => option.id)).to.deep.equal([
    "relevance", "total_views,desc", "avg_views,desc", "avg_views_today,desc",
    "avg_views_week,desc", "avg_views_month,desc", "updated_at,desc",
    "current_books,desc", "created_at,desc", "rating,desc", "updated_at,asc",
    "current_books,asc", "created_at,asc", "rating,asc",
  ]);
  expect(options.slice(6).map((option) => option.label)).to.deep.equal([
    "Updated newest", "Chapter count ↓", "Added newest", "Rating ↓",
    "Updated oldest", "Chapter count ↑", "Added oldest", "Rating ↑",
  ]);
  const schedule = Application.scheduleRequest;
  const requests: Request[] = [];
  Application.scheduleRequest = async (request) => {
    requests.push(request);
    if (!request.url.includes("/api/v2/search/series")) throw new Error("Unexpected request during saved-sort replay");
    return capture;
  };
  const query = { title: "", metadata: [{ id: "formats", value: { Manga: "included" as const } }] };
  try {
    const baseline = await source.getSearchResults(query, { page: 2 });
    const body = requests[0].body;
    expect(await source.getSearchResults(query, { page: 2 }, null as never), "whole-null optional sort keeps Relevance").to.deep.equal(baseline);
    expect(new globalThis.URL(requests.at(-1)!.url).searchParams.get("sort")).to.equal(null);
    expect(requests.at(-1)!.body).to.equal(body);
    for (const [id, expected] of [
      [undefined, null], ...options.map((option) => [option.id, option.id === "relevance" ? null : option.id]),
      ["books_count", "current_books,desc"], ["books_count,asc", "current_books,asc"],
      ["books_count,desc", "current_books,desc"],
    ] as Array<[string | undefined, string | null]>) {
      const result = await source.getSearchResults(query, { page: 2 }, id === undefined ? undefined : { id, label: "Saved sort" });
      const request = requests.at(-1)!;
      const url = new globalThis.URL(request.url);
      expect(url.searchParams.get("sort")).to.equal(expected);
      expect(url.searchParams.get("page")).to.equal("1");
      expect(request.body).to.equal(body);
      expect(result).to.deep.equal(baseline);
    }
    for (const id of ["series_name", "series_name,asc", "series_name,desc", "series_name,invalid"]) {
      const before = requests.length;
      let error: unknown;
      try { await source.getSearchResults({ ...query, metadata: [...query.metadata, { id: "tags_text", value: "__unresolved_sort_tag__" }] }, undefined, { id, label: "Saved By Name" }); }
      catch (caught) { error = caught; }
      expect(String(error)).to.match(/no longer supports By Name.*Choose another sort/);
      expect(requests.length, "name sort rejected before any request").to.equal(before);
    }
    for (const id of ["books_count,invalid", "books_count,asc,desc", "books_count,"]) {
      const before = requests.length;
      let error: unknown;
      try { await source.getSearchResults(query, undefined, { id, label: "Malformed saved sort" }); }
      catch (caught) { error = caught; }
      expect(String(error)).to.match(/Invalid Kagane Books Count.*Choose another sort/);
      expect(requests.length, "invalid direction rejected before any request").to.equal(before);
    }
    for (const id of [null, 42, {}, "", "rating", "rating,ASC", "rating,sideways", "created_at,sideways", "updated_at,asc,desc", "total_views,asc", "current_books", "popular_now,desc", "unknown"]) {
      const before = requests.length;
      let error: unknown;
      try { await source.getSearchResults({ ...query, metadata: [...query.metadata, { id: "tags_text", value: "__unresolved_sort_tag__" }] }, undefined, { id: id as string, label: "Unsupported sort" }); }
      catch (caught) { error = caught; }
      expect(String(error)).to.match(/Unknown Kagane sort.*Choose another sort/);
      expect(requests.length, "unsupported sort rejected before taxonomy or search").to.equal(before);
    }
    for (const sort of ["avg_views_today,desc", "avg_views_week,desc", "avg_views_month,desc", "avg_views,desc"]) {
      const homeQuery = { title: "ignored", metadata: [{ id: HOME_SECTION_METADATA_ID, value: sort }] };
      expect(await source.getSortingOptions(homeQuery)).to.deep.equal([]);
      await source.getSearchResults(homeQuery, undefined, { id: "series_name,desc", label: "Ignored in home context" });
      expect(new globalThis.URL(requests.at(-1)!.url).searchParams.get("sort")).to.equal(sort);
      const homeBody = JSON.parse(requests.at(-1)!.body as string);
      expect(homeBody.title).to.equal(undefined);
      expect(homeBody.format).to.equal(undefined);
    }
  } finally {
    Application.scheduleRequest = schedule;
  }
}

// Replay only this run's actual target responses, changing language metadata only.
// This checks the built-native boundary, not provider language or iOS UI coverage.
export async function assertKaganeLanguageEntryPoints(
  sourceManga: SourceManga,
  captures: Map<string, Capture>,
) {
  const schedule = Application.scheduleRequest;
  const saved = Application.getState(CONTENT_LANGUAGES_KEY);
  const source = Kagane as typeof Kagane & KaganeImplementation;
  const url = `${API_URL}/api/v2/series/${sourceManga.mangaId}`;
  const capture = captures.get(url);
  if (!capture) throw new Error("No current live Kagane detail response for language boundaries");
  const raw = JSON.parse(Application.arrayBufferToUTF8String(capture[1])) as Record<
    string,
    unknown
  >;
  expect(raw.translated_language).to.equal("en");
  let translated: unknown = raw.translated_language;
  const requests: Request[] = [];
  Application.scheduleRequest = async (request) => {
    if (request.url === url) {
      requests.push(request);
      const data = { ...raw, translated_language: translated };
      return [capture[0], new TextEncoder().encode(JSON.stringify(data)).buffer as ArrayBuffer];
    }
    if (request.url.startsWith(`${url}/books`)) {
      requests.push(request);
      const prior = captures.get(request.url);
      if (!prior)
        throw new Error("Uncaptured Kagane chapter continuation in language boundary check");
      return prior;
    }
    // Do not intercept another source or fabricate taxonomy, manifests or tokens.
    return schedule(request);
  };
  try {
    // This run's real English series must not become Spanish when preferences reorder.
    Application.setState(["es", "en"], CONTENT_LANGUAGES_KEY);
    const baseline = await source.getChapters(sourceManga);
    expect(baseline.length).to.be.greaterThan(0);
    expect(baseline.every((chapter) => chapter.langCode === "en")).to.equal(true);
    expect(baseline[0].sourceManga).to.equal(sourceManga);
    const cases: [unknown, string][] = [
      [undefined, "und"],
      [null, "und"],
      ["", "und"],
      ["  ", "und"],
      ["unk", "und"],
      ["und", "und"],
      ["UNKNOWN", "und"],
      [42, "und"],
      [{}, "und"],
      [[], "und"],
      ["en--US", "und"],
      ["English", "und"],
      ["https://invalid", "und"],
      ["en-US-US", "und"],
      ["es", "es"],
      [" es ", "es"],
      ["pt-br", "pt-BR"],
      ["pt-BR", "pt-BR"],
      ["pt", "pt"],
      ["es-la", "es-419"],
      ["es-419", "es-419"],
      ["zh-hk", "zh-HK"],
      ["zh-Hans", "zh-Hans"],
      ["zh-Hant", "zh-Hant"],
      ["en_US", "en-US"],
      ["iw", "he"],
      ["in", "id"],
      ["ji", "yi"],
      ["ja-ro", "ja-Latn"],
      ["fil", "fil"],
      ["pt-la", "pt-BR"],
      ["ko-ro", "ko-Latn"],
      ["zh-ro", "zh-Latn"],
    ];
    for (const [value, expected] of cases) {
      translated = value;
      Application.setState(["es", "en"], CONTENT_LANGUAGES_KEY);
      const start = requests.length;
      const chapters = await source.getChapters(sourceManga);
      expect(chapters.every((chapter) => chapter.langCode === expected)).to.equal(true);
      expect(chapters.map(({ langCode: _language, ...chapter }) => chapter)).to.deep.equal(
        baseline.map(({ langCode: _language, ...chapter }) => chapter),
      );
      const paths = requests
        .slice(start)
        .map((request) => new globalThis.URL(request.url).pathname);
      expect(paths.filter((path) => !path.includes("/books"))).to.deep.equal([
        `/api/v2/series/${sourceManga.mangaId}`,
      ]);
      expect(
        paths.every(
          (path) =>
            path === `/api/v2/series/${sourceManga.mangaId}` ||
            path.startsWith(`/api/v2/series/${sourceManga.mangaId}/books`),
        ),
      ).to.equal(true);
    }
  } finally {
    Application.scheduleRequest = schedule;
    Application.setState(saved, CONTENT_LANGUAGES_KEY);
  }
}

// Closed native probes reuse only this run's bulk response, with no provider calls.
export async function assertKaganeNumericRanges(capture: Capture) {
  const source = Kagane as typeof Kagane & KaganeImplementation;
  const labels = [
    ["current_books_min", "Minimum chapters"], ["current_books_max", "Maximum chapters"],
    ["start_year_min", "Earliest start year"], ["start_year_max", "Latest start year"],
  ];
  const fields = await source.getSearchFilters();
  for (const [id, title] of labels) {
    const field = fields.find((entry) => entry.id === id);
    expect(field?.type, `${id} native text input`).to.equal("input");
    expect(field?.title).to.equal(title);
    if (field?.type === "input") {
      expect(field.value).to.equal("");
      if (id.startsWith("current_books")) expect(field.placeholder).to.match(/uploaded.*entries.*not highest chapter number/i);
    }
  }
  const raw = JSON.parse(Application.arrayBufferToUTF8String(capture[1]));
  const schedule = Application.scheduleRequest;
  const requests: Request[] = [];
  let replay = { ...raw, last: true };
  Application.scheduleRequest = async (request) => {
    requests.push(request);
    if (!request.url.includes("/api/v2/search/series")) throw new Error("Range probe unexpectedly requested provider metadata");
    return [capture[0], new TextEncoder().encode(JSON.stringify(replay)).buffer as ArrayBuffer];
  };
  const search = (values: unknown, page = 1) => source.getSearchResults({ title: "  preserved query  ", metadata: values as SearchFilterValue[] }, { page }, { id: "updated_at,desc", label: "Latest" });
  const base = [{ id: "formats", value: { Manga: "included" } }, { id: "statuses", value: { Ongoing: "included" } }];
  try {
    await search(base);
    const baseline = JSON.parse(requests.at(-1)!.body as string);
    const cases: Array<[Record<string, string>, Record<string, unknown>]> = [
      [{ current_books_min: " 100 " }, { current_books: { min: 100 } }],
      [{ current_books_max: "20" }, { current_books: { max: 20 } }],
      [{ current_books_min: "0", current_books_max: "0" }, { current_books: { min: 0, max: 0 } }],
      [{ current_books_max: "2147483647" }, { current_books: { max: 2147483647 } }],
      [{ start_year_min: "2020", start_year_max: "2022" }, { start_year: { min: 2020, max: 2022 } }],
      [{ start_year_min: "1", start_year_max: "9999" }, { start_year: { min: 1, max: 9999 } }],
      [{ start_year_max: "2020" }, { start_year: { max: 2020 } }],
      [{ start_year_min: "2020", start_year_max: "2020" }, { start_year: { min: 2020, max: 2020 } }],
      [{ current_books_min: "  ", current_books_max: "", start_year_min: "", start_year_max: "\t" }, {}],
      [{ current_books_min: "100", start_year_min: "2020" }, { current_books: { min: 100 }, start_year: { min: 2020 } }],
    ];
    for (const [values, expected] of cases) {
      const metadata = [...base, ...Object.entries(values).map(([id, value]) => ({ id, value }))];
      await search(metadata, 2);
      const request = requests.at(-1)!, url = new globalThis.URL(request.url);
      expect(JSON.parse(request.body as string)).to.deep.equal({ ...expected, ...baseline });
      expect(url.pathname).to.equal("/api/v2/search/series");
      expect(url.searchParams.get("page")).to.equal("1");
      expect(url.searchParams.get("sort")).to.equal("updated_at,desc");
      expect(request.method).to.equal("POST");
    }
    // Changed bounds must produce a new body, never a stale prior result/session.
    await search([{ id: "current_books_min", value: "10" }]);
    const firstBody = requests.at(-1)!.body;
    await search([{ id: "current_books_min", value: "11" }]);
    expect(requests.at(-1)!.body).not.to.equal(firstBody);
    // The native continuation keeps the same range and server page progression.
    replay = { ...raw, last: false };
    const query = [{ id: "current_books_min", value: "0" }];
    const first = await search(query);
    expect(first.metadata).to.deep.equal({ page: 2 });
    const continuationBody = requests.at(-1)!.body;
    replay = { ...raw, last: true };
    const second = await search(query, (first.metadata as { page: number } | undefined)?.page);
    expect(second.metadata).to.equal(undefined);
    expect(requests.at(-1)!.body).to.equal(continuationBody);
    expect(new globalThis.URL(requests.at(-1)!.url).searchParams.get("page")).to.equal("1");
    const invalid: unknown[] = [null, 1, 0, true, false, {}, [], ["1"], NaN, Infinity, undefined,
      "-1", "+1", "1.5", "1e2", "Infinity", "NaN", "1 0", "1,000", "0x10", "１２", "9007199254740992", "2147483648"];
    for (const value of invalid) {
      for (const home of [false, true]) {
        const metadata = [{ id: "current_books_min", value }, { id: "tags_text", value: "requires taxonomy" }, ...(home ? [{ id: HOME_SECTION_METADATA_ID, value: "avg_views_today,desc" }] : [])];
        const before = requests.length;
        let error: unknown;
        try { await search(metadata); } catch (caught) { error = caught; }
        expect(String(error)).to.match(/Invalid Kagane numeric range/);
        expect(requests.length, "invalid range rejected before every HTTP request").to.equal(before);
      }
    }
    for (const metadata of [
      [{ id: "start_year_min", value: "0" }], [{ id: "start_year_max", value: "10000" }],
      [{ id: "current_books_min", value: "2" }, { id: "current_books_max", value: "1" }],
      [{ id: "start_year_min", value: "2022" }, { id: "start_year_max", value: "2020" }],
      [{ id: "current_books_min", value: "1" }, { id: "current_books_min", value: "2" }],
      [{ id: "start_year_max", value: "" }, { id: "start_year_max", value: {} }],
    ]) {
      const before = requests.length;
      let error: unknown;
      try { await search(metadata); } catch (caught) { error = caught; }
      expect(String(error)).to.match(/Invalid Kagane numeric range/);
      expect(requests.length).to.equal(before);
    }
    const home = [{ id: HOME_SECTION_METADATA_ID, value: "avg_views_today,desc" }, { id: "current_books_min", value: "100" }, { id: "start_year_max", value: "2020" }];
    await search(home);
    const homeBody = JSON.parse(requests.at(-1)!.body as string);
    expect(homeBody.current_books).to.equal(undefined);
    expect(homeBody.start_year).to.equal(undefined);
    expect(homeBody.title).to.equal(undefined);
    expect(new globalThis.URL(requests.at(-1)!.url).searchParams.get("sort")).to.equal("avg_views_today,desc");
    const homeForm = source.getAdvancedSearchForm({ title: "", metadata: home });
    expect(homeForm.getSearchQueryMetadata()).to.deep.equal(home);
  } finally {
    Application.scheduleRequest = schedule;
  }
}

// Reuse one consumed bulk response at the native edge. No detail enrichment or
// provider requests: settings must change newly mapped cards, not cached rendering.
export async function assertKaganeListingSubtitles(capture: Capture, source = Kagane as typeof Kagane & KaganeImplementation) {
  const raw = JSON.parse(Application.arrayBufferToUTF8String(capture[1]));
  const schedule = Application.scheduleRequest, invalidate = Application.invalidateDiscoverSections;
  const keys = [SHOW_SUBTITLE_TYPE_KEY, SHOW_SUBTITLE_RATING_KEY];
  const saved = keys.map((key) => Application.getState(key));
  let replay = { ...raw, last: true }, requests = 0, invalidations = 0;
  Application.scheduleRequest = async (request) => {
    requests++;
    expect(new globalThis.URL(request.url).pathname, "only bulk listing replay; no N+1 detail/metadata").to.equal("/api/v2/search/series");
    return [capture[0], new TextEncoder().encode(JSON.stringify(replay)).buffer as ArrayBuffer];
  };
  Application.invalidateDiscoverSections = () => { invalidations++; };
  const expected = (row: Record<string, unknown>, search: boolean, type: boolean, rating: boolean) => {
    const base = [typeof row.current_books === "number" ? `${row.current_books} Chapters` : undefined,
      search && row.start_year ? String(row.start_year as number) : undefined].filter(Boolean).join(" - ");
    const extra = [type && typeof row.format === "string" ? row.format.trim() : "",
      rating && typeof row.rating === "number" && Number.isFinite(row.rating) && row.rating > 0 && row.rating <= 100 ? `★ ${(row.rating / 10).toFixed(1)}` : ""].filter(Boolean).join(" · ");
    return extra ? [base, extra].filter(Boolean).join(" - ") : base || (search ? "" : undefined);
  };
  const check = (items: Array<SearchResultItem | DiscoverSectionItem>, search: boolean, type: boolean, rating: boolean) => {
    expect(items.length, "nonempty native response-derived subtitle sample").to.be.greaterThan(0);
    const rows = new Map<string, Record<string, unknown>>(replay.content.map((row: Record<string, unknown>) => [row.series_id, row]));
    for (const item of items) {
      if (!("mangaId" in item) || !("subtitle" in item)) throw new Error("Expected ordinary native listing card");
      const row = rows.get(item.mangaId);
      if (!row) throw new Error("Native listing lost exact consumed-response canonical identity");
      expect(item.subtitle, `canonical ${item.mangaId} subtitle`).to.equal(expected(row, search, type, rating));
    }
  };
  try {
    for (const key of keys) Application.setState(undefined, key);
    const sections = await source.getDiscoverSections();
    const recent = sections.find((section) => section.id === "recently-added")!, latest = sections.find((section) => section.id === "latest")!;
    const form = await source.getSettingsForm();
    const subtitleSection = form.getSections().find((section) => section.id === "listing-subtitles");
    expect(subtitleSection?.footer).to.match(/Recently Added.*simple Discover.*search results.*Does not change Latest Updates or Popular.*Featured/);
    type Toggle = { type: string; value: boolean; onValueChange: string | ((value: boolean) => Promise<void>) };
    const row = (id: string, current = form) => current.getSections().flatMap((section) => section.items).find((item) => item.id === id) as unknown as Toggle;
    const toggle = async (id: string, value: boolean) => {
      const item = row(id);
      expect(item.type).to.equal("toggleRow");
      await Application.SelectorRegistry.selector(item.onValueChange)(value);
    };
    expect(row("show-subtitle-type").value, "type defaults off").to.equal(false);
    expect(row("show-subtitle-rating").value, "listing rating defaults off").to.equal(false);
    const baselineSearch = await source.getSearchResults({ title: "" });
    const baselineRecent = await source.getDiscoverSectionItems(recent);
    const baselineLatest = await source.getDiscoverSectionItems(latest);
    check(baselineSearch.items, true, false, false); check(baselineRecent.items, false, false, false);
    for (const [type, rating] of [[false, false], [true, false], [false, true], [true, true], [false, false]]) {
      const before = requests;
      await toggle("show-subtitle-type", type); await toggle("show-subtitle-rating", rating);
      expect(Application.getState(keys[0])).to.equal(type); expect(Application.getState(keys[1])).to.equal(rating);
      const freshForm = await source.getSettingsForm();
      expect(row("show-subtitle-type", freshForm).value).to.equal(type);
      expect(row("show-subtitle-rating", freshForm).value).to.equal(rating);
      const search = await source.getSearchResults({ title: "" }), discovery = await source.getDiscoverSectionItems(recent);
      check(search.items, true, type, rating); check(discovery.items, false, type, rating);
      const withoutSubtitle = (items: Array<SearchResultItem | DiscoverSectionItem>) => items.map((item) => { const { subtitle: _subtitle, ...rest } = item as SearchResultItem; return rest; });
      expect(withoutSubtitle(search.items)).to.deep.equal(withoutSubtitle(baselineSearch.items));
      expect(withoutSubtitle(discovery.items)).to.deep.equal(withoutSubtitle(baselineRecent.items));
      expect(await source.getDiscoverSectionItems(latest), "Latest actual Vol/Ch labels untouched").to.deep.equal(baselineLatest);
      expect(requests - before, "one bulk response per native mapping; toggles/form reload add no HTTP").to.equal(3);
      if (!type && !rating) { expect(search).to.deep.equal(baselineSearch); expect(discovery).to.deep.equal(baselineRecent); }
    }
    expect(invalidations, "each subtitle handler invalidates Discover SDK cache").to.equal(10);
    // Invalid legacy/non-boolean state never enables either optional feature.
    for (const value of [undefined, null, "true", 1, [], {}]) {
      for (const key of keys) Application.setState(value, key);
      const current = await source.getSettingsForm();
      expect(row("show-subtitle-type", current).value).to.equal(false);
      expect(row("show-subtitle-rating", current).value).to.equal(false);
    }
    for (const key of keys) Application.setState(true, key);
    const seed = raw.content.find((entry: { series_id: string }) => entry.series_id === baselineSearch.items[0].mangaId);
    const cases = [
      { format: " Manga ", rating: 85, current_books: 0, start_year: 2024 },
      ...[undefined, null, 0, -1, 100.01, 0.01, 1, 85, 100, "85", true, {}, []].map((rating) => ({ format: "Manga", rating })),
      ...[undefined, null, "", "  ", " Novel ", 42, true, {}, []].map((format) => ({ format, rating: 85 })),
      { format: undefined, rating: undefined, current_books: undefined, start_year: undefined },
      { format: "Manga", rating: 85, current_books: undefined, start_year: undefined },
    ];
    for (const values of cases) {
      replay = { ...raw, last: true, content: [{ ...seed, ...values }] };
      const before = requests;
      check((await source.getSearchResults({ title: "" })).items, true, true, true);
      check((await source.getDiscoverSectionItems(recent)).items, false, true, true);
      expect(requests - before).to.equal(2);
    }
    // JSON cannot carry NaN/Infinity; verify those runtime-only guards directly.
    for (const rating of [NaN, Infinity, -Infinity]) {
      expect(appendListingSubtitle(undefined, { ...seed, format: undefined, rating }, { showType: true, showRating: true })).to.equal(undefined);
    }
    return { canonicalRows: baselineSearch.items.length, boundaryCases: cases.length, replayRequests: requests, discoverInvalidations: invalidations };
  } finally {
    Application.scheduleRequest = schedule; Application.invalidateDiscoverSections = invalidate;
    keys.forEach((key, index) => Application.setState(saved[index], key));
  }
}

// Inspect only bulk rows consumed by these native searches, with no detail lookups.
export async function assertKaganeLiveNumericRanges() {
  const source = Kagane as typeof Kagane & KaganeImplementation;
  const cases: Array<Record<string, { min?: number; max?: number }>> = [
    { current_books: { min: 100 } }, { current_books: { max: 20 } },
    { start_year: { min: 2020, max: 2022 } },
    { current_books: { min: 100 }, start_year: { min: 2020, max: 2022 } },
  ];
  let rangeRequests = 0;
  for (const ranges of cases) {
    const metadata = Object.entries(ranges).flatMap(([field, range]) => Object.entries(range).map(([side, value]) => ({ id: `${field}_${side}`, value: String(value) })));
    const schedule = Application.scheduleRequest;
    const rows = new Map<string, Record<string, unknown>>();
    Application.scheduleRequest = async (request) => {
      if (request.url.includes("/api/v2/search/series")) {
        if (rangeRequests >= 6) throw new Error("Numeric-range checks exceeded their six-search provider budget");
        rangeRequests += 1;
      }
      const result = await schedule(request);
      if (request.url.includes("/api/v2/search/series")) {
        expect(JSON.parse(request.body as string)).to.include.all.keys(Object.keys(ranges));
        const body = JSON.parse(request.body as string);
        for (const [field, range] of Object.entries(ranges)) expect(body[field]).to.deep.equal(range);
        const raw = JSON.parse(Application.arrayBufferToUTF8String(result[1]));
        for (const row of raw.content) rows.set(row.series_id, row);
      }
      return result;
    };
    try {
      const assertRows = (items: SearchResultItem[]) => {
        for (const item of items) {
          const row = rows.get(item.mangaId);
          expect(row, "canonical result from consumed bulk response").not.to.equal(undefined);
          for (const [field, range] of Object.entries(ranges)) {
            const value = row?.[field];
            expect(typeof value === "number" && Number.isSafeInteger(value), `${field} must be actual integer metadata, not null/missing`).to.equal(true);
            if (typeof value !== "number") throw new Error(`Missing constrained Kagane ${field}`);
            if (range.min !== undefined) expect(value).to.be.at.least(range.min);
            if (range.max !== undefined) expect(value).to.be.at.most(range.max);
          }
        }
      };
      const query = { title: "", metadata };
      const result = await source.getSearchResults(query);
      expect(result.items.length, "nonempty live range sample").to.be.greaterThan(0);
      assertRows(result.items);
      if (Object.keys(ranges).length === 2 && result.metadata) {
        const next = await source.getSearchResults(query, result.metadata as { page?: number });
        assertRows(next.items);
      }
    } finally {
      Application.scheduleRequest = schedule;
    }
  }
}

// Exercise native callbacks and round-trip their emitted metadata through JSON,
// reusing one consumed response only at the request edge (no provider calls).
export async function assertKaganePagination(capture: Capture, source = Kagane as typeof Kagane & KaganeImplementation) {
  const schedule = Application.scheduleRequest;
  const raw = JSON.parse(Application.arrayBufferToUTF8String(capture[1]));
  const requests: Request[] = [];
  let replay = { ...raw, last: false };
  Application.scheduleRequest = async (request) => {
    requests.push(request);
    expect(new globalThis.URL(request.url).pathname, "pagination replay only uses bulk search").to.equal("/api/v2/search/series");
    return [capture[0], new TextEncoder().encode(JSON.stringify(replay)).buffer as ArrayBuffer];
  };
  const sections = await source.getDiscoverSections();
  const callbacks = [
    (metadata: unknown) => source.getSearchResults({ title: "" }, metadata as { page?: number }),
    ...["latest", "recently-added"].map((id) => (metadata: unknown) => source.getDiscoverSectionItems(sections.find((section) => section.id === id)!, metadata as { page?: number })),
  ];
  const roundTrip = (value: unknown) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const malformed = [false, true, 0, 2, "", "2", [], [2],
    ...[false, true, "", "2", "bad", [], [2], {}, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 1e100].map((page) => ({ page }))];
  // Nonfinite runtime numbers serialize to null; test their raw rejection separately.
  const invalid = [...malformed.map(roundTrip), ...[NaN, Infinity, -Infinity].map((page) => ({ page }))];
  try {
    const rejectCallbacks = [...callbacks,
      (metadata: unknown) => source.getSearchResults({ title: "", metadata: [{ id: "tags_text", value: "requires taxonomy" }] }, metadata as { page?: number }),
      (metadata: unknown) => source.getDiscoverSectionItems(sections.find((section) => section.id === "popular")!, metadata as { page?: number }),
    ];
    for (const invoke of rejectCallbacks) for (const value of invalid) {
      const before = requests.length;
      let error: unknown;
      try { await invoke(value); } catch (caught) { error = caught; }
      expect(String(error), "malformed cursor rejected by source").to.match(/Invalid Kagane pagination/);
      expect(requests.length, "invalid cursor rejected before all HTTP").to.equal(before);
    }
    for (const invoke of callbacks) {
      const baseline = await invoke(undefined);
      expect(baseline.metadata).to.deep.equal({ page: 2 });
      const body = requests.at(-1)!.body;
      for (const metadata of [null, {}, Object.create(null), { page: 1 }, { page: null }, { page: undefined }, { unrelated: true }, { unrelated: true, page: null }, roundTrip({ page: undefined }), roundTrip({ page: NaN })]) {
        expect(await invoke(metadata), "ordinary first-page compatibility").to.deep.equal(baseline);
        expect(new globalThis.URL(requests.at(-1)!.url).searchParams.get("page")).to.equal("0");
        expect(requests.at(-1)!.body).to.equal(body);
      }
      // Use the callback's own cursor, not a fabricated page-two marker.
      expect((await invoke(roundTrip(baseline.metadata))).metadata).to.deep.equal({ page: 3 });
      expect(new globalThis.URL(requests.at(-1)!.url).searchParams.get("page")).to.equal("1");
      expect(requests.at(-1)!.body).to.equal(body);
      for (const metadata of [Object.assign(Object.create(null), { page: 2 }), { page: 2, context: "ignored legacy field" }, { page: 2147483648 }]) {
        expect((await invoke(metadata)).metadata).to.deep.equal({ page: metadata.page + 1 });
        expect(new globalThis.URL(requests.at(-1)!.url).searchParams.get("page")).to.equal(String(metadata.page - 1));
      }
      // The numeric limit is JavaScript's safe-integer boundary, not a provider cap.
      replay = { ...raw, last: true };
      expect((await invoke({ page: Number.MAX_SAFE_INTEGER })).metadata).to.equal(undefined);
      expect(new globalThis.URL(requests.at(-1)!.url).searchParams.get("page")).to.equal(String(Number.MAX_SAFE_INTEGER - 1));
      for (const content of [raw.content, []]) {
        replay = { ...raw, content, last: false };
        const before = requests.length;
        let error: unknown;
        try { await invoke({ page: Number.MAX_SAFE_INTEGER }); } catch (caught) { error = caught; }
        expect(String(error)).to.match(/Kagane pagination exceeds the safe page range/);
        expect(requests.length - before, "no unsafe cursor or additional page request").to.equal(1);
      }
      replay = { ...raw, last: false };
    }
    return { malformedJSONCases: malformed.length, malformedRuntimeCases: invalid.length - malformed.length, callbackPaths: rejectCallbacks.length, replayRequests: requests.length };
  } finally {
    Application.scheduleRequest = schedule;
  }
}

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Kagane tests", logger);
  const probe = new Probe("kagane-language-probe");
  probe.registerInterceptor();
  registerDefaultTests(suite, Kagane as typeof Kagane & KaganeImplementation, sourceInfo);
  suite.test("Reader: original native chapter and complete first/last source-issued image bytes", async () => {
    const manga = suite.state["MangaProviding.getMangaDetails"] as SourceManga | undefined;
    const chapters = suite.state["ChapterProviding.getChapters"] as Chapter[] | undefined;
    const reader = suite.state["ChapterProviding.getChapterDetails"] as ChapterDetails | undefined;
    if (!manga || !chapters?.[0] || !reader) throw new Error("No successful native Kagane reader sample");
    const detail = probe.firstDetails.get(`${API_URL}/api/v2/series/${manga.mangaId}`);
    if (!detail) throw new Error("No intercepted native Kagane detail response");
    assertKaganePublicationStatus(manga, detail);
    logger.log("readerImageEvidence", await assertKaganeReaderImageBytes(manga, chapters[0], reader));
  });
  suite.test("Native directional sorts emit exact tokens and preserve consumed count/rating order", async () => {
    const source = Kagane as typeof Kagane & KaganeImplementation;
    for (const option of (await source.getSortingOptions()).filter((entry) => /^(updated_at|created_at|current_books|rating),/.test(entry.id))) {
      for (const url of probe.captures.keys()) if (new globalThis.URL(url).searchParams.get("sort") === option.id) probe.captures.delete(url);
      const result = await source.getSearchResults({ title: "" }, undefined, option);
      const capture = [...probe.captures].filter(([url]) => new globalThis.URL(url).searchParams.get("sort") === option.id).at(-1)?.[1];
      if (!capture) throw new Error(`No native ${option.id} response`);
      const [field, direction] = option.id.split(",");
      if (field === "current_books" || field === "rating") assertKaganeNumericSortOrder(capture, result.items, field, direction === "asc");
      if (option.id === "current_books,desc") await assertKaganeSavedSorts(capture);
    }
  });
  suite.test("Unknown malformed and stale tags fail before search; valid native payloads remain exact", async () => {
    await (Kagane as typeof Kagane & KaganeImplementation).getSearchFilters();
    const tags = probe.captures.get(`${API_URL}/api/v2/tags/list`);
    const search = [...probe.captures].find(([url]) => url.includes("/api/v2/search/series"))?.[1];
    if (!tags || !search) throw new Error("No actual Kagane taxonomy/search response seeds");
    await assertKaganeTagFilters(JSON.parse(Application.arrayBufferToUTF8String(tags[1])), search);
  });
  suite.test("Native optional ranges serialize exactly, isolate continuation and reject malformed values before HTTP", async () => {
    const search = [...probe.captures].find(([url]) => url.includes("/api/v2/search/series"))?.[1];
    if (!search) throw new Error("No actual Kagane search response for closed native range probes");
    await assertKaganeNumericRanges(search);
  });
  suite.test("Native pagination rejects malformed cursors before HTTP and preserves first pages and safe continuations", async () => {
    const search = [...probe.captures].find(([url]) => url.includes("/api/v2/search/series"))?.[1];
    if (!search) throw new Error("No consumed Kagane search response for pagination replay");
    logger.log("paginationEvidence", await assertKaganePagination(search));
  });
  suite.test("Optional listing type/rating defaults, persistence, exact subtitles and toggle reloads reuse consumed bulk rows", async () => {
    const search = [...probe.captures].find(([url]) => url.includes("/api/v2/search/series"))?.[1];
    if (!search) throw new Error("No consumed Kagane search response for subtitle replay");
    logger.log("listingSubtitleEvidence", await assertKaganeListingSubtitles(search));
  });
  suite.test("Live chapter-count and start-year bounds match consumed bulk rows", async () => {
    await assertKaganeLiveNumericRanges();
  });
  suite.test(
    "Current live series translation and unknown language preserve native chapter identity",
    async () => {
      const chapters = suite.state["ChapterProviding.getChapters"] as Chapter[] | undefined;
      if (!chapters?.[0])
        throw new Error("No successful live chapter sample for language boundaries");
      await assertKaganeLanguageEntryPoints(chapters[0].sourceManga, probe.captures);
    },
  );
  try {
    await suite.run();
  } finally {
    probe.unregisterInterceptor();
  }
}
