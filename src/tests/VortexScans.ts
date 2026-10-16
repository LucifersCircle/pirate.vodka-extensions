/* eslint-disable no-unused-expressions */
import {
  ContentRating,
  SourceIntents,
  PaperbackInterceptor,
  type Chapter,
  type ChapterDetails,
  type DiscoverSectionItem,
  type Request,
  type Response,
  type SearchResultItem,
  type SourceManga,
  type TestLogger,
} from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { TestSuite, registerDefaultTests } from "./suite.js";
import { VortexScans, type VortexScansImplementation } from "../VortexScans/main.js";
import {
  DOMAIN,
  DOMAIN_API,
  PAGE_SIZE,
  type VortexPost,
  type VortexQueryResponse,
  type VortexChaptersResponse,
} from "../VortexScans/implementations/shared/models.js";
import { serializedProperty } from "../VortexScans/implementations/discover-section/page-data.js";
import { parseHome } from "../VortexScans/implementations/discover-section/home.js";
import { contentSettings, observeContent } from "../VortexScans/implementations/shared/content.js";
import { VortexSettingsForm } from "../VortexScans/implementations/settings-form/main.js";
import { buildMangaId } from "../VortexScans/implementations/shared/utils.js";
import { parseMangaPage } from "../VortexScans/implementations/manga/parsers.js";
import sourceInfo from "../VortexScans/pbconfig.js";

// Capture actual native callbacks. Mutations below reuse these current responses,
// never committed fixtures, an alternate network client, or per-card enrichment.
class Probe extends PaperbackInterceptor {
  readonly requests: Request[] = [];
  readonly responses: { request: Request; response: Response; body: string }[] = [];
  override async interceptRequest(request: Request): Promise<Request> {
    if (request.url.startsWith(DOMAIN) || request.url.startsWith(DOMAIN_API))
      this.requests.push(request);
    return request;
  }
  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (
      response.status === 200 &&
      (request.url.startsWith(DOMAIN) || request.url.startsWith(DOMAIN_API))
    ) {
      const body = Application.arrayBufferToUTF8String(data);
      if (!body.includes("vShield") && response.headers["cf-mitigated"] !== "challenge")
        this.responses.push({ request, response, body });
    }
    return data;
  }
}
// Preserve the established saved-ID ASCII escaping, including a literal period.
const canonical = (post: Pick<VortexPost, "id" | "slug">): string =>
  `${post.id}:${post.slug.replace(/[^A-Za-z0-9_-]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
const cards = (items: (DiscoverSectionItem | SearchResultItem)[]) =>
  items.map((item) => {
    if (!("mangaId" in item)) throw new Error("Expected a native series card");
    return { mangaId: item.mangaId, title: item.title, imageUrl: item.imageUrl };
  });
const expectedCards = (posts: VortexPost[]) =>
  posts
    .filter((post) => !post.isNovel && post.seriesType !== "NOVEL")
    .map((post) => ({
      mangaId: canonical(post),
      title: Application.decodeHTMLEntities(post.postTitle),
      imageUrl: post.featuredImage,
    }));
const isHome = (url: string): boolean => url === DOMAIN || url === `${DOMAIN}/`;
const field = <T>(html: string, name: string): T => {
  const $ = cheerio.load(html);
  const script = $("script")
    .toArray()
    .map((element) => $(element).text())
    .filter((value) => value.includes("$_TSR.router="));
  expect(script).to.have.length(1);
  return serializedProperty<T>(script[0], name);
};
const rejects = async (operation: () => Promise<unknown>, pattern: RegExp) => {
  let failure: unknown;
  try { await operation(); } catch (error) { failure = error; }
  expect(String(failure)).to.match(pattern);
};
const buffer = (value: unknown): ArrayBuffer => new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
const isQuery = (request: Request): boolean => {
  const url = new globalThis.URL(request.url);
  return url.origin + url.pathname === `${DOMAIN_API}/query`;
};

const isSeriesRoute = (input: string, slug: string, chapter?: string): boolean => {
  if (!input.startsWith(`${DOMAIN}/`)) return false;
  const url = new globalThis.URL(input);
  // Source-generated routes have this canonical authority. Inspect raw components
  // before URL normalizes dot directories, controls or backslashes.
  const rawPath = input.slice(DOMAIN.length).split(/[?#]/)[0];
  const segments = rawPath.split("/"), expected = chapter === undefined ? [slug] : [slug, chapter];
  if (url.origin !== DOMAIN || url.username || url.password || segments.length !== expected.length + 2 || segments[0] !== "" || segments[1] !== "series") return false;
  const safe = (part: string) => part !== "." && part !== ".." && !Array.from(part).some((char) => char === "/" || char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  try { return expected.every((part, index) => {
    const decoded = decodeURIComponent(segments[index + 2]);
    return safe(part) && safe(decoded) && decoded === part;
  }); }
  catch { return false; }
};

// Independent public API oracle for the unchanged multi-layout HTML reader.
// Numeric chapter IDs come only from the same native chapter-list response.
type ReaderIdentity = { id?: number; slug: string; number: number; postId: number; postSlug: string };
type OracleChapter = {
  id: number; slug: string; number: number; mangaPostId: number; price: number;
  mangaPost: { id?: number; slug: string }; chapterStatus?: string;
  isLocked: boolean; isAccessible: boolean; isLockedByCoins?: boolean;
  isPermanentlyLocked?: boolean | number; isShortLinkLocked?: boolean;
  images?: { url: string; order: number }[];
};
function assertPublicChapter(chapter: OracleChapter, expected: ReaderIdentity, detail = false): void {
  expect(chapter).to.be.an("object");
  expect(Number.isSafeInteger(chapter.id) && chapter.id > 0, "source chapter ID").to.equal(true);
  if (expected.id !== undefined) expect(chapter.id).to.equal(expected.id);
  expect(chapter.slug).to.equal(expected.slug);
  expect(chapter.number).to.equal(expected.number);
  expect(chapter.mangaPostId).to.equal(expected.postId);
  expect(chapter.mangaPost.slug).to.equal(expected.postSlug);
  if (chapter.mangaPost.id !== undefined) expect(chapter.mangaPost.id).to.equal(expected.postId);
  if (chapter.chapterStatus !== undefined) expect(chapter.chapterStatus).to.equal("PUBLIC");
  expect(chapter.price, "public free oracle chapter").to.equal(0);
  expect(chapter.isLocked).to.equal(false);
  expect(chapter.isAccessible).to.equal(true);
  expect(chapter.isPermanentlyLocked).to.be.oneOf([false, 0]);
  expect(chapter.isShortLinkLocked).to.equal(false);
  if (chapter.isLockedByCoins !== undefined) expect(chapter.isLockedByCoins).to.equal(false);
  if (detail) {
    expect(chapter.mangaPost.id).to.equal(expected.postId);
    expect(chapter.chapterStatus).to.equal("PUBLIC");
    expect(chapter.isLockedByCoins).to.equal(false);
  }
}
function orderedOraclePages(chapter: OracleChapter): string[] {
  expect(chapter.images).to.be.an("array").and.not.empty;
  expect(chapter.images!.length).to.be.at.most(2000);
  const images = [...chapter.images!].sort((left, right) => left.order - right.order);
  images.forEach((image, index) => {
    expect(image.order, "complete unique source page order").to.equal(index);
    const url = new globalThis.URL(image.url);
    expect(url.protocol).to.equal("https:");
    expect(url.hostname).not.to.be.empty;
    expect(url.username + url.password).to.equal("");
  });
  expect(new Set(images.map((image) => image.url)).size).to.equal(images.length);
  return images.map((image) => image.url);
}

// The existing HTML reader collapses literal pathname slash runs. Do not extend
// that equivalence to URL decoding, another origin, query/fragment or dot paths.
function comparableReaderPage(input: string): string {
  if (Array.from(input).some((char) => char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    throw new Error("Ambiguous reader image URL");
  const parts = /^(https:\/\/[^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/s.exec(input);
  if (!parts) throw new Error("Expected an absolute HTTPS reader image URL");
  const path = parts[2] ?? "";
  if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path) || path.split("/").some((part) => {
    const dots = part.replace(/%2e/gi, ".");
    return dots === "." || dots === "..";
  })) throw new Error("Ambiguous reader image pathname");
  return parts[1] + path.replace(/\/{2,}/g, "/") + (parts[3] ?? "") + (parts[4] ?? "");
}

// Diagnostics are not URL equivalence. Keep only a known public image origin and
// numeric page/split shape; never emit credentials, queries, fragments or opaque
// path identifiers. Unknown/ambiguous URLs remain redacted, not normalized.
function readerPageDiagnostic(input: string | undefined) {
  if (input === undefined) return { present: false, path: undefined };
  const shape = { present: true, queryRedacted: input.includes("?"), fragmentRedacted: input.includes("#") };
  const publicOrigin = "https://storage.vortexscans.org";
  const raw = input.split(/[?#]/)[0];
  if (!raw.startsWith(`${publicOrigin}/`) || Array.from(raw).some((char) => char === "\\" || char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127))
    return { ...shape, origin: "[redacted]", path: "[redacted]" };
  const path = raw.slice(publicOrigin.length);
  const page = /^\/+upload\/+series\/+[A-Za-z0-9_-]+\/+[A-Za-z0-9_-]+\/+(page-\d{1,6}(?:_\d{1,6})*)_\d{10,16}-\d{1,10}\.(webp|jpe?g|png|gif|avif)$/.exec(path);
  return { ...shape, origin: publicOrigin,
    path: page ? `/upload/series/[redacted]/[redacted]/${page[1]}_[redacted].${page[2]}` : "[redacted]",
    literalSlashRuns: (path.match(/\/{2,}/g) ?? []).length };
}

type ReaderProof = { mangaId: string; chapterId: string; completePages: number; literalSlashAliases: number; rawImageRequests: number };

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("VortexScans tests", logger);
  const extension = VortexScans as typeof VortexScans & VortexScansImplementation;
  const probe = new Probe("VortexScans.native-test-evidence");
  const stateKeys = ["VortexScans.contentSettings", "VortexScans.contentWarnings", "VortexScans.readerTitles"];
  const saved = stateKeys.map((key) => Application.getState(key));
  let home = "";
  const rows = new Map<string, Awaited<ReturnType<typeof extension.getDiscoverSectionItems>>>();
  registerDefaultTests(
    suite,
    VortexScans as typeof VortexScans & VortexScansImplementation,
    sourceInfo,
    // Keep the observed chapter-0 reader regression independent of changing search order.
    { mangaProviding: { getMangaDetails: ["658:got-a-gallery-in-the-wild"] } },
  );

  suite.test("home: one cold response, no warm requests or per-title enrichment", async () => {
    expect(sourceInfo.capabilities).to.include(SourceIntents.SETTINGS_FORM_PROVIDING);
    expect(contentSettings().excludeNSFW).to.equal(true);
    // Check complete source membership separately from the explicit policy mutations.
    await (await extension.getSettingsForm()).setExcludeNSFW(false);
    const sections = await extension.getDiscoverSections();
    expect(sections.map((section) => section.id)).to.deep.equal([
      "featured", "popular-today", "release-filters", "collections",
      "most-popular", "genres",
    ]);
    const selected = sections.filter((section) =>
      ["featured", "popular-today", "most-popular"].includes(section.id),
    );
    const before = probe.requests.length;
    const cold = await Promise.all(selected.map((section) => extension.getDiscoverSectionItems(section)));
    selected.forEach((section, index) => rows.set(section.id, cold[index]));
    const requests = probe.requests.slice(before);
    expect(requests.map((request) => request.url)).to.have.length(1);
    expect(isHome(requests[0].url)).to.equal(true);
    home = probe.responses.filter(({ request }) => isHome(request.url)).at(-1)!.body;
    const warmStart = probe.requests.length;
    const warm = await Promise.all(selected.map((section) => extension.getDiscoverSectionItems(section)));
    expect(warm).to.deep.equal(cold);
    expect(probe.requests.length).to.equal(warmStart);
    // Reuse the same response for every native first-page representation.
    for (const metadata of [null, {}, Object.create(null)]) {
      const repeated = await Promise.all(selected.map((section) => extension.getDiscoverSectionItems(section, metadata)));
      expect(repeated).to.deep.equal(cold);
      expect(probe.requests.length).to.equal(warmStart);
    }
    const browse = sections.find((section) => section.id === "release-filters")!;
    expect(browse.title).to.equal("Browse releases");
    expect((await extension.getDiscoverSectionItems(browse)).items).to.deep.equal(
      ["Latest", "New"].map((name) => ({ type: "genresCarouselItem", name, searchQuery: {
        title: "", metadata: [{ id: "vortex-home-section", value: name.toLowerCase() }],
      } })),
    );
    expect(probe.requests.length).to.equal(warmStart);
    logger.log("homeRequests", { cold: 1, warm: 0, perTitle: 0 });
  });

  suite.test("home: exact current 6/20/9 rows, original covers and terminal editorial rows", async () => {
    const featured = field<VortexPost[]>(home, "combinedSliderPosts");
    const monthly = field<VortexPost[]>(home, "monthlyPosts");
    const ranking = field<{ id: number; slug: string; title: string; coverImage: string }[]>(home, "transformedTopSeries").slice(0, 9);
    expect(featured).to.have.length(6);
    expect(buildMangaId(42, "v.2")).to.equal("42:v%2E2");
    const popular = ranking.map((rank) => {
      const post = monthly.find((entry) => entry.slug === rank.slug)!;
      expect(post.postTitle).to.equal(rank.title);
      expect(post.featuredImage).to.equal(rank.coverImage);
      return post;
    });
    expect(popular).to.have.length(9);
    const changedRank = home.replace(/(transformedTopSeries:\$R\[\d+\]=\[\$R\[\d+\]=\{id:)\d+/, (_, prefix: string) => `${prefix}999999`);
    expect(changedRank).not.to.equal(home);
    expect(parseHome(changedRank).popular.map(canonical)).to.deep.equal(popular.map(canonical));
    for (const [id, posts] of [["featured", featured], ["most-popular", popular]] as const)
      expect(cards(rows.get(id)!.items), id).to.deep.equal(expectedCards(posts));
    const $ = cheerio.load(home);
    const section = $("h1,h2,h3,h4,p").filter((_, element) => $(element).text().trim() === "Popular Today").first().closest("section");
    const sourceIds = new Map<string, number>();
    for (const match of home.matchAll(/\{id:(\d+),slug:"([^"]+)"/g))
      if (!sourceIds.has(match[2])) sourceIds.set(match[2], Number(match[1]));
    const today = new Map<string, { mangaId: string; title: string; imageUrl: string }>();
    section.find('a[href^="/series/"]').each((_, element) => {
      const anchor = $(element), slug = decodeURIComponent((anchor.attr("href") ?? "").slice(8).split(/[?#]/)[0]);
      if (today.has(slug)) return;
      const id = sourceIds.get(slug), imageUrl = anchor.find("img[src]").first().attr("src");
      const title = anchor.attr("title")?.trim() || anchor.find("h3").first().text().trim();
      if (id && imageUrl && title) today.set(slug, { mangaId: canonical({ id, slug }), title: Application.decodeHTMLEntities(title), imageUrl });
    });
    expect(today.size).to.equal(20);
    expect(cards(rows.get("popular-today")!.items)).to.deep.equal([...today.values()]);
    const before = probe.requests.length;
    for (const id of ["featured", "most-popular"]) {
      expect(rows.get(id)!.metadata).to.equal(undefined);
      const section = (await extension.getDiscoverSections()).find((item) => item.id === id)!;
      for (const metadata of [{ page: 2 }, [], false, 0, ""]) {
        expect(await extension.getDiscoverSectionItems(section, metadata as Parameters<typeof extension.getDiscoverSectionItems>[1])).to.deep.equal({ items: [] });
      }
    }
    expect(probe.requests.length).to.equal(before);
  });

  suite.test("legacy latest: empty first-page metadata and real cursor guards reuse cached home", async () => {
    // This retained handler is not a current Browse row. Test compatibility from
    // the existing home response, then stop a real continuation before network I/O.
    const sections = await extension.getDiscoverSections();
    expect(sections.some((section) => section.id === "latest-releases")).to.equal(false);
    const section = { ...sections[0], id: "latest-releases" };
    const before = probe.requests.length;
    const first = await extension.getDiscoverSectionItems(section);
    expect(first.items).not.to.be.empty;
    for (const metadata of [null, {}, Object.create(null)])
      expect(await extension.getDiscoverSectionItems(section, metadata)).to.deep.equal(first);
    expect(probe.requests.length).to.equal(before);
    const cursor = first.metadata;
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) throw new Error("Expected the native legacy cursor");
    for (const metadata of [[], false, 0, "", { ...cursor, page: 1 }, { ...cursor, contentContext: "stale" }, { ...cursor, seen: undefined }])
      await rejects(() => extension.getDiscoverSectionItems(section, metadata as Parameters<typeof extension.getDiscoverSectionItems>[1]), /Invalid VortexScans homepage cursor/);
    expect(probe.requests.length).to.equal(before);
    const schedule = Application.scheduleRequest;
    const requests: Request[] = [];
    try {
      Application.scheduleRequest = async (request) => {
        requests.push(request);
        throw new Error("Offline legacy continuation boundary");
      };
      await rejects(() => extension.getDiscoverSectionItems(section, cursor as Parameters<typeof extension.getDiscoverSectionItems>[1]), /Offline legacy continuation boundary/);
      expect(requests.map(({ url, method }) => ({ url, method }))).to.deep.equal([{
        url: `${DOMAIN_API}/posts?page=2&perPage=36&searchTerm=&isNovel=false&tag=latestUpdatePinned`, method: "GET",
      }]);
      expect(probe.requests.length).to.equal(before);
    } finally {
      Application.scheduleRequest = schedule;
    }
  });

  suite.test("latest: Browse chip preserves native query, exact source order and page-two continuation", async () => {
    const sections = await extension.getDiscoverSections();
    expect(sections.some((section) => section.id === "latest-releases")).to.equal(false);
    const browse = sections.find((section) => section.id === "release-filters")!;
    const chips = await extension.getDiscoverSectionItems(browse);
    const chip = chips.items.find((item) => "name" in item && item.name === "Latest");
    if (!chip || !("searchQuery" in chip)) throw new Error("Expected the native Latest chip");
    const query = chip.searchQuery as Parameters<typeof extension.getSearchResults>[0];
    expect(query).to.deep.equal({ title: "", metadata: [{ id: "vortex-home-section", value: "latest" }] });
    const snapshot = JSON.stringify(query);
    expect(await extension.getSortingOptions(query)).to.deep.equal([]);
    expect(extension.getAdvancedSearchForm(query).getSearchQueryMetadata()).to.deep.equal(query.metadata);
    let cursor: Parameters<typeof extension.getSearchResults>[1];
    const pages: string[][] = [];
    for (const page of [1, 2]) {
      const before = probe.responses.length, cursorSnapshot = JSON.stringify(cursor);
      const result = await extension.getSearchResults(query, cursor);
      expect(JSON.stringify(query)).to.equal(snapshot);
      expect(JSON.stringify(cursor)).to.equal(cursorSnapshot);
      const responses = probe.responses.slice(before);
      expect(responses).to.have.length(1);
      const url = new globalThis.URL(responses[0].request.url);
      expect(url.origin + url.pathname).to.equal(`${DOMAIN_API}/posts`);
      for (const [key, value] of Object.entries({ page: String(page), perPage: String(PAGE_SIZE), searchTerm: "", isNovel: "false", tag: "latestUpdatePinned" }))
        expect(url.searchParams.get(key), key).to.equal(value);
      const data = JSON.parse(responses[0].body) as VortexQueryResponse;
      expect(data.posts).to.have.length(PAGE_SIZE);
      expect(cards(result.items)).to.deep.equal(expectedCards(data.posts));
      pages.push(result.items.map((item) => item.mangaId));
      cursor = result.metadata as Parameters<typeof extension.getSearchResults>[1];
      expect(cursor?.page).to.equal(page + 1);
    }
    expect(pages[1]).not.to.deep.equal(pages[0]);
    logger.log("latestChipContinuations", { pages: [1, 2], counts: pages.map((items) => items.length) });
  });

  suite.test("search cursors: numeric boundaries preserve first pages, continuations and policy resets", async () => {
    const seed = probe.responses.find(({ request }) => isQuery(request))!;
    expect(seed, "same native catalog response").not.to.equal(undefined);
    const raw = JSON.parse(seed.body) as VortexQueryResponse;
    expect(raw.posts).to.have.length(PAGE_SIZE);
    const schedule = Application.scheduleRequest, before = probe.requests.length;
    const requests: Request[] = [];
    let payload = raw;
    const context = JSON.stringify(contentSettings());
    const queryFor = (kind: string) => ({ title: "", metadata: kind === "search" ? [] : [{ id: "vortex-home-section", value: kind }] });
    const invoke = (kind: string, metadata?: unknown) => extension.getSearchResults(queryFor(kind), metadata as Parameters<typeof extension.getSearchResults>[1]);
    const lastPage = () => new globalThis.URL(requests.at(-1)!.url).searchParams.get("page");
    try {
      const replay: typeof Application.scheduleRequest = async (request) => {
        const url = new globalThis.URL(request.url);
        if (![`${DOMAIN_API}/query`, `${DOMAIN_API}/posts`].includes(url.origin + url.pathname))
          throw new Error(`Unexpected cursor replay route: ${request.url}`);
        requests.push(request);
        // All branches consume the same response contract. Reuse this current
        // native response; overflow controls below mutate only pagination data.
        return [{ ...seed.response, url: request.url }, buffer(payload)];
      };
      Application.scheduleRequest = replay;
      if (Application.scheduleRequest !== replay) throw new Error("Native runtime does not allow replacing Application.scheduleRequest");
      for (const kind of ["search", "latest", "new"]) {
        payload = { ...raw, totalCount: undefined };
        const first = await invoke(kind);
        expect(first.items).not.to.be.empty;
        expect((first.metadata as Parameters<typeof extension.getSearchResults>[1])?.page).to.equal(2);
        for (const metadata of [null, JSON.parse("{}"), Object.create(null), JSON.parse(JSON.stringify({ page: undefined })), JSON.parse('{"page":null}'), { page: 1 }]) {
          expect(await invoke(kind, metadata)).to.deep.equal(first);
          expect(lastPage()).to.equal("1");
        }
        const cursor = JSON.parse(JSON.stringify(first.metadata));
        await invoke(kind, cursor);
        expect(lastPage()).to.equal("2");
        for (const metadata of [[], false, "2", { page: "bad" }, { page: "2" }, { page: 0 }, { page: -1 }, { page: 1.5 }, { page: true }, { page: Number.MAX_SAFE_INTEGER + 1 }, { ...cursor, page: "bad" }]) {
          const count = requests.length;
          await rejects(() => invoke(kind, metadata), /Invalid VortexScans search cursor/);
          expect(requests.length).to.equal(count);
        }
        // Preserve reset precedence, not a new content-context schema binding.
        await invoke(kind, { page: "bad", contentContext: "stale" });
        expect(lastPage()).to.equal("1");
        await invoke(kind, { page: 2, contentContext: context, sourceField: "compatible" });
        expect(lastPage()).to.equal("2");
        const lastSafe = await invoke(kind, { page: Number.MAX_SAFE_INTEGER - 1 });
        expect((lastSafe.metadata as Parameters<typeof extension.getSearchResults>[1])?.page).to.equal(Number.MAX_SAFE_INTEGER);
        for (const posts of [raw.posts, raw.posts.map((post) => ({ ...post, isNovel: true }))]) {
          payload = { posts };
          const count = requests.length;
          await rejects(() => invoke(kind, { page: Number.MAX_SAFE_INTEGER }), /Invalid VortexScans search cursor/);
          expect(requests.length).to.equal(count + 1);
          expect(lastPage()).to.equal(String(Number.MAX_SAFE_INTEGER));
        }
        payload = { posts: [] };
        expect(await invoke(kind, { page: Number.MAX_SAFE_INTEGER })).to.deep.equal({ items: [], metadata: undefined });
      }
      expect(probe.requests.length).to.equal(before);
    } finally { Application.scheduleRequest = schedule; }
  });

  suite.test("metadata: explicit counts are not latest numbers and missing values stay absent", async () => {
    const seed = probe.responses.find(({ request }) => isQuery(request))!;
    expect(seed, "same native catalog response").not.to.equal(undefined);
    const raw = JSON.parse(seed.body) as VortexQueryResponse;
    const post = raw.posts.find((item) => item.chapters?.length && !item.isNovel)!;
    expect(post).not.to.equal(undefined);
    const schedule = Application.scheduleRequest, before = probe.requests.length;
    try {
      for (const [count, number, expected] of [
        [90, 132, "90 Chapters"], [6, 5, "6 Chapters"],
        [undefined, 1.5, "Ch. 1.5"], [0, undefined, "0 Chapters"],
        [undefined, undefined, undefined], [undefined, 0, "Ch. 0"],
      ] as const) {
        const copy = { ...post, _count: count === undefined ? undefined : { chapters: count },
          chapters: number === undefined ? [] : [{ ...post.chapters[0], number }] };
        const replay: typeof Application.scheduleRequest = async (request) => {
          if (!isQuery(request)) throw new Error(`Unexpected metadata replay route: ${request.url}`);
          return [{ ...seed.response, url: request.url }, buffer({ posts: [copy], totalCount: 1 })];
        };
        Application.scheduleRequest = replay;
        if (Application.scheduleRequest !== replay) throw new Error("Native runtime does not allow replacing Application.scheduleRequest");
        const result = await extension.getSearchResults({ title: "" });
        expect(cards(result.items)).to.deep.equal(expectedCards([copy]));
        expect(result.items[0].subtitle).to.equal(expected);
      }
      expect(probe.requests.length).to.equal(before);
    } finally { Application.scheduleRequest = schedule; }
  });

  suite.test("metadata: chapter subtitles retain decimals and genuine text with exact native references", async () => {
    const source = suite.state["MangaProviding.getMangaDetails"] as SourceManga;
    const seed = probe.responses.find(({ request }) => {
      const url = new globalThis.URL(request.url);
      return url.origin + url.pathname === `${DOMAIN_API}/chapters`;
    })!;
    expect(seed, "same native chapter-list response").not.to.equal(undefined);
    const raw = JSON.parse(seed.body) as VortexChaptersResponse, chapter = raw.post.chapters.find((item) => !item.isLocked)!;
    expect(chapter).not.to.equal(undefined);
    const schedule = Application.scheduleRequest, before = probe.requests.length;
    try {
      for (const [number, title, expected] of [
        [1.5, "Chapter 1 Remake", "Chapter 1 Remake"], [1.5, "Chapter 1.5", ""],
        [1.5, "Ch. 1.5: Remake", "Remake"], [1.5, "1.5 - A &amp; B", "A & B"],
        [1, "Chapter 1.5: Remake", "Chapter 1.5: Remake"],
        [1.5, "Chapter 1.50: Remake", "Remake"], [1.5, "Chapter 1.5.1", "Chapter 1.5.1"],
        [1.5, "Chapter 1.5th", "Chapter 1.5th"], [1.5, "The Remake", "The Remake"],
        [1, "Chapter 1: -2 HP", "-2 HP"], [1, "Chapter 1: —Forever—", "—Forever—"],
        [1, "Chapter 1 - -2 HP", "-2 HP"],
        [1, "1-2 Punch", "1-2 Punch"], [1, "Chapter 1–2", "Chapter 1–2"],
      ] as const) {
        const replay: typeof Application.scheduleRequest = async (request) => {
          const url = new globalThis.URL(request.url);
          if (url.origin + url.pathname !== `${DOMAIN_API}/chapters`) throw new Error(`Unexpected chapter replay route: ${request.url}`);
          return [{ ...seed.response, url: request.url }, buffer({ ...raw, post: { ...raw.post,
            chapters: [{ ...chapter, number, title }] } })];
        };
        Application.scheduleRequest = replay;
        if (Application.scheduleRequest !== replay) throw new Error("Native runtime does not allow replacing Application.scheduleRequest");
        const result = await extension.getChapters(source);
        expect(result).to.have.length(1); expect(result[0].sourceManga).to.equal(source);
        expect(result[0].chapterId).to.equal(chapter.slug); expect(result[0].chapNum).to.equal(number);
        expect(result[0].title).to.equal(expected);
      }
      expect(probe.requests.length).to.equal(before);
    } finally { Application.scheduleRequest = schedule; }
  });

  const verifyReader = async (source: SourceManga, chapters: Chapter[], reader: ChapterDetails, evidence: TestLogger, responses = probe.responses, expectedApiChapterId?: number): Promise<ReaderProof> => {
    expect(chapters).not.to.be.empty;
    for (const chapter of chapters) expect(chapter.sourceManga).to.equal(source);
    expect(reader.mangaId).to.equal(source.mangaId);
    expect(reader.id).to.equal(chapters[0].chapterId);
    if (!("pages" in reader)) throw new Error("Expected manga pages");
    const slug = source.mangaInfo.additionalInfo?.slug;
    expect(source.mangaInfo.shareUrl).to.equal(`${DOMAIN}/series/${slug}`);
    const response = responses.find(({ request }) => isSeriesRoute(request.url, slug!, chapters[0].chapterId));
    expect(response).not.to.equal(undefined);
    const $ = cheerio.load(response!.body);
    evidence.log("readerInput", {
      mangaId: source.mangaId, chapterId: chapters[0].chapterId, chapNum: chapters[0].chapNum,
      readerPath: new globalThis.URL(response!.request.url).pathname, nativePages: reader.pages.length,
      layout: { seoImages: $('section[aria-label*="comic pages"] img[src]').length,
        indexedImages: $("[data-image-index]").length, documentImages: $("img[src]").length,
        astroIslands: $("astro-island").length },
    });
    const postId = Number(source.mangaId.split(/[:/|]/)[0]);
    expect(Number.isSafeInteger(postId) && postId > 0).to.equal(true);
    const listResponse = responses.find(({ request }) => {
      const url = new globalThis.URL(request.url);
      return url.origin + url.pathname === `${DOMAIN_API}/chapters` && url.searchParams.get("postId") === String(postId);
    });
    expect(listResponse, "same native chapter-list response").not.to.equal(undefined);
    const raw = JSON.parse(listResponse!.body) as { post: { chapters: OracleChapter[] } };
    const selected = raw.post.chapters.filter((chapter) => chapter.slug === chapters[0].chapterId);
    expect(selected, "unique source chapter slug").to.have.length(1);
    const identity: ReaderIdentity = { slug: chapters[0].chapterId, number: chapters[0].chapNum, postId, postSlug: slug! };
    assertPublicChapter(selected[0], identity);
    identity.id = selected[0].id;
    if (expectedApiChapterId !== undefined) expect(identity.id, "pinned native-list API chapter ID").to.equal(expectedApiChapterId);
    expect(raw.post.chapters.filter((chapter) => chapter.id === identity.id), "unique source chapter ID").to.have.length(1);
    evidence.log("readerOracleInput", { ...identity, publicListAccess: true, oracleRequests: 1 });
    const [oracleResponse, oracleBody] = await Application.scheduleRequest({
      url: `${DOMAIN_API}/chapter?chapterId=${identity.id}`, method: "GET",
    });
    expect(oracleResponse.status).to.equal(200);
    const oracle = JSON.parse(Application.arrayBufferToUTF8String(oracleBody)) as { chapter: OracleChapter };
    assertPublicChapter(oracle.chapter, identity, true);
    const pages = orderedOraclePages(oracle.chapter);
    const comparablePages = pages.map(comparableReaderPage);
    const literalSlashAliases = pages.filter((url, index) => url !== comparablePages[index]).length;
    evidence.log("readerOracle", { chapterId: oracle.chapter.id, postId: oracle.chapter.mangaPostId,
      chapterStatus: oracle.chapter.chapterStatus, publicAccess: true, sourcePages: pages.length,
      firstPagePath: readerPageDiagnostic(pages[0]).path, lastPagePath: readerPageDiagnostic(pages.at(-1)).path,
      literalSlashAliases });
    expect(new Set(comparablePages).size, "no source pages collapse into duplicates").to.equal(pages.length);
    // Observe the consumed HTML before the unchanged equality can fail. These
    // indices refer only to the validated API manifest, never inferred filenames.
    const apiIndex = (url: string | undefined): number => {
      try { return url === undefined ? -1 : comparablePages.indexOf(comparableReaderPage(url)); }
      catch { return -1; }
    };
    const advertisedIndex = (value: string | undefined) => value === undefined ? undefined :
      /^\d{1,6}$/.test(value) && Number(value) < 2000 ? Number(value) : "[redacted]";
    const domImages = $("img").toArray().map((element, position) => ({
      position, hasSrc: $(element).attr("src") !== undefined,
      apiIndex: apiIndex($(element).attr("src")), exact: pages.includes($(element).attr("src") ?? ""),
      hidden: $(element).closest("[hidden]").length > 0,
      ariaHidden: $(element).closest('[aria-hidden="true"]').length > 0,
      // Structural positions only: no IDs, classes, arbitrary tag names or URLs.
      path: $(element).parents().toArray().reverse().concat(element).slice(-8).map((node) =>
        `${/^(html|head|body|main|section|div|picture|img|astro-island)$/.test(node.name) ? node.name : "element"}[${$(node).index()}]`).join(">"),
      advertisedIndex: advertisedIndex($(element).attr("data-image-index")),
      nearestAdvertisedIndex: advertisedIndex($(element).closest("[data-image-index]").attr("data-image-index")),
    }));
    const domReaderApiIndices = domImages.filter((image) => image.apiIndex >= 0).map((image) => image.apiIndex);
    const indexedElements = $("[data-image-index]").toArray().map((element, position) => ({
      position, advertisedIndex: advertisedIndex($(element).attr("data-image-index")),
      imagePositions: $(element).find("img").addBack("img").toArray().map((image) => $("img").index(image)),
    }));
    // Independently inspect the existing fallback's raw URL scan input, before
    // grouping/sorting. Do not call the production parser or treat this as oracle.
    const documentMatches = Array.from(response!.body.matchAll(/https?:\/\/[^"'\\\s]+\/(?:public\/)?upload\/series\/[^"'\\\s]+?\.(?:webp|jpe?g|png)(?:\?[^"'\\\s]*)?/gi));
    const documentApiIndices = documentMatches.map(([url]) => apiIndex(url));
    const documentFirstReaderApiIndices = [...new Set(documentApiIndices.filter((index) => index >= 0))];
    evidence.log("readerHtmlOrder", {
      domImages, domReaderApiIndices, domReaderCount: domReaderApiIndices.length,
      domComplete: domReaderApiIndices.length === pages.length && new Set(domReaderApiIndices).size === pages.length,
      indexedElements,
      documentScan: { rawCandidateCount: documentMatches.length, candidateApiIndices: documentApiIndices,
        completeTokens: documentMatches.map((match) => {
          const next = response!.body[match.index + match[0].length];
          return next === undefined || /["'\s<>]/.test(next);
        }),
        exactCandidateCount: documentMatches.filter(([url], index) => documentApiIndices[index] >= 0 && url === pages[documentApiIndices[index]]).length,
        literalSlashAliasCandidateCount: documentMatches.filter(([url], index) => documentApiIndices[index] >= 0 && url !== pages[documentApiIndices[index]]).length,
        unmatchedCandidateCount: documentApiIndices.filter((index) => index < 0).length,
        firstReaderApiIndices: documentFirstReaderApiIndices,
        readerCandidateCount: documentFirstReaderApiIndices.length,
        coversAllApiPages: documentFirstReaderApiIndices.length === pages.length },
      nativeApiIndices: reader.pages.map(apiIndex),
    });
    // Record before Chai truncates array values in String(error). Reuse only the
    // consumed manifests; this log must not fetch or change either page array.
    evidence.log("readerManifestComparison", {
      nativeCount: reader.pages.length, apiCount: pages.length,
      pages: Array.from({ length: Math.max(reader.pages.length, pages.length) }, (_, index) => {
        let nativeComparable: string | undefined;
        try { if (reader.pages[index] !== undefined) nativeComparable = comparableReaderPage(reader.pages[index]); } catch { /* The unchanged strict assertion below still rejects this URL. */ }
        return { index, native: readerPageDiagnostic(reader.pages[index]), api: readerPageDiagnostic(pages[index]),
          equal: nativeComparable !== undefined && nativeComparable === comparablePages[index],
          nativeApiIndex: nativeComparable === undefined ? -1 : comparablePages.indexOf(nativeComparable) };
      }),
    });
    expect(reader.pages.map(comparableReaderPage), "HTML reader equals independent ordered public API manifest; literal pathname slash runs only").to.deep.equal(comparablePages);
    expect(new Set(reader.pages).size).to.equal(reader.pages.length);
    const imageEvidence: { page: number; bytes: number; contentLength?: number; contentEncoding?: string; format: string }[] = [];
    const pairs = evidence.list("readerRawImagePairs");
    let rawImageRequests = 0;
    for (const url of new Set([reader.pages[0], reader.pages.at(-1)!])) {
      const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
      expect(response.status, url).to.equal(200);
      expect(Object.entries(response.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1], url).to.match(/^image\//i);
      const bytes = new Uint8Array(data), magic = String.fromCharCode(...bytes.slice(0, 16));
      expect(bytes.length, url).to.be.greaterThan(100);
      const length = Object.entries(response.headers).find(([name]) => name.toLowerCase() === "content-length")?.[1]?.trim();
      const contentLength = length && /^\d+$/.test(length) && Number.isSafeInteger(Number(length)) ? Number(length) : undefined;
      const contentEncoding = Object.entries(response.headers).find(([name]) => name.toLowerCase() === "content-encoding")?.[1]?.trim().toLowerCase();
      if (contentLength !== undefined && (!contentEncoding || contentEncoding === "identity"))
        expect(bytes.length, `Content-Length: ${url}`).to.equal(contentLength);
      let format: string;
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        format = "JPEG";
        expect(Array.from(bytes.slice(-2)), `JPEG EOI: ${url}`).to.deep.equal([0xff, 0xd9]);
      } else if (magic.startsWith("\x89PNG\r\n\x1a\n")) {
        format = "PNG";
        expect(Array.from(bytes.slice(-12)), `PNG final IEND chunk: ${url}`).to.deep.equal([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
      } else if (magic.startsWith("GIF87a") || magic.startsWith("GIF89a")) {
        format = "GIF";
        expect(bytes.at(-1), `GIF trailer: ${url}`).to.equal(0x3b);
      } else if (magic.startsWith("RIFF") && magic.slice(8, 12) === "WEBP") {
        format = "WebP";
        expect(new DataView(data).getUint32(4, true) + 8, `WebP RIFF file length: ${url}`).to.equal(bytes.length);
      } else if (/^....ftypavi[fs]/s.test(magic)) {
        format = "AVIF";
        const view = new DataView(data);
        let offset = 0;
        while (offset < bytes.length) {
          expect(offset + 8, `AVIF box header: ${url}`).to.be.at.most(bytes.length);
          let size = view.getUint32(offset), header = 8;
          if (size === 1) {
            expect(offset + 16, `AVIF extended box header: ${url}`).to.be.at.most(bytes.length);
            size = view.getUint32(offset + 8) * 0x1_0000_0000 + view.getUint32(offset + 12);
            header = 16;
          } else if (size === 0) size = bytes.length - offset;
          expect(Number.isSafeInteger(size) && size >= header && offset + size <= bytes.length, `AVIF complete box: ${url}`).to.equal(true);
          offset += size;
        }
        expect(offset, `AVIF complete file: ${url}`).to.equal(bytes.length);
      } else throw new Error(`Unsupported image response format: ${url}`);
      const rawUrl = pages[reader.pages.indexOf(url)];
      if (rawUrl !== url) {
        // Both URLs are source-derived and already matched above. Fetch the exact
        // raw API URL, never an alias manufactured from the normalized URL.
        const [rawResponse, rawData] = await Application.scheduleRequest({ url: rawUrl, method: "GET" });
        rawImageRequests++;
        expect(rawResponse.status, rawUrl).to.equal(200);
        expect(Object.entries(rawResponse.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1], rawUrl).to.match(/^image\//i);
        const rawBytes = new Uint8Array(rawData);
        let firstMismatch = 0;
        while (firstMismatch < bytes.length && firstMismatch < rawBytes.length && bytes[firstMismatch] === rawBytes[firstMismatch]) firstMismatch++;
        if (firstMismatch === bytes.length && firstMismatch === rawBytes.length) firstMismatch = -1;
        pairs.scope(String(rawImageRequests)).log("comparison", { page: reader.pages.indexOf(url) + 1,
          rawPath: readerPageDiagnostic(rawUrl).path, nativePath: readerPageDiagnostic(url).path,
          rawBytes: rawBytes.length, nativeBytes: bytes.length, firstMismatch });
        expect(rawBytes.length, "raw published/native image body length").to.equal(bytes.length);
        expect(firstMismatch, "raw published/native entire image body first mismatch (-1 means equal)").to.equal(-1);
      }
      imageEvidence.push({ page: reader.pages.indexOf(url) + 1, bytes: bytes.length, contentLength, contentEncoding, format });
    }
    const proof = { mangaId: source.mangaId, chapterId: reader.id, completePages: reader.pages.length, literalSlashAliases, rawImageRequests };
    evidence.log("readerEvidence", { ...proof, images: imageEvidence });
    return proof;
  };

  suite.test("original reader: native source references, complete pages and first/last image bytes", async () => {
    const source658 = suite.state["MangaProviding.getMangaDetails"] as SourceManga;
    const chapters658 = suite.state["ChapterProviding.getChapters"] as Chapter[];
    expect(source658.mangaId, "pinned native reader title").to.equal("658:got-a-gallery-in-the-wild");
    expect(chapters658[0]?.chapterId, "pinned first native chapter slug").to.equal("chapter-0");
    expect(chapters658[0]?.chapNum, "pinned first native chapter number").to.equal(0);
    const dynamic = await verifyReader(
      source658,
      chapters658,
      suite.state["ChapterProviding.getChapterDetails"] as ChapterDetails,
      logger,
      undefined,
      32482,
    );
    const mangaId = "403:so-did-someone-force-you-to-become-the-heavenly-demon";
    const slug = "so-did-someone-force-you-to-become-the-heavenly-demon";
    const evidence = logger.scope("regression403");
    if (dynamic.mangaId === mangaId) {
      evidence.log("proof", { ...dynamic, reusedDynamic: true });
    } else {
      const responseStart = probe.responses.length;
      evidence.log("input", { mangaId, slug, path: `/series/${slug}` });
      const schedule = Application.scheduleRequest;
      const errorIdentity = (value: unknown) => {
        const error = value as { name?: unknown; code?: unknown } | undefined;
        const names = ["Error", "TypeError", "SyntaxError", "URIError", "FetchError", "SocketError", "TimeoutError", "AbortError"];
        const codes = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ABORT_ERR"];
        return { name: typeof error?.name === "string" && names.includes(error.name) ? error.name : "Other",
          code: typeof error?.code === "string" && codes.includes(error.code) ? error.code : typeof error?.code === "number" && Number.isSafeInteger(error.code) ? error.code : undefined };
      };
      const record: typeof Application.scheduleRequest = async (request) => {
        if (request.url !== `${DOMAIN}/series/${slug}`) return schedule(request);
        try {
          const result = await schedule(request);
          evidence.log("detailsResponse", { status: result[0].status, bytes: result[1].byteLength });
          if (result[0].status === 200) {
            try {
              const post = parseMangaPage(Application.arrayBufferToUTF8String(result[1]), { id: "403", slug });
              evidence.log("detailsParser", { outcome: post ? "matched" : "empty", idMatches: post?.id === 403, slugMatches: post?.slug === slug });
            } catch {
              evidence.log("detailsParser", { outcome: "threw" });
            }
          }
          return result;
        } catch (error) {
          evidence.log("detailsError", { ...errorIdentity(error), cause: errorIdentity((error as { cause?: unknown })?.cause) });
          throw error;
        }
      };
      let source: SourceManga;
      try {
        Application.scheduleRequest = record;
        if (Application.scheduleRequest !== record) throw new Error("Native runtime cannot record403 request diagnostics");
        source = await extension.getMangaDetails(mangaId);
      } finally {
        Application.scheduleRequest = schedule;
      }
      expect(source.mangaId).to.equal(mangaId);
      expect(source.mangaInfo.additionalInfo?.slug).to.equal(slug);
      expect(source.mangaInfo.shareUrl).to.equal(`${DOMAIN}/series/${slug}`);
      const chapters = await extension.getChapters(source);
      expect(chapters).not.to.be.empty;
      expect(chapters[0].sourceManga).to.equal(source);
      const reader = await extension.getChapterDetails(chapters[0]);
      const proof = await verifyReader(source, chapters, reader, evidence, probe.responses.slice(responseStart));
      evidence.log("proof", { ...proof, reusedDynamic: false });
    }
  });

  suite.test("regression584: saved apostrophe ID details, original chapters/reader and complete image bytes", async () => {
    const mangaId = "584:the-sword-emperor%27s-path-to-namgung";
    const slug = "the-sword-emperor's-path-to-namgung";
    const evidence = logger.scope("regression584");
    const settings = await extension.getSettingsForm(), previous = contentSettings().excludeNSFW;
    await settings.setExcludeNSFW(true);
    evidence.log("input", { mangaId, slug, path: `/series/${slug}`, stage: "details", exclusion: true });
    const schedule = Application.scheduleRequest, responseStart = probe.responses.length;
    const transport = evidence.list("transport");
    let sequence = 0;
    const errorIdentity = (value: unknown) => {
      const error = value as { name?: unknown; code?: unknown } | undefined;
      const safe = (part: unknown) => typeof part === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(part) ? part : undefined;
      return { name: safe(error?.name), code: typeof error?.code === "number" && Number.isSafeInteger(error.code) ? error.code : safe(error?.code) };
    };
    const record: typeof Application.scheduleRequest = async (request) => {
      const url = new globalThis.URL(request.url), entry = transport.scope(String(++sequence));
      entry.log("path", url.pathname);
      try {
        const result = await schedule(request);
        entry.log("status", result[0].status);
        if (url.origin === DOMAIN && url.pathname.startsWith("/series/")) {
          const $ = cheerio.load(Application.arrayBufferToUTF8String(result[1]));
          entry.log("layout", { h1: $("h1").length, namedH1: $('h1[itemprop="name"]').length,
            schemaImages: $('[itemprop="image"][src]').length, astroIslands: $("astro-island").length,
            indexedImages: $("[data-image-index]").length, seoImages: $('section[aria-label*="comic pages"] img[src]').length });
        }
        return result;
      } catch (error) {
        entry.log("error", { ...errorIdentity(error), cause: errorIdentity((error as { cause?: unknown })?.cause) });
        throw error;
      }
    };
    try {
      Application.scheduleRequest = record;
      if (Application.scheduleRequest !== record) throw new Error("Native runtime cannot record584 request diagnostics");
      const before = probe.requests.length;
      const source = await extension.getMangaDetails(mangaId);
      evidence.log("details", { mangaId: source.mangaId, title: source.mangaInfo.primaryTitle,
        paths: probe.requests.slice(before).map(({ url }) => new globalThis.URL(url).pathname) });
      expect(source.mangaId).to.equal(mangaId);
      expect(source.mangaInfo.primaryTitle).to.equal("The Sword Emperor’s Path to Namgung");
      expect(source.mangaInfo.additionalInfo?.slug).to.equal(slug);
      expect(source.mangaInfo.shareUrl).to.equal(`${DOMAIN}/series/${slug}`);
      expect(source.mangaInfo.contentRating).to.equal(ContentRating.MATURE);
      expect(probe.requests.slice(before).some(({ url }) => isSeriesRoute(url, slug)), "exact native apostrophe details route")
        .to.equal(true);
      const chapters = await extension.getChapters(source);
      expect(chapters).not.to.be.empty;
      const chapter = chapters[0];
      expect(chapter.sourceManga).to.equal(source);
      evidence.log("chapter", { chapterId: chapter.chapterId, chapNum: chapter.chapNum, stage: "original HTML reader" });
      const reader = await extension.getChapterDetails(chapter);
      await verifyReader(source, chapters, reader, evidence, probe.responses.slice(responseStart));
    } finally {
      Application.scheduleRequest = schedule;
      await settings.setExcludeNSFW(previous);
    }
  });

  suite.test("content: persisted default-on exclusion keeps unknown Mature and excludes actual warning names", async () => {
    const settings = await extension.getSettingsForm();
    expect(settings).to.be.instanceOf(VortexSettingsForm);
    await settings.setExcludeNSFW(true);
    expect(contentSettings().excludeNSFW).to.equal(true);
    const form = settings.getSections();
    expect(form[0].items[0]).to.include({ id: "excludeNSFW", value: true });
    expect(form[0].footer).to.include("Unknown").and.to.include("not a source adult label");
    const seed = probe.responses.find(({ request }) => isQuery(request))!;
    expect(seed).not.to.equal(undefined);
    const raw = JSON.parse(seed.body) as VortexQueryResponse;
    const posts = raw.posts.filter((post) => !post.isNovel && post.seriesType !== "NOVEL").slice(0, 3).map((post, index) => ({
      ...post, genres: index === 1 ? [{ name: "Adult" }] : index === 2 ? [{ name: "Mature" }] : [],
    })) as VortexPost[]; // Source-name evidence deliberately lacks taxonomy IDs.
    expect(posts).to.have.length(3);
    const warnings = Application.getState(stateKeys[1]);
    const schedule = Application.scheduleRequest;
    const requestCount = probe.requests.length;
    Application.setState(undefined, stateKeys[1]);
    try {
      const replay: typeof Application.scheduleRequest = async (request) => {
        if (!isQuery(request)) throw new Error(`Unexpected replay route: ${request.url}`);
        return [{ ...seed.response, url: request.url }, buffer({ ...raw, posts, totalCount: 3 })];
      };
      Application.scheduleRequest = replay;
      if (Application.scheduleRequest !== replay)
        throw new Error("Native runtime does not allow replacing Application.scheduleRequest");
      const result = await extension.getSearchResults({ title: "" });
      expect(result.items.map((item) => item.mangaId)).to.deep.equal([canonical(posts[0])]);
      expect(result.items[0].contentRating).to.equal(ContentRating.MATURE);
      await settings.setExcludeNSFW(false);
      expect((await extension.getSettingsForm()).getSections()[0].items[0]).to.include({ value: false });
      const allowed = await extension.getSearchResults({ title: "" });
      expect(allowed.items.map((item) => item.mangaId)).to.deep.equal(posts.map(canonical));
      expect(allowed.items.map((item) => item.contentRating)).to.deep.equal([ContentRating.MATURE, ContentRating.ADULT, ContentRating.MATURE]);
      await settings.setExcludeNSFW(true);
      // Sparse saved copies cannot erase a positive source warning.
      posts[1].genres = [];
      const again = await extension.getSearchResults({ title: "" });
      expect(again.items.map((item) => item.mangaId)).to.deep.equal([canonical(posts[0])]);
      expect(contentSettings().excludeNSFW).to.equal(true);
      const concurrentReplay: typeof schedule = async (request) => {
        if (!isQuery(request)) throw new Error(`Unexpected replay route: ${request.url}`);
        const labelled = new globalThis.URL(request.url).searchParams.get("searchTerm") === "labelled";
        const post = { ...posts[0], genres: labelled ? [{ name: "Adult" }] : [] };
        return [{ ...seed.response, url: request.url }, buffer({ ...raw, posts: [post], totalCount: 1 })];
      };
      Application.scheduleRequest = concurrentReplay;
      if (Application.scheduleRequest !== concurrentReplay)
        throw new Error("Native runtime does not allow replacing Application.scheduleRequest");
      await Promise.all([
        rejects(() => extension.getSearchResults({ title: "sparse" }), /content warnings changed/i),
        extension.getSearchResults({ title: "labelled" }).then((result) => { expect(result.items).to.be.empty; }),
      ]);
      const originalSlug = posts[0].slug;
      posts[0].slug += ".影";
      const unicode = await extension.getSearchResults({ title: "unicode" });
      expect(unicode.items.map((item) => item.mangaId)).to.deep.equal([canonical(posts[0])]);
      expect(unicode.items[0].mangaId).to.include("%2E%5F71");
      posts[0].slug = originalSlug;
      const source = suite.state["MangaProviding.getMangaDetails"] as SourceManga;
      const reader = suite.state["ChapterProviding.getChapterDetails"] as ChapterDetails;
      if (!("pages" in reader)) throw new Error("Expected previously issued reader pages");
      observeContent(source.mangaId, ["Adult"]);
      const image = { url: reader.pages[0], method: "GET" as const };
      const response: Response = { url: image.url, status: 200, headers: {}, cookies: [] };
      await rejects(() => VortexScans.vortexInterceptor.interceptRequest(image), /reader is hidden/i);
      await rejects(() => VortexScans.vortexInterceptor.interceptResponse(image, response, new ArrayBuffer(0)), /reader is hidden/i);
      expect(probe.requests.length).to.equal(requestCount);
    } finally {
      Application.scheduleRequest = schedule;
      Application.setState(warnings, stateKeys[1]);
      await settings.setExcludeNSFW(true);
    }
  });

  suite.test("content: a native request pending across a setting change cannot release stale results", async () => {
    const settings = await extension.getSettingsForm();
    await settings.setExcludeNSFW(false);
    const seed = probe.responses.find(({ request }) => isQuery(request))!;
    expect(seed).not.to.equal(undefined);
    const schedule = Application.scheduleRequest;
    const requestCount = probe.requests.length;
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    try {
      const replay: typeof Application.scheduleRequest = async (request) => {
        if (!isQuery(request)) throw new Error(`Unexpected replay route: ${request.url}`);
        enter();
        await held;
        return [{ ...seed.response, url: request.url }, buffer(JSON.parse(seed.body))];
      };
      Application.scheduleRequest = replay;
      if (Application.scheduleRequest !== replay)
        throw new Error("Native runtime does not allow replacing Application.scheduleRequest");
      const pending = rejects(() => extension.getSearchResults({ title: "" }), /settings changed/i);
      await Promise.race([entered, pending.then(() => { throw new Error("Native request ended before response interception"); })]);
      await settings.setExcludeNSFW(true);
      release();
      await pending;
      expect(probe.requests.length).to.equal(requestCount);
      expect((await extension.getSettingsForm()).getSections()[0].items[0]).to.include({ value: true });
    } finally {
      release();
      Application.scheduleRequest = schedule;
      await settings.setExcludeNSFW(true);
    }
  });

  stateKeys.forEach((key) => Application.setState(undefined, key));
  probe.registerInterceptor();
  try {
    await suite.run();
  } finally {
    stateKeys.forEach((key, index) => Application.setState(saved[index], key));
    probe.unregisterInterceptor();
  }
}
