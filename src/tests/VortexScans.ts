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
  type VortexPost,
  type VortexQueryResponse,
} from "../VortexScans/implementations/shared/models.js";
import { serializedProperty } from "../VortexScans/implementations/discover-section/page-data.js";
import { parseHome } from "../VortexScans/implementations/discover-section/home.js";
import { contentSettings, observeContent } from "../VortexScans/implementations/shared/content.js";
import { VortexSettingsForm } from "../VortexScans/implementations/settings-form/main.js";
import { buildMangaId } from "../VortexScans/implementations/shared/utils.js";
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
const cards = (items: DiscoverSectionItem[]) =>
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
  );

  suite.test("home: one cold response, no warm requests or per-title enrichment", async () => {
    expect(sourceInfo.capabilities).to.include(SourceIntents.SETTINGS_FORM_PROVIDING);
    expect(contentSettings().excludeNSFW).to.equal(true);
    // Check complete source membership separately from the explicit policy mutations.
    await (await extension.getSettingsForm()).setExcludeNSFW(false);
    const sections = await extension.getDiscoverSections();
    expect(sections.map((section) => section.id)).to.deep.equal([
      "featured", "popular-today", "latest-releases", "release-filters", "collections",
      "most-popular", "genres",
    ]);
    const selected = sections.filter((section) =>
      ["featured", "popular-today", "latest-releases", "most-popular"].includes(section.id),
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

  suite.test("home: exact current 6/20/36/9 rows, original covers and terminal editorial rows", async () => {
    const featured = field<VortexPost[]>(home, "combinedSliderPosts");
    const latest = field<VortexPost[]>(home, "latestMangaPosts");
    const monthly = field<VortexPost[]>(home, "monthlyPosts");
    const ranking = field<{ id: number; slug: string; title: string; coverImage: string }[]>(home, "transformedTopSeries").slice(0, 9);
    expect(featured).to.have.length(6);
    expect(latest).to.have.length(36);
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
    for (const [id, posts] of [["featured", featured], ["latest-releases", latest], ["most-popular", popular]] as const)
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
      expect(await extension.getDiscoverSectionItems(section, { page: 2 })).to.deep.equal({ items: [] });
    }
    expect(probe.requests.length).to.equal(before);
  });

  suite.test("latest: two genuine 36-post continuations preserve order and unique IDs", async () => {
    const section = (await extension.getDiscoverSections()).find((item) => item.id === "latest-releases")!;
    let cursor = rows.get(section.id)!.metadata;
    const seen = new Set(cards(rows.get(section.id)!.items).map((item) => item.mangaId));
    for (const page of [2, 3]) {
      expect(cursor).not.to.equal(undefined);
      const before = probe.responses.length, snapshot = JSON.stringify(cursor);
      const result = await extension.getDiscoverSectionItems(section, cursor as Parameters<typeof extension.getDiscoverSectionItems>[1]);
      expect(JSON.stringify(cursor)).to.equal(snapshot);
      const responses = probe.responses.slice(before);
      expect(responses).to.have.length(1);
      const url = new globalThis.URL(responses[0].request.url);
      expect(url.origin + url.pathname).to.equal(`${DOMAIN_API}/posts`);
      for (const [key, value] of Object.entries({ page: String(page), perPage: "36", searchTerm: "", isNovel: "false", tag: "latestUpdatePinned" }))
        expect(url.searchParams.get(key), key).to.equal(value);
      const data = JSON.parse(responses[0].body) as VortexQueryResponse;
      expect(data.posts).to.have.length(36);
      const expected = expectedCards(data.posts).filter((item) => !seen.has(item.mangaId));
      expect(cards(result.items)).to.deep.equal(expected);
      expect(result.items).not.to.be.empty;
      for (const item of cards(result.items)) {
        expect(seen.has(item.mangaId)).to.equal(false);
        seen.add(item.mangaId);
      }
      cursor = result.metadata;
    }
    logger.log("latestContinuations", { pages: [2, 3], unique: seen.size });
  });

  suite.test("original reader: native source references, complete pages and first/last image bytes", async () => {
    const source = suite.state["MangaProviding.getMangaDetails"] as SourceManga;
    const chapters = suite.state["ChapterProviding.getChapters"] as Chapter[];
    const reader = suite.state["ChapterProviding.getChapterDetails"] as ChapterDetails;
    expect(chapters).not.to.be.empty;
    for (const chapter of chapters) expect(chapter.sourceManga).to.equal(source);
    expect(reader.mangaId).to.equal(source.mangaId);
    expect(reader.id).to.equal(chapters[0].chapterId);
    if (!("pages" in reader)) throw new Error("Expected manga pages");
    const slug = source.mangaInfo.additionalInfo?.slug;
    expect(source.mangaInfo.shareUrl).to.equal(`${DOMAIN}/series/${slug}`);
    const response = probe.responses.find(({ request }) => request.url.endsWith(`/series/${slug}/${chapters[0].chapterId}`));
    expect(response).not.to.equal(undefined);
    const $ = cheerio.load(response!.body);
    logger.log("readerInput", {
      mangaId: source.mangaId, chapterId: chapters[0].chapterId, chapNum: chapters[0].chapNum,
      readerPath: new globalThis.URL(response!.request.url).pathname, nativePages: reader.pages.length,
      layout: { seoImages: $('section[aria-label*="comic pages"] img[src]').length,
        indexedImages: $("[data-image-index]").length, documentImages: $("img[src]").length,
        astroIslands: $("astro-island").length },
    });
    const postId = Number(source.mangaId.split(/[:/|]/)[0]);
    expect(Number.isSafeInteger(postId) && postId > 0).to.equal(true);
    const listResponse = probe.responses.find(({ request }) => {
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
    expect(raw.post.chapters.filter((chapter) => chapter.id === identity.id), "unique source chapter ID").to.have.length(1);
    logger.log("readerOracleInput", { ...identity, publicListAccess: true, oracleRequests: 1 });
    const [oracleResponse, oracleBody] = await Application.scheduleRequest({
      url: `${DOMAIN_API}/chapter?chapterId=${identity.id}`, method: "GET",
    });
    expect(oracleResponse.status).to.equal(200);
    const oracle = JSON.parse(Application.arrayBufferToUTF8String(oracleBody)) as { chapter: OracleChapter };
    assertPublicChapter(oracle.chapter, identity, true);
    const pages = orderedOraclePages(oracle.chapter);
    logger.log("readerOracle", { chapterId: oracle.chapter.id, postId: oracle.chapter.mangaPostId,
      chapterStatus: oracle.chapter.chapterStatus, publicAccess: true, sourcePages: pages.length,
      firstPagePath: new globalThis.URL(pages[0]).pathname, lastPagePath: new globalThis.URL(pages.at(-1)!).pathname });
    expect(reader.pages, "HTML reader equals independent ordered public API manifest").to.deep.equal(pages);
    expect(new Set(reader.pages).size).to.equal(reader.pages.length);
    const imageEvidence: { page: number; bytes: number; contentLength?: number; contentEncoding?: string; format: string }[] = [];
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
      imageEvidence.push({ page: reader.pages.indexOf(url) + 1, bytes: bytes.length, contentLength, contentEncoding, format });
    }
    logger.log("readerEvidence", { mangaId: source.mangaId, chapterId: reader.id, completePages: reader.pages.length, images: imageEvidence });
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
