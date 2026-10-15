import {
  PaperbackInterceptor,
  type Chapter,
  type ChapterDetails,
  type Request,
  type Response,
  type SourceManga,
  type SearchResultItem,
  type TestLogger,
} from "@paperback/types";
import { expect } from "chai";
import { TestSuite, registerDefaultTests } from "./suite.js";
import { Kagane, type KaganeImplementation } from "../Kagane/main.js";
import sourceInfo from "../Kagane/pbconfig.js";
import { API_URL, CONTENT_LANGUAGES_KEY, HOME_SECTION_METADATA_ID } from "../Kagane/implementations/shared/models.js";
import type { TagDto } from "../Kagane/implementations/shared/models.js";
import type { SearchFilterValue } from "@paperback/types/lib/compat/0.8";
import { CUSTOM_HIDDEN_TAGS_KEY } from "../Kagane/implementations/shared/tag-options.js";

type Capture = [Response, ArrayBuffer];
class Probe extends PaperbackInterceptor {
  readonly captures = new Map<string, Capture>();
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
    return data;
  }
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

// Inspect the same actual response used by the native Books Count request, not a
// second probe or a locally sorted copy. Equal counts are valid server ties.
export function assertKaganeBooksCountOrder(capture: Capture, items: SearchResultItem[]) {
  const raw = JSON.parse(Application.arrayBufferToUTF8String(capture[1])) as {
    content: Array<{ series_id: string; current_books: number }>;
  };
  expect(raw.content.length, "native Books Count sample").to.be.greaterThan(1);
  const counts = raw.content.map((book) => book.current_books);
  expect(counts.every((count) => Number.isFinite(count) && count >= 0), "native book counts").to.equal(true);
  expect(counts.every((count, index) => index === 0 || counts[index - 1] >= count), "Books Count descending, allowing ties").to.equal(true);
  const ids = new Set(items.map((item) => item.mangaId));
  expect(items.map((item) => item.mangaId), "native filtered result order").to.deep.equal(
    raw.content.filter((book) => ids.has(book.series_id)).map((book) => book.series_id),
  );
}

// Replay this run's unchanged actual search response at the native request edge.
// Saved-sort checks add no provider calls and never change search filters/body.
export async function assertKaganeSavedSorts(capture: Capture) {
  const source = Kagane as typeof Kagane & KaganeImplementation;
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
    "current_books,desc", "created_at,desc",
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
    for (const [id, expected] of [
      [undefined, null], ...options.map((option) => [option.id, option.id === "relevance" ? null : option.id]),
      ["books_count", "current_books"], ["books_count,asc", "current_books,asc"],
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
    logger.log("readerImageEvidence", await assertKaganeReaderImageBytes(manga, chapters[0], reader));
  });
  suite.test("Books Count uses descending native counts; saved sorts preserve filters and reject stale names", async () => {
    const source = Kagane as typeof Kagane & KaganeImplementation;
    const option = (await source.getSortingOptions()).find((entry) => entry.label === "Books Count");
    if (!option) throw new Error("Missing Books Count sorting option");
    const result = await source.getSearchResults({ title: "" }, undefined, option);
    const capture = [...probe.captures].find(([url]) => new globalThis.URL(url).searchParams.get("sort") === "current_books,desc")?.[1];
    if (!capture) throw new Error("No current Books Count native search response");
    assertKaganeBooksCountOrder(capture, result.items);
    await assertKaganeSavedSorts(capture);
  });
  suite.test("Unknown malformed and stale tags fail before search; valid native payloads remain exact", async () => {
    await (Kagane as typeof Kagane & KaganeImplementation).getSearchFilters();
    const tags = probe.captures.get(`${API_URL}/api/v2/tags/list`);
    const search = [...probe.captures].find(([url]) => url.includes("/api/v2/search/series"))?.[1];
    if (!tags || !search) throw new Error("No actual Kagane taxonomy/search response seeds");
    await assertKaganeTagFilters(JSON.parse(Application.arrayBufferToUTF8String(tags[1])), search);
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
