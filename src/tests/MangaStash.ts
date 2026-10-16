/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
/* eslint-disable no-unused-expressions */
import {
  ContentRating,
  PaperbackInterceptor,
  type Chapter,
  type Metadata,
  type Request,
  type Response,
  type SourceManga,
  type TestLogger,
} from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { MangaStash, MangaStashExtension } from "../MangaStash/main.js";
import info from "../MangaStash/pbconfig.js";
import {
  MangaStashSearchForm,
  MangaStashSettingsForm,
  preferences,
  PREFERENCES,
  NATIVE_POLICY,
  nativeAllowed,
} from "../MangaStash/forms.js";
import { BASE_URL, CONTROLS, SECTIONS, SORTS, nativeRating } from "../MangaStash/models.js";
import {
  IMAGE_LIFETIME,
  IMAGE_STORE,
  OBSERVATIONS,
  authorizeImage,
  issueImages,
  observe,
} from "../MangaStash/images.js";
import { MangaStashInterceptor } from "../MangaStash/network.js";
import {
  parseCatalog,
  parseDetails,
  parseHome,
  distinctHomeSections,
  parseReader,
  ratingFromLabels,
} from "../MangaStash/parsers.js";
import {
  chapterURL,
  imageURL,
  queryScope,
  readFilters,
  searchURL,
  seriesURL,
} from "../MangaStash/urls.js";
import { TestSuite } from "./suite.js";
class Probe extends PaperbackInterceptor {
  requests: Request[] = [];
  responses = new Map<string, string>();
  gate?: (request: Request, data: ArrayBuffer) => Promise<ArrayBuffer>;
  override async interceptRequest(request: Request) {
    this.requests.push(request);
    return request;
  }
  override async interceptResponse(request: Request, response: Response, data: ArrayBuffer) {
    const result = this.gate ? await this.gate(request, data) : data;
    if (response.headers["content-type"]?.includes("text/html"))
      this.responses.set(request.url, Application.arrayBufferToUTF8String(result));
    return result;
  }
}
const rejects = async (fn: () => Promise<unknown>, pattern: RegExp) => {
  let error: unknown;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  expect(String(error)).to.match(pattern);
};
export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaStash tests", logger),
    settings = new MangaStashSettingsForm(),
    probe = new Probe("MangaStash.tests");
  const saved = Application.getState(PREFERENCES),
    savedImages = Application.getState(IMAGE_STORE),
    savedEvidence = Application.getState(OBSERVATIONS),
    savedNativePolicy = Application.getState(NATIVE_POLICY);
  let manga: SourceManga,
    chapters: Chapter[] = [],
    chapter: Chapter,
    pages: string[] = [],
    home = "",
    detail = "",
    reader = "";
  let cursor: Metadata | undefined, catalogChapterCover: string | undefined;
  const browseQuery = {
    title: "",
    metadata: { genre: ["action"], language: ["EN"], rating: "safe" },
  };
  suite.test("initialisation: official host and explicit compatibility default", async () => {
    Application.setState({ onlySafe: false, revision: 1 }, PREFERENCES);
    Application.setState([], IMAGE_STORE);
    Application.setState([], OBSERVATIONS);
    await MangaStash.initialise();
    probe.registerInterceptor();
    expect(typeof URL).to.equal("undefined");
    expect(typeof Headers).to.equal("undefined");
    expect(typeof URLSearchParams).to.equal("undefined");
    expect(preferences().onlySafe).to.equal(false);
    expect(info.version).to.equal("0.0.1-alpha.2");
    expect((await MangaStash.getSettingsForm()).getSections()).not.to.be.empty;
  });
  suite.test("home: exact same-response complete sequences and legitimate overlap", async () => {
    expect(await MangaStash.getDiscoverSections()).to.deep.equal(SECTIONS);
    const results = [];
    for (const section of SECTIONS) results.push(await MangaStash.getDiscoverSectionItems(section));
    home = probe.responses.get(BASE_URL + "/")!;
    const parsed = parseHome(home),
      $ = cheerio.load(home);
    for (const [index, section] of SECTIONS.entries()) {
      const root = $("section.home-section").filter(
        (_, e) => $(e).find("h2.section-title").text().trim() === section.title,
      );
      const raw = root
        .find(section.id === "latest" ? ".update-title" : ".series-scroll > a.series-card")
        .toArray()
        .map((e) => ($(e).attr("href") ?? "").replace(/^\/|\/$/g, ""));
      expect(results[index].items.map((i) => ("mangaId" in i ? i.mangaId : ""))).to.deep.equal(raw);
      expect(parsed[section.id].map((i) => i.mangaId)).to.deep.equal(raw);
      expect(
        results[index].items.map((i) => ("contentRating" in i ? i.contentRating : undefined)),
      ).to.deep.equal(parsed[section.id].map((i) => nativeRating(i.sourceRating)));
    }
    expect(probe.requests.filter((r) => r.url === BASE_URL + "/").length).to.equal(1);
    const changed = cheerio.load(home),
      roots = changed("section.home-section");
    const popular = roots.filter(
      (_, e) => changed(e).find("h2").text().trim() === "Popular This Month",
    );
    roots
      .filter((_, e) => changed(e).find("h2").text().trim() === "New Additions")
      .find(".series-scroll")
      .html(popular.find(".series-scroll").html()!);
    const duplicates = parseHome(changed.html());
    expect(duplicates.new.map((i) => i.mangaId)).to.deep.equal(
      duplicates.popular.map((i) => i.mangaId),
    );
    expect(distinctHomeSections(duplicates).map((s) => s.id)).to.deep.equal(["popular", "latest"]);
  });
  suite.test("search: q-only native results preserve explicit Safe", async () => {
    const result = await MangaStash.getSearchResults({ title: "Ayashimon" });
    expect(result.items.some((i) => i.mangaId === "ayashimon")).to.equal(true);
    expect(result.items.find((i) => i.mangaId === "ayashimon")?.contentRating).to.equal(
      ContentRating.EVERYONE,
    );
    expect(await MangaStash.getSortingOptions({ title: "Ayashimon" })).to.deep.equal([]);
    expect(await MangaStash.getSortingOptions({ title: "" })).to.deep.equal(SORTS);
  });
  suite.test(
    "catalog: exact advertised covers retain ownership and issued URL provenance",
    async () => {
      const url = searchURL(""),
        result = await MangaStash.getSearchResults({ title: "" }),
        html = probe.responses.get(url)!,
        $ = cheerio.load(html),
        rows = $(".series-grid > a.series-card").toArray(),
        advertised = rows.map((e) => {
          const row = $(e),
            image = row.find("img").first(),
            set = image.attr("srcset") || image.attr("data-srcset"),
            selected = set
              ? set
                  .split(",")
                  .map((v) => v.trim().split(/\s+/))
                  .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))[0][0]
              : image.attr("data-src") || image.attr("src")!;
          return {
            id: row.attr("href")!.replace(/^\/|\/$/g, ""),
            image: selected.startsWith("/") ? BASE_URL + selected : selected,
          };
        });
      expect(result.items.map((i) => ({ id: i.mangaId, image: i.imageUrl }))).to.deep.equal(
        advertised,
      );
      catalogChapterCover = result.items.find((i) =>
        /\/content\/[^/]+\/chapter-\d+(?:\.\d+)?\//.test(i.imageUrl),
      )?.imageUrl;
      const interceptor = new MangaStashInterceptor("MangaStash.catalog-cover-check"),
        before = probe.requests.length;
      for (const item of result.items)
        expect(
          (await interceptor.interceptRequest({ url: item.imageUrl, method: "GET" })).url,
        ).to.equal(item.imageUrl);
      expect(probe.requests.length).to.equal(before);
      const first = advertised[0];
      for (const bad of [
        `${BASE_URL}/content/${first.id}-foreign/chapter-1/001.webp`,
        `${BASE_URL}/content/${first.id.toUpperCase()}/chapter-1/001.webp`,
        `${BASE_URL}/content/${first.id}/chapter-1/../001.webp`,
        `${BASE_URL}/content/${first.id}/chapter-1/%2e%2e/001.webp`,
        `${BASE_URL}/content/${first.id}/chapter-1%2f001.webp`,
        `${BASE_URL}/content/${first.id}/chapter-1/%30%30%31.webp`,
        `${BASE_URL}/content/${first.id}/chapter-1/001.webp?extra=1`,
        `${BASE_URL}/content/${first.id}/chapter-1/001.webp/extra`,
        `${BASE_URL}/content/${first.id}/chapter-other/001.webp`,
        `${BASE_URL}/content/${first.id}/chapter-1/001.svg`,
        `https://mangastash.org.evil.example/content/${first.id}/chapter-1/001.webp`,
      ]) {
        const changed = cheerio.load(html),
          image = changed(".series-grid > a.series-card").first().find("img").first();
        image
          .removeAttr("srcset")
          .removeAttr("data-srcset")
          .removeAttr("data-src")
          .attr("src", bad);
        expect(() => parseCatalog(changed.html(), url)).to.throw(/MangaStash/);
        await rejects(
          () => interceptor.interceptRequest({ url: bad, method: "GET" }),
          /authorization|Invalid|Wrong/,
        );
      }
      await rejects(
        () =>
          interceptor.interceptRequest({
            url: `${BASE_URL}/content/${first.id}/chapter-1/unissued.webp`,
            method: "GET",
          }),
        /authorization/,
      );
      expect(probe.requests.length).to.equal(before);
    },
  );
  suite.test("browse: exact declared controls and preserved real page-two scope", async () => {
    const first = await MangaStash.getSearchResults(browseQuery, undefined, SORTS[3]);
    expect(first.items).not.to.be.empty;
    expect(
      first.items.every(
        (i) => i.sourceRating === "unknown" && i.contentRating === ContentRating.MATURE,
      ),
    ).to.equal(true);
    cursor = first.metadata;
    expect(cursor).not.to.equal(undefined);
    const second = await MangaStash.getSearchResults(browseQuery, cursor, SORTS[3]);
    expect(second.items).not.to.be.empty;
    expect(second.items.some((i) => first.items.some((j) => j.mangaId === i.mangaId))).to.equal(
      false,
    );
    const firstURL = searchURL("", browseQuery.metadata, "title"),
      next = (cursor as { next: string }).next;
    expect(queryScope(next)).to.equal(queryScope(firstURL));
    expect(
      parseCatalog(probe.responses.get(next)!, next).items.map((i) => i.mangaId),
    ).to.deep.equal(second.items.map((i) => i.mangaId));
    const html = probe.responses.get(firstURL)!,
      mutated = cheerio.load(html);
    mutated('input[name="genre[]"][value="action"]').removeAttr("checked");
    expect(() => parseCatalog(mutated.html(), firstURL)).to.throw(/preserve selected/);
    const nextScope = cheerio.load(html);
    nextScope("nav.pagination a.page-next").attr("href", "/browse/?page=2");
    expect(() => parseCatalog(nextScope.html(), firstURL)).to.throw(/scope/);
    const form = new MangaStashSearchForm(browseQuery);
    expect(form.getSections()).not.to.be.empty;
    expect(form.getSearchQueryMetadata()).to.deep.equal(readFilters(browseQuery.metadata));
    logger.log(
      "controls",
      CONTROLS.map((c) => ({ id: c.id, values: c.items.map((i) => i.id) })),
    );
  });
  suite.test(
    "invalid filters, text/filter combinations, sort and stale cursors fail before HTTP",
    async () => {
      const before = probe.requests.length;
      for (const value of [
        null,
        [],
        { unknown: ["x"] },
        { genre: "action" },
        { genre: ["action", "action"] },
        { genre: ["obsolete"] },
        { rating: ["safe"] },
        { rating: null },
        { language: ["en"] },
      ]) {
        await rejects(
          () => MangaStash.getSearchResults({ title: "", metadata: value as Metadata }),
          /Invalid|Unknown/,
        );
        await rejects(
          () => MangaStash.getAdvancedSearchForm({ title: "", metadata: value as Metadata }),
          /Invalid|Unknown/,
        );
      }
      await rejects(
        () => MangaStash.getSearchResults({ title: "Ayashimon", metadata: { genre: ["action"] } }),
        /supports only q/,
      );
      await rejects(
        () => MangaStash.getSearchResults({ title: "Ayashimon" }, undefined, SORTS[0]),
        /supports only q/,
      );
      await rejects(
        () =>
          MangaStash.getSearchResults({ title: "" }, undefined, { id: "obsolete", label: "bad" }),
        /Unknown/,
      );
      await rejects(() => MangaStash.getSearchResults({ title: "" }, cursor), /stale/);
      for (const c of [
        { ...(cursor as object), next: BASE_URL + "/browse/?genre[]=comedy&page=2" },
        { ...(cursor as object), seen: ["../bad"] },
        { ...(cursor as object), page: 2.5 },
      ])
        await rejects(() => MangaStash.getSearchResults(browseQuery, c, SORTS[3]), /Invalid|scope/);
      expect(probe.requests.length).to.equal(before);
    },
  );
  suite.test("details and complete native chapter inventory reuse one response", async () => {
    manga = await MangaStash.getMangaDetails("ayashimon");
    detail = probe.responses.get(seriesURL(manga.mangaId))!;
    const before = probe.requests.length;
    const persisted = JSON.parse(JSON.stringify(manga)) as SourceManga;
    chapters = await MangaStash.getChapters(persisted);
    expect(probe.requests.length).to.equal(before);
    const expected = parseDetails(detail, "ayashimon"),
      $ = cheerio.load(detail),
      rawRows = $("#chapter-list > a.chapter-row").toArray(),
      rawIds = rawRows.map((e) => $(e).attr("href")!.replace(/^\//, "")),
      declared = $("#chapters .cl-toolbar h2")
        .text()
        .trim()
        .match(/^Chapters \((\d+)\)$/),
      publicRows = expected.chapters.filter((c) => c.additionalInfo?.locked !== "true");
    expect(declared).not.to.equal(null);
    expect(rawRows.length).to.equal(Number(declared![1]));
    expect(expected.chapters.map((c) => c.chapterId)).to.deep.equal(rawIds);
    expect(chapters.map((c) => c.chapterId)).to.deep.equal(publicRows.map((c) => c.chapterId));
    expect(chapters.every((c, i) => c.sourceManga === persisted && c.sortingIndex === i)).to.equal(
      true,
    );
    for (const c of chapters) {
      const row = rawRows.find((e) => $(e).attr("href") === "/" + c.chapterId)!;
      const date = $(row).find("time[datetime]").attr("datetime");
      expect(c.publishDate?.getTime()).to.equal(date ? Date.parse(date) : undefined);
    }
    expect(manga.mangaInfo.contentRating).to.equal(ContentRating.EVERYONE);
    expect(manga.mangaInfo.thumbnailUrl).to.equal(BASE_URL + "/content/covers/ayashimon.jpg");
    expect(manga.mangaInfo.status).to.equal("Ongoing");
    expect(manga.mangaInfo.author).to.equal("Kaku Yuuji");
    chapter = chapters.find((c) => c.chapterId === "ayashimon/chapter-25.6")!;
    expect(chapter.chapNum).to.equal(25.6);
    expect(chapter.title).to.equal(undefined);
  });
  suite.test(
    "public inventory omits locked rows but rejects a persisted locked identity before reader HTTP",
    async () => {
      const source = new MangaStashExtension(),
        before = probe.requests.length;
      let expectedPublic: ReturnType<typeof parseDetails>["chapters"] = [];
      probe.gate = async (request, data) => {
        if (request.url !== seriesURL("ayashimon")) return data;
        const original = Application.arrayBufferToUTF8String(data),
          baseline = parseDetails(original, "ayashimon"),
          altered = cheerio.load(original),
          target = altered(`#chapter-list a[href="/${chapter.chapterId}"]`);
        expect(target.length).to.equal(1);
        target.attr("data-locked", "true");
        const changed = parseDetails(altered.html(), "ayashimon");
        expect(changed.chapters.length).to.equal(baseline.chapters.length);
        expect(changed.chapters.map((c) => c.chapterId)).to.deep.equal(
          baseline.chapters.map((c) => c.chapterId),
        );
        expectedPublic = changed.chapters.filter((c) => c.additionalInfo?.locked !== "true");
        return new TextEncoder().encode(altered.html()).buffer as ArrayBuffer;
      };
      try {
        const readable = await source.getChapters(manga);
        expect(readable.map((c) => [c.chapterId, c.publishDate?.getTime()])).to.deep.equal(
          expectedPublic.map((c) => [c.chapterId, c.publishDate?.getTime()]),
        );
        expect(readable.some((c) => c.chapterId === chapter.chapterId)).to.equal(false);
        expect(readable.every((c, i) => c.sourceManga === manga && c.sortingIndex === i)).to.equal(
          true,
        );
        const afterInventory = probe.requests.length;
        await rejects(
          () => source.getChapterDetails({ ...chapter, additionalInfo: { locked: "false" } }),
          /requires website access/,
        );
        expect(probe.requests.length).to.equal(afterInventory);
        expect(afterInventory - before).to.equal(1);
      } finally {
        probe.gate = undefined;
      }
    },
  );
  suite.test(
    "reader: actual persisted native identity and ordered advertised credit pages",
    async () => {
      const persisted = JSON.parse(JSON.stringify(chapter)) as Chapter,
        result = await MangaStash.getChapterDetails(persisted);
      expect(result.id).to.equal(chapter.chapterId);
      expect(result.mangaId).to.equal("ayashimon");
      if (!("pages" in result)) throw new Error("Expected comic pages");
      pages = result.pages;
      reader = probe.responses.get(chapterURL(chapter.chapterId, "ayashimon"))!;
      const $ = cheerio.load(reader),
        rows = $("#reader-pages > .reader-page").toArray(),
        advertised = rows.map((e, i) => {
          expect($(e).attr("data-page")).to.equal(String(i + 1));
          const image = $(e).find(".reader-page-inner > img");
          expect(image.length).to.equal(1);
          const url = image.attr("data-src") || image.attr("src")!;
          return url.startsWith("/") ? BASE_URL + url : url;
        }),
        config = $("script:not([src])")
          .toArray()
          .map((e) => $(e).text())
          .find((text) => /\bconst readerConfig\s*=/.test(text))!,
        total = config.match(/^\s*totalPages:\s*(\d+),\s*$/m);
      expect(total).not.to.equal(null);
      expect(rows.length).to.equal(Number(total![1]));
      expect(pages).to.deep.equal(advertised);
      logger.log("readerURLs", pages);
    },
  );
  suite.test(
    "images: complete original cover and first/middle/last transport with exact persisted grants",
    async () => {
      const bytes = [],
        urls = new Set([
          manga.mangaInfo.thumbnailUrl,
          pages[0],
          pages[Math.floor(pages.length / 2)],
          pages[pages.length - 1],
        ]);
      for (const url of urls) {
        const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
        expect(response.status).to.equal(200);
        expect(response.headers["content-type"]).to.match(/^image\/jpe?g(?:;|$)/i);
        expect(data.byteLength).to.be.greaterThan(1000);
        const body = new Uint8Array(data);
        expect(Array.from(body.subarray(0, 2))).to.deep.equal([0xff, 0xd8]);
        expect(Array.from(body.subarray(body.length - 2))).to.deep.equal([0xff, 0xd9]);
        bytes.push({ url, bytes: data.byteLength });
      }
      if (catalogChapterCover && !urls.has(catalogChapterCover)) {
        const [response, data] = await Application.scheduleRequest({
          url: catalogChapterCover,
          method: "GET",
        });
        expect(response.status).to.equal(200);
        expect(data.byteLength).to.be.greaterThan(1000);
        const type = response.headers["content-type"],
          body = new Uint8Array(data);
        if (/^image\/webp(?:;|$)/i.test(type)) {
          expect(Array.from(body.subarray(0, 4))).to.deep.equal([82, 73, 70, 70]);
          expect(Array.from(body.subarray(8, 12))).to.deep.equal([87, 69, 66, 80]);
          expect(new DataView(data).getUint32(4, true) + 8).to.equal(data.byteLength);
        } else {
          expect(type).to.match(/^image\/jpe?g(?:;|$)/i);
          expect(Array.from(body.subarray(0, 2))).to.deep.equal([0xff, 0xd8]);
          expect(Array.from(body.subarray(body.length - 2))).to.deep.equal([0xff, 0xd9]);
        }
        logger.log("advertisedChapterCoverBytes", {
          url: catalogChapterCover,
          bytes: data.byteLength,
          type,
        });
      } else
        logger.log(
          "advertisedChapterCoverBytes",
          "Unexercised: no additional chapter-page cover advertised in this catalog response.",
        );
      logger.log("sampledImageBytes", bytes);
      const before = probe.requests.length,
        interceptor = new MangaStashInterceptor("MangaStash.image-callback-check");
      expect((await interceptor.interceptRequest({ url: pages[0], method: "GET" })).url).to.equal(
        pages[0],
      );
      expect(probe.requests.length).to.equal(before);
      for (const url of [
        pages[0] + "?other=1",
        pages[0].replace(/[^/]+$/, "unissued.jpg"),
        pages[0].replace("mangastash.org", "evil.example"),
        BASE_URL + "/content/covers/unissued.jpg",
        BASE_URL + "/assets/unissued.jpg",
        BASE_URL + "/unissued.jpg",
        BASE_URL + "/",
      ]) {
        await rejects(
          () => interceptor.interceptRequest({ url, method: "GET" }),
          /authorization|Invalid|Wrong/,
        );
      }
      const stored = Application.getState(IMAGE_STORE) as { at: number }[];
      const evidence = Application.getState(OBSERVATIONS) as { at: number }[];
      const dayOld = Date.now() - 23 * 60 * 60 * 1000;
      Application.setState(
        stored.map((g) => ({ ...g, at: dayOld })),
        IMAGE_STORE,
      );
      Application.setState(
        evidence.map((g) => ({ ...g, at: dayOld })),
        OBSERVATIONS,
      );
      expect(authorizeImage(pages[0]).at).to.equal(dayOld);
      await interceptor.interceptRequest({ url: pages[0], method: "GET" });
      expect(authorizeImage(pages[0]).at).to.equal(dayOld);
      Application.setState(stored, IMAGE_STORE);
      Application.setState(evidence, OBSERVATIONS);
      Application.setState(
        stored.map((g) => ({ ...g, at: Date.now() - IMAGE_LIFETIME - 1 })),
        IMAGE_STORE,
      );
      await rejects(
        () => interceptor.interceptRequest({ url: pages[0], method: "GET" }),
        /expired/,
      );
      Application.setState(stored, IMAGE_STORE);
    },
  );
  suite.test(
    "images: overlapping cover and reader roles retain independent fixed grants",
    async () => {
      const saved = Application.getState(IMAGE_STORE),
        evidence = Application.getState(OBSERVATIONS),
        policy = preferences(),
        url = pages[0],
        before = probe.requests.length,
        readerGrant = authorizeImage(url),
        coverAt = Date.now();
      try {
        issueImages([url], chapter.sourceManga.mangaId, "safe", policy, coverAt);
        const roles = (
          Application.getState(IMAGE_STORE) as { url: string; chapter?: string; at: number }[]
        ).filter((g) => g.url === url);
        expect(roles.length).to.equal(2);
        expect(roles.find((g) => g.chapter === chapter.chapterId)?.at).to.equal(readerGrant.at);
        expect(roles.find((g) => g.chapter === undefined)?.at).to.equal(coverAt);
        issueImages([url], chapter.sourceManga.mangaId, "unknown", policy, Date.now());
        expect(
          (
            Application.getState(IMAGE_STORE) as { url: string; chapter?: string; rating: string }[]
          ).find((g) => g.url === url && g.chapter === undefined)?.rating,
        ).to.equal("safe");
        expect(
          (
            Application.getState(IMAGE_STORE) as { url: string; chapter?: string; at: number }[]
          ).find((g) => g.url === url && g.chapter === undefined)?.at,
        ).to.equal(coverAt);
        Application.setState([{ ...roles[0], chapter: "" }], IMAGE_STORE);
        expect(() => authorizeImage(url)).to.throw(/reader image role/);
        Application.setState([...roles, roles[0]], IMAGE_STORE);
        expect(() => authorizeImage(url)).to.throw(/duplicate/);
        Application.setState(
          [
            ...roles,
            {
              ...roles.find((g) => g.chapter !== undefined)!,
              chapter: chapter.chapterId + "-other",
            },
          ],
          IMAGE_STORE,
        );
        expect(() => authorizeImage(url)).to.throw(/Conflicting/);
        Application.setState(roles, IMAGE_STORE);
        const interceptor = new MangaStashInterceptor("MangaStash.overlapping-cover-check");
        const issued = JSON.stringify(Application.getState(IMAGE_STORE));
        expect((await interceptor.interceptRequest({ url, method: "GET" })).url).to.equal(url);
        expect(JSON.stringify(Application.getState(IMAGE_STORE))).to.equal(issued);
        expect(() =>
          issueImages(
            [url],
            chapter.sourceManga.mangaId,
            "safe",
            policy,
            Date.now(),
            chapter.chapterId + "-other",
          ),
        ).to.throw(/Conflicting/);
        Application.setState(
          roles.map((g) => ({
            ...g,
            at: g.chapter === undefined ? Date.now() - IMAGE_LIFETIME - 1 : g.at,
          })),
          IMAGE_STORE,
        );
        expect(authorizeImage(url).chapter).to.equal(chapter.chapterId);
        Application.setState(
          roles.map((g) => ({
            ...g,
            at: g.chapter === undefined ? g.at : Date.now() - IMAGE_LIFETIME - 1,
          })),
          IMAGE_STORE,
        );
        expect(authorizeImage(url).chapter).to.equal(undefined);
        Application.setState({ ...policy, revision: policy.revision + 1 }, PREFERENCES);
        expect(() => authorizeImage(url)).to.throw(/revoked/);
        expect(probe.requests.length).to.equal(before);
      } finally {
        Application.setState(policy, PREFERENCES);
        Application.setState(saved, IMAGE_STORE);
        Application.setState(evidence, OBSERVATIONS);
      }
    },
  );
  suite.test(
    "reader: live-derived wrong owner, chapter, config, ordering, gaps and duplicates reject",
    async () => {
      const chapterLine = reader.match(/^[ \t]*chapterNum:\s*(\d+(?:\.\d+)?),[ \t]*$/m)!,
        totalLine = reader.match(/^[ \t]*totalPages:\s*(\d+),[ \t]*$/m)!,
        slugLine = reader.match(/^[ \t]*seriesSlug:\s*'([a-z0-9-]+)',[ \t]*$/m)!,
        wrongNumber = Number(chapterLine[1]) + 1,
        wrongSlug = chapter.sourceManga.mangaId + "-wrong",
        changeDOM = (mutate: (dom: cheerio.CheerioAPI) => void) => {
          const dom = cheerio.load(reader);
          mutate(dom);
          return dom.html();
        },
        mutations = [
          reader.replace(chapterLine[0], chapterLine[0] + `\n    'chapterNum': ${wrongNumber},`),
          reader.replace(chapterLine[0], chapterLine[0] + `\n    ['chapterNum']: ${wrongNumber},`),
          reader.replace(chapterLine[0], chapterLine[0] + `\n    ...{chapterNum: ${wrongNumber}},`),
          changeDOM(($) => {
            $('link[rel="canonical"]').attr(
              "href",
              chapterURL(chapter.chapterId, chapter.sourceManga.mangaId).replace(
                "/" + chapter.sourceManga.mangaId + "/",
                "/" + wrongSlug + "/",
              ),
            );
          }),
          reader.replace(slugLine[0], `    seriesSlug: '${wrongSlug}',`),
          reader.replace(chapterLine[0], `    chapterNum: ${wrongNumber},`),
          reader.replace(totalLine[0], `    totalPages: ${Number(totalLine[1]) + 1},`),
          changeDOM(($) => {
            $("#reader-pages > .reader-page").first().attr("data-page", "2");
          }),
          changeDOM(($) => {
            $("#reader-pages > .reader-page .reader-page-inner > img")
              .first()
              .attr(
                "data-src",
                pages[0].replace(/\/chapter-\d+(?:\.\d+)?\//, `/chapter-${wrongNumber}/`),
              );
          }),
          reader.replace(slugLine[0], `    seriesSlug: (() => '${slugLine[1]}')(),`),
          changeDOM(($) => {
            $(".reader").addClass("reader-locked");
          }),
        ];
      if (pages.length > 1) {
        mutations.push(
          changeDOM(($) => {
            $("#reader-pages > .reader-page").eq(1).attr("data-page", "1");
          }),
          changeDOM(($) => {
            $("#reader-pages > .reader-page .reader-page-inner > img")
              .eq(1)
              .attr("data-src", pages[0]);
          }),
        );
      }
      for (const html of mutations) {
        expect(html).not.to.equal(reader);
        expect(() => parseReader(html, chapter)).to.throw(/MangaStash/);
      }
      const wrong = JSON.parse(JSON.stringify(chapter)) as Chapter;
      wrong.sourceManga.mangaId = "other";
      const before = probe.requests.length;
      await rejects(() => MangaStash.getChapterDetails(wrong), /identity/);
      expect(probe.requests.length).to.equal(before);
    },
  );
  suite.test(
    "classification: genuine labels and unknown fallback never infer demographics",
    async () => {
      expect(ratingFromLabels(["Safe", "Mature"])).to.equal("mature");
      expect(ratingFromLabels(["Safe", "Suggestive"])).to.equal("suggestive");
      expect(ratingFromLabels(["Seinen", "Josei", "Romance", "5 stars"])).to.equal("unknown");
      const $ = cheerio.load(detail);
      $(".series-badges .badge")
        .filter((_, e) => $(e).text() === "Safe")
        .remove();
      expect(parseDetails($.html(), "ayashimon").rating).to.equal("unknown");
      expect(parseDetails($.html(), "ayashimon").source.mangaInfo.contentRating).to.equal(
        ContentRating.MATURE,
      );
      $(".series-badges").append('<span class="badge">Suggestive</span>');
      expect(parseDetails($.html(), "ayashimon").rating).to.equal("suggestive");
      expect(parseDetails($.html(), "ayashimon").source.mangaInfo.contentRating).to.equal(
        ContentRating.MATURE,
      );
    },
  );
  suite.test(
    "policy: strict source exclusion errors honestly and revokes saved image access",
    async () => {
      await settings.setOnlySafe(true);
      expect(() => authorizeImage(pages[0])).to.throw(/authorization/);
      await rejects(() => MangaStash.getDiscoverSectionItems(SECTIONS[0]), /excludes this feed/);
      const safe = await MangaStash.getMangaDetails("ayashimon"),
        current = (await MangaStash.getChapters(safe)).find(
          (c) => c.chapterId === chapter.chapterId,
        )!;
      const result = await MangaStash.getChapterDetails(current);
      if (!("pages" in result)) throw new Error("Expected comic pages");
      expect(authorizeImage(result.pages[0]).id).to.equal("ayashimon");
      const at = Date.now();
      observe("ayashimon", "mature", at);
      expect(() => authorizeImage(result.pages[0])).to.throw(/revoked/);
      await rejects(() => MangaStash.getChapters(safe), /excluded/);
      await settings.setOnlySafe(false);
      expect(() => authorizeImage(result.pages[0])).to.throw(/revoked/);
      Application.setState([], OBSERVATIONS);
    },
  );
  suite.test("zero-results and optional metadata use explicit source semantics", async () => {
    const url = searchURL("Ayashimon"),
      $ = cheerio.load(probe.responses.get(url)!);
    $(".search-result-row").remove();
    $(".search-summary").text('0 results for "Ayashimon"');
    expect(parseCatalog($.html(), url).items).to.deep.equal([]);
    $(".search-summary").text("Loading");
    expect(() => parseCatalog($.html(), url)).to.throw(/unexplained empty/);
    const d = cheerio.load(detail);
    d(".series-author,.series-description,.series-badges,.series-rating-section").remove();
    d("script[type='application/ld+json']").each((_, e) => {
      const data = JSON.parse(d(e).text());
      if (data["@type"] === "Book") {
        delete data.numberOfPages;
        delete data.aggregateRating;
        d(e).text(JSON.stringify(data));
      }
    });
    const parsed = parseDetails(d.html(), "ayashimon");
    expect(parsed.rating).to.equal("unknown");
    expect(parsed.source.mangaInfo.rating).to.equal(undefined);
    expect(parsed.source.mangaInfo.status).to.equal(undefined);
    expect(parsed.chapters).not.to.be.empty;
    d(".series-header").append('<span data-content-rating="unrecognized">Safe?</span>');
    expect(() => parseDetails(d.html(), "ayashimon")).to.throw(/unrecognized content/);
  });
  suite.test("native rating uses the 0–1 scale and omits malformed source scores", async () => {
    expect(manga.mangaInfo.rating).to.be.within(0, 1);
    for (const [input, expected] of [
      [0, 0],
      [5, 1],
      [4.94, 0.988],
      [-1, undefined],
      [5.1, undefined],
      ["4.9", undefined],
      [null, undefined],
    ] as const) {
      const d = cheerio.load(detail);
      d("script[type='application/ld+json']").each((_, e) => {
        const value = JSON.parse(d(e).text());
        if (value["@type"] === "Book") {
          value.aggregateRating = { ratingValue: input, bestRating: 5 };
          d(e).text(JSON.stringify(value));
        }
      });
      const actual = parseDetails(d.html(), "ayashimon").source.mangaInfo.rating;
      if (expected === undefined) expect(actual).to.equal(undefined);
      else expect(actual).to.be.closeTo(expected, 1e-12);
    }
    const d = cheerio.load(detail);
    d(".series-header").append('<div class="content-warning">Mature</div>');
    expect(parseDetails(d.html(), "ayashimon").rating).to.equal("mature");
    d(".content-warning").text("Review age warning");
    expect(() => parseDetails(d.html(), "ayashimon")).to.throw(/unrecognized content warning/);
  });
  suite.test("persisted evidence loss invalidates grants and cached responses", async () => {
    const current = await MangaStash.getMangaDetails("ayashimon"),
      oldRevision = preferences().revision;
    Application.setState(undefined, OBSERVATIONS);
    expect(() => authorizeImage(current.mangaInfo.thumbnailUrl)).to.throw(/evidence was lost/);
    expect(preferences().revision).to.be.greaterThan(oldRevision);
    expect(() => authorizeImage(current.mangaInfo.thumbnailUrl)).to.throw(/authorization/);
  });
  suite.test("native input and finite-feed guards reject before network", async () => {
    const before = probe.requests.length;
    await rejects(
      () => MangaStash.getChapters("ayashimon" as unknown as SourceManga),
      /native SourceManga/,
    );
    await rejects(
      () => MangaStash.getChapterDetails("chapter-25.6" as unknown as Chapter),
      /native Chapter/,
    );
    await rejects(() => MangaStash.getDiscoverSectionItems(SECTIONS[0], {}), /finite snapshots/);
    expect(probe.requests.length).to.equal(before);
    expect(() => imageURL(BASE_URL + "/content/covers/thumbnails/other.jpg", "ayashimon")).to.throw(
      /owner/,
    );
  });
  suite.test("settings race: pending result cannot survive an ABA policy change", async () => {
    const source = new MangaStashExtension();
    let release!: () => void, started!: () => void;
    const ready = new Promise<void>((r) => {
        started = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    probe.gate = async (request, data) => {
      if (request.url === BASE_URL + "/") {
        started();
        await gate;
      }
      return data;
    };
    const pending = source.getDiscoverSectionItems(SECTIONS[0]);
    try {
      await Promise.race([
        ready,
        pending.then(() => {
          throw new Error("Expected pending response");
        }),
      ]);
      await settings.setOnlySafe(true);
      await settings.setOnlySafe(false);
      release();
      await rejects(() => pending, /settings changed/);
    } finally {
      release();
      probe.gate = undefined;
    }
  });
  suite.test(
    "native app caps are current policy at catalogs, persisted readers and images",
    async () => {
      const host = Application as unknown as {
        filterMatureTitles: boolean;
        filterAdultTitles: boolean;
      };
      const original = { mature: host.filterMatureTitles, adult: host.filterAdultTitles };
      const source = new MangaStashExtension();
      try {
        host.filterMatureTitles = false;
        host.filterAdultTitles = false;
        const allowed = await source.getDiscoverSectionItems(SECTIONS[0]);
        const card = allowed.items.find((i) => "imageUrl" in i)!;
        if (!("imageUrl" in card)) throw new Error("Expected native cover card");
        expect(authorizeImage(card.imageUrl).id).not.to.be.empty;
        host.filterMatureTitles = true;
        expect(nativeAllowed("unknown")).to.equal(false);
        expect(nativeAllowed("safe")).to.equal(true);
        expect(() => authorizeImage(card.imageUrl)).to.throw(/authorization/);
        await rejects(
          () => source.getDiscoverSectionItems(SECTIONS[0]),
          /native content-rating filters exclude this feed/,
        );
        probe.gate = async (request, data) => {
          if (request.url !== seriesURL("ayashimon")) return data;
          const changed = cheerio.load(Application.arrayBufferToUTF8String(data));
          changed(".series-badges .badge")
            .filter((_, e) => changed(e).text() === "Safe")
            .text("Mature");
          return new TextEncoder().encode(changed.html()).buffer as ArrayBuffer;
        };
        const restricted = new MangaStashExtension();
        await rejects(() => restricted.getMangaDetails("ayashimon"), /native content-rating/);
        const before = probe.requests.length;
        await rejects(() => restricted.getChapters(manga), /native content-rating/);
        await rejects(() => restricted.getChapterDetails(chapter), /native content-rating/);
        expect(probe.requests.length).to.equal(before);
        host.filterMatureTitles = false;
        host.filterAdultTitles = true;
        expect(nativeAllowed("unknown")).to.equal(true);
        expect(nativeAllowed("explicit")).to.equal(false);
        expect(() => authorizeImage(card.imageUrl)).to.throw(/authorization/);
      } finally {
        probe.gate = undefined;
        host.filterMatureTitles = original.mature;
        host.filterAdultTitles = original.adult;
        preferences();
      }
    },
  );
  suite.test(
    "redirect callback cancels changed destinations and response identity stays strict",
    async () => {
      const interceptor = new MangaStashInterceptor("MangaStash.redirect-check");
      expect(
        await interceptor.handleRedirect(
          { url: "https://other.example/page.jpg", method: "GET" },
          {
            url: pages[0],
            status: 302,
            headers: { location: "https://other.example/page.jpg" },
            cookies: [],
          },
        ),
      ).to.equal(undefined);
      await rejects(
        () =>
          interceptor.interceptResponse(
            { url: pages[0], method: "GET" },
            {
              url: "https://other.example/page.jpg",
              status: 200,
              headers: { "content-type": "image/jpeg" },
              cookies: [],
            },
            new Uint8Array([255, 216, 255]).buffer,
          ),
        /redirected/,
      );
    },
  );
  try {
    await suite.run();
  } finally {
    probe.unregisterInterceptor();
    Application.setState(saved, PREFERENCES);
    Application.setState(savedImages, IMAGE_STORE);
    Application.setState(savedEvidence, OBSERVATIONS);
    Application.setState(savedNativePolicy, NATIVE_POLICY);
  }
}
