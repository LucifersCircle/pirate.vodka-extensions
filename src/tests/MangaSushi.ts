/* eslint-disable no-unused-expressions */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  DiscoverSectionType,
  PaperbackInterceptor,
  type GenresCarouselItem,
  type Metadata,
  type SortingOption,
  type Chapter,
  type Request,
  type Response,
  type SourceManga,
  type TestLogger,
} from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { MangaSushi } from "../MangaSushi/main.js";
import {
  MangaSushiSearchForm,
  MangaSushiSettingsForm,
  preferences,
  readGenreRoute,
} from "../MangaSushi/forms.js";
import {
  BASE_URL,
  BLOCKED_GENRES,
  EDITORIAL_IDS,
  GENRE_ROUTE_KEY,
  SECTIONS,
  SORTS,
  STATUSES,
  type Cursor,
} from "../MangaSushi/models.js";
import { fetchNext, fetchText, MangaSushiInterceptor, searchUrl } from "../MangaSushi/network.js";
import {
  chapterTitle,
  isAllowed,
  parseCatalog,
  parseGenreOptions,
  parseHomeGenres,
  parseReader,
  seriesUrl,
} from "../MangaSushi/parsers.js";
import { englishTitle, searchTitle } from "../MangaSushi/titles.js";
import { TestSuite } from "./suite.js";
import { sourceURL } from "../MangaSushi/urls.js";

// Observe the real host requests and optionally hold a live response in flight.
// No saved HTML, alternate parser, or replacement source implementation is used.
class DiscoveryProbe extends PaperbackInterceptor {
  readonly requests: Request[] = [];
  readonly responses: { request: Request; response: Response; html: string }[] = [];
  gate?: (request: Request, data: ArrayBuffer) => Promise<ArrayBuffer>;
  override async interceptRequest(request: Request): Promise<Request> {
    if (request.url.startsWith(`${BASE_URL}/`)) this.requests.push(request);
    return request;
  }
  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    const result = this.gate ? await this.gate(request, data) : data;
    if (request.url.startsWith(`${BASE_URL}/`))
      this.responses.push({ request, response, html: Application.arrayBufferToUTF8String(result) });
    return result;
  }
}

const requestParameters = (body: string): Map<string, string> =>
  new Map(
    body.split("&").map((pair) => {
      const separator = pair.indexOf("=");
      const decode = (value: string) => decodeURIComponent(value.replace(/\+/g, " "));
      return [decode(pair.slice(0, separator)), decode(pair.slice(separator + 1))];
    }),
  );

const boundedIds = (body: string): string[] =>
  [...requestParameters(body)]
    .filter(([key]) => /^vars\[post_name__in\]\[\d+\]$/.test(key))
    .map(([, value]) => value);

const FEED_SECTIONS = SECTIONS.filter((section) => section.id !== "genres");
const GENRE_IDS =
  "action adventure romance comedy drama school-life shounen adult anime comic cooking doujinshi ecchi fantasy gender-bender harem historical horror josei live-action manga manhua manhwa martial-arts mature mecha mystery one-shot psychological sci-fi seinen shoujo shoujo-ai shounen-ai slice-of-life smut soft-yaoi soft-yuri sports tragedy supernatural webtoon yaoi yuri".split(
    " ",
  );
const ids = (items: object[]): string[] =>
  items.map((item) => {
    if (!("mangaId" in item) || typeof item.mangaId !== "string")
      throw new Error("Expected a native manga card, not a genre chip.");
    return item.mangaId;
  });
const encodeHTML = (html: string): ArrayBuffer =>
  new TextEncoder().encode(html).buffer as ArrayBuffer;
const SAMPLE = "welcome-to-the-cheap-restaurant-of-outcasts";
const rejects = async (operation: () => Promise<unknown>, pattern: RegExp) => {
  let failure: unknown;
  try {
    await operation();
  } catch (error) {
    failure = error;
  }
  expect(String(failure)).to.match(pattern);
};
const checkReaderImages = async (pages: string[]) => {
  for (const url of new Set([pages[0], pages[pages.length - 1]])) {
    const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
    expect(response.status, url).to.equal(200);
    const contentType = Object.entries(response.headers).find(
      ([name]) => name.toLowerCase() === "content-type",
    )?.[1];
    expect(contentType, url).to.match(/^image\//i);
    const bytes = new Uint8Array(data);
    expect(bytes.length, url).to.be.greaterThan(100);
    const magic = String.fromCharCode(...bytes.slice(0, 16));
    expect(
      (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
        magic.startsWith("\x89PNG\r\n\x1a\n") ||
        magic.startsWith("GIF8") ||
        (magic.startsWith("RIFF") && magic.slice(8, 12) === "WEBP") ||
        /^....ftypavi[fs]/s.test(magic),
      `Image response must contain supported image bytes: ${url}`,
    ).to.equal(true);
  }
};

export async function runTests(logger: TestLogger) {
  const saved = Application.getState("MangaSushi.preferences");
  const suite = new TestSuite("MangaSushi tests", logger);
  let safeSource: SourceManga;
  let safeDetailHTML = "";
  let safeCatalogRelease = "";
  let safeSearchResponse: DiscoveryProbe["responses"][number] | undefined;
  let sample: SourceManga;
  let sampleChapters: Chapter[];
  let issuedReaderPages: string[];
  let sourceSearch: ReturnType<typeof parseCatalog>;
  let home = "";
  const settings = new MangaSushiSettingsForm();
  suite.test("initialisation", async () => {
    Application.setState(undefined, "MangaSushi.preferences");
    await MangaSushi.initialise();
    expect(preferences().excludeNSFW).to.equal(true);
  });
  suite.test("URLs: native source parser preserves exact identities without host globals", async () => {
    const url = `${BASE_URL}/?s=Hero's%20Return%20%252F&author=A%2BB%3DC`;
    const parsed = sourceURL(url);
    expect(parsed.pathname).to.equal("/");
    expect(parsed.search).to.equal(url.slice(BASE_URL.length + 1));
    expect(parsed.href).to.equal(url.replace("Hero's", "Hero%27s"));
    for (const value of [
      "http://mangasushi.org/", "https://mangasushi.org.evil/", "https://user@mangasushi.org/",
      `${BASE_URL}:443/`, `${BASE_URL}/manga/../`, `${BASE_URL}/manga/%2e%2e/`,
      `${BASE_URL}/manga/a\\b/`, `${BASE_URL}/#fragment`, `${BASE_URL}/manga/a b/`,
    ]) expect(() => sourceURL(value)).to.throw(/Mangasushi/);
  });
  suite.test("getDiscoverSections: native section order", async () => {
    expect((await MangaSushi.getDiscoverSections()).map((section) => section.title)).to.deep.equal([
      "Popular Series",
      "What's New",
      "Genres",
    ]);
    expect((await MangaSushi.getDiscoverSections())[2].type).to.equal(DiscoverSectionType.genres);
  });
  suite.test("getSortingOptions: all seven site sorts", async () => {
    expect(await MangaSushi.getSortingOptions()).to.deep.equal(SORTS);
    const html = await fetchText(searchUrl({ title: "" }, true));
    for (const sort of SORTS.filter((item) => item.id))
      expect(html).to.include(`m_orderby=${sort.id}`);
    sourceSearch = parseCatalog(html, "search", true);
  });
  suite.test("getSearchResults: native adult filter plus genre safety", async () => {
    const probe = new DiscoveryProbe("MangaSushi.detail-metadata-test");
    probe.registerInterceptor();
    try {
      const result = await MangaSushi.getSearchResults({ title: "" });
      expect(result.items).not.to.be.empty;
      for (const item of result.items) {
        expect(isAllowed(item.metadata)).to.equal(true);
        expect(item.imageUrl).to.match(/^https:\/\//);
        expect(item.metadata.genres.some((genre) => BLOCKED_GENRES.includes(genre.id))).to.equal(
          false,
        );
      }
      expect(result.items.map((item) => item.mangaId)).to.deep.equal(
        sourceSearch.items.filter((item) => isAllowed(item.metadata)).map((item) => item.mangaId),
      );
      safeSearchResponse = probe.responses.find((entry) => entry.request.url === searchUrl({ title: "" }, true));
      const catalogHTML = safeSearchResponse?.html ?? "";
      expect(catalogHTML, "Missing the search response consumed by native getSearchResults").not.to.be.empty;
      const $catalog = cheerio.load(catalogHTML);
      const row = $catalog(".c-tabs-item__content").filter((_, node) => $catalog(node).find(".post-title a").first().attr("href") === seriesUrl(result.items[0].mangaId));
      expect(row.length, "Unique canonical search metadata row").to.equal(1);
      safeCatalogRelease = row.find(".mg_release .summary-content").text().replace(/\s+/g, " ").trim();
      safeSource = await MangaSushi.getMangaDetails(result.items[0].mangaId);
      safeDetailHTML = probe.responses.find((entry) => entry.request.url === seriesUrl(safeSource.mangaId))?.html ?? "";
    } finally { probe.unregisterInterceptor(); }
  });
  suite.test("getSearchResults: displayed smart punctuation resolves by exact ID", async () => {
    const quoted = sourceSearch.items.find((item) => /[‘’“”]/.test(item.title));
    expect(quoted).not.to.equal(undefined);
    const result = await MangaSushi.getSearchResults({ title: quoted!.title });
    expect(result.items.some((item) => item.mangaId === quoted!.mangaId)).to.equal(true);
  });
  suite.test("getMangaDetails: full canonical metadata", async () => {
    expect(safeSource.mangaInfo.primaryTitle).not.to.be.empty;
    expect(safeSource.mangaInfo.synopsis).not.to.be.empty;
    expect(safeSource.mangaInfo.author).to.be.a("string").and.not.be.empty;
    expect(safeSource.mangaInfo.artist).to.be.a("string").and.not.be.empty;
    expect(safeSource.mangaInfo.tagGroups?.[0].tags).not.to.be.empty;
    expect(safeDetailHTML, "Missing the detail response consumed by native getMangaDetails").not.to.be.empty;
    const $ = cheerio.load(safeDetailHTML);
    const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
    const field = (name: string) => normalized($(".profile-manga .post-content_item").filter((_, node) => normalized($(node).find(".summary-heading").text()).toLowerCase() === name).find(".summary-content").text());
    expect(safeSource.mangaInfo.additionalInfo?.Type).to.equal(field("type") || undefined);
    // The existing classification metadata takes precedence over detail-page release.
    expect(safeSource.mangaInfo.additionalInfo?.Released).to.equal(safeCatalogRelease || field("release") || undefined);
    const aggregate = $(".tab-summary .vote-details[typeof='AggregateRating']");
    const scoreText = aggregate.find('[property="ratingValue"]').text().trim(), votesText = aggregate.find('[property="ratingCount"]').text().trim();
    const score = Number(scoreText), votes = Number(votesText);
    // The first safe search result is dynamic and may legitimately be unrated.
    const rated = aggregate.length === 1 && ["ratingValue", "bestRating", "ratingCount"].every((property) => aggregate.find(`[property="${property}"]`).length === 1)
      && aggregate.find('[property="bestRating"]').text().trim() === "5" && /^\d+(?:\.\d+)?$/.test(scoreText)
      && /^[1-9]\d*$/.test(votesText) && Number.isFinite(score) && score > 0 && score <= 5 && Number.isSafeInteger(votes) && votes > 0;
    expect(safeSource.mangaInfo.rating).to.equal(rated ? score / 5 : undefined);
    expect(safeSource.mangaInfo.additionalInfo?.Score).to.equal(rated ? `★ ${score}/5 (${votes} ${votes === 1 ? "vote" : "votes"})` : undefined);
  });
  suite.test("getMangaDetails: unknown classification is blocked by default", async () => {
    await rejects(
      () => MangaSushi.getMangaDetails(SAMPLE),
      /hidden by NSFW exclusion|lacks reliable/,
    );
  });
  suite.test("getChapters and reader: accessible with default exclusion", async () => {
    const schedule = Application.scheduleRequest;
    let binaryBodies = 0;
    // Model the documented native ArrayBuffer representation of the source's
    // actual empty POST body, through the real scheduler and interceptor chain.
    Application.scheduleRequest = async (request) => {
      if (request.method !== "POST") return schedule(request);
      expect(request.body).to.equal("");
      binaryBodies++;
      return schedule({ ...request, body: encodeHTML(request.body as string) });
    };
    try {
      const chapters = await MangaSushi.getChapters(safeSource);
      expect(chapters.length).to.be.greaterThan(0);
      for (const chapter of chapters) expect(chapter.sourceManga).to.equal(safeSource);
      const reader = await MangaSushi.getChapterDetails(chapters[0]);
      if (!("pages" in reader)) throw new Error("Expected manga reader pages.");
      expect(reader.pages.length).to.be.greaterThan(1);
      await checkReaderImages(reader.pages);
      expect(binaryBodies).to.equal(1);
    } finally { Application.scheduleRequest = schedule; }
  });
  suite.test(
    "getChapters and reader: cold-cache persisted records across three safe titles",
    async () => {
      const titles = sourceSearch.items.filter((item) => isAllowed(item.metadata)).slice(0, 3);
      expect(titles).to.have.length(3);
      for (const item of titles) {
        // Reload from persisted IDs rather than relying on a warm discovery cache.
        await settings.setExcludeNSFW(true);
        const source = await MangaSushi.getMangaDetails(item.mangaId);
        const storedSource = JSON.parse(JSON.stringify(source)) as SourceManga;
        const chapters = await MangaSushi.getChapters(storedSource);
        expect(chapters.length, item.mangaId).to.be.greaterThan(0);
        expect(new Set(chapters.map((chapter) => chapter.chapterId)).size).to.equal(
          chapters.length,
        );
        for (const chapter of chapters) {
          expect(chapter.sourceManga).to.equal(storedSource);
          expect(chapter.sourceManga.mangaId).to.equal(item.mangaId);
          expect(chapter.chapNum).to.be.a("number").and.not.to.be.NaN;
          if (chapter.publishDate)
            expect(chapter.publishDate.getTime()).to.be.a("number").and.not.to.be.NaN;
        }
        for (const chapter of new Set([chapters[0], chapters[chapters.length - 1]])) {
          const storedChapter = JSON.parse(JSON.stringify(chapter)) as Chapter;
          const reader = await MangaSushi.getChapterDetails(storedChapter);
          if (!("pages" in reader)) throw new Error("Expected manga reader pages.");
          expect(reader.id).to.equal(chapter.chapterId);
          expect(reader.mangaId).to.equal(item.mangaId);
          expect(reader.pages.length).to.be.greaterThan(0);
          expect(new Set(reader.pages).size).to.equal(reader.pages.length);
        }
      }
    },
  );
  suite.test("getChapters and reader: Lonely Attack canonical underscore chapter IDs", async () => {
    for (const invalid of [
      "../chapter-143_1",
      "chapter-143_1/extra",
      "chapter-143_1?x=1",
      "chapter-143_1#page",
      "chapter-%2f143",
      "chapter-%5c143",
      "chapter-%00143",
    ])
      expect(() => seriesUrl("lonely-attack-on-the-different-world", invalid)).to.throw(
        /Invalid Mangasushi identity/,
      );
    const source = await MangaSushi.getMangaDetails("lonely-attack-on-the-different-world");
    const chapters = await MangaSushi.getChapters(source);
    expect(chapters.length).to.be.greaterThan(330);
    for (const chapter of chapters) expect(chapter.sourceManga).to.equal(source);
    expect(chapters.find((chapter) => chapter.chapterId === "chapter-335")).to.include({
      chapNum: 335,
      title: "",
      volume: 0,
    });
    for (const [number, title] of [
      [213, "REUP"],
      [204, "Fixed"],
    ] as const)
      expect(chapters.find((chapter) => chapter.chapterId === `chapter-${number}`)).to.include({
        chapNum: number,
        title,
      });
    for (const number of [143, 127]) {
      const chapter = chapters.find((item) => item.chapterId === `chapter-${number}_1`);
      expect(chapter, `Canonical chapter-${number}_1 must not be omitted`).not.to.equal(undefined);
      expect(chapter!.chapNum).to.equal(number);
      expect(chapter!.title).to.equal("");
      const reader = await MangaSushi.getChapterDetails(chapter!);
      if (!("pages" in reader)) throw new Error("Expected manga reader pages.");
      expect(reader.id).to.equal(chapter!.chapterId);
      expect(reader.mangaId).to.equal(source.mangaId);
      expect(reader.pages.length).to.be.greaterThan(1);
      await checkReaderImages(reader.pages);
    }
    const titledSource = await MangaSushi.getMangaDetails(
      "yondome-wa-iya-na-shizokusei-majutsushi",
    );
    const titledChapters = await MangaSushi.getChapters(titledSource);
    for (const [id, chapNum, title] of [
      ["chapter-21-taleas-weapon", 21, "Taleas Weapon"],
      ["chapter-20-ghouls-versus-orcs", 20, "Ghouls Versus Orcs!"],
      ["chapter-19-preparing-for-war", 19, "Preparing For War"],
    ] as const)
      expect(titledChapters.find((chapter) => chapter.chapterId === id)).to.include({
        sourceManga: titledSource,
        volume: 0,
        chapNum,
        title,
      });
    const titledChapter = titledChapters.find(
      (chapter) => chapter.chapterId === "chapter-21-taleas-weapon",
    )!;
    const titledReader = await MangaSushi.getChapterDetails(titledChapter);
    if (!("pages" in titledReader)) throw new Error("Expected manga reader pages.");
    expect(titledReader.id).to.equal(titledChapter.chapterId);
    expect(titledReader.mangaId).to.equal(titledSource.mangaId);
    expect(titledReader.pages.length).to.be.greaterThan(1);
    await checkReaderImages(titledReader.pages);
  });
  suite.test(
    "English titles: exact source aliases keep original titles, full alternatives and IDs",
    async () => {
      for (const [id, query, expected] of [
        [
          "botsuraku-yotei-nanode-kajishokunin-wo-mezasu",
          "Botsuraku Yotei Nanode",
          "Expecting to Fall into Ruin, I Aim to Become a Blacksmith",
        ],
        [
          "tensei-akuma-no-saikyou-yuusha-ikusei-keikaku",
          "Tensei Akuma",
          "Reincarnated Devil’s Plan for Raising the Strongest Hero",
        ],
        [
          "academy-saikyou-no-mob-healer-shinigee-sekai-no-mob-ni-tensei-shita-ore-wa-hazure-job-healer-to-gensaku-chishiki-de-musou-suru",
          "Academy Saikyou no Mob Healer",
          "The Academy's Strongest Mob Healer: Reincarnated as a Mob in a Deadly Game World, I Dominate with the Useless Job [Healer] and My Original Knowledge",
        ],
      ]) {
        const raw = parseCatalog(
          await fetchText(searchUrl({ title: query }, true)),
          "search",
          true,
        ).items.find((item) => item.mangaId === id)!;
        expect(raw).not.to.equal(undefined);
        expect(raw.title).not.to.equal(expected);
        for (const title of [
          raw.title,
          expected,
          expected
            .replace(/[‘’]/g, "'")
            .replace(/'/g, "’")
            .toUpperCase(),
          expected.replace(/[‘’]/g, "'"),
        ]) {
          const result = await MangaSushi.getSearchResults({ title });
          expect(result.items.find((item) => item.mangaId === id)?.title).to.equal(expected);
        }
        const details = await MangaSushi.getMangaDetails(id);
        expect(details.mangaId).to.equal(id);
        expect(details.mangaInfo.primaryTitle).to.equal(expected);
        expect(details.mangaInfo.secondaryTitles).to.include(raw.title);
        expect(details.mangaInfo.secondaryTitles).to.include(raw.metadata.alternative);
        expect(
          englishTitle(id, raw.title, [raw.metadata.alternative.replace(expected, "")]),
        ).to.equal(raw.title);
        expect(englishTitle(id, raw.title, [`Unrelated ${expected} sequel`])).to.equal(raw.title);
        expect(englishTitle("unregistered-id", raw.title, [expected])).to.equal(raw.title);
        expect(searchTitle(`${expected} extra`)).to.equal(`${expected} extra`);
      }
    },
  );
  suite.test("English titles: Japanese-only alternatives retain the source title", async () => {
    const raw = parseCatalog(
      await fetchText(searchUrl({ title: "Ken yo" }, true)),
      "search",
      true,
    ).items.find((item) => item.mangaId === "ken-yo-kaku-katariki")!;
    expect(raw.metadata.alternative).to.match(/[\u3040-\u9fff]/);
    const result = await MangaSushi.getSearchResults({ title: raw.title });
    expect(result.items.find((item) => item.mangaId === raw.mangaId)?.title).to.equal(raw.title);
    expect((await MangaSushi.getMangaDetails(raw.mangaId)).mangaInfo.primaryTitle).to.equal(
      raw.title,
    );
  });
  suite.test(
    "English titles: cold classification still queries the original source title",
    async () => {
      const id = "botsuraku-yotei-nanode-kajishokunin-wo-mezasu";
      await settings.setExcludeNSFW(true);
      const probe = new DiscoveryProbe("MangaSushi.original-title-test");
      probe.registerInterceptor();
      try {
        const details = await MangaSushi.getMangaDetails(id);
        expect(details.mangaInfo.primaryTitle).to.equal(
          "Expecting to Fall into Ruin, I Aim to Become a Blacksmith",
        );
        const queries = probe.requests
          .filter((request) => request.url.startsWith(`${BASE_URL}/?`))
          .map((request) => requestParameters(request.url.split("?")[1]).get("s"));
        expect(queries[0]).to.equal("Botsuraku Yotei Nanode, Kajishokunin wo Mezasu");
      } finally {
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test(
    "English titles: removing an alias from live metadata restores original display",
    async () => {
      const id = "botsuraku-yotei-nanode-kajishokunin-wo-mezasu";
      const original = "Botsuraku Yotei Nanode, Kajishokunin wo Mezasu";
      const alias = "Expecting to Fall into Ruin, I Aim to Become a Blacksmith";
      await settings.setExcludeNSFW(true);
      const probe = new DiscoveryProbe("MangaSushi.removed-alias-test");
      probe.gate = async (request, data) =>
        request.url.startsWith(`${BASE_URL}/?`)
          ? (new TextEncoder().encode(
              Application.arrayBufferToUTF8String(data).replaceAll(alias, ""),
            ).buffer as ArrayBuffer)
          : data;
      probe.registerInterceptor();
      try {
        const result = await MangaSushi.getSearchResults({ title: original });
        expect(result.items.find((item) => item.mangaId === id)?.title).to.equal(original);
        expect((await MangaSushi.getMangaDetails(id)).mangaInfo.primaryTitle).to.equal(original);
      } finally {
        probe.unregisterInterceptor();
        await settings.setExcludeNSFW(true);
      }
    },
  );
  suite.test("getSearchResults: every native sort executes", async () => {
    for (const sort of SORTS) {
      const result = await MangaSushi.getSearchResults({ title: "" }, undefined, sort);
      expect(result.items.length).to.be.greaterThan(0);
      for (const item of result.items) expect(isAllowed(item.metadata)).to.equal(true);
    }
  });
  suite.test("getSearchResults: native continuation", async () => {
    const first = await MangaSushi.getSearchResults({ title: "" });
    expect(first.metadata).not.to.equal(undefined);
    const second = await MangaSushi.getSearchResults({ title: "" }, first.metadata);
    expect(second.items).not.to.be.empty;
    expect(second.items.map((item) => item.mangaId)).not.to.deep.equal(
      first.items.map((item) => item.mangaId),
    );
    for (const item of second.items) expect(isAllowed(item.metadata)).to.equal(true);
  });
  suite.test("getSearchResults: genuine empty query terminates", async () => {
    const result = await MangaSushi.getSearchResults({ title: "qzxzqzxzznomatch887771" });
    expect(result.items).to.deep.equal([]);
    expect(result.metadata).to.equal(undefined);
  });
  suite.test("advanced search: malformed saved constraints fail before native requests", async () => {
    const invalid: Metadata[] = [
      "action", [], false, { genres: "action" }, { genres: ["action", null] },
      { genres: ["invalid/genre"] }, { statuses: "end" }, { statuses: ["retired-status"] },
      { condition: "or" }, { adult: 0 }, { author: 1 }, { artist: [] }, { release: 2026 },
    ];
    const invalidSorts = [{}, { id: null }, { id: 1 }, { id: "unknown" }] as unknown as SortingOption[];
    const schedule = Application.scheduleRequest;
    let requests = 0;
    Application.scheduleRequest = async () => {
      requests++;
      throw new Error("Invalid saved constraints reached the native scheduler.");
    };
    try {
      for (const exclude of [true, false]) {
        await settings.setExcludeNSFW(exclude);
        for (const metadata of invalid) {
          const query = { title: "Saved filter proof", metadata };
          await rejects(() => MangaSushi.getSearchResults(query), /Mangasushi saved .* filter is invalid/);
          await rejects(() => MangaSushi.getAdvancedSearchForm(query), /Mangasushi saved .* filter is invalid/);
        }
        for (const sort of invalidSorts)
          await rejects(() => MangaSushi.getSearchResults({ title: "" }, undefined, sort), /saved sort is invalid/);
        for (const metadata of [undefined, null, {}, { genres: [], statuses: [], condition: "", adult: "" }])
          expect(searchUrl({ title: "", metadata }, exclude)).to.equal(searchUrl({ title: "" }, exclude));
        for (const sort of SORTS)
          expect(searchUrl({ title: "", metadata: { genres: ["action"], statuses: ["end"] } }, exclude, sort))
            .to.include(`m_orderby=${sort.id}&genre%5B0%5D=action`)
            .and.to.include("status%5B0%5D=end");
      }
      expect(requests).to.equal(0);
    } finally {
      Application.scheduleRequest = schedule;
      await settings.reset();
    }
  });
  suite.test("advanced search: actual taxonomy and native options", async () => {
    const html = await fetchText(searchUrl({ title: "" }, true));
    const genres = parseGenreOptions(html);
    expect(genres.length).to.be.greaterThan(20);
    expect(genres.some((genre) => genre.id === "action")).to.equal(true);
    const form = new MangaSushiSearchForm({ title: "" }, genres);
    await form.setGenres(["action", "fantasy"]);
    await form.setCondition(["1"]);
    await form.setAuthor("Yamata Nagato");
    await form.setArtist("Abeno Chaco");
    await form.setRelease("2026");
    await form.setStatuses([STATUSES[0].id]);
    await form.setAdult(["1"]);
    await form.formDidSubmit();
    const query = { title: "", metadata: form.getSearchQueryMetadata() };
    const url = searchUrl(query, true);
    for (const part of [
      "genre%5B0%5D=action",
      "genre%5B1%5D=fantasy",
      "op=1",
      "author=Yamata%20Nagato",
      "artist=Abeno%20Chaco",
      "release=2026",
      "adult=0",
      "status%5B0%5D=on-going",
    ])
      expect(url).to.include(part);
    const result = await MangaSushi.getSearchResults(query);
    expect(result.items).not.to.be.empty;
    for (const item of result.items)
      expect(item.metadata.genres.map((genre) => genre.id)).to.include.members([
        "action",
        "fantasy",
      ]);
    await form.reset();
    expect(form.getSearchQueryMetadata()).to.include({
      adult: "",
      condition: "",
      author: "",
      artist: "",
      release: "",
    });
  });
  suite.test(
    "genres: exact native menu chips, safe defaults and lazy private routing",
    async () => {
      const genreSection = SECTIONS.find((section) => section.id === "genres")!;
      const probe = new DiscoveryProbe("MangaSushi.genre-navigation-test");
      await settings.setExcludeNSFW(true);
      probe.registerInterceptor();
      try {
        const result = await MangaSushi.getDiscoverSectionItems(genreSection);
        expect(probe.requests.map((request) => request.url)).to.deep.equal([`${BASE_URL}/`]);
        const native = parseHomeGenres(probe.responses[0].html);
        expect(native.map((genre) => genre.id)).to.deep.equal(GENRE_IDS);
        expect(native).to.have.length(44);
        const chips = result.items as GenresCarouselItem[];
        const eligible = native.filter((genre) => !BLOCKED_GENRES.includes(genre.id));
        expect(chips).to.have.length(40);
        expect(chips.map((chip) => chip.name)).to.deep.equal(eligible.map((genre) => genre.title));
        expect(result.metadata).to.equal(undefined);
        for (const [index, chip] of chips.entries()) {
          expect(chip.type).to.equal("genresCarouselItem");
          expect(chip).not.to.have.property("mangaId");
          expect(chip).not.to.have.property("imageUrl");
          expect(chip.searchQuery.metadata).to.deep.equal({
            [GENRE_ROUTE_KEY]: eligible[index].id,
          });
          expect(readGenreRoute(chip.searchQuery.metadata)).to.equal(eligible[index].id);
        }
        await MangaSushi.getDiscoverSectionItems(genreSection);
        expect(probe.requests, "Warm chips never fetch any archive").to.have.length(1);
        const query = chips[0].searchQuery;
        const form = await MangaSushi.getAdvancedSearchForm(query);
        expect(form.getSections()).to.deep.equal([]);
        await form.formDidSubmit();
        expect(form.getSearchQueryMetadata()).to.deep.equal(query.metadata);
        expect(await MangaSushi.getSortingOptions(query)).to.deep.equal([]);
        expect(probe.requests, "Route-specific form and sorting are local").to.have.length(1);
        expect(readGenreRoute()).to.equal(undefined);
        for (const value of [
          null,
          1,
          [],
          ["action", "action"],
          {},
          "",
          "Action",
          " action",
          "../action",
          "action/",
          "action?x=1",
          "https://mangasushi.org/manga-genre/action/",
          "https://other.invalid/manga-genre/action/",
        ]) {
          const metadata = { [GENRE_ROUTE_KEY]: value };
          expect(() => readGenreRoute(metadata)).to.throw(/genre|archive|route/i);
          await rejects(
            () => MangaSushi.getSearchResults({ title: "Action", metadata }),
            /genre|archive|route/i,
          );
        }
        for (const metadata of [
          { [GENRE_ROUTE_KEY]: "action", genres: ["romance"] },
          { [GENRE_ROUTE_KEY]: "action", extra: "action" },
        ]) {
          expect(() => readGenreRoute(metadata)).to.throw(/genre|archive|route/i);
          await rejects(
            () => MangaSushi.getSearchResults({ title: "Action", metadata }),
            /genre|archive|route/i,
          );
        }
        for (const id of ["adult", "ecchi", "mature", "smut"])
          await rejects(
            () => MangaSushi.getSearchResults({ title: id, metadata: { [GENRE_ROUTE_KEY]: id } }),
            /unavailable|genre|archive/i,
          );
        await rejects(
          () =>
            MangaSushi.getSearchResults({
              title: "Cartoon",
              metadata: { [GENRE_ROUTE_KEY]: "cartoon" },
            }),
          /genre|archive|route/i,
        );
        expect(probe.requests, "Invalid route metadata must not make requests").to.have.length(1);
        await settings.setExcludeNSFW(false);
        const unrestricted = await MangaSushi.getDiscoverSectionItems(genreSection);
        expect(
          (unrestricted.items as GenresCarouselItem[]).map((chip) =>
            readGenreRoute(chip.searchQuery.metadata),
          ),
        ).to.deep.equal(GENRE_IDS);
      } finally {
        probe.unregisterInterceptor();
        await settings.setExcludeNSFW(true);
      }
    },
  );
  suite.test(
    "genres: exact archive canonical order, bounded enrichment and native continuation",
    async () => {
      const genreSection = SECTIONS.find((section) => section.id === "genres")!;
      await settings.setExcludeNSFW(true);
      const chips = (await MangaSushi.getDiscoverSectionItems(genreSection))
        .items as GenresCarouselItem[];
      const probe = new DiscoveryProbe("MangaSushi.genre-archive-test");
      let actionCursor: Parameters<typeof MangaSushi.getSearchResults>[1];
      probe.registerInterceptor();
      try {
        for (const genre of ["action", "romance"]) {
          const query = chips.find(
            (chip) => readGenreRoute(chip.searchQuery.metadata) === genre,
          )!.searchQuery;
          const start = probe.requests.length,
            responseStart = probe.responses.length;
          const first = await MangaSushi.getSearchResults(query);
          const requests = probe.requests.slice(start),
            responses = probe.responses.slice(responseStart);
          expect(requests).to.have.length(2);
          expect(requests[0].url).to.equal(`${BASE_URL}/manga-genre/${genre}/`);
          expect(
            requests.some((request) => request.url.startsWith(`${BASE_URL}/?`)),
            "Display title must not become text search",
          ).to.equal(false);
          const raw = parseCatalog(
            responses.find(({ request }) => request.url === requests[0].url)!.html,
            "latest",
          );
          expect(raw.items).to.have.length(12);
          const batch = requests.find((request) => typeof request.body === "string")!;
          expect(batch.url).to.equal(`${BASE_URL}/wp-admin/admin-ajax.php`);
          const body = requestParameters(batch.body as string);
          for (const [key, value] of Object.entries({
            template: "madara-core/content/content-search",
            page: "0",
            "vars[taxonomy]": "wp-manga-genre",
            "vars[term]": genre,
            "vars[posts_per_page]": "12",
            "vars[meta_key]": "_latest_update",
            "vars[orderby]": "post_name__in",
            "vars[paged]": "1",
            "vars[order]": "desc",
            "vars[s]": "",
          }))
            expect(body.get(key), key).to.equal(value);
          expect(batch.body).to.include("manga_adult_content");
          expect(boundedIds(batch.body as string)).to.deep.equal(ids(raw.items));
          const metadata = parseCatalog(
            responses.find(
              ({ request }) => request.url === batch.url && request.body === batch.body,
            )!.html,
            "search",
            true,
            { ...raw.next!, page: 0 },
          ).items;
          const allowed = new Map(
            metadata.filter((item) => isAllowed(item.metadata)).map((item) => [item.mangaId, item]),
          );
          expect(ids(first.items)).to.deep.equal(ids(raw.items).filter((id) => allowed.has(id)));
          for (const item of first.items) {
            expect(item.metadata.genres.map((tag) => tag.id)).to.include(genre);
            expect(item.metadata.adult).to.equal(false);
            const original = raw.items.find((entry) => entry.mangaId === item.mangaId)!;
            expect(item.title).to.equal(
              englishTitle(item.mangaId, original.title, [
                allowed.get(item.mangaId)!.metadata.alternative,
              ]),
            );
          }
          expect(first.metadata).not.to.equal(undefined);
          const warmCount = probe.requests.length;
          expect(ids((await MangaSushi.getSearchResults(query)).items)).to.deep.equal(
            ids(first.items),
          );
          expect(probe.requests, "Warm archive and metadata must both be reused").to.have.length(
            warmCount,
          );
          if (genre === "romance") {
            expect(
              ids((await MangaSushi.getSearchResults(query, actionCursor)).items),
            ).to.deep.equal(ids(first.items));
            expect(
              probe.requests,
              "A foreign archive cursor must restart only the selected genre",
            ).to.have.length(warmCount);
          }
          if (genre === "action") {
            actionCursor = first.metadata;
            const nextStart = probe.requests.length,
              nextResponseStart = probe.responses.length;
            const second = await MangaSushi.getSearchResults(query, first.metadata);
            const nextRequests = probe.requests.slice(nextStart),
              nextResponses = probe.responses.slice(nextResponseStart);
            expect(nextRequests).to.have.length(2);
            for (const request of nextRequests) {
              expect(request.url).to.equal(`${BASE_URL}/wp-admin/admin-ajax.php`);
              const parameters = requestParameters(request.body as string);
              const archive = parameters.get("template") === "madara-core/content/content-archive";
              expect(parameters.get("page")).to.equal(archive ? "1" : "0");
              if (!archive) {
                expect(parameters.get("vars[paged]")).to.equal("1");
                expect(parameters.get("vars[orderby]")).to.equal("post_name__in");
              }
              expect(parameters.get("vars[term]")).to.equal("action");
              expect(parameters.get("vars[posts_per_page]")).to.equal("12");
            }
            const archiveResponse = nextResponses.find(
              ({ request }) =>
                requestParameters(request.body as string).get("template") ===
                "madara-core/content/content-archive",
            )!;
            const native = parseCatalog(archiveResponse.html, "latest", false, raw.next);
            const enriched = nextResponses.find(
              ({ request }) =>
                requestParameters(request.body as string).get("template") ===
                "madara-core/content/content-search",
            )!;
            expect(boundedIds(enriched.request.body as string)).to.deep.equal(ids(native.items));
            const eligible = new Set(
              parseCatalog(enriched.html, "search", true, raw.next)
                .items.filter((item) => isAllowed(item.metadata))
                .map((item) => item.mangaId),
            );
            expect(ids(second.items)).to.deep.equal(
              ids(native.items).filter((id) => eligible.has(id) && !ids(first.items).includes(id)),
            );
            expect(second.items).not.to.be.empty;
            expect(new Set([...ids(first.items), ...ids(second.items)]).size).to.equal(
              first.items.length + second.items.length,
            );
            const repeatedCount = probe.requests.length;
            expect(
              ids((await MangaSushi.getSearchResults(query, first.metadata)).items),
            ).to.deep.equal(ids(second.items));
            expect(probe.requests).to.have.length(repeatedCount);
          }
        }
      } finally {
        probe.unregisterInterceptor();
        await settings.setExcludeNSFW(true);
      }
    },
  );
  suite.test(
    "genres: finite Horror archive retains metadata and terminates with two cold requests",
    async () => {
      await settings.setExcludeNSFW(true);
      const chips = (
        await MangaSushi.getDiscoverSectionItems(
          SECTIONS.find((section) => section.id === "genres")!,
        )
      ).items as GenresCarouselItem[];
      const query = chips.find(
        (chip) => readGenreRoute(chip.searchQuery.metadata) === "horror",
      )!.searchQuery;
      const probe = new DiscoveryProbe("MangaSushi.finite-genre-test");
      probe.registerInterceptor();
      try {
        const result = await MangaSushi.getSearchResults(query);
        expect(probe.requests).to.have.length(2);
        expect(probe.requests[0].url).to.equal(`${BASE_URL}/manga-genre/horror/`);
        const raw = parseCatalog(probe.responses[0].html, "latest");
        expect(raw.items).to.have.length(1);
        expect(raw.next).to.equal(undefined);
        const body = requestParameters(probe.requests[1].body as string);
        expect(body.get("page")).to.equal("0");
        expect(body.get("vars[term]")).to.equal("horror");
        expect(body.get("vars[posts_per_page]")).to.equal(String(raw.items.length));
        expect(body.get("vars[orderby]")).to.equal("post_name__in");
        expect(boundedIds(probe.requests[1].body as string)).to.deep.equal(ids(raw.items));
        const metadata = parseCatalog(probe.responses[1].html, "search", true, {
          page: 0,
          template: "madara-core/content/content-search",
          vars: {},
        }).items;
        const eligible = new Set(
          metadata.filter((item) => isAllowed(item.metadata)).map((item) => item.mangaId),
        );
        expect(ids(result.items)).to.deep.equal(ids(raw.items).filter((id) => eligible.has(id)));
        expect(result.metadata).to.equal(undefined);
        expect(ids((await MangaSushi.getSearchResults(query)).items)).to.deep.equal(
          ids(result.items),
        );
        expect(probe.requests).to.have.length(2);
      } finally {
        probe.unregisterInterceptor();
        await settings.setExcludeNSFW(true);
      }
    },
  );
  suite.test(
    "genres: malformed cumulative history is rejected before source requests",
    async () => {
      await settings.setExcludeNSFW(true);
      const chips = (
        await MangaSushi.getDiscoverSectionItems(
          SECTIONS.find((section) => section.id === "genres")!,
        )
      ).items as GenresCarouselItem[];
      const query = chips.find(
        (chip) => readGenreRoute(chip.searchQuery.metadata) === "action",
      )!.searchQuery;
      const first = await MangaSushi.getSearchResults(query);
      expect(first.metadata).not.to.equal(undefined);
      const probe = new DiscoveryProbe("MangaSushi.genre-history-test");
      probe.registerInterceptor();
      try {
        for (const seen of [
          undefined,
          null,
          "action",
          {},
          [1],
          ["../manga"],
          ["lonely-attack-on-the-different-world", "lonely-attack-on-the-different-world"],
        ])
          await rejects(
            () =>
              MangaSushi.getSearchResults(query, {
                ...(first.metadata as unknown as Cursor),
                seen,
              }),
            /history/i,
          );
        expect(probe.requests).to.have.length(0);
      } finally {
        probe.unregisterInterceptor();
        await settings.setExcludeNSFW(true);
      }
    },
  );
  suite.test(
    "genres: duplicate-only and excluded-only pages advance, while stalled archives stop visibly",
    async () => {
      for (const mode of ["duplicates", "excluded", "stalled"]) {
        await settings.setExcludeNSFW(true);
        const chips = (
          await MangaSushi.getDiscoverSectionItems(
            SECTIONS.find((section) => section.id === "genres")!,
          )
        ).items as GenresCarouselItem[];
        const query = chips.find(
          (chip) => readGenreRoute(chip.searchQuery.metadata) === "action",
        )!.searchQuery;
        const probe = new DiscoveryProbe(`MangaSushi.genre-progress-${mode}-test`);
        const schedule = Application.scheduleRequest;
        let firstCards = "",
          firstHTML = "",
          active = false;
        probe.gate = async (request, data) => {
          const html = Application.arrayBufferToUTF8String(data);
          if (request.url === `${BASE_URL}/manga-genre/action/`) {
            const $ = cheerio.load(html);
            firstHTML = html;
            firstCards = $(".page-item-detail.manga")
              .toArray()
              .map((node) => $.html(node))
              .join("");
            expect(firstCards).not.to.equal("");
            return data;
          }
          if (!active || typeof request.body !== "string") return data;
          const body = requestParameters(request.body);
          if (body.get("template") !== "madara-core/content/content-archive") return data;
          if (mode === "duplicates" && body.get("page") === "1") return encodeHTML(firstCards);
          if (mode === "excluded" && body.get("page") === "1") {
            const $ = cheerio.load(html);
            expect($(".page-item-detail.manga").length).to.be.greaterThan(0);
            $(".page-item-detail.manga").attr("data-adult", "1");
            return encodeHTML($.html());
          }
          return data;
        };
        probe.registerInterceptor();
        try {
          const first = await MangaSushi.getSearchResults(query);
          const nativeFirst = parseCatalog(firstHTML, "latest");
          expect(first.metadata).not.to.equal(undefined);
          active = true;
          const count = probe.requests.length,
            responseStart = probe.responses.length;
          if (mode === "stalled") {
            // These deliberately repeated cards come from this run's first page.
            // Do not fetch ten provider pages whose contents would be discarded.
            const seed = probe.responses.find(
              ({ request }) => request.url === `${BASE_URL}/manga-genre/action/`,
            )!;
            const cursor = JSON.stringify(first.metadata);
            expect(nativeFirst.next!.page).to.equal(1);
            expect(nativeFirst.next!.template).to.equal("madara-core/content/content-archive");
            const fields: string[] = [];
            const pending: [string, unknown][] = Object.entries(nativeFirst.next!.vars).map(
              ([key, value]) => [`vars[${key}]`, value],
            );
            while (pending.length) {
              const [key, value] = pending.shift()!;
              if (value !== null && typeof value === "object")
                pending.unshift(
                  ...Object.entries(value).map(([child, entry]): [string, unknown] => [
                    `${key}[${child}]`,
                    entry,
                  ]),
                );
              else {
                const text =
                  typeof value === "string"
                    ? value
                    : typeof value === "number" || typeof value === "boolean"
                      ? String(value)
                      : "";
                fields.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
              }
            }
            const requests: Request[] = [];
            const replay: typeof schedule = async (request) => {
              requests.push(request);
              expect(requests.length).to.be.at.most(10);
              expect(request.url).to.equal(`${BASE_URL}/wp-admin/admin-ajax.php`);
              expect(request.method).to.equal("POST");
              expect(request.body).to.equal(
                [
                  "action=madara_load_more",
                  `page=${requests.length}`,
                  "template=madara-core%2Fcontent%2Fcontent-archive",
                  ...fields,
                ].join("&"),
              );
              return [{ ...seed.response, url: request.url }, encodeHTML(firstCards)];
            };
            Application.scheduleRequest = replay;
            if (Application.scheduleRequest !== replay)
              throw new Error(
                "Native runtime does not allow replacing Application.scheduleRequest",
              );
            await rejects(
              () => MangaSushi.getSearchResults(query, first.metadata),
              /no visible progress in ten source pages/i,
            );
            expect(requests).to.have.length(10);
            expect(JSON.stringify(first.metadata)).to.equal(cursor);
            expect(probe.requests).to.have.length(count);
            expect(probe.responses).to.have.length(responseStart);
          } else {
            const next = await MangaSushi.getSearchResults(query, first.metadata);
            const requests = probe.requests.slice(count),
              responses = probe.responses.slice(responseStart);
            expect(requests).to.have.length(mode === "duplicates" ? 3 : 4);
            const archiveResponses = responses.filter(
              ({ request }) =>
                typeof request.body === "string" &&
                requestParameters(request.body).get("template") ===
                  "madara-core/content/content-archive",
            );
            expect(
              archiveResponses.map(({ request }) =>
                requestParameters(request.body as string).get("page"),
              ),
            ).to.deep.equal(["1", "2"]);
            const native = parseCatalog(archiveResponses[1].html, "latest", false, {
              ...nativeFirst.next!,
              page: 2,
            });
            const batch = responses
              .filter(
                ({ request }) =>
                  typeof request.body === "string" &&
                  requestParameters(request.body).get("template") ===
                    "madara-core/content/content-search",
              )
              .at(-1)!;
            const bounded = requestParameters(batch.request.body as string);
            expect(bounded.get("page")).to.equal("0");
            expect(bounded.get("vars[paged]")).to.equal("1");
            expect(bounded.get("vars[posts_per_page]")).to.equal(String(native.items.length));
            expect(bounded.get("vars[orderby]")).to.equal("post_name__in");
            expect(boundedIds(batch.request.body as string)).to.deep.equal(ids(native.items));
            const eligible = new Set(
              parseCatalog(batch.html, "search", true, nativeFirst.next)
                .items.filter((item) => isAllowed(item.metadata))
                .map((item) => item.mangaId),
            );
            expect(ids(next.items)).to.deep.equal(
              ids(native.items).filter(
                (id) => eligible.has(id) && !ids(nativeFirst.items).includes(id),
              ),
            );
            expect(next.items).not.to.be.empty;
            expect(new Set([...ids(first.items), ...ids(next.items)]).size).to.equal(
              first.items.length + next.items.length,
            );
            const repeated = probe.requests.length;
            expect(
              ids((await MangaSushi.getSearchResults(query, first.metadata)).items),
            ).to.deep.equal(ids(next.items));
            expect(probe.requests, "A repeated logical cursor must be pure").to.have.length(
              repeated,
            );
          }
          expect(
            probe.requests
              .slice(count)
              .some((request) => request.url.startsWith(`${BASE_URL}/manga/`)),
          ).to.equal(false);
        } finally {
          Application.scheduleRequest = schedule;
          probe.unregisterInterceptor();
          await settings.setExcludeNSFW(true);
        }
      }
    },
  );
  suite.test("genres: out-of-page metadata fails closed without per-title fallback", async () => {
    await settings.setExcludeNSFW(true);
    const chips = (
      await MangaSushi.getDiscoverSectionItems(SECTIONS.find((section) => section.id === "genres")!)
    ).items as GenresCarouselItem[];
    const query = chips.find(
      (chip) => readGenreRoute(chip.searchQuery.metadata) === "action",
    )!.searchQuery;
    const target = "lonely-attack-on-the-different-world";
    await MangaSushi.getMangaDetails(target);
    const probe = new DiscoveryProbe("MangaSushi.genre-identity-test");
    let changed = false;
    probe.gate = async (request, data) => {
      if (
        typeof request.body !== "string" ||
        requestParameters(request.body).get("template") !== "madara-core/content/content-search"
      )
        return data;
      const $ = cheerio.load(Application.arrayBufferToUTF8String(data));
      const warm = $(".c-tabs-item__content").filter(
        (_index, node) => $(node).find(`.post-title a[href="${seriesUrl(target)}"]`).length > 0,
      );
      expect(warm).to.have.length(1);
      warm.append('<span class="adult-content">Adult content</span>');
      const anchor = $(".c-tabs-item__content .post-title a")
        .filter((_index, node) => $(node).attr("href") !== seriesUrl(target))
        .first();
      expect(anchor).to.have.length(1);
      anchor.attr("href", `${BASE_URL}/manga/out-of-page-canonical-proof/`);
      changed = true;
      return encodeHTML($.html());
    };
    probe.registerInterceptor();
    try {
      await rejects(
        () => MangaSushi.getSearchResults(query),
        /bounded genre metadata|canonical|outside/i,
      );
      expect(changed).to.equal(true);
      expect(probe.requests).to.have.length(2);
      expect(
        probe.requests.filter((request) => request.url.startsWith(`${BASE_URL}/manga/`)),
      ).to.have.length(0);
      probe.gate = undefined;
      await rejects(
        () => MangaSushi.getMangaDetails(target),
        /hidden by NSFW exclusion|lacks reliable/i,
      );
      const valid = await MangaSushi.getSearchResults({
        title: "Lonely Attack on the Different World",
      });
      expect(ids(valid.items)).not.to.include(target);
      await rejects(
        () => MangaSushi.getMangaDetails(target),
        /hidden by NSFW exclusion|lacks reliable/i,
      );
    } finally {
      probe.unregisterInterceptor();
      await settings.setExcludeNSFW(true);
    }
  });
  suite.test(
    "genres: raw root and descendant warnings survive held metadata enrichment",
    async () => {
      await settings.setExcludeNSFW(true);
      const chips = (
        await MangaSushi.getDiscoverSectionItems(
          SECTIONS.find((section) => section.id === "genres")!,
        )
      ).items as GenresCarouselItem[];
      const query = chips.find(
        (chip) => readGenreRoute(chip.searchQuery.metadata) === "action",
      )!.searchQuery;
      const targets = [
        "lonely-attack-on-the-different-world",
        "yondome-wa-iya-na-shizokusei-majutsushi",
      ];
      await MangaSushi.getMangaDetails(targets[0]);
      const probe = new DiscoveryProbe("MangaSushi.genre-warning-test");
      let arrived!: () => void, release!: () => void;
      const ready = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      probe.gate = async (request, data) => {
        if (
          typeof request.body === "string" &&
          requestParameters(request.body).get("template") === "madara-core/content/content-search"
        ) {
          arrived();
          await held;
          return data;
        }
        if (request.url !== `${BASE_URL}/manga-genre/action/`) return data;
        const $ = cheerio.load(Application.arrayBufferToUTF8String(data));
        for (const [index, id] of targets.entries()) {
          const row = $(".page-item-detail.manga").filter(
            (_index, node) => $(node).find(`.post-title a[href="${seriesUrl(id)}"]`).length > 0,
          );
          expect(row).to.have.length(1);
          if (index === 0) row.attr("data-adult", "1");
          else row.append('<span class="adult-content">Adult content</span>');
        }
        return encodeHTML($.html());
      };
      probe.registerInterceptor();
      const pending = MangaSushi.getSearchResults(query);
      void pending.catch(() => undefined);
      try {
        await Promise.race([
          ready,
          pending.then(() => {
            throw new Error("Archive completed without its bounded metadata gate.");
          }),
        ]);
        // Both fresh raw warnings must be observed before a later safe batch resolves.
        // A same-ID details response cannot revive either title while the batch is held.
        for (const id of targets)
          await rejects(
            () => MangaSushi.getMangaDetails(id),
            /hidden by NSFW exclusion|lacks reliable/i,
          );
        release();
        const result = await pending;
        for (const id of targets) expect(ids(result.items)).not.to.include(id);
        const batch = probe.requests.filter((request) => typeof request.body === "string");
        expect(batch).to.have.length(1);
        for (const id of targets)
          await rejects(
            () => MangaSushi.getMangaDetails(id),
            /hidden by NSFW exclusion|lacks reliable/i,
          );
      } finally {
        release();
        await pending.catch(() => undefined);
        probe.unregisterInterceptor();
        await settings.setExcludeNSFW(true);
      }
    },
  );
  suite.test("metadata: rejected delayed warnings cannot seed a new local warning window", async () => {
    await settings.setExcludeNSFW(true);
    const target = "lonely-attack-on-the-different-world";
    const query = { title: "Lonely Attack on the Different World" };
    const newer = new (MangaSushi.constructor as new () => typeof MangaSushi)();
    await newer.initialise();
    const probe = new DiscoveryProbe("MangaSushi.rejected-warning-order-test");
    let arrived!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => { arrived = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    let mutated = false;
    probe.gate = async (request, data) => {
      if (mutated || request.url !== searchUrl(query, true)) return data;
      const $ = cheerio.load(Application.arrayBufferToUTF8String(data));
      const row = $(".c-tabs-item__content").filter(
        (_index, node) => $(node).find(`.post-title a[href="${seriesUrl(target)}"]`).length > 0,
      );
      expect(row).to.have.length(1);
      row.append('<span class="adult-content">Adult content</span>');
      mutated = true;
      arrived();
      await held;
      return encodeHTML($.html());
    };
    probe.registerInterceptor();
    const pending = MangaSushi.getSearchResults(query);
    void pending.catch(() => undefined);
    try {
      await Promise.race([
        ready,
        pending.then(() => { throw new Error("Search completed without the delayed warning gate."); }),
      ]);
      const safe = await newer.getSearchResults(query);
      expect(ids(safe.items)).to.include(target);
      release();
      expect(ids((await pending).items)).not.to.include(target);
      // The ignored old warning must not turn into new contrary evidence when
      // this same instance receives another genuinely fresh safe response.
      expect(ids((await MangaSushi.getSearchResults(query)).items)).to.include(target);
      expect(probe.requests).to.have.length(3);
    } finally {
      release();
      await pending.catch(() => undefined);
      probe.unregisterInterceptor();
      await MangaSushi.initialise();
      await settings.setExcludeNSFW(true);
    }
  });
  suite.test(
    "genres: Cooking archive is genuinely empty without metadata or catalog scans",
    async () => {
      await settings.setExcludeNSFW(true);
      const chips = (
        await MangaSushi.getDiscoverSectionItems(
          SECTIONS.find((section) => section.id === "genres")!,
        )
      ).items as GenresCarouselItem[];
      const query = chips.find(
        (chip) => readGenreRoute(chip.searchQuery.metadata) === "cooking",
      )!.searchQuery;
      const probe = new DiscoveryProbe("MangaSushi.empty-genre-test");
      probe.registerInterceptor();
      try {
        const result = await MangaSushi.getSearchResults(query);
        expect(result.items).to.deep.equal([]);
        expect(result.metadata).to.equal(undefined);
        expect(probe.requests.map((request) => request.url)).to.deep.equal([
          `${BASE_URL}/manga-genre/cooking/`,
        ]);
        const $ = cheerio.load(probe.responses[0].html);
        expect($("body").hasClass("term-cooking")).to.equal(true);
        expect($(".no-results.not-found")).to.have.length(1);
        expect($("#navigation-ajax")).to.have.length(0);
      } finally {
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test(
    "advanced genres: ignored Cooking filter fails visibly in one native request",
    async () => {
      const probe = new DiscoveryProbe("MangaSushi.ignored-genre-test");
      probe.registerInterceptor();
      try {
        await rejects(
          () => MangaSushi.getSearchResults({ title: "", metadata: { genres: ["cooking"] } }),
          /genre.*filter|filter.*genre/i,
        );
        expect(probe.requests).to.have.length(1);
        expect(probe.requests[0].url).to.equal(
          searchUrl({ title: "", metadata: { genres: ["cooking"] } }, true),
        );
        const $ = cheerio.load(probe.responses[0].html);
        expect($('input[name="genre[]"][value="cooking"]').attr("checked")).not.to.equal(undefined);
        expect(parseCatalog(probe.responses[0].html, "search", true).items).not.to.be.empty;
      } finally {
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test(
    "advanced genres: fresh malformed taxonomy and wrong-card evidence fail without scans",
    async () => {
      const query = { title: "", metadata: { genres: ["action"] } };
      const probe = new DiscoveryProbe("MangaSushi.genre-boundary-test");
      probe.registerInterceptor();
      try {
        for (const mutation of [
          "missing",
          "malformed",
          "malformed-json",
          "duplicate",
          "duplicate-json",
          "wrong-term",
          "constructor-sibling",
          "wrong-cards",
        ]) {
          let changed = false;
          probe.gate = async (request, data) => {
            if (request.url !== searchUrl(query, true)) return data;
            const $ = cheerio.load(Application.arrayBufferToUTF8String(data));
            if (mutation === "wrong-cards") {
              const anchors = $('.mg_genres a[href="https://mangasushi.org/manga-genre/action/"]');
              expect(anchors.length).to.be.greaterThan(0);
              anchors.attr("href", `${BASE_URL}/manga-genre/cooking/`).text("Cooking");
            } else {
              const script = $("script").filter((_index, node) =>
                /^\s*var __madara_query_vars = /.test($(node).text()),
              );
              expect(script).to.have.length(1);
              if (mutation === "duplicate") script.after($.html(script));
              else {
                const state = JSON.parse(script.text().match(/= (\{.*\});?\s*$/s)![1]) as Record<
                  string,
                  unknown
                >;
                if (mutation === "missing") delete state.tax_query;
                else if (mutation === "malformed") state.tax_query = "action";
                else if (mutation === "wrong-term")
                  state.tax_query = {
                    relation: "OR",
                    0: { taxonomy: "wp-manga-genre", field: "slug", terms: ["romance"] },
                  };
                else if (mutation === "constructor-sibling")
                  (state.tax_query as Record<string, unknown>)["1"] = {
                    taxonomy: "constructor",
                    field: "term_id",
                    terms: [2],
                  };
                let serialized = JSON.stringify(state);
                if (mutation === "malformed-json") serialized = serialized.replace("{", "{broken");
                if (mutation === "duplicate-json")
                  serialized = serialized.replace('"tax_query":', '"tax_query":{},"tax_query":');
                script.text(`var __madara_query_vars = ${serialized};`);
              }
            }
            changed = true;
            return encodeHTML($.html());
          };
          const count = probe.requests.length;
          await rejects(
            () => MangaSushi.getSearchResults(query),
            /genre|filter|pagination|query|ambiguous/i,
          );
          expect(changed, mutation).to.equal(true);
          expect(
            probe.requests.length - count,
            `${mutation} must not trigger fallback requests`,
          ).to.equal(1);
        }
      } finally {
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test(
    "advanced genres: rejected filters cannot discard fresh warnings or revive warm-safe titles",
    async () => {
      const query = { title: "", metadata: { genres: ["action"] } };
      for (const continuation of [false, true]) {
        const scenario = continuation ? "continuation" : "first page";
        await settings.setExcludeNSFW(true);
        const probe = new DiscoveryProbe(`MangaSushi.ignored-warning-${continuation}-test`);
        probe.registerInterceptor();
        try {
          const first = await MangaSushi.getSearchResults(query);
          const cursor = continuation ? first.metadata : undefined;
          if (continuation)
            expect(cursor, `${scenario}: a native continuation cursor is required`).not.to.equal(
              undefined,
            );
          const warm = continuation ? await MangaSushi.getSearchResults(query, cursor) : first;
          expect(warm.items, `${scenario}: warm native page has visible titles`).not.to.be.empty;
          const target = warm.items[0].mangaId;
          // Mutate the exact response that warmed this title, not a later rotating page.
          const captured = probe.responses.at(-1)!;
          const $ = cheerio.load(captured.html);
          const row = $(".c-tabs-item__content").filter(
            (_index, node) => $(node).find(`.post-title a[href="${seriesUrl(target)}"]`).length > 0,
          );
          expect(row.length, `${scenario}: exactly one warm row for ${target}`).to.equal(1);
          row.append('<span class="adult-content">Adult content</span>');
          if (continuation) {
            const action = row.find(`.mg_genres a[href="${BASE_URL}/manga-genre/action/"]`);
            expect(action.length, `${scenario}: warm target has exactly one Action link`).to.equal(
              1,
            );
            action.attr("href", `${BASE_URL}/manga-genre/cooking/`).text("Cooking");
          } else {
            const script = $("script").filter((_index, node) =>
              /^\s*var __madara_query_vars = /.test($(node).text()),
            );
            expect(script.length, `${scenario}: exactly one native query script`).to.equal(1);
            const state = JSON.parse(script.text().match(/= (\{.*\});?\s*$/s)![1]) as Record<
              string,
              unknown
            >;
            delete state.tax_query;
            script.text(`var __madara_query_vars = ${JSON.stringify(state)};`);
          }
          const invalid = $.html();
          let changed = false;
          probe.gate = async (request, data) => {
            if (
              request.url !== captured.request.url ||
              request.method !== captured.request.method ||
              request.body !== captured.request.body
            )
              return data;
            changed = true;
            return encodeHTML(invalid);
          };
          const count = probe.requests.length;
          await rejects(
            () => MangaSushi.getSearchResults(query, cursor),
            /genre.*filter|filter.*genre/i,
          );
          expect(changed, `${scenario}: mutated response matched the exact warm request`).to.equal(
            true,
          );
          expect(probe.requests.length - count, `${scenario}: rejected filter cannot scan`).to.equal(
            1,
          );
          // A subsequent clean response for the same IDs must not erase the warning.
          probe.gate = async (request, data) =>
            request.url === captured.request.url &&
            request.method === captured.request.method &&
            request.body === captured.request.body
              ? encodeHTML(captured.html)
              : data;
          await rejects(
            () => MangaSushi.getMangaDetails(target),
            /hidden by NSFW exclusion|lacks reliable/i,
          );
          const valid = await MangaSushi.getSearchResults(query, cursor);
          expect(ids(valid.items)).not.to.include(target);
          await rejects(
            () => MangaSushi.getMangaDetails(target),
            /hidden by NSFW exclusion|lacks reliable/i,
          );
        } finally {
          probe.unregisterInterceptor();
          await settings.setExcludeNSFW(true);
        }
      }
    },
  );
  suite.test(
    "advanced genres: changed or contradictory empty responses fail without scanning",
    async () => {
      const query = { title: "qzxzqzxzznomatch887771", metadata: { genres: ["action"] } };
      const probe = new DiscoveryProbe("MangaSushi.empty-genre-boundary-test");
      probe.registerInterceptor();
      try {
        for (const mutation of ["text", "navigation", "duplicate-state"]) {
          let changed = false;
          probe.gate = async (request, data) => {
            if (request.url !== searchUrl(query, true)) return data;
            const $ = cheerio.load(Application.arrayBufferToUTF8String(data));
            const empty = $(".no-results.not-found");
            expect(empty).to.have.length(1);
            expect(empty.text().replace(/\s+/g, " ").trim()).to.equal(
              "No matches found. Try a different search...",
            );
            if (mutation === "text") empty.text("Unexpected provider response.");
            else if (mutation === "navigation") {
              expect(sourceSearch.next).not.to.equal(undefined);
              $("body").append(
                '<a id="navigation-ajax" data-template="madara-core/content/content-search"></a>',
              );
              $("body").append(
                `<script>var __madara_query_vars = ${JSON.stringify(sourceSearch.next!.vars)};</script>`,
              );
            } else {
              const script = $("script").filter((_index, node) =>
                /\bvar manga_args\s*=/.test($(node).text()),
              );
              expect(script).to.have.length(1);
              script.after($.html(script));
            }
            changed = true;
            return encodeHTML($.html());
          };
          const count = probe.requests.length;
          await rejects(
            () => MangaSushi.getSearchResults(query),
            /genre|filter|pagination|ambiguous/i,
          );
          expect(changed).to.equal(true);
          expect(probe.requests.length - count).to.equal(1);
        }
      } finally {
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test(
    "advanced genres: native multiple-genre OR, AND and genuine empty remain distinct",
    async () => {
      const probe = new DiscoveryProbe("MangaSushi.multi-genre-test");
      probe.registerInterceptor();
      try {
        for (const condition of ["", "1"]) {
          const count = probe.requests.length;
          const result = await MangaSushi.getSearchResults({
            title: "",
            metadata: { genres: ["action", "fantasy"], condition },
          });
          expect(result.items).not.to.be.empty;
          expect(probe.requests.length - count).to.equal(1);
          for (const item of result.items) {
            const genres = item.metadata.genres.map((genre) => genre.id);
            expect(
              condition === "1"
                ? ["action", "fantasy"].every((genre) => genres.includes(genre))
                : ["action", "fantasy"].some((genre) => genres.includes(genre)),
            ).to.equal(true);
          }
          const emptyCount = probe.requests.length;
          const empty = await MangaSushi.getSearchResults({
            title: "qzxzqzxzznomatch887771",
            metadata: { genres: ["action", "fantasy"], condition },
          });
          expect(empty.items).to.deep.equal([]);
          expect(empty.metadata).to.equal(undefined);
          expect(probe.requests.length - emptyCount).to.equal(1);
        }
      } finally {
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test(
    "getDiscoverSectionItems: cold-cache default exactly mirrors eligible site rows",
    async () => {
      const safeIds = new Set(
        sourceSearch.items.filter((item) => isAllowed(item.metadata)).map((item) => item.mangaId),
      );
      let page = sourceSearch;
      for (let index = 0; page.next && index < 20; index++) {
        page = parseCatalog(await fetchNext(page.next), "search", true, page.next);
        for (const item of page.items) if (isAllowed(item.metadata)) safeIds.add(item.mangaId);
      }
      expect(page.next).to.equal(undefined);
      await settings.setExcludeNSFW(false);
      await settings.setExcludeNSFW(true);
      const homepage = await fetchText(`${BASE_URL}/`);
      const probe = new DiscoveryProbe("MangaSushi.discovery-count-test");
      probe.registerInterceptor();
      const schedule = Application.scheduleRequest;
      let binaryRequest: Request | undefined;
      const guard = new MangaSushiInterceptor("MangaSushi.binary-body-guard");
      Application.scheduleRequest = async (request) => {
        if (request.method !== "POST") return schedule(request);
        if (typeof request.body !== "string") throw new Error("Expected source-issued form bytes.");
        binaryRequest = { ...request, body: encodeHTML(request.body) };
        // A compatible representation is not permission for altered bytes,
        // arbitrary objects, another method or another source route.
        for (const changed of [
          { ...binaryRequest, body: encodeHTML(request.body + "&unissued=1") },
          { ...binaryRequest, body: new Uint8Array([0xff]).buffer },
          { ...binaryRequest, body: {} },
          { ...binaryRequest, body: Object.create(ArrayBuffer.prototype) as object },
          { ...binaryRequest, body: new Uint8Array(0) },
          { ...binaryRequest, body: undefined },
          { ...binaryRequest, method: "GET" },
          { ...binaryRequest, url: `${BASE_URL}/manga/another-title/ajax/chapters/` },
        ]) await rejects(() => guard.interceptRequest(changed), /image|metadata/);
        return schedule(binaryRequest);
      };
      try {
        const started = Date.now();
        const rows = await Promise.all(
          SECTIONS.map((section) => MangaSushi.getDiscoverSectionItems(section)),
        );
        expect(probe.requests.length, "One shared homepage plus one metadata batch").to.equal(2);
        const batch = probe.requests.find((request) =>
          request.url.endsWith("/wp-admin/admin-ajax.php"),
        );
        expect(batch).not.to.equal(undefined);
        if (!(batch?.body instanceof ArrayBuffer))
          throw new Error("Expected native binary metadata form bytes.");
        const body = requestParameters(Application.arrayBufferToUTF8String(batch.body));
        expect(body.get("template")).to.equal("madara-core/content/content-search");
        expect(body.get("page")).to.equal("0");
        const adult = [...body.entries()].find(
          ([key, value]) =>
            /^vars\[meta_query\].*\[key\]$/.test(key) && value === "manga_adult_content",
        );
        expect(adult, "Native adult filter must remain present").not.to.equal(undefined);
        expect(body.get(adult![0].replace(/\[key\]$/, "[value]"))).to.equal("");
        logger.log("discoveryCold", {
          requests: probe.requests.length,
          durationMs: Date.now() - started,
        });
        const warmStarted = Date.now();
        const warmRows = await Promise.all(
          SECTIONS.map((section) => MangaSushi.getDiscoverSectionItems(section)),
        );
        expect(probe.requests.length, "Warm discovery must not refetch either response").to.equal(
          2,
        );
        logger.log("discoveryWarm", { requests: 0, durationMs: Date.now() - warmStarted });
        for (const row of [rows[0], warmRows[0]])
          expect(
            row.items.find(
              (item) =>
                "mangaId" in item && item.mangaId === "yondome-wa-iya-na-shizokusei-majutsushi",
            ),
          ).to.include({ title: "Death Attribute Magician" });
        expect(
          (rows[2].items as GenresCarouselItem[]).map((chip) =>
            readGenreRoute(chip.searchQuery.metadata),
          ),
        ).to.deep.equal(
          parseHomeGenres(homepage)
            .filter((genre) => !BLOCKED_GENRES.includes(genre.id))
            .map((genre) => genre.id),
        );
        for (const [index, section] of FEED_SECTIONS.entries()) {
          const native = parseCatalog(homepage, section.id === "popular" ? "popular" : "latest");
          const expectedIds = native.items
            .filter((item) => safeIds.has(item.mangaId))
            .map((item) => item.mangaId);
          const result = rows[index];
          expect(result.items.map((item) => ("mangaId" in item ? item.mangaId : ""))).to.deep.equal(
            expectedIds,
          );
          expect(
            warmRows[index].items.map((item) => ("mangaId" in item ? item.mangaId : "")),
          ).to.deep.equal(expectedIds);
          for (const item of result.items) {
            if (!("mangaId" in item)) throw new Error("Expected a manga discovery item.");
            expect(isAllowed(item.metadata as Parameters<typeof isAllowed>[0])).to.equal(true);
            const original = native.items.find((entry) => entry.mangaId === item.mangaId)!;
            expect(item.title).to.equal(
              englishTitle(item.mangaId, original.title, [
                (item.metadata as Parameters<typeof isAllowed>[0]).alternative,
              ]),
            );
          }
          if (section.id === "popular") expect(result.metadata).to.equal(undefined);
        }
        expect(binaryRequest).not.to.equal(undefined);
        await rejects(() => guard.interceptRequest(binaryRequest!), /image|metadata/);
      } finally {
        Application.scheduleRequest = schedule;
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test("settings: pending native discovery batch is invalidated", async () => {
    await settings.setExcludeNSFW(false);
    await settings.setExcludeNSFW(true);
    const probe = new DiscoveryProbe("MangaSushi.discovery-settings-test");
    let started!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    probe.gate = async (request, data) => {
      if (
        typeof request.body === "string" &&
        requestParameters(request.body).get("template") === "madara-core/content/content-search"
      ) {
        started();
        await gate;
      }
      return data;
    };
    probe.registerInterceptor();
    const pending = MangaSushi.getDiscoverSectionItems(SECTIONS[1]);
    try {
      await Promise.race([
        ready,
        pending.then(() => {
          throw new Error("Discovery completed without the native metadata gate.");
        }),
      ]);
      await settings.setExcludeNSFW(false);
      release();
      await rejects(() => pending, /settings changed/);
    } finally {
      release();
      probe.unregisterInterceptor();
      await settings.setExcludeNSFW(true);
    }
  });
  suite.test("settings: explicit opt-out and finite Popular fidelity", async () => {
    await settings.setExcludeNSFW(false);
    expect(preferences().excludeNSFW).to.equal(false);
    home = await fetchText(`${BASE_URL}/`);
    const native = parseCatalog(home, "popular");
    const probe = new DiscoveryProbe("MangaSushi.unfiltered-discovery-test");
    probe.registerInterceptor();
    try {
      const started = Date.now();
      const rows = await Promise.all(
        SECTIONS.map((section) => MangaSushi.getDiscoverSectionItems(section)),
      );
      expect(
        probe.requests.length,
        "Unfiltered discovery shares one home and one metadata batch",
      ).to.equal(2);
      logger.log("unfilteredDiscoveryCold", {
        requests: probe.requests.length,
        durationMs: Date.now() - started,
      });
      const batch = probe.requests.find((request) => typeof request.body === "string");
      expect(batch).not.to.equal(undefined);
      if (typeof batch?.body !== "string") throw new Error("Expected metadata batch body.");
      expect(batch.body).not.to.include("manga_adult_content");
      const warmStarted = Date.now();
      const warmRows = await Promise.all(
        SECTIONS.map((section) => MangaSushi.getDiscoverSectionItems(section)),
      );
      expect(probe.requests.length, "Unfiltered warm discovery must make zero requests").to.equal(
        2,
      );
      logger.log("unfilteredDiscoveryWarm", { requests: 0, durationMs: Date.now() - warmStarted });
      for (const row of [rows[0], warmRows[0]])
        expect(
          row.items.find(
            (item) =>
              "mangaId" in item && item.mangaId === "yondome-wa-iya-na-shizokusei-majutsushi",
          ),
        ).to.include({ title: "Death Attribute Magician" });
      const result = rows[0];
      expect(result.items.map((item) => ("mangaId" in item ? item.mangaId : ""))).to.deep.equal(
        native.items.map((item) => item.mangaId),
      );
      expect(result.metadata).to.equal(undefined);
      expect(
        (rows[2].items as GenresCarouselItem[]).map((chip) =>
          readGenreRoute(chip.searchQuery.metadata),
        ),
      ).to.deep.equal(parseHomeGenres(home).map((genre) => genre.id));
      for (const [index, section] of FEED_SECTIONS.entries()) {
        const originals = parseCatalog(home, section.id === "popular" ? "popular" : "latest").items;
        for (const item of rows[index].items) {
          if (!("mangaId" in item)) throw new Error("Expected manga discovery item.");
          const original = originals.find((entry) => entry.mangaId === item.mangaId)!;
          expect(item.title).to.equal(
            englishTitle(item.mangaId, original.title, [
              (item.metadata as Parameters<typeof isAllowed>[0]).alternative,
            ]),
          );
        }
      }
    } finally {
      probe.unregisterInterceptor();
    }
  });
  suite.test("getDiscoverSectionItems: What's New native load more", async () => {
    const first = await MangaSushi.getDiscoverSectionItems(SECTIONS[1]);
    const native = parseCatalog(home, "latest");
    expect(first.items.map((item) => ("mangaId" in item ? item.mangaId : ""))).to.deep.equal(
      native.items.map((item) => item.mangaId),
    );
    expect(first.metadata).not.to.equal(undefined);
    const second = await MangaSushi.getDiscoverSectionItems(SECTIONS[1], first.metadata);
    const expected = parseCatalog(await fetchNext(native.next!), "latest", false, native.next);
    expect(second.items.map((item) => ("mangaId" in item ? item.mangaId : ""))).to.deep.equal(
      expected.items.map((item) => item.mangaId),
    );
    expect(second.items).not.to.be.empty;
  });
  suite.test("catalog: editorial posts are not manga even with exclusions off", async () => {
    for (const id of EDITORIAL_IDS) {
      const result = await MangaSushi.getSearchResults({ title: id.replace(/-/g, " ") });
      expect(result.items.some((item) => item.mangaId === id)).to.equal(false);
      await rejects(() => MangaSushi.getMangaDetails(id), /site announcement/);
    }
  });
  suite.test("getMangaDetails: original title and alternatives", async () => {
    sample = await MangaSushi.getMangaDetails(SAMPLE);
    expect(sample.mangaId).to.equal(SAMPLE);
    expect(sample.mangaInfo.primaryTitle).to.equal("Welcome to the Cheap Restaurant of Outcasts!");
    expect(sample.mangaInfo.secondaryTitles).to.include("Tsuihousha Shokudou e Youkoso!");
    expect(sample.mangaInfo.synopsis).not.to.be.empty;
    expect(sample.mangaInfo.status).to.equal("OnGoing");
  });
  suite.test("getChapters: asynchronous full list and decimal labels", async () => {
    sampleChapters = await MangaSushi.getChapters(sample);
    expect(sampleChapters.length).to.be.greaterThan(60);
    for (const chapter of sampleChapters) {
      expect(chapter.sourceManga).to.equal(sample);
      expect(chapter.volume, "The source does not report a volume for these chapters").to.equal(0);
    }
    expect(new Set(sampleChapters.map((chapter) => chapter.chapterId)).size).to.equal(
      sampleChapters.length,
    );
    const chapter = sampleChapters.find((item) => item.chapterId === "chapter-66-1");
    expect(chapter?.chapNum).to.equal(66.1);
    expect(chapter?.title).to.equal("");
    // Exercise conservative boundaries alongside the real decimal-row flow.
    expect(chapterTitle("Chapter 66.1", chapter!.chapNum)).to.equal("");
    expect(chapterTitle("66.1", chapter!.chapNum)).to.equal("");
    expect(chapterTitle("Chapter 66.1", 66)).to.equal("Chapter 66.1");
    expect(chapterTitle("Chapter 66.1-66.2", chapter!.chapNum)).to.equal("Chapter 66.1-66.2");
    expect(chapterTitle("Chapter 66.1 to 66.2", chapter!.chapNum)).to.equal("Chapter 66.1 to 66.2");
    expect(chapterTitle("Chapter 66.1.5", chapter!.chapNum)).to.equal("Chapter 66.1.5");
    expect(chapterTitle("Special Chapter 66.1", chapter!.chapNum)).to.equal("Special Chapter 66.1");
    expect(chapter?.publishDate?.toISOString().slice(0, 10)).to.equal("2026-10-08");
    const probe = new DiscoveryProbe("MangaSushi.reported-volume-test");
    probe.gate = async (request, data) =>
      request.url.endsWith("/ajax/chapters/")
        ? (new TextEncoder().encode(
            Application.arrayBufferToUTF8String(data)
              .replace("Chapter 66.1", "Volume 2 Chapter 66.1")
              .replace("Chapter 65", "Chapter 65: A New Beginning")
              .replace("Chapter 64", "Ch. 64 – Extra")
              .replace("Chapter 63", "Special Chapter 63")
              .replace("Chapter 62", "Chapter 62-63")
              .replace("Chapter 61", "Special"),
          ).buffer as ArrayBuffer)
        : data;
    probe.registerInterceptor();
    try {
      // Change only labels in a fresh live response, keeping canonical URLs.
      // Subtitles, special labels and reported volumes use the public source path.
      const reported = await MangaSushi.getChapters(sample);
      expect(reported.find((item) => item.chapterId === "chapter-66-1")).to.include({
        volume: 2,
        chapNum: 66.1,
        title: "Volume 2 Chapter 66.1",
      });
      for (const [id, chapNum, title] of [
        ["chapter-65", 65, "A New Beginning"],
        ["chapter-64", 64, "Extra"],
        ["chapter-63", 63, "Special Chapter 63"],
        ["chapter-62", 62, "Chapter 62-63"],
        ["chapter-61", 0, "Special"],
      ] as const)
        expect(reported.find((item) => item.chapterId === id)).to.include({
          sourceManga: sample,
          volume: 0,
          chapNum,
          title,
        });
    } finally {
      probe.unregisterInterceptor();
    }
    for (const item of sampleChapters)
      expect(item.publishDate?.getTime()).to.be.a("number").and.not.to.be.NaN;
  });
  suite.test("getChapterDetails: exact ordered lazy pages", async () => {
    const result = await MangaSushi.getChapterDetails(
      sampleChapters.find((chapter) => chapter.chapterId === "chapter-66-1")!,
    );
    if (!("pages" in result)) throw new Error("Expected manga reader pages.");
    expect(result.id).to.equal("chapter-66-1");
    expect(result.mangaId).to.equal(SAMPLE);
    expect(result.pages).to.have.length(12);
    for (const [index, page] of result.pages.entries())
      expect(page).to.match(new RegExp(`/${String(index).padStart(2, "0")}\\.jpg$`));
    await checkReaderImages(result.pages);
    issuedReaderPages = result.pages;
  });
  suite.test("reader: duplicate pages and page-order gaps fail closed", async () => {
    const chapter = sampleChapters.find((item) => item.chapterId === "chapter-66-1")!;
    const html = await fetchText(seriesUrl(SAMPLE, chapter.chapterId));
    expect(() => parseReader(html.replace('id="image-1"', 'id="image-2"'), chapter)).to.throw(
      /page order/,
    );
    expect(() => parseReader(html.replace("/01.jpg", "/00.jpg"), chapter)).to.throw(
      /duplicate reader pages/,
    );
  });
  suite.test("getChapterDetails: second chapter pages", async () => {
    const chapter = sampleChapters.find((item) => item.chapterId !== "chapter-66-1")!;
    const result = await MangaSushi.getChapterDetails(chapter);
    if (!("pages" in result)) throw new Error("Expected manga reader pages.");
    expect(result.pages.length).to.be.greaterThan(1);
    expect(new Set(result.pages).size).to.equal(result.pages.length);
    for (const page of result.pages) expect(page).to.match(/^https:\/\/\S+$/);
  });
  suite.test("metadata: ambiguous cursor fields and mutable final identity fail closed", async () => {
    const schedule = Application.scheduleRequest;
    let requests = 0;
    Application.scheduleRequest = async () => {
      requests++;
      throw new Error("Unexpected native scheduler access.");
    };
    const vars = { post_type: "wp-manga", post_status: "publish", template: "search", s: "original" };
    const cursor = { page: 1, template: "madara-core/content/content-search", vars };
    try {
      for (const key of ["post_type", "post_status", "template", "s"]) {
        for (const value of [
          { ...vars, [`${key}][0`]: "collision" },
          { [`${key}][0`]: "collision", ...vars },
        ]) await rejects(() => fetchNext({ ...cursor, vars: value }), /Conflicting Mangasushi metadata/);
      }
      for (const key of ["post_type\u0000alias", "post_status\n", "template]tail"]) {
        await rejects(() => fetchNext({ ...cursor, vars: { ...vars, [key]: "invalid" } }), /metadata/);
      }
      expect(requests).to.equal(0);
      Application.scheduleRequest = async (request) => {
        request.url = `${BASE_URL}/manga/different-title/`;
        return [
          { url: request.url, status: 200, headers: { "content-type": "text/html" }, cookies: [] },
          encodeHTML("<html></html>"),
        ];
      };
      await rejects(() => fetchText(`${BASE_URL}/`), /metadata request is no longer pending/);
    } finally { Application.scheduleRequest = schedule; }
  });
  suite.test("metadata: pending cloned requests and HTML response boundary", async () => {
    const guard = new MangaSushiInterceptor("MangaSushi.metadata-proof-guard");
    class MetadataProbe extends DiscoveryProbe {
      override async interceptRequest(request: Request): Promise<Request> {
        const clone = JSON.parse(JSON.stringify(request)) as Request;
        clone.headers = Object.fromEntries(
          Object.entries(clone.headers ?? {}).map(([key, value]) => [key.toUpperCase(), value]),
        );
        await guard.interceptRequest(clone);
        clone.headers = Object.fromEntries(
          Object.entries(clone.headers ?? {}).map(([key, value]) => [key.toUpperCase(), value]),
        );
        const returned = await guard.interceptRequest(clone);
        for (const key of ["referer", "origin", "user-agent"])
          expect(Object.keys(returned.headers ?? {}).filter((name) => name.toLowerCase() === key)).to.have.length(1);
        await rejects(
          () => guard.interceptRequest({ url: `${BASE_URL}/wp-content/uploads/unissued.jpg`, method: "GET" }),
          /image|authorization/i,
        );
        return super.interceptRequest(returned);
      }
      override async interceptResponse(request: Request, response: Response, data: ArrayBuffer): Promise<ArrayBuffer> {
        await guard.interceptResponse(request, response, data);
        await rejects(
          () => guard.interceptResponse(request, { ...response, url: `${BASE_URL}/wp-content/uploads/unissued.jpg` }, data),
          /metadata/i,
        );
        await rejects(
          () => guard.interceptResponse(request, response, encodeHTML("<svg></svg>")),
          /metadata/i,
        );
        return super.interceptResponse(request, response, data);
      }
    }
    const probe = new MetadataProbe("MangaSushi.metadata-proof");
    probe.registerInterceptor();
    try {
      await fetchText(`${BASE_URL}/`);
      expect(probe.requests).to.have.length(1);
      expect(probe.responses).to.have.length(1);
      await rejects(() => guard.interceptRequest(probe.requests[0]), /image|authorization/i);
    } finally { probe.unregisterInterceptor(); }
  });
  suite.test("images: native issued URLs persist, reject mutation and expire without network requests", async () => {
    const interceptor = new MangaSushiInterceptor("MangaSushi.image-proof");
    const images = [sample.mangaInfo.thumbnailUrl, issuedReaderPages[0]];
    const state = Application.getState("MangaSushi.issuedImages");
    const probe = new DiscoveryProbe("MangaSushi.image-proof-observer");
    probe.registerInterceptor();
    try {
      for (const url of images)
        expect((await interceptor.interceptRequest({ url, method: "GET" })).url).to.equal(url);
      for (const url of [
        `${images[1]}?unissued=1`,
        "https://mangasushi.org/wp-content/uploads/unissued.jpg",
        "https://example.invalid/unissued.jpg",
        seriesUrl(SAMPLE),
      ]) await rejects(() => interceptor.interceptRequest({ url, method: "GET" }), /image|authorization/i);
      const expired = JSON.parse(state as string) as [string, { at: number; expires: number }][];
      for (const [, grant] of expired) { grant.at -= 24 * 60 * 60 * 1000 + 1; grant.expires -= 24 * 60 * 60 * 1000 + 1; }
      Application.setState(JSON.stringify(expired), "MangaSushi.issuedImages");
      await rejects(() => interceptor.interceptRequest({ url: images[1], method: "GET" }), /expired|authorization/i);
      expect(probe.requests).to.have.length(0);
    } finally {
      Application.setState(state, "MangaSushi.issuedImages");
      probe.unregisterInterceptor();
    }
    const previous = preferences().excludeNSFW;
    try {
      await settings.setExcludeNSFW(!previous);
      for (const url of images) await rejects(() => interceptor.interceptRequest({ url, method: "GET" }), /settings|authorization/i);
    } finally { await settings.setExcludeNSFW(previous); }
  });
  suite.test("settings: stale library and cached metadata cannot bypass exclusion", async () => {
    await settings.setExcludeNSFW(false);
    const query = { title: "Logout shita no wa VRMMO" };
    const knownBlocked = parseCatalog(
      await fetchText(searchUrl(query, false)),
      "search",
    ).items.find((item) => item.metadata.genres.some((genre) => genre.id === "mature"));
    expect(
      knownBlocked,
      "Need an actual live Mature-tagged source title, not the app's conservative badge",
    ).not.to.equal(undefined);
    const permitted = await MangaSushi.getMangaDetails(knownBlocked!.mangaId);
    expect(permitted.mangaInfo.tagGroups?.[0].tags.some((tag) => tag.id === "mature")).to.equal(
      true,
    );
    await settings.setExcludeNSFW(true);
    expect(
      (await MangaSushi.getSearchResults(query)).items.some(
        (item) => item.mangaId === knownBlocked!.mangaId,
      ),
    ).to.equal(false);
    await rejects(
      () => MangaSushi.getMangaDetails(permitted.mangaId),
      /hidden by NSFW exclusion|lacks reliable/,
    );
    await rejects(
      () => MangaSushi.getChapters(permitted),
      /hidden by NSFW exclusion|lacks reliable/,
    );
    await rejects(
      () => MangaSushi.getMangaDetails(SAMPLE),
      /hidden by NSFW exclusion|lacks reliable/,
    );
    await rejects(() => MangaSushi.getChapters(sample), /hidden by NSFW exclusion|lacks reliable/);
    await rejects(
      () => MangaSushi.getChapterDetails(sampleChapters[0]),
      /hidden by NSFW exclusion|lacks reliable/,
    );
  });
  suite.test("settings: pending permissive response cannot survive exclusion switch", async () => {
    await settings.setExcludeNSFW(false);
    const pending = MangaSushi.getMangaDetails(SAMPLE);
    await settings.setExcludeNSFW(true);
    await rejects(() => pending, /settings changed/);
    await rejects(
      () => MangaSushi.getMangaDetails(SAMPLE),
      /hidden by NSFW exclusion|lacks reliable/,
    );
  });
  suite.test("getSearchResults: all-filtered native pages reach real end", async () => {
    const result = await MangaSushi.getSearchResults({
      title: "",
      metadata: { genres: ["ecchi"] },
    });
    expect(result.items).to.deep.equal([]);
    expect(result.metadata).to.equal(undefined);
  });
  suite.test("catalog: malformed response fails closed", async () => {
    expect(() =>
      parseCatalog("<html><title>Unexpected response</title></html>", "search", true),
    ).to.throw();
  });
  // Epoch migration is destructive: keep it last, after ordinary reader/cache checks.
  suite.test("images: native state roundtrip preserves evidence and retires legacy grants", async () => {
    const keys = ["MangaSushi.imageEvidence", "MangaSushi.imageEvidenceGeneration", "MangaSushi.issuedImages"];
    const original = keys.map((key) => Application.getState(key));
    const savedPreferences = Application.getState("MangaSushi.preferences");
    const schedule = Application.scheduleRequest;
    const captured = safeSearchResponse;
    if (!captured) throw new Error("Missing the source response consumed by native search.");
    let requests = 0;
    Application.scheduleRequest = async (request) => {
      expect(request.url).to.equal(captured.request.url);
      expect(request.method).to.equal(captured.request.method);
      requests++;
      return [captured.response, encodeHTML(captured.html)];
    };
    try {
      const cold = new (MangaSushi.constructor as new () => typeof MangaSushi)();
      await cold.initialise();
      const first = await cold.getSearchResults({ title: "" });
      expect(first.items).not.to.be.empty;
      const image = first.items[0].imageUrl;
      const guard = new MangaSushiInterceptor("MangaSushi.state-roundtrip");
      const stored = keys.map((key) => Application.getState(key));
      // Roundtrip source-emitted state, not a preseeded first-install ledger.
      // A 0/1 bridge is a compatibility model, not a proven physical-app cause.
      const nativeRoundtrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value),
        (_key, item: unknown) => item === 0 ? false : item === 1 ? true : item) as unknown;
      for (const [index, key] of keys.entries()) Application.setState(nativeRoundtrip(stored[index]), key);
      const reloaded = new (MangaSushi.constructor as new () => typeof MangaSushi)();
      await reloaded.getSearchResults({ title: "" });
      expect((await guard.interceptRequest({ url: image, method: "GET" })).url).to.equal(image);
      for (const key of keys) expect(Application.getState(key)).to.be.a("string");
      const ledger = JSON.parse(Application.getState(keys[0]) as string) as { generation: string; sequence: number; discardedThrough: number; titles: unknown[] };
      // Malformed current JSON cannot silently reset authority.
      try {
        Application.setState(JSON.stringify({ ...ledger, sequence: true }), keys[0]);
        await rejects(() => guard.interceptRequest({ url: image, method: "GET" }), /sequence=boolean/);
      } finally { Application.setState(JSON.stringify(ledger), keys[0]); }
      // Retire recognizable numeric-schema state, including ambiguous counters.
      for (const key of keys) {
        const legacy: unknown = JSON.parse(Application.getState(key) as string,
          (_key, value: unknown) => typeof value === "string" && /^json-v1:\d+$/.test(value)
            ? Number(value.slice(8)) : value);
        Application.setState(nativeRoundtrip(legacy), key);
      }
      await rejects(() => guard.interceptRequest({ url: image, method: "GET" }), /authorization/);
      const fresh = await reloaded.getSearchResults({ title: "" });
      expect(fresh.items).not.to.be.empty;
      expect(fresh.items.every((item) => isAllowed(item.metadata))).to.equal(true);
      expect(JSON.parse(Application.getState(keys[0]) as string).generation).not.to.equal(ledger.generation);
      const grants = JSON.parse(Application.getState(keys[2]) as string) as [string, { chapters: string[] }][];
      expect(grants.every(([, grant]) => grant.chapters.length === 1 && grant.chapters[0] === "")).to.equal(true);
      expect((await guard.interceptRequest({ url: fresh.items[0].imageUrl, method: "GET" })).url).to.equal(fresh.items[0].imageUrl);
      expect(Application.getState("MangaSushi.preferences")).to.deep.equal(savedPreferences);
      expect(requests).to.equal(3);
    } finally {
      Application.scheduleRequest = schedule;
      for (const [index, key] of keys.entries()) Application.setState(original[index], key);
    }
  });
  try {
    await suite.run();
  } finally {
    Application.setState(saved, "MangaSushi.preferences");
  }
}
