/* eslint-disable no-unused-expressions */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  PaperbackInterceptor,
  type Chapter,
  type Request,
  type Response,
  type SourceManga,
  type TestLogger,
} from "@paperback/types";
import { expect } from "chai";
import { MangaSushi } from "../MangaSushi/main.js";
import { MangaSushiSearchForm, MangaSushiSettingsForm, preferences } from "../MangaSushi/forms.js";
import {
  BASE_URL,
  BLOCKED_GENRES,
  EDITORIAL_IDS,
  SECTIONS,
  SORTS,
  STATUSES,
} from "../MangaSushi/models.js";
import { fetchNext, fetchText, searchUrl } from "../MangaSushi/network.js";
import {
  isAllowed,
  parseCatalog,
  parseGenreOptions,
  parseReader,
  seriesUrl,
} from "../MangaSushi/parsers.js";
import { TestSuite } from "./suite.js";

// Observe the real host requests and optionally hold a live response in flight.
// No saved HTML, alternate parser, or replacement source implementation is used.
class DiscoveryProbe extends PaperbackInterceptor {
  readonly requests: Request[] = [];
  gate?: (request: Request, data: ArrayBuffer) => Promise<ArrayBuffer>;
  override async interceptRequest(request: Request): Promise<Request> {
    if (request.url.startsWith(`${BASE_URL}/`)) this.requests.push(request);
    return request;
  }
  override async interceptResponse(
    request: Request,
    _response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    return this.gate ? this.gate(request, data) : data;
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
  let sample: SourceManga;
  let sampleChapters: Chapter[];
  let sourceSearch: ReturnType<typeof parseCatalog>;
  let home = "";
  const settings = new MangaSushiSettingsForm();
  suite.test("initialisation", async () => {
    Application.setState(undefined, "MangaSushi.preferences");
    await MangaSushi.initialise();
    expect(preferences().excludeNSFW).to.equal(true);
  });
  suite.test("getDiscoverSections: native section order", async () => {
    expect((await MangaSushi.getDiscoverSections()).map((section) => section.title)).to.deep.equal([
      "Popular Series",
      "What's New",
    ]);
  });
  suite.test("getSortingOptions: all seven site sorts", async () => {
    expect(await MangaSushi.getSortingOptions()).to.deep.equal(SORTS);
    const html = await fetchText(searchUrl({ title: "" }, true));
    for (const sort of SORTS.filter((item) => item.id))
      expect(html).to.include(`m_orderby=${sort.id}`);
    sourceSearch = parseCatalog(html, "search", true);
  });
  suite.test("getSearchResults: native adult filter plus genre safety", async () => {
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
    safeSource = await MangaSushi.getMangaDetails(result.items[0].mangaId);
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
  });
  suite.test("getMangaDetails: unknown classification is blocked by default", async () => {
    await rejects(
      () => MangaSushi.getMangaDetails(SAMPLE),
      /hidden by NSFW exclusion|lacks reliable/,
    );
  });
  suite.test("getChapters and reader: accessible with default exclusion", async () => {
    const chapters = await MangaSushi.getChapters(safeSource);
    expect(chapters.length).to.be.greaterThan(0);
    for (const chapter of chapters) expect(chapter.sourceManga).to.equal(safeSource);
    const reader = await MangaSushi.getChapterDetails(chapters[0]);
    if (!("pages" in reader)) throw new Error("Expected manga reader pages.");
    expect(reader.pages.length).to.be.greaterThan(1);
    await checkReaderImages(reader.pages);
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
    for (const number of [143, 127]) {
      const chapter = chapters.find((item) => item.chapterId === `chapter-${number}_1`);
      expect(chapter, `Canonical chapter-${number}_1 must not be omitted`).not.to.equal(undefined);
      expect(chapter!.chapNum).to.equal(number);
      const reader = await MangaSushi.getChapterDetails(chapter!);
      if (!("pages" in reader)) throw new Error("Expected manga reader pages.");
      expect(reader.id).to.equal(chapter!.chapterId);
      expect(reader.mangaId).to.equal(source.mangaId);
      expect(reader.pages.length).to.be.greaterThan(1);
      await checkReaderImages(reader.pages);
    }
  });
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
        if (typeof batch?.body !== "string")
          throw new Error("Expected an encoded metadata batch body.");
        const body = requestParameters(batch.body);
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
        for (const [index, section] of SECTIONS.entries()) {
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
          for (const item of result.items)
            expect(isAllowed(item.metadata as Parameters<typeof isAllowed>[0])).to.equal(true);
          if (section.id === "popular") expect(result.metadata).to.equal(undefined);
        }
      } finally {
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
    const result = await MangaSushi.getDiscoverSectionItems(SECTIONS[0]);
    expect(result.items.map((item) => ("mangaId" in item ? item.mangaId : ""))).to.deep.equal(
      native.items.map((item) => item.mangaId),
    );
    expect(result.metadata).to.equal(undefined);
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
    for (const chapter of sampleChapters) expect(chapter.sourceManga).to.equal(sample);
    expect(new Set(sampleChapters.map((chapter) => chapter.chapterId)).size).to.equal(
      sampleChapters.length,
    );
    const chapter = sampleChapters.find((item) => item.chapterId === "chapter-66-1");
    expect(chapter?.chapNum).to.equal(66.1);
    expect(chapter?.title).to.equal("Chapter 66.1");
    expect(chapter?.publishDate?.toISOString().slice(0, 10)).to.equal("2026-10-08");
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
  suite.test("settings: stale library and cached metadata cannot bypass exclusion", async () => {
    await settings.setExcludeNSFW(true);
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
  try {
    await suite.run();
  } finally {
    Application.setState(saved, "MangaSushi.preferences");
  }
}
