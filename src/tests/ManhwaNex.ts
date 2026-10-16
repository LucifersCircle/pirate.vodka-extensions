/* eslint-disable no-unused-expressions */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { ContentRating, PaperbackInterceptor, type Chapter, type Metadata, type Request, type Response, type SourceManga, type TestLogger } from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { ManhwaNex } from "../ManhwaNex/main.js";
import { ManhwaNexSearchForm, ManhwaNexSettingsForm, preferences, readFilters } from "../ManhwaNex/forms.js";
import { BASE_URL, GENRES, SECTIONS, SORTS, STATUSES, type CatalogItem } from "../ManhwaNex/models.js";
import { fetchText, searchUrl, ManhwaNexInterceptor } from "../ManhwaNex/network.js";
import { chapterTitle, emptyMetadata, imageUrl, isAllowed, parseCatalog, parseChapters, parseDetails, parseGenreOptions, parseHomeCategories, parseReader, seriesUrl, taxonomyId, validateCatalogUrl } from "../ManhwaNex/parsers.js";
import { TestSuite } from "./suite.js";

class RequestProbe extends PaperbackInterceptor {
  readonly requests: Request[] = [];
  readonly responses = new Map<string, string>();
  gate?: (request: Request, data: ArrayBuffer) => Promise<ArrayBuffer>;
  override async interceptRequest(request: Request) {
    if (request.url.startsWith(`${BASE_URL}/`)) this.requests.push(request);
    return request;
  }
  override async interceptResponse(request: Request, _response: Response, data: ArrayBuffer) {
    const result = this.gate ? await this.gate(request, data) : data;
    if (request.url.startsWith(`${BASE_URL}/`)) this.responses.set(`${request.url}${typeof request.body === "string" ? request.body : ""}`, Application.arrayBufferToUTF8String(result));
    return result;
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
    await settings.setExcludeNSFW(true); probe.requests.length = 0;
    const sections = await ManhwaNex.getDiscoverSections();
    home = probe.responses.get(`${BASE_URL}/`)!;
    const categories = parseHomeCategories(home), popular = ids(parseCatalog(home, "popular").items), latest = ids(parseCatalog(home, "latest").items);
    const repeatsLatest = popular.length > 0 && popular.every((id, index) => id === latest[index]);
    const expectedRows = SECTIONS.filter((section) => section.id !== "popular" || !repeatsLatest);
    expect(categories.map((category) => category.title)).to.deep.equal(["Action", "Romance", "Fantasy", "Martial Arts", "Adventure", "Ghost", "Cultivation", "System"]);
    expect(sections.map((section) => section.title)).to.deep.equal([...expectedRows.map((section) => section.title), ...categories.map((category) => category.title)]);
    expect(sections.filter((section) => !section.id.startsWith("genre:"))).to.deep.equal(expectedRows);
    expect(sections.filter((section) => section.id.startsWith("genre:")).map((section) => section.id)).to.deep.equal(categories.map((category) => category.id));
    expect(probe.requests.map((request) => request.url)).to.deep.equal([`${BASE_URL}/`]);
    await ManhwaNex.getDiscoverSections(); expect(probe.requests).to.have.length(1);
    expect(parseCatalog(home, "popular").items).not.to.be.empty;
    expect(parseCatalog(home, "latest").items).not.to.be.empty;
  });
  suite.test("discovery: unprovable duplication preserves descriptors without relaxing row validation", async () => {
    const pages = (ManhwaNex as unknown as { pages: Map<string, { data: string; expires: number }> }).pages;
    const url = `${BASE_URL}/`, original = pages.get(url)!;
    expect(original?.data).to.equal(home);
    const expected = [...SECTIONS, ...parseHomeCategories(home).map(({ id, title }) => ({ id, title, type: SECTIONS[1].type }))];
    const count = probe.requests.length, saved = preferences();
    const cases: [string, (page: ReturnType<typeof cheerio.load>) => unknown, "popular" | "latest"][] = [
      ["empty Popular widget", ($) => $(".widget-manga-popular-slider .slider__item").remove(), "popular"],
      ["missing Popular widget", ($) => $(".widget-manga-popular-slider").remove(), "popular"],
      ["malformed Popular cover", ($) => $(".widget-manga-popular-slider .slider__item").first().find("img").remove(), "popular"],
      ["empty Latest widget", ($) => $(".page-item-detail.manga").remove(), "latest"],
      ["malformed Latest cover", ($) => $(".page-item-detail.manga").first().find("img").remove(), "latest"],
    ];
    try {
      for (const [label, change, kind] of cases) {
        const $ = cheerio.load(home); change($); const html = $.html();
        pages.set(url, { ...original, data: html });
        expect(() => parseCatalog(html, kind), label).to.throw(/catalog layout changed|invalid image URL/);
        expect(await ManhwaNex.getDiscoverSections(), label).to.deep.equal(expected);
        await rejects(() => ManhwaNex.getDiscoverSectionItems(SECTIONS[kind === "popular" ? 0 : 1]), /catalog layout changed|invalid image URL/);
      }
      const invalid = cheerio.load(home); invalid("li.menu-item-object-wp-manga-genre > a").first().attr("href", "https://other.test/manga-genre/action/");
      pages.set(url, { ...original, data: invalid.html() });
      await rejects(() => ManhwaNex.getDiscoverSections(), /invalid home category/);
      expect(probe.requests).to.have.length(count);
      expect(preferences()).to.deep.equal(saved);
    } finally { pages.set(url, original); }
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
  suite.test("categories: exact linked native archives, bounded lazy requests, distinct titles and terminal pagination", async () => {
    const categories = parseHomeCategories(home);
    for (const exclude of [true, false]) {
      await settings.setExcludeNSFW(exclude); probe.requests.length = 0; probe.responses.clear();
      const sections = await ManhwaNex.getDiscoverSections();
      expect(probe.requests.map((request) => request.url)).to.deep.equal([`${BASE_URL}/`]);
      for (const category of categories) {
        const section = sections.find((entry) => entry.id === category.id)!;
        let cursor: Parameters<typeof ManhwaNex.getDiscoverSectionItems>[1], url = category.url, pages = 0;
        const seen: string[] = [], combined: string[] = [], expectedCombined: string[] = [];
        do {
          const count = probe.requests.length;
          const result = await ManhwaNex.getDiscoverSectionItems(section, cursor);
          const requests = probe.requests.slice(count);
          expect(requests.filter((request) => request.method === "GET").map((request) => request.url)).to.deep.equal([url]);
          const batches = requests.filter((request) => request.method === "POST");
          expect(batches.length).to.be.at.most(exclude ? 1 : 0);
          const raw = parseCatalog(probe.responses.get(url)!, "category", false, url);
          const classifications = new Map<string, ReturnType<typeof emptyMetadata>>();
          for (const [key, response] of probe.responses) if (key.startsWith(`${BASE_URL}/wp-admin/admin-ajax.php`) && key.includes("manga_adult_content"))
            for (const item of parseCatalog(response, "search", true).items) classifications.set(item.mangaId, item.metadata);
          for (const request of batches) {
            expect(request.url).to.equal(`${BASE_URL}/wp-admin/admin-ajax.php`);
            if (typeof request.body !== "string") throw new Error("Expected a form-encoded native metadata batch.");
            const form = new Map(request.body.split("&").map((pair) => {
              const separator = pair.indexOf("=");
              return [decodeURIComponent(pair.slice(0, separator)), decodeURIComponent(pair.slice(separator + 1))];
            }));
            const batchIds = [...form].filter(([key]) => /^vars\[post_name__in\]\[\d+\]$/.test(key)).map(([, value]) => value);
            expect(batchIds).not.to.be.empty; expect(batchIds.length).to.be.at.most(raw.items.length);
            expect(batchIds.every((id) => ids(raw.items).includes(id))).to.equal(true);
            expect(Number(form.get("vars[posts_per_page]"))).to.equal(batchIds.length);
            expect(request.body).to.include("manga_adult_content");
          }
          const expected = ids(raw.items).filter((id) => !seen.includes(id) && (!exclude || isAllowed(classifications.get(id) ?? emptyMetadata())));
          expect(ids(result.items), `${section.title}, ${url}, exclude=${exclude}`).to.deep.equal(expected);
          expect(result.metadata === undefined).to.equal(raw.next === undefined);
          if (result.metadata) expect((result.metadata as { url: string }).url).to.equal(raw.next);
          if (exclude) for (const item of result.items) {
            const data = item.metadata as ReturnType<typeof emptyMetadata>;
            expect(isAllowed(data)).to.equal(true);
            expect(data.genres.some((genre) => `genre:${genre.id}` === section.id)).to.equal(true);
          }
          seen.push(...ids(raw.items)); combined.push(...ids(result.items)); expectedCombined.push(...expected); pages++;
          const warmCount = probe.requests.length;
          expect(ids((await ManhwaNex.getDiscoverSectionItems(section, cursor)).items)).to.deep.equal(ids(result.items));
          expect(probe.requests).to.have.length(warmCount);
          cursor = result.metadata; url = raw.next ?? "";
          expect(pages).to.be.at.most(20);
        } while (cursor);
        expect(new Set(combined).size).to.equal(combined.length);
        expect(combined, `${section.title} retains every eligible archive title in native order`).to.deep.equal(expectedCombined);
      }
    }
    await settings.reset();
  });
  suite.test("categories: observed adult conflicts revoke direct and in-flight access without losing metadata", async () => {
    const category = parseHomeCategories(home).find((entry) => entry.id === "genre:action")!;
    const scenarios = [
      { id: category.id, url: category.url, kind: "category", evidence: "category", marker: "warning", modes: [true, false] },
      { id: category.id, url: category.url, kind: "category", evidence: "category", marker: "data-adult", modes: [true, false] },
      { id: category.id, url: category.url, kind: "category", evidence: "category", marker: "mature", modes: [true, false] },
      { id: "popular", url: `${BASE_URL}/`, kind: "popular", evidence: "latest", marker: "warning", modes: [true] },
      { id: "latest", url: `${BASE_URL}/`, kind: "latest", evidence: "popular", marker: "warning", modes: [true] },
    ] as const;
    const scenarioSection = async (id: string) => {
      const section = (await ManhwaNex.getDiscoverSections()).find((entry) => entry.id === id)
        ?? (id === "popular" ? SECTIONS[0] : undefined);
      if (!section) throw new Error(`The native conflict-probe section ${id} is missing.`);
      return section;
    };
    for (const scenario of scenarios) for (const exclude of scenario.modes) {
      await settings.setExcludeNSFW(true); probe.responses.clear();
      const baselineSection = await scenarioSection(scenario.id);
      const baseline = await ManhwaNex.getDiscoverSectionItems(baselineSection);
      const evidenceIds = ids(parseCatalog(probe.responses.get(scenario.url)!, scenario.evidence, false, scenario.url).items);
      const searchableIds = ids((await ManhwaNex.getSearchResults({ title: "" })).items);
      const candidates = baseline.items.flatMap((item) => {
        if (!("mangaId" in item) || typeof item.mangaId !== "string" || !("title" in item) || typeof item.title !== "string") throw new Error("Expected a native title for the conflict probe.");
        return evidenceIds.includes(item.mangaId) && searchableIds.includes(item.mangaId) ? [{ mangaId: item.mangaId, title: item.title }] : [];
      });
      expect(candidates.length, "Two current eligible archive/home/search titles are required for warm/cold conflict coverage").to.be.at.least(2);
      const target = candidates[0], coldId = candidates[1].mangaId;
      await settings.setExcludeNSFW(exclude); probe.responses.clear();
      let issued: { chapter: Chapter; page: string } | undefined;
      const source = await ManhwaNex.getMangaDetails(target.mangaId);
      expect(source.mangaInfo.primaryTitle).to.equal(target.title);
      if (exclude) {
        const chapter = (await ManhwaNex.getChapters(source)).find((entry) => entry.additionalInfo?.locked !== "true");
        if (!chapter) throw new Error("The current conflict-probe title has no unlocked native chapter.");
        const reader = await ManhwaNex.getChapterDetails(chapter);
        issued = { chapter, page: reader.pages[0] };
      }
      const batch = [...probe.responses].filter(([key]) => key.startsWith(`${BASE_URL}/wp-admin/admin-ajax.php`)).flatMap(([, html]) => parseCatalog(html, "search", exclude).items).find((item) => item.mangaId === target.mangaId)!;
      expect(batch.metadata.adult).to.equal(false); expect(batch.metadata.genres).not.to.be.empty;
      let releaseReader!: () => void, readyReader!: () => void, readerHeld = false;
      let releaseBatch!: () => void, readyBatch!: () => void, batchHeld = false;
      const heldReader = new Promise<void>((resolve) => { releaseReader = resolve; });
      const arrivedReader = new Promise<void>((resolve) => { readyReader = resolve; });
      const heldBatch = new Promise<void>((resolve) => { releaseBatch = resolve; });
      const arrivedBatch = new Promise<void>((resolve) => { readyBatch = resolve; });
      let readerPending: ReturnType<typeof ManhwaNex.getChapterDetails> | undefined;
      let sectionPending: ReturnType<typeof ManhwaNex.getDiscoverSectionItems> | undefined;
      probe.gate = async (request, data) => {
        if (issued && request.url === seriesUrl(target.mangaId, issued.chapter.chapterId)) {
          readerHeld = true; readyReader(); await heldReader; return data;
        }
        if (issued && request.url === `${BASE_URL}/wp-admin/admin-ajax.php` && !batchHeld) {
          expect(typeof request.body).to.equal("string"); expect(request.body).to.include(coldId);
          batchHeld = true; readyBatch(); await heldBatch; return data;
        }
        if (request.url !== scenario.url) return data;
        const $ = cheerio.load(Application.arrayBufferToUTF8String(data));
        const selector = scenario.evidence === "popular" ? ".widget-manga-popular-slider .slider__item" : ".page-item-detail.manga";
        const cards = $(selector), warm = cards.filter((_index, node) => $(node).find(`.post-title a[href="${seriesUrl(target.mangaId)}"]`).length > 0);
        const cold = cards.filter((_index, node) => $(node).find(`.post-title a[href="${seriesUrl(coldId)}"]`).length > 0);
        expect(warm).to.have.length(1); expect(cold).to.have.length(1);
        for (const card of [warm, cold]) {
          if (scenario.marker === "warning") card.append('<span class="adult-warning">Adult content</span>');
          else if (scenario.marker === "data-adult") card.attr("data-adult", "1");
          else card.append(`<div class="mg_genres"><div class="summary-content"><a href="${BASE_URL}/manga-genre/mature/">Mature</a></div></div>`);
        }
        return new TextEncoder().encode($.html()).buffer;
      };
      try {
        if (issued) {
          readerPending = ManhwaNex.getChapterDetails(issued.chapter);
          void readerPending.catch(() => undefined);
          await Promise.race([arrivedReader, readerPending]); expect(readerHeld).to.equal(true);
        }
        const section = await scenarioSection(scenario.id);
        sectionPending = ManhwaNex.getDiscoverSectionItems(section);
        void sectionPending.catch(() => undefined);
        const cache = (ManhwaNex as unknown as { cache: Map<string, { data: ReturnType<typeof emptyMetadata>; expires: number }> }).cache;
        let adultExpiry = 0, coldExpiry = 0;
        if (issued) {
          await Promise.race([arrivedBatch, sectionPending]); expect(batchHeld).to.equal(true);
          expect(cache.get(target.mangaId)!.data.adult).to.equal(true); expect(cache.get(coldId)!.data.adult).to.equal(true);
          adultExpiry = cache.get(target.mangaId)!.expires; coldExpiry = cache.get(coldId)!.expires;
          releaseReader();
          await rejects(() => readerPending!, /hidden by NSFW exclusion|lacks reliable/);
          await rejects(() => ManhwaNex.getMangaDetails(coldId), /hidden by NSFW exclusion|lacks reliable/);
          await rejects(() => Application.scheduleRequest({ url: issued!.page, method: "GET" }), /authorization is missing/);
          releaseBatch();
        }
        const result = await sectionPending;
        const raw = parseCatalog(probe.responses.get(scenario.url)!, scenario.kind, false, scenario.url);
        const evidence = parseCatalog(probe.responses.get(scenario.url)!, scenario.evidence, false, scenario.url);
        for (const id of [target.mangaId, coldId]) expect(evidence.items.find((item) => item.mangaId === id)!.metadata.adult).to.equal(true);
        const classifications = new Map([...probe.responses].filter(([key]) => key.startsWith(`${BASE_URL}/wp-admin/admin-ajax.php`)).flatMap(([, html]) => parseCatalog(html, "search", exclude).items).map((item) => [item.mangaId, item.metadata]));
        expect(ids(result.items)).to.deep.equal(ids(raw.items).filter((id) => !exclude || (![target.mangaId, coldId].includes(id) && isAllowed(classifications.get(id) ?? emptyMetadata()))));
        expect((result.metadata as { url?: string } | undefined)?.url).to.equal(raw.next);
        if (issued) {
          const completedBatch = [...probe.responses].filter(([key]) => key.startsWith(`${BASE_URL}/wp-admin/admin-ajax.php`)).flatMap(([, html]) => parseCatalog(html, "search", true).items).find((item) => item.mangaId === coldId)!;
          expect(completedBatch.metadata.genres).not.to.be.empty;
          expect(cache.get(coldId)!.data).to.deep.equal({ ...completedBatch.metadata, adult: true });
          expect(cache.get(coldId)!.expires).to.equal(coldExpiry);
          expect(ids((await ManhwaNex.getDiscoverSectionItems(section)).items)).not.to.include(target.mangaId).and.not.to.include(coldId);
          expect(cache.get(target.mangaId)!.expires).to.equal(adultExpiry);
          await rejects(() => ManhwaNex.getMangaDetails(target.mangaId), /hidden by NSFW exclusion|lacks reliable/);
          await rejects(() => ManhwaNex.getChapters(issued!.chapter.sourceManga), /hidden by NSFW exclusion|lacks reliable/);
          await rejects(() => ManhwaNex.getChapterDetails(issued!.chapter), /hidden by NSFW exclusion|lacks reliable/);
          await rejects(() => Application.scheduleRequest({ url: issued!.page, method: "GET" }), /authorization is missing/);
          const fresh = new ManhwaNexInterceptor("ManhwaNex.conflict-restart");
          await rejects(() => fresh.interceptRequest({ url: issued!.page, method: "GET" }), /authorization is missing/);
          const refreshed = await ManhwaNex.getSearchResults({ title: "" });
          const rawSearch = parseCatalog(probe.responses.get(searchUrl({ title: "" }, true))!, "search", true, searchUrl({ title: "" }, true));
          for (const id of [target.mangaId, coldId]) expect(ids(rawSearch.items)).to.include(id);
          expect(ids(refreshed.items)).not.to.include(target.mangaId).and.not.to.include(coldId);
          expect(cache.get(target.mangaId)!.expires).to.equal(adultExpiry);
          expect(cache.get(coldId)!.expires).to.equal(coldExpiry);
          await rejects(() => ManhwaNex.getMangaDetails(target.mangaId), /hidden by NSFW exclusion|lacks reliable/);
        } else {
          const marked = result.items.find((item) => "mangaId" in item && item.mangaId === target.mangaId)!;
          expect(marked.contentRating).to.equal(ContentRating.ADULT);
          expect(marked.metadata).to.deep.equal({ ...batch.metadata, adult: true });
        }
      } finally {
        releaseReader(); releaseBatch(); probe.gate = undefined;
        await readerPending?.catch(() => undefined); await sectionPending?.catch(() => undefined);
      }
    }
    await settings.reset();
  });
  suite.test("categories: malformed home anchors and foreign or non-advancing archive routes fail closed", async () => {
    const category = parseHomeCategories(home)[0];
    for (const change of [
      (anchor: ReturnType<ReturnType<typeof cheerio.load>>) => anchor.text(""),
      (anchor: ReturnType<ReturnType<typeof cheerio.load>>) => anchor.removeAttr("href"),
      (anchor: ReturnType<ReturnType<typeof cheerio.load>>) => anchor.attr("href", "https://other.test/manga-genre/action/"),
      (anchor: ReturnType<ReturnType<typeof cheerio.load>>) => anchor.attr("href", `${BASE_URL}/manga-tag/action/`),
      (anchor: ReturnType<ReturnType<typeof cheerio.load>>) => anchor.attr("href", `${BASE_URL}/manga-genre/unknown/`),
    ]) {
      const $ = cheerio.load(home); change($("li.menu-item-object-wp-manga-genre > a").first());
      expect(() => parseHomeCategories($.html())).to.throw(/home category/);
    }
    for (const url of [`${BASE_URL}/page/2/`, `${BASE_URL}/manga-genre/romance/page/2/`, `${category.url}page/1/`, `${category.url}page/2/?s=other`, `${BASE_URL}/manga-genre/%61ction/page/2/`, `https://other.test/manga-genre/action/page/2/`])
      expect(() => validateCatalogUrl(url, category.url, 1)).to.throw(/invalid|non-advancing/);
    expect(validateCatalogUrl(`${category.url}page/2/`, category.url, 1)).to.equal(`${category.url}page/2/`);
    const html = await fetchText(category.url), $ = cheerio.load(html);
    $("link[rel=canonical]").attr("href", `${BASE_URL}/manga-genre/romance/`);
    expect(() => parseCatalog($.html(), "category", false, category.url)).to.throw(/different category/);
    const badNext = cheerio.load(html); badNext(".nextpostslink").attr("href", `${BASE_URL}/page/2/`);
    expect(() => parseCatalog(badNext.html(), "category", false, category.url)).to.throw(/invalid/);
    const skipped = cheerio.load(html); skipped(".nextpostslink").attr("href", `${category.url}page/3/`);
    expect(() => parseCatalog(skipped.html(), "category", false, category.url)).to.throw(/non-consecutive/);
    const wrongPage = cheerio.load(html); wrongPage(".wp-pagenavi .current").text("2");
    expect(() => parseCatalog(wrongPage.html(), "category", false, category.url)).to.throw(/different catalog page/);
    expect(validateCatalogUrl(`${category.url}page/3/`, category.url, 1)).to.equal(`${category.url}page/3/`);
  });
  suite.test("pagination: canonical-ID overlaps are removed, duplicate-only advancing pages retain later titles", async () => {
    const nextUrl = parseCatalog(home, "latest").next!, nextHtml = await fetchText(nextUrl);
    const thirdUrl = parseCatalog(nextHtml, "latest", false, nextUrl).next!;
    const thirdHtml = await fetchText(thirdUrl), firstIds = ids(parseCatalog(home, "latest").items);
    const $home = cheerio.load(home), firstCards = $home(".page-item-detail.manga").toArray().map((node) => $home.html(node));
    for (const duplicateOnly of [false, true]) {
      await settings.setExcludeNSFW(false); probe.requests.length = 0;
      const edited = cheerio.load(nextHtml), rows = edited(".page-item-detail.manga");
      const overlappingCard = firstCards.find((_card, index) => !ids(parseCatalog(nextHtml, "latest", false, nextUrl).items).includes(firstIds[index]));
      if (!overlappingCard) throw new Error("No distinct first-page card available for the overlap regression.");
      const replacement = duplicateOnly ? firstCards.join("") : overlappingCard;
      if (duplicateOnly) rows.slice(1).remove();
      rows.first().replaceWith(replacement);
      probe.gate = async (request, data) => request.url === nextUrl ? new TextEncoder().encode(edited.html()).buffer : data;
      try {
        const first = await ManhwaNex.getDiscoverSectionItems(SECTIONS[1]);
        const next = await ManhwaNex.getDiscoverSectionItems(SECTIONS[1], first.metadata);
        const expected = parseCatalog(duplicateOnly ? thirdHtml : edited.html(), "latest", false, duplicateOnly ? thirdUrl : nextUrl);
        expect(ids(first.items)).to.deep.equal(firstIds);
        expect(ids(next.items)).to.deep.equal(ids(expected.items).filter((id) => !firstIds.includes(id)));
        expect(new Set([...ids(first.items), ...ids(next.items)]).size).to.equal(first.items.length + next.items.length);
        if (duplicateOnly) expect(probe.requests.filter((request) => request.method === "GET").map((request) => request.url)).to.deep.equal([`${BASE_URL}/`, nextUrl, thirdUrl]);
        expect(ids((await ManhwaNex.getDiscoverSectionItems(SECTIONS[1])).items)).to.deep.equal(firstIds);
      } finally { probe.gate = undefined; }
    }
    await settings.setExcludeNSFW(false);
    probe.gate = async (request, data) => {
      if (request.url !== nextUrl) return data;
      const $ = cheerio.load(nextHtml); $(".nextpostslink").attr("href", nextUrl);
      return new TextEncoder().encode($.html()).buffer;
    };
    try {
      const first = await ManhwaNex.getDiscoverSectionItems(SECTIONS[1]);
      await rejects(() => ManhwaNex.getDiscoverSectionItems(SECTIONS[1], first.metadata), /non-advancing/);
    } finally { probe.gate = undefined; await settings.reset(); }
  });
  suite.test("pagination: continuation is scoped to category, query, settings and refresh", async () => {
    await settings.setExcludeNSFW(false);
    const sections = await ManhwaNex.getDiscoverSections(), action = sections.find((section) => section.id === "genre:action")!, romance = sections.find((section) => section.id === "genre:romance")!;
    const first = await ManhwaNex.getDiscoverSectionItems(action); expect(first.metadata).not.to.equal(undefined);
    expect(ids((await ManhwaNex.getDiscoverSectionItems(romance, first.metadata)).items)).to.deep.equal(ids((await ManhwaNex.getDiscoverSectionItems(romance)).items));
    const searchFirst = await ManhwaNex.getSearchResults({ title: "" });
    const query = { title: "Logging 10,000" };
    expect(ids((await ManhwaNex.getSearchResults(query, searchFirst.metadata)).items)).to.deep.equal(ids((await ManhwaNex.getSearchResults(query)).items));
    await settings.setExcludeNSFW(true); probe.requests.length = 0;
    const reset = await ManhwaNex.getDiscoverSectionItems(action, first.metadata);
    expect(probe.requests.filter((request) => request.method === "GET").map((request) => request.url)).to.deep.equal([`${BASE_URL}/`, parseHomeCategories(home).find((category) => category.id === action.id)!.url]);
    expect(ids(reset.items)).to.deep.equal(ids((await ManhwaNex.getDiscoverSectionItems(action)).items));
    await settings.reset();
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
  suite.test("advanced search: malformed saved filters fail before requests without losing valid constraints", async () => {
    const invalid: Metadata[] = [
      "action", [], 1, false,
      { genres: "action" }, { genres: ["invalid/genre"] }, { genres: ["action", null] },
      { statuses: "end" }, { statuses: ["retired-status"] }, { statuses: ["end", 1] },
      { condition: "or" }, { condition: ["1"] }, { adult: "all" }, { adult: 0 },
      { author: 123 }, { artist: ["3rd Studio"] }, { release: 2026 },
    ];
    const neutral = { genres: [], condition: "", author: "", artist: "", release: "", adult: "", statuses: [] };
    for (const exclude of [true, false]) {
      await settings.setExcludeNSFW(exclude); probe.requests.length = 0;
      for (const metadata of invalid) {
        const query = { title: "Logging", metadata };
        await rejects(() => ManhwaNex.getSearchResults(query), /ManhwaNex saved .* filter is invalid/);
        await rejects(() => ManhwaNex.getAdvancedSearchForm(query), /ManhwaNex saved .* filter is invalid/);
        expect(() => new ManhwaNexSearchForm(query, [])).to.throw(/ManhwaNex saved .* filter is invalid/);
      }
      expect(probe.requests).to.have.length(0);
      for (const metadata of [undefined, null, {}, neutral, Object.fromEntries(Object.keys(neutral).map((key) => [key, null]))])
        expect(searchUrl({ title: "", metadata }, exclude)).to.equal(searchUrl({ title: "" }, exclude));
      const metadata = { genres: ["action", "fantasy", "saved-taxonomy-id"], statuses: STATUSES.map((status) => status.id), condition: "1", adult: "0", author: " 3rd Studio ", artist: " Artist & Co. ", release: " 2026 " };
      const persisted = JSON.parse(JSON.stringify(metadata)) as typeof metadata;
      const form = new ManhwaNexSearchForm({ title: "", metadata: persisted }, parseGenreOptions(search));
      expect(form.getSearchQueryMetadata()).to.deep.equal({ ...metadata, author: "3rd Studio", artist: "Artist & Co.", release: "2026" });
      expect(persisted).to.deep.equal(metadata);
      expect(searchUrl({ title: " Logging: 10,000? ", metadata }, exclude)).to.equal(`${BASE_URL}/?s=Logging%3A%2010%2C000%3F&post_type=wp-manga&genre%5B0%5D=action&genre%5B1%5D=fantasy&genre%5B2%5D=saved-taxonomy-id&op=1&author=3rd%20Studio&artist=Artist%20%26%20Co.&release=2026&adult=0&status%5B0%5D=on-going&status%5B1%5D=end&status%5B2%5D=canceled&status%5B3%5D=on-hold&status%5B4%5D=upcoming`);
      await form.setCondition([""]); await form.setAdult([""]); await form.setGenres([]); await form.setStatuses([]);
      expect(form.getSearchQueryMetadata()).to.deep.include({ condition: "", adult: "", genres: [], statuses: [] });
      await form.reset(); expect(form.getSearchQueryMetadata()).to.deep.equal(neutral);
      expect(readFilters({ release: "not-a-year", author: "3rd Studio" }).release).to.equal("not-a-year");
    }
    await settings.reset();
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
  suite.test("details: reported title normalizes the native five-point rating", async () => {
    await settings.setExcludeNSFW(true);
    const id = "high-level-martial-arts-my-cells-can-evolve-infinitely", url = seriesUrl(id);
    probe.responses.delete(url);
    const details = await ManhwaNex.getMangaDetails(id), $ = cheerio.load(probe.responses.get(url)!);
    const score = $(".post-total-rating .score");
    expect(score).to.have.length(1);
    const rawRating = Number(score.text().trim());
    expect(rawRating).to.be.greaterThan(0).and.at.most(5);
    expect(Number($("[property=bestRating]").first().text())).to.equal(5);
    expect(Number($("[property=ratingValue]").first().text())).to.equal(rawRating);
    expect(details.mangaId).to.equal(id);
    expect(details.mangaInfo.primaryTitle).to.equal("High-Level Martial Arts: My Cells Can Evolve Infinitely");
    expect(details.mangaInfo.rating).to.equal(rawRating / 5).and.within(0, 1);
  });
  suite.test("details: fresh live rating boundaries omit unrated and malformed scores", async () => {
    const id = "high-level-martial-arts-my-cells-can-evolve-infinitely", url = seriesUrl(id);
    await ManhwaNex.getMangaDetails(id);
    const html = probe.responses.get(url);
    expect(html).to.be.a("string").and.not.to.be.empty;
    const original = parseDetails(html!, id);
    const cases: [string | undefined, number | undefined][] = [
      ["5", 1], ["4.5", 0.9], ["0.5", 0.1], [" 4.5 ", 0.9],
      ["0", undefined], ["", undefined], ["  ", undefined], [undefined, undefined],
      ["unrated", undefined], ["NaN", undefined], ["Infinity", undefined],
      ["-1", undefined], ["5.1", undefined], ["0x4", undefined],
      ["4e0", undefined], ["4/5", undefined], ["5 points", undefined],
    ];
    const requests = probe.requests.length;
    for (const [text, expected] of cases) {
      const $ = cheerio.load(html!), score = $(".post-total-rating .score");
      expect(score).to.have.length(1);
      if (text === undefined) score.remove(); else score.text(text);
      const details = parseDetails($.html(), id);
      expect(details.mangaId).to.equal(id);
      expect({ ...details.mangaInfo, rating: undefined }).to.deep.equal({ ...original.mangaInfo, rating: undefined });
      expect(details.mangaInfo.rating, String(text)).to.equal(expected);
      expect(Object.hasOwn(details.mangaInfo, "rating"), String(text)).to.equal(expected !== undefined);
    }
    expect(probe.requests).to.have.length(requests);
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
      expect(reader.pages).to.deep.equal(parseReader(await fetchText(seriesUrl(SAMPLE, persisted.chapterId)), persisted).pages);
      await imageBytes(reader.pages);
    }
  });
  suite.test("reader: explicit opt-out retains exact native chapter pages and actual image bytes", async () => {
    await settings.setExcludeNSFW(false);
    try {
      const source = JSON.parse(JSON.stringify(await ManhwaNex.getMangaDetails(SAMPLE))) as SourceManga;
      const list = await ManhwaNex.getChapters(source);
      expect(list.map((chapter) => chapter.chapterId)).to.deep.equal(chapters.map((chapter) => chapter.chapterId));
      for (const chapter of list) { expect(chapter.sourceManga).to.equal(source); expect(chapter.volume).to.equal(0); }
      const chapter = JSON.parse(JSON.stringify(list[0])) as Chapter;
      const expected = parseReader(await fetchText(seriesUrl(SAMPLE, chapter.chapterId)), chapter);
      const reader = await ManhwaNex.getChapterDetails(chapter);
      expect(reader.pages).to.deep.equal(expected.pages); await imageBytes(reader.pages);
    } finally { await settings.reset(); }
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
      await settings.setExcludeNSFW(true);
      const action = (await ManhwaNex.getDiscoverSections()).find((section) => section.id === "genre:action")!;
      expect(ids((await ManhwaNex.getDiscoverSectionItems(action)).items)).not.to.include(SAMPLE);
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
