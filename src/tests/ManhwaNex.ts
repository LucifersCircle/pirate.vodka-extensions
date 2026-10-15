/* eslint-disable no-unused-expressions */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { ContentRating, PaperbackInterceptor, type Chapter, type Request, type Response, type SourceManga, type TestLogger } from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { ManhwaNex } from "../ManhwaNex/main.js";
import { ManhwaNexSearchForm, ManhwaNexSettingsForm, preferences } from "../ManhwaNex/forms.js";
import { BASE_URL, GENRES, SECTIONS, SORTS, STATUSES, type CatalogItem } from "../ManhwaNex/models.js";
import { fetchText, searchUrl, ManhwaNexInterceptor } from "../ManhwaNex/network.js";
import { chapterTitle, emptyMetadata, imageUrl, isAllowed, parseCatalog, parseChapters, parseGenreOptions, parseReader, seriesUrl, taxonomyId, validateCatalogUrl } from "../ManhwaNex/parsers.js";
import { TestSuite } from "./suite.js";

class RequestProbe extends PaperbackInterceptor {
  readonly requests: Request[] = [];
  gate?: (request: Request, data: ArrayBuffer) => Promise<ArrayBuffer>;
  override async interceptRequest(request: Request) {
    if (request.url.startsWith(`${BASE_URL}/`)) this.requests.push(request);
    return request;
  }
  override async interceptResponse(request: Request, _response: Response, data: ArrayBuffer) {
    return this.gate ? this.gate(request, data) : data;
  }
}
const rejects = async (operation: () => Promise<unknown>, pattern: RegExp) => {
  let failure: unknown;
  try { await operation(); } catch (error) { failure = error; }
  expect(String(failure)).to.match(pattern);
};
const imageBytes = async (pages: string[]) => {
  for (const url of new Set([pages[0], pages[pages.length - 1]])) {
    const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
    expect(response.status, url).to.equal(200);
    expect(Object.entries(response.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1], url).to.match(/^image\//i);
    const bytes = new Uint8Array(data), magic = String.fromCharCode(...bytes.slice(0, 16));
    expect(bytes.length, url).to.be.greaterThan(100);
    expect((bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) || magic.startsWith("\x89PNG\r\n\x1a\n") || magic.startsWith("GIF8") || (magic.startsWith("RIFF") && magic.slice(8, 12) === "WEBP") || /^....ftypavi[fs]/s.test(magic), url).to.equal(true);
  }
};
const ids = (items: object[]) => items.map((item) => {
  if (!("mangaId" in item) || typeof item.mangaId !== "string") throw new Error("Expected native manga card.");
  return item.mangaId;
});
const SAMPLE = "logging-10000-years-into-the-future";

export async function runTests(logger: TestLogger) {
  const savedRegistry = Application.getState("ManhwaNex.readerPages");
  const saved = Application.getState("ManhwaNex.preferences"), suite = new TestSuite("ManhwaNex tests", logger);
  const settings = new ManhwaNexSettingsForm(), probe = new RequestProbe("ManhwaNex.tests");
  let home = "", search = "", sample: SourceManga, chapters: Chapter[];
  let sourceItems: CatalogItem[] = [];
  suite.test("initialisation and persistent safe defaults", async () => {
    Application.setState(undefined, "ManhwaNex.preferences"); await ManhwaNex.initialise(); probe.registerInterceptor();
    expect(preferences().excludeNSFW).to.equal(true);
    expect((await ManhwaNex.getSettingsForm()).getSections()).not.to.be.empty;
  });
  suite.test("discovery: exact native section names and order", async () => {
    home = await fetchText(`${BASE_URL}/`);
    expect((await ManhwaNex.getDiscoverSections()).map((section) => section.title)).to.deep.equal(["Popular Series", "Latest Updates"]);
    expect(parseCatalog(home, "popular").items).not.to.be.empty;
    expect(parseCatalog(home, "latest").items).not.to.be.empty;
  });
  suite.test("discovery: two cold requests and zero warm without per-card lookups", async () => {
    await settings.setExcludeNSFW(true); probe.requests.length = 0;
    const popular = await ManhwaNex.getDiscoverSectionItems(SECTIONS[0]);
    const latest = await ManhwaNex.getDiscoverSectionItems(SECTIONS[1]);
    expect(probe.requests).to.have.length(2);
    expect(probe.requests.filter((request) => request.url.endsWith("/wp-admin/admin-ajax.php"))).to.have.length(1);
    const body = probe.requests.find((request) => request.method === "POST")?.body;
    expect(body).to.be.a("string");
    expect(body).to.include("post_name__in").and.to.include("manga_adult_content");
    expect(ids(popular.items)).to.deep.equal(ids(parseCatalog(home, "popular").items));
    expect(ids(latest.items)).to.deep.equal(ids(parseCatalog(home, "latest").items));
    for (const item of [...popular.items, ...latest.items]) expect(isAllowed(item.metadata as ReturnType<typeof emptyMetadata>)).to.equal(true);
    const count = probe.requests.length;
    expect(ids((await ManhwaNex.getDiscoverSectionItems(SECTIONS[0])).items)).to.deep.equal(ids(popular.items));
    expect(ids((await ManhwaNex.getDiscoverSectionItems(SECTIONS[1])).items)).to.deep.equal(ids(latest.items));
    expect(probe.requests).to.have.length(count);
  });
  suite.test("discovery: native page-two order and fixed Popular carousel", async () => {
    const initial = await ManhwaNex.getDiscoverSectionItems(SECTIONS[1]); expect(initial.metadata).not.to.equal(undefined);
    const nextUrl = parseCatalog(home, "latest").next!;
    const expected = parseCatalog(await fetchText(nextUrl), "latest", false, nextUrl);
    const next = await ManhwaNex.getDiscoverSectionItems(SECTIONS[1], initial.metadata);
    expect(ids(next.items)).to.deep.equal(ids(expected.items).filter((id) => !ids(initial.items).includes(id)));
    expect((await ManhwaNex.getDiscoverSectionItems(SECTIONS[0])).metadata).to.equal(undefined);
  });
  suite.test("search: only the actually advertised Relevance sort", async () => {
    expect(await ManhwaNex.getSortingOptions()).to.deep.equal(SORTS);
    search = await fetchText(searchUrl({ title: "" }, true)); sourceItems = parseCatalog(search, "search", true, searchUrl({ title: "" }, true)).items;
    const $ = cheerio.load(search);
    expect($(".c-nav-tabs .c-tabs-content a[href*=m_orderby], .c-nav-tabs a[href*=m_orderby]").toArray().every((node) => !($(node).attr("href") ?? "").match(/m_orderby=[a-z]/))).to.equal(true);
    await rejects(() => ManhwaNex.getSearchResults({ title: "" }, undefined, { id: "views", label: "Invented" }), /Unknown ManhwaNex sort/);
  });
  suite.test("search: exact native order, pagination and no-result termination", async () => {
    const first = await ManhwaNex.getSearchResults({ title: "" }); expect(ids(first.items)).to.deep.equal(ids(sourceItems.filter((item) => isAllowed(item.metadata))));
    expect(first.metadata).not.to.equal(undefined);
    const url = parseCatalog(search, "search", true, searchUrl({ title: "" }, true)).next!;
    const expected = parseCatalog(await fetchText(url), "search", true, url);
    const next = await ManhwaNex.getSearchResults({ title: "" }, first.metadata);
    expect(ids(next.items)).to.deep.equal(ids(expected.items.filter((item) => isAllowed(item.metadata))).filter((id) => !ids(first.items).includes(id)));
    const none = await ManhwaNex.getSearchResults({ title: "unmatchable-manhwanex-57209113" });
    expect(none.items).to.be.empty; expect(none.metadata).to.equal(undefined);
  });
  suite.test("search: source title and punctuation are forwarded unchanged", async () => {
    const query = { title: "Logging 10,000" }, result = await ManhwaNex.getSearchResults(query);
    const expected = parseCatalog(await fetchText(searchUrl(query, true)), "search", true, searchUrl(query, true));
    expect(ids(result.items)).to.deep.equal(ids(expected.items.filter((item) => isAllowed(item.metadata))));
    expect(result.items.some((item) => item.mangaId === SAMPLE)).to.equal(true);
  });
  suite.test("advanced search: all actual genre and status choices", async () => {
    const genres = parseGenreOptions(search);
    expect(genres.map((genre) => genre.id)).to.deep.equal(GENRES);
    const form = await ManhwaNex.getAdvancedSearchForm({ title: "" }); expect(form.getSections()).not.to.be.empty;
    const draft = new ManhwaNexSearchForm({ title: "" }, genres);
    await draft.setGenres(["action", "fantasy"]); await draft.setCondition(["1"]); await draft.setAuthor("3rd Studio"); await draft.setArtist("3rd Studio"); await draft.setRelease("2026"); await draft.setStatuses(["on-going"]);
    expect(draft.getSearchQueryMetadata()).to.deep.include({ genres: ["action", "fantasy"], condition: "1", author: "3rd Studio", artist: "3rd Studio", release: "2026", statuses: ["on-going"] });
    await draft.formDidSubmit(); await draft.setRelease("not-a-year"); await rejects(() => draft.formDidSubmit(), /four digits/);
    await draft.reset(); expect((draft.getSearchQueryMetadata() as { genres: string[] }).genres).to.deep.equal([]);
  });
  suite.test("advanced search: every native genre, condition and status is exercised", async () => {
    for (const genre of GENRES) {
      const result = await ManhwaNex.getSearchResults({ title: "", metadata: { genres: [genre] } });
      for (const item of result.items) expect(item.metadata.genres.some((tag) => tag.id === genre)).to.equal(true);
    }
    for (const status of STATUSES) {
      const query = { title: "", metadata: { statuses: [status.id] } };
      const expected = parseCatalog(await fetchText(searchUrl(query, true)), "search", true, searchUrl(query, true));
      expect(ids((await ManhwaNex.getSearchResults(query)).items)).to.deep.equal(ids(expected.items.filter((item) => isAllowed(item.metadata))));
    }
    const result = await ManhwaNex.getSearchResults({ title: "", metadata: { genres: ["action", "fantasy"], condition: "1" } });
    for (const item of result.items) for (const genre of ["action", "fantasy"]) expect(item.metadata.genres.some((tag) => tag.id === genre)).to.equal(true);
  });
  suite.test("advanced search: author, artist, release and adult semantics", async () => {
    for (const metadata of [{ author: "Xingjiu" }, { artist: "3rd Studio" }, { release: "2026" }]) {
      const query = { title: "", metadata }, url = searchUrl(query, true);
      const expected = parseCatalog(await fetchText(url), "search", true, url);
      expect(ids((await ManhwaNex.getSearchResults(query)).items)).to.deep.equal(ids(expected.items.filter((item) => isAllowed(item.metadata))));
    }
    expect((await ManhwaNex.getSearchResults({ title: "", metadata: { adult: "1" } })).items).to.be.empty;
    await settings.setExcludeNSFW(false);
    for (const adult of ["", "0", "1"]) {
      const query = { title: "", metadata: { adult } }, url = searchUrl(query, false);
      const expected = parseCatalog(await fetchText(url), "search", false, url);
      expect(ids((await ManhwaNex.getSearchResults(query)).items)).to.deep.equal(ids(expected.items));
    }
    await settings.setExcludeNSFW(true);
  });
  suite.test("search: numeric-author redirect fails visibly and long titles retain native semantics", async () => {
    await rejects(() => ManhwaNex.getSearchResults({ title: "", metadata: { author: "3rd Studio" } }), /redirected this search|catalog layout changed/);
    const title = parseCatalog(home, "popular").items[0].title;
    const query = { title }, url = searchUrl(query, true);
    const expected = parseCatalog(await fetchText(url), "search", true, url);
    expect(ids((await ManhwaNex.getSearchResults(query)).items)).to.deep.equal(ids(expected.items.filter((item) => isAllowed(item.metadata))));
  });
  suite.test("classification: unknown and conflicting source labels fail closed", async () => {
    expect(isAllowed(emptyMetadata())).to.equal(false);
    const $ = cheerio.load(search); $(".c-tabs-item__content").first().find(".mg_genres").remove();
    expect(isAllowed(parseCatalog($.html(), "search", true, searchUrl({ title: "" }, true)).items[0].metadata)).to.equal(false);
    const data = { ...sourceItems[0].metadata, nativeSafe: true, adult: true }; expect(isAllowed(data)).to.equal(false);
    expect(isAllowed({ ...data, adult: false, nativeSafe: false })).to.equal(false);
    for (const change of [(anchor: ReturnType<ReturnType<typeof cheerio.load>>) => anchor.text(""), (anchor: ReturnType<ReturnType<typeof cheerio.load>>) => anchor.attr("href", "https://other.test/manga-genre/action/"), (anchor: ReturnType<ReturnType<typeof cheerio.load>>) => anchor.attr("href", `${BASE_URL}/manga-genre/%zz/`), (anchor: ReturnType<ReturnType<typeof cheerio.load>>) => anchor.removeAttr("href"), (anchor: ReturnType<ReturnType<typeof cheerio.load>>) => anchor.attr("href", `${BASE_URL}/unexpected-route/action/`)]) {
      const broken = cheerio.load(search); change(broken(".mg_genres a").first());
      expect(() => parseCatalog(broken.html(), "search", true, searchUrl({ title: "" }, true))).to.throw(/unlabelled genre|invalid genre|identity/);
    }
  });
  suite.test("details: canonical identity, whole aliases and full metadata", async () => {
    sample = await ManhwaNex.getMangaDetails(SAMPLE);
    expect(sample.mangaId).to.equal(SAMPLE); expect(sample.mangaInfo.primaryTitle).to.equal("Logging 10,000 Years into the Future");
    expect(sample.mangaInfo.secondaryTitles[0]).to.include("Logging 10,000 Years into the Future");
    expect(sample.mangaInfo.synopsis).not.to.be.empty; expect(sample.mangaInfo.status).not.to.be.empty;
    expect(sample.mangaInfo.tagGroups?.[0].tags).not.to.be.empty;
    expect(sample.mangaInfo.contentRating).to.equal(ContentRating.MATURE);
    expect(sample.mangaInfo.shareUrl).to.equal(seriesUrl(SAMPLE));
  });
  suite.test("chapters: complete public AJAX list, exact persisted reference and volume zero", async () => {
    const stored = JSON.parse(JSON.stringify(sample)) as SourceManga;
    const html = await fetchText(`${seriesUrl(SAMPLE)}ajax/chapters/?t=1`, "");
    const expected = parseChapters(html, stored, new Date()); chapters = await ManhwaNex.getChapters(stored);
    expect(chapters.map((chapter) => chapter.chapterId)).to.deep.equal(expected.map((chapter) => chapter.chapterId));
    expect(new Set(chapters.map((chapter) => chapter.chapterId)).size).to.equal(chapters.length);
    for (const chapter of chapters) {
      expect(chapter.sourceManga).to.equal(stored); expect(chapter.volume).to.equal(0); expect(chapter.chapNum).to.be.a("number").and.not.to.be.NaN;
      expect(chapter.publishDate?.getTime()).to.be.a("number").and.not.to.be.NaN;
    }
    const decimal = chapters.find((chapter) => chapter.chapterId === "chapter-339-5");
    expect(decimal).to.include({ chapNum: 339.5, title: "", volume: 0 });
    expect(chapters.find((chapter) => chapter.chapterId === "chapter-360")).to.include({ chapNum: 360, title: "" });
  });
  suite.test("reader: persisted newest, oldest and decimal chapters with actual endpoint image bytes", async () => {
    for (const chapter of new Set([chapters[0], chapters[chapters.length - 1], chapters.find((item) => item.chapterId === "chapter-339-5")!])) {
      const persisted = JSON.parse(JSON.stringify(chapter)) as Chapter;
      const reader = await ManhwaNex.getChapterDetails(persisted);
      expect(reader.id).to.equal(chapter.chapterId); expect(reader.mangaId).to.equal(SAMPLE); expect(reader.pages.length).to.be.greaterThan(0);
      expect(new Set(reader.pages).size).to.equal(reader.pages.length);
      await imageBytes(reader.pages);
    }
  });
  suite.test("reader: cold persisted inputs for two other native titles", async () => {
    for (const item of sourceItems.filter((item) => isAllowed(item.metadata)).slice(0, 2)) {
      await settings.setExcludeNSFW(true);
      const source = JSON.parse(JSON.stringify(await ManhwaNex.getMangaDetails(item.mangaId))) as SourceManga;
      const list = await ManhwaNex.getChapters(source); expect(list).not.to.be.empty;
      for (const chapter of list) expect(chapter.sourceManga).to.equal(source);
      const reader = await ManhwaNex.getChapterDetails(JSON.parse(JSON.stringify(list[0])) as Chapter); await imageBytes(reader.pages);
    }
  });
  suite.test("reader guards: malformed IDs, foreign assets and exact chapter identity", async () => {
    for (const value of ["../chapter-1", "chapter-1/extra", "chapter-1?x=1", "chapter-1#page", "chapter-%2f1", "chapter-%5c1", "chapter-%001", "chapter-%252f1", "chapter-1\\extra"]) expect(() => seriesUrl(SAMPLE, value)).to.throw(/Invalid ManhwaNex identity/);
    for (const value of ["http://cdn.manhwanex.com/manga_a/b/1.png", "https://cdn.manhwanex.com.evil.test/manga_a/1.png", "https://cdn.manhwanex.com:443/manga_a/1.png", "https://other.test/1.png", "https://manhwanex.com/wp-content/uploads/../1.png"]) expect(() => imageUrl(value)).to.throw(/invalid image URL/);
    expect(taxonomyId("%e5%85%a8%e6%b0%91")).to.equal("%e5%85%a8%e6%b0%91");
    for (const id of ["%2f", "%5c", "%00", "%252f", "%2e%2e", "%zz", "%e5"]) expect(() => taxonomyId(id)).to.throw(/taxonomy/);
    expect(() => validateCatalogUrl("https://other.test/page/2/", `${BASE_URL}/`, 1)).to.throw(/invalid/);
    expect(() => validateCatalogUrl(`${BASE_URL}/page/1/`, `${BASE_URL}/`, 1)).to.throw(/non-advancing/);
    const html = await fetchText(seriesUrl(SAMPLE, "chapter-339-5"));
    expect(() => parseReader(html, { ...chapters[0], chapterId: "chapter-360" })).to.throw(/different reader chapter/);
    const foreign = cheerio.load(html); foreign("link[rel=canonical]").attr("href", seriesUrl("another-series", "chapter-339-5"));
    expect(() => parseReader(foreign.html(), { ...chapters[0], chapterId: "chapter-339-5" })).to.throw(/different reader chapter/);
  });
  suite.test("chapter subtitles: only redundant complete matching prefixes disappear", async () => {
    for (const [label, number, expected] of [["Chapter 339.5", 339.5, ""], ["Chapter 213 - REUP", 213, "REUP"], ["Chapter 204 - Fixed", 204, "Fixed"], ["Chapter 12 - 13", 12, "Chapter 12 - 13"], ["Chapter 12.5", 12, "Chapter 12.5"], ["Chapter 12A", 12, "Chapter 12A"], ["Special", 0, "Special"]] as [string, number, string][]) expect(chapterTitle(label, number)).to.equal(expected);
  });
  suite.test("chapters: real volume survives independently of leading chapter-title cleanup", async () => {
    const html = await fetchText(`${seriesUrl(SAMPLE)}ajax/chapters/?t=1`, "");
    const $ = cheerio.load(html);
    $("li.wp-manga-chapter").first().children("a").first().text("Volume 2 Chapter 66.1 - Real subtitle");
    const rows = parseChapters($.html(), sample, new Date());
    expect(rows[0]).to.include({ volume: 2, chapNum: 66.1, title: "Volume 2 Chapter 66.1 - Real subtitle" });
    expect(rows[0].sourceManga).to.equal(sample);
    $("li.wp-manga-chapter").first().children("a").first().text("Chapter 66.1 - Subtitle");
    $("li.wp-manga-chapter").first().wrap('<div class="wp-manga-volume"></div>');
    $("li.wp-manga-chapter").first().before('<div class="volume-name">Volume 3</div>');
    expect(parseChapters($.html(), sample, new Date())[0]).to.include({ volume: 3, chapNum: 66.1, title: "Subtitle" });
  });
  suite.test("classification: unknown live-response metadata blocks all native entry points", async () => {
    const source = JSON.parse(JSON.stringify(sample)) as SourceManga;
    const chapter = JSON.parse(JSON.stringify(chapters[0])) as Chapter;
    probe.gate = async (request, data) => {
      if (request.url.startsWith(`${BASE_URL}/`) && (request.url.includes("post_type=") || request.url.endsWith("/wp-admin/admin-ajax.php"))) {
        const $ = cheerio.load(Application.arrayBufferToUTF8String(data));
        $(".c-tabs-item__content").filter((_index, node) => $(node).find(`.post-title a[href="${seriesUrl(SAMPLE)}"]`).length > 0).find(".mg_genres").remove();
        return new TextEncoder().encode($.html()).buffer;
      }
      return data;
    };
    try {
      for (const operation of [() => ManhwaNex.getMangaDetails(SAMPLE), () => ManhwaNex.getChapters(source), () => ManhwaNex.getChapterDetails(chapter)]) {
        await settings.setExcludeNSFW(true);
        await rejects(operation, /hidden by NSFW exclusion|lacks reliable/);
      }
      await settings.setExcludeNSFW(true);
      const searchResult = await ManhwaNex.getSearchResults({ title: "Logging 10,000" });
      expect(ids(searchResult.items)).not.to.include(SAMPLE);
      await settings.setExcludeNSFW(true);
      const latest = await ManhwaNex.getDiscoverSectionItems(SECTIONS[1]);
      expect(ids(latest.items)).not.to.include(SAMPLE);
      await settings.setExcludeNSFW(false);
      expect((await ManhwaNex.getMangaDetails(SAMPLE)).mangaId).to.equal(SAMPLE);
    } finally { probe.gate = undefined; await settings.reset(); }
  });
  suite.test("settings: opt-out is persistent, reset and issued-image invalidation", async () => {
    const reader = await ManhwaNex.getChapterDetails(chapters[0]);
    await settings.setExcludeNSFW(false); expect(preferences().excludeNSFW).to.equal(false);
    expect(Application.getState("ManhwaNex.preferences")).to.deep.equal(preferences());
    await rejects(() => Application.scheduleRequest({ url: reader.pages[0], method: "GET" }), /settings changed/);
    probe.requests.length = 0;
    const popular = await ManhwaNex.getDiscoverSectionItems(SECTIONS[0]), latest = await ManhwaNex.getDiscoverSectionItems(SECTIONS[1]);
    expect(probe.requests).to.have.length(1); expect(ids(popular.items)).to.deep.equal(ids(parseCatalog(home, "popular").items)); expect(ids(latest.items)).to.deep.equal(ids(parseCatalog(home, "latest").items));
    await settings.reset(); expect(preferences().excludeNSFW).to.equal(true);
  });
  suite.test("reader authorization: persisted restart, settings change, unknown and evicted URLs", async () => {
    const reader = await ManhwaNex.getChapterDetails(chapters[0]);
    const fresh = new ManhwaNexInterceptor("ManhwaNex.restart-test");
    expect((await fresh.interceptRequest({ url: reader.pages[0], method: "GET" })).url).to.equal(reader.pages[0]);
    fresh.registerInterceptor();
    try { await imageBytes(reader.pages); } finally { fresh.unregisterInterceptor(); }
    await settings.setExcludeNSFW(false);
    await rejects(() => fresh.interceptRequest({ url: reader.pages[0], method: "GET" }), /settings changed/);
    await rejects(() => fresh.interceptRequest({ url: "https://cdn.manhwanex.com/manga_unknown/unknown/1.png", method: "GET" }), /authorization is missing/);
    const many = Array.from({ length: 4097 }, (_value, index) => `https://cdn.manhwanex.com/manga_registry/regression/${index}.png`);
    fresh.issuePages(many, SAMPLE);
    await rejects(() => fresh.interceptRequest({ url: many[0], method: "GET" }), /authorization is missing/);
    expect((await fresh.interceptRequest({ url: many[many.length - 1], method: "GET" })).url).to.equal(many[many.length - 1]);
    await settings.reset();
    const reauthorized = await ManhwaNex.getChapterDetails(JSON.parse(JSON.stringify(chapters[0])) as Chapter);
    await imageBytes(reauthorized.pages);
  });
  suite.test("settings race: stale in-flight discovery cannot repopulate cache", async () => {
    await settings.setExcludeNSFW(false);
    let release!: () => void, ready!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; }), arrived = new Promise<void>((resolve) => { ready = resolve; });
    probe.gate = async (request, data) => { if (request.url === `${BASE_URL}/`) { ready(); await held; } return data; };
    const pending = ManhwaNex.getDiscoverSectionItems(SECTIONS[0]);
    await arrived; await settings.setExcludeNSFW(true); release();
    await rejects(() => pending, /settings changed/); probe.gate = undefined;
    const result = await ManhwaNex.getDiscoverSectionItems(SECTIONS[0]); expect(result.items).not.to.be.empty;
    for (const item of result.items) expect(isAllowed(item.metadata as ReturnType<typeof emptyMetadata>)).to.equal(true);
  });
  try { await suite.run(); } finally { probe.gate = undefined; probe.unregisterInterceptor(); Application.setState(saved, "ManhwaNex.preferences"); Application.setState(savedRegistry, "ManhwaNex.readerPages"); }
}
