/* eslint-disable no-unused-expressions */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  PaperbackInterceptor,
  type Chapter,
  type DiscoverSectionItem,
  type Request,
  type Response,
  type SourceManga,
  type TestLogger,
  type Metadata,
  type PagedResults,
} from "@paperback/types";
import { expect } from "chai";
import { Hijala, HijalaExtension } from "../Hijala/main.js";
import {
  blockedGenre,
  HijalaSettingsForm,
  matchesPreferences,
  preferences,
} from "../Hijala/forms.js";
import { API_URL, BASE_URL, SECTIONS, SORTS, TYPES, type Post } from "../Hijala/models.js";
import { catalogUrl, feedUrl, fetchText } from "../Hijala/network.js";
import {
  catalog,
  pageProperty,
  parseChapters,
  parseGenreOptions,
  searchItem,
  seriesUrl,
  slugToId,
} from "../Hijala/parsers.js";
import sourceInfo from "../Hijala/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

// Observe actual built-native callbacks. Negative cases mutate fresh live responses only.
class Probe extends PaperbackInterceptor {
  readonly requests: Request[] = [];
  gate?: (request: Request, data: ArrayBuffer) => Promise<ArrayBuffer>;
  override async interceptRequest(request: Request): Promise<Request> {
    if (request.url.startsWith(`${BASE_URL}/`) || request.url.startsWith(`${API_URL}/`))
      this.requests.push(request);
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
const rejects = async (operation: () => Promise<unknown>, pattern: RegExp) => {
  let failure: unknown;
  try {
    await operation();
  } catch (error) {
    failure = error;
  }
  expect(String(failure)).to.match(pattern);
};
const ids = (items: DiscoverSectionItem[]) =>
  items.map((item) => ("mangaId" in item ? item.mangaId : item.name));
// The canonical taxonomy archive is not a per-title detail request.
const isSeriesDetailRequest = (request: Pick<Request, "url">): boolean => {
  const path = new globalThis.URL(request.url).pathname;
  return path.startsWith("/series/") && path !== "/series/";
};
const bytes = async (pages: string[]) => {
  const evidence: { page: number; status: number; bytes: number }[] = [];
  for (const url of new Set([
    pages[0],
    pages[Math.floor(pages.length / 2)],
    pages[pages.length - 1],
  ])) {
    const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
    expect(response.status).to.equal(200);
    expect(
      Object.entries(response.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1],
    ).to.match(/^image\//i);
    const value = new Uint8Array(data),
      magic = String.fromCharCode(...value.slice(0, 16));
    expect(value.length).to.be.greaterThan(100);
    expect(
      (value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) ||
        magic.startsWith("\x89PNG\r\n\x1a\n") ||
        magic.startsWith("GIF8") ||
        (magic.startsWith("RIFF") && magic.slice(8, 12) === "WEBP") ||
        /^....ftypavi[fs]/s.test(magic),
    ).to.equal(true);
    evidence.push({ page: pages.indexOf(url) + 1, status: response.status, bytes: value.length });
  }
  return evidence;
};

const pageIds = (items: unknown[]): string[] =>
  items.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("mangaId" in item) ||
      typeof item.mangaId !== "string"
    )
      throw new Error("Expected a native series item");
    return item.mangaId;
  });
const walkPages = async (
  load: (metadata?: Metadata) => Promise<PagedResults<unknown>>,
  limit: number,
  requests: Request[],
) => {
  const all: string[] = [],
    seen = new Set<string>();
  let cursor: Metadata | undefined;
  for (let page = 1; page <= limit; page++) {
    const before = JSON.stringify(cursor),
      result = await load(cursor),
      ids = pageIds(result.items);
    expect(new Set(ids).size).to.equal(ids.length);
    for (const id of ids) {
      expect(seen.has(id), `Duplicate native ID across accumulated pages: ${id}`).to.equal(false);
      seen.add(id);
      all.push(id);
    }
    const count = requests.length,
      repeated = await load(cursor);
    expect(pageIds(repeated.items)).to.deep.equal(ids);
    expect(repeated.metadata).to.deep.equal(result.metadata);
    expect(
      requests.length,
      "Repeated native cursor should reuse cached physical responses",
    ).to.equal(count);
    expect(JSON.stringify(cursor), "Caller cursor must remain immutable").to.equal(before);
    expect(new Set(all).size).to.equal(all.length);
    if (!result.metadata) return { ids: all, pages: page };
    expect(
      ids.length,
      "Duplicate-only physical pages must be advanced internally, not returned as premature end",
    ).to.be.greaterThan(0);
    cursor = result.metadata;
  }
  throw new Error("Native pagination never reached a terminal result within its evidence bound");
};

export async function runTests(logger: TestLogger) {
  const saved = Application.getState("Hijala.preferences");
  const suite = new TestSuite("Hijala tests", logger);
  suite.test("defaults: fresh persistent state", async () => {
    Application.setState(undefined, "Hijala.preferences");
    for (const path of ["/series", "/series/", "/series/?page=1", "/series-other/title"]) {
      expect(isSeriesDetailRequest({ url: `${BASE_URL}${path}` })).to.equal(false);
    }
    for (const path of ["/series/mimosa", "/series/mimosa/chapter-56"]) {
      expect(isSeriesDetailRequest({ url: `${BASE_URL}${path}` })).to.equal(true);
    }
  });
  registerDefaultTests(suite, Hijala, sourceInfo);
  let settings: HijalaSettingsForm;
  let home = "";
  let fullCatalog = new Map<string, Post>();
  let rows: Awaited<ReturnType<typeof Hijala.getDiscoverSectionItems>>[] = [];
  let discoverySource: HijalaExtension | undefined;
  let sample: SourceManga, chapters: Chapter[];

  suite.test(
    "settings: honest default-on genre exclusion and complete native taxonomy",
    async () => {
      const canonical = new Probe("Hijala.canonical-taxonomy");
      canonical.registerInterceptor();
      try {
        settings = await Hijala.getSettingsForm();
        expect(preferences().excludeNSFW).to.equal(true);
        expect(preferences().hidePaid).to.equal(true);
        expect(preferences().types).to.deep.equal(TYPES);
        const taxonomy = parseGenreOptions(await fetchText(`${BASE_URL}/series/`));
        expect(taxonomy.length).to.be.greaterThan(20);
        expect(
          taxonomy.some((item) => blockedGenre(item.title) && /mature/i.test(item.title)),
        ).to.equal(true);
        const form = await Hijala.getAdvancedSearchForm({ title: "" });
        expect(form.getSections().length).to.equal(2);
        expect((await Hijala.getSortingOptions()).map((item) => item.id)).to.deep.equal(
          SORTS.map((item) => item.id),
        );
        logger.log("liveGenres", taxonomy.length);
        expect(canonical.requests.length).to.be.greaterThan(0);
        expect(
          canonical.requests.every((request) => request.url === `${BASE_URL}/series/`),
        ).to.equal(true);
      } finally {
        canonical.unregisterInterceptor();
      }
    },
  );
  suite.test("discover: actual current five sections and rendered Popular limit", async () => {
    home = await fetchText(`${BASE_URL}/`);
    expect(pageProperty<string[]>(home, "latestReleaseFilters")).to.deep.equal(["latest", "new"]);
    expect(home)
      .to.include("Latest Releases")
      .and.to.include("Most Popular")
      .and.to.include("Latest Updates");
    expect(
      (await Hijala.getDiscoverSections()).map(({ id, title }) => ({ id, title })),
    ).to.deep.equal(SECTIONS.map(({ id, title }) => ({ id, title })));
    expect(SECTIONS.map((section) => section.id)).to.deep.equal([
      "featured",
      "latest",
      "new",
      "popular",
      "updates",
    ]);
    for (let page = 1, total = 1; fullCatalog.size < total; page++) {
      const data = catalog(
        await fetchText(
          `${API_URL}/api/query?page=${page}&perPage=100&orderBy=lastChapterAddedAt&orderDirection=desc`,
        ),
      );
      total = data.totalCount;
      expect(data.posts.length).to.equal(Math.min(100, total - (page - 1) * 100));
      for (const post of data.posts) {
        expect(fullCatalog.has(post.slug)).to.equal(false);
        fullCatalog.set(post.slug, post);
      }
      expect(page).to.be.lessThan(11);
    }
    logger.log("bulkCatalogCount", fullCatalog.size);
  });
  suite.test(
    "discover: cold and warm native callbacks share bounded bulk requests without N+1",
    async () => {
      await settings.setExcludeNSFW(false);
      await settings.setExcludeNSFW(true);
      const source = (discoverySource = new HijalaExtension()),
        probe = new Probe("Hijala.discovery-count");
      probe.gate = async (request, data) => {
        if (request.url === `${BASE_URL}/`) home = Application.arrayBufferToUTF8String(data);
        return data;
      };
      probe.registerInterceptor();
      try {
        const sections = await source.getDiscoverSections();
        rows = await Promise.all(
          sections.map((section) => source.getDiscoverSectionItems(section)),
        );
        const cold = probe.requests.length;
        expect(probe.requests.filter((request) => request.url === `${BASE_URL}/`).length).to.equal(
          1,
        );
        expect(
          probe.requests.filter((request) => request.url.includes("perPage=100")).length,
        ).to.equal(Math.ceil(fullCatalog.size / 100));
        expect(probe.requests.some(isSeriesDetailRequest)).to.equal(false);
        expect(cold).to.equal(3 + Math.ceil(fullCatalog.size / 100));
        const warm = await Promise.all(
          sections.map((section) => source.getDiscoverSectionItems(section)),
        );
        expect(probe.requests.length).to.equal(cold);
        expect(warm.map((row) => ids(row.items))).to.deep.equal(rows.map((row) => ids(row.items)));
        logger.log("discoveryRequests", { cold, warm: 0, bulk: Math.ceil(fullCatalog.size / 100) });
      } finally {
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test("discover: empty first-page metadata reuses finite home snapshots", async () => {
    // Reuse the previous discovery cache in full runs, with no extra provider calls.
    const source = discoverySource ?? new HijalaExtension();
    const probe = new Probe("Hijala.first-page-metadata");
    const sections = SECTIONS.filter((item) => ["featured", "popular", "updates"].includes(item.id));
    probe.registerInterceptor();
    try {
      const first = await Promise.all(sections.map((section) => source.getDiscoverSectionItems(section)));
      const cold = probe.requests.length;
      if (discoverySource) expect(cold).to.equal(0);
      for (const metadata of [null, {}, Object.create(null)]) {
        const repeated = await Promise.all(sections.map((section) => source.getDiscoverSectionItems(section, metadata)));
        expect(repeated).to.deep.equal(first);
        expect(probe.requests.length).to.equal(cold);
      }
      for (const section of sections) {
        for (const metadata of [{ page: 2 }, [], false, 0, ""]) {
          expect(await source.getDiscoverSectionItems(section, metadata)).to.deep.equal({ items: [] });
        }
      }
      expect(first.every((row) => row.metadata === undefined)).to.equal(true);
      expect(probe.requests.length).to.equal(cold);
    } finally {
      probe.unregisterInterceptor();
    }
  });
  suite.test(
    "discover: homepage order, covers and bounded snapshots match public source data",
    async () => {
      const allow = (post: Post) => matchesPreferences(searchItem(post), preferences());
      expect(ids(rows[0].items)).to.deep.equal(
        pageProperty<Post[]>(home, "combinedSliderPosts")
          .filter(allow)
          .map((post) => slugToId(post.slug)),
      );
      expect(ids(rows[1].items)).to.deep.equal(
        pageProperty<Post[]>(home, "latestMangaPosts")
          .filter(allow)
          .map((post) => slugToId(post.slug)),
      );
      const popular = pageProperty<{ slug: string; coverImage: string }[]>(
        home,
        "transformedTopSeries",
      ).slice(0, 9);
      expect(ids(rows[3].items)).to.deep.equal(
        popular
          .filter((post) => fullCatalog.has(post.slug) && allow(fullCatalog.get(post.slug)!))
          .map((post) => slugToId(post.slug)),
      );
      for (const item of rows[3].items)
        if ("mangaId" in item)
          expect(item.imageUrl).to.equal(
            popular.find((post) => slugToId(post.slug) === item.mangaId)!.coverImage,
          );
      for (const index of [0, 3, 4]) expect(rows[index].metadata).to.equal(undefined);
      expect(
        rows
          .flatMap((row) => row.items)
          .some((item) => "title" in item && /coin sale|announcement/i.test(item.title)),
      ).to.equal(false);
    },
  );
  suite.test(
    "discover: every real per-chapter update retains identity and paid boundary",
    async () => {
      const updates = pageProperty<{ seriesSlug: string; chapterSlug: string; isPaid: boolean }[]>(
        home,
        "chapterUpdates",
      );
      const expected = updates.filter(
        (update) =>
          !update.isPaid &&
          fullCatalog.has(update.seriesSlug) &&
          matchesPreferences(searchItem(fullCatalog.get(update.seriesSlug)!), preferences()),
      );
      expect(
        rows[4].items.map((item) =>
          "chapterId" in item ? `${item.mangaId}/${item.chapterId}` : "",
        ),
      ).to.deep.equal(
        expected.map((update) => `${slugToId(update.seriesSlug)}/${slugToId(update.chapterSlug)}`),
      );
      expect(new Set(expected.map((item) => item.seriesSlug)).size).to.be.lessThan(expected.length);
      await settings.setHidePaid(false);
      const all = await Hijala.getDiscoverSectionItems(SECTIONS[4]);
      expect(
        all.items.some((item) => "subtitle" in item && item.subtitle?.startsWith("[Paid]")),
      ).to.equal(true);
      expect(all.items.length).to.be.greaterThan(rows[4].items.length);
      await settings.setHidePaid(true);
    },
  );
  suite.test("discover: New actual request, next page and repeated native requests", async () => {
    const first = await Hijala.getDiscoverSectionItems(SECTIONS[2]);
    const reference = catalog(await fetchText(feedUrl("new", 1)));
    expect(ids(first.items)).to.deep.equal(
      reference.posts
        .map(searchItem)
        .filter((item) => matchesPreferences(item, preferences()))
        .map((item) => item.mangaId),
    );
    expect(first.metadata).not.to.equal(undefined);
    const second = await Hijala.getDiscoverSectionItems(SECTIONS[2], first.metadata);
    expect(second.items).not.to.be.empty;
    expect(
      ids((await Hijala.getDiscoverSectionItems(SECTIONS[2], first.metadata)).items),
    ).to.deep.equal(ids(second.items));
    expect(ids(second.items).every((id) => !ids(first.items).includes(id))).to.equal(true);
    expect(new Set([...ids(first.items), ...ids(second.items)]).size).to.equal(
      first.items.length + second.items.length,
    );
  });
  suite.test("discover: Latest uses verified pinned feed and actual page 2", async () => {
    const pinned = pageProperty<boolean>(home, "hasPinnedSeriesSection");
    const tag = pinned ? "latestUpdate" : "latestUpdatePinned";
    const first = await Hijala.getDiscoverSectionItems(SECTIONS[1]);
    const reference = catalog(await fetchText(feedUrl("latest", 1, tag)));
    expect(reference.posts.map((post) => post.slug)).to.deep.equal(
      pageProperty<Post[]>(home, "latestMangaPosts").map((post) => post.slug),
    );
    expect(ids(first.items)).to.deep.equal(
      reference.posts
        .map(searchItem)
        .filter((item) => matchesPreferences(item, preferences()))
        .map((item) => item.mangaId),
    );
    expect(first.metadata).not.to.equal(undefined);
    const second = await Hijala.getDiscoverSectionItems(SECTIONS[1], first.metadata);
    const next = catalog(await fetchText(feedUrl("latest", 2, tag)));
    expect(ids(second.items)).to.deep.equal(
      next.posts
        .map(searchItem)
        .filter((item) => matchesPreferences(item, preferences()))
        .map((item) => item.mangaId),
    );
    expect(ids(second.items).every((id) => !ids(first.items).includes(id))).to.equal(true);
  });
  suite.test(
    "pagination: complete live New and catalog have globally unique accumulated IDs",
    async () => {
      const expected = [...fullCatalog.values()]
        .filter((post) => matchesPreferences(searchItem(post), preferences()))
        .map((post) => slugToId(post.slug))
        .sort();
      const evidence = [];
      for (const kind of ["new", "catalog"]) {
        const source = new HijalaExtension(),
          probe = new Probe(`Hijala.pagination-live-${kind}`);
        probe.registerInterceptor();
        try {
          const result = await walkPages(
            (cursor) =>
              kind === "new"
                ? source.getDiscoverSectionItems(SECTIONS[2], cursor)
                : source.getSearchResults({ title: "" }, cursor),
            20,
            probe.requests,
          );
          expect([...result.ids].sort()).to.deep.equal(expected);
          expect(probe.requests.some(isSeriesDetailRequest)).to.equal(false);
          evidence.push({
            kind,
            pages: result.pages,
            delivered: result.ids.length,
            unique: new Set(result.ids).size,
          });
        } finally {
          probe.unregisterInterceptor();
        }
      }
      logger.log("paginationLive", evidence);
    },
  );
  suite.test(
    "pagination: partial overlap and duplicate-only physical pages lose no live-derived IDs",
    async () => {
      const posts = [...fullCatalog.values()];
      expect(posts.length).to.be.greaterThan(60);
      const physical = [
        posts.slice(0, 20),
        [...posts.slice(15, 20), ...posts.slice(20, 35)],
        posts.slice(15, 35),
      ];
      for (let start = 35; start < posts.length; start += 20)
        physical.push(posts.slice(start, start + 20));
      expect(new Set(physical.flat().map((post) => post.slug)).size).to.equal(posts.length);
      const expected = posts
        .filter((post) => matchesPreferences(searchItem(post), preferences()))
        .map((post) => slugToId(post.slug));
      const evidence = [];
      for (const kind of ["new", "catalog"]) {
        const source = new HijalaExtension(),
          probe = new Probe(`Hijala.pagination-overlap-${kind}`);
        const target = (url: string) => {
          const value = new globalThis.URL(url);
          return (
            value.hostname === "api.en-hijala.com" &&
            (kind === "new"
              ? value.pathname === "/api/posts" && value.searchParams.get("tag") === "new"
              : value.pathname === "/api/query")
          );
        };
        probe.gate = async (request, data) => {
          if (!target(request.url)) return data;
          const value = JSON.parse(Application.arrayBufferToUTF8String(data));
          expect(Array.isArray(value.posts)).to.equal(true);
          const page = Number(new globalThis.URL(request.url).searchParams.get("page"));
          value.posts = physical[page - 1] ?? [];
          // totalCount counts unique source identities, not repeated physical rows.
          value.totalCount = posts.length;
          return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
        };
        probe.registerInterceptor();
        try {
          const result = await walkPages(
            (cursor) =>
              kind === "new"
                ? source.getDiscoverSectionItems(SECTIONS[2], cursor)
                : source.getSearchResults({ title: "" }, cursor),
            physical.length + 1,
            probe.requests,
          );
          expect(result.ids).to.deep.equal(expected);
          const requests = probe.requests.filter((request) => target(request.url));
          expect(
            requests.map((request) =>
              Number(new globalThis.URL(request.url).searchParams.get("page")),
            ),
          ).to.deep.equal(physical.map((_page, index) => index + 1));
          expect(physical.length).to.be.greaterThan(Math.ceil(posts.length / 20));
          expect(probe.requests.some(isSeriesDetailRequest)).to.equal(false);
          evidence.push({
            kind,
            physicalPages: physical.length,
            logicalPages: result.pages,
            sourceUnique: posts.length,
            delivered: result.ids.length,
            unique: new Set(result.ids).size,
          });
        } finally {
          probe.unregisterInterceptor();
        }
      }
      logger.log("paginationOverlap", evidence);
    },
  );
  suite.test(
    "pagination: query filter sort section and settings changes reset old cursors",
    async () => {
      const source = new HijalaExtension(),
        probe = new Probe("Hijala.pagination-context");
      probe.registerInterceptor();
      try {
        const first = await source.getSearchResults({ title: "" });
        expect(first.metadata).not.to.equal(undefined);
        const cursor = first.metadata!,
          snapshot = JSON.stringify(cursor);
        const second = await source.getSearchResults({ title: "" }, cursor);
        const recreated = await new HijalaExtension().getSearchResults({ title: "" }, cursor);
        expect(recreated.items.map((item) => item.mangaId)).to.deep.equal(
          second.items.map((item) => item.mangaId),
        );
        expect(
          second.items.every(
            (item) => !first.items.some((prior) => prior.mangaId === item.mangaId),
          ),
        ).to.equal(true);
        expect(JSON.stringify(cursor)).to.equal(snapshot);
        for (const [query, sort] of [
          [{ title: "Mimosa" }, undefined],
          [{ title: "", metadata: { genres: { "1": "included" } } }, undefined],
          [{ title: "" }, SORTS[1]],
        ] as const) {
          const start = probe.requests.length;
          const reset = await source.getSearchResults(query, cursor, sort);
          const sent = probe.requests
            .slice(start)
            .filter((request) => new globalThis.URL(request.url).pathname === "/api/query");
          expect(sent.length).to.equal(1);
          expect(new globalThis.URL(sent[0].url).searchParams.get("page")).to.equal("1");
          const expected = await source.getSearchResults(query, undefined, sort);
          expect(reset.items.map((item) => item.mangaId)).to.deep.equal(
            expected.items.map((item) => item.mangaId),
          );
        }
        const freshNew = await source.getDiscoverSectionItems(SECTIONS[2]);
        expect(
          ids((await source.getDiscoverSectionItems(SECTIONS[2], cursor)).items),
        ).to.deep.equal(ids(freshNew.items));
        expect(
          (await source.getSearchResults({ title: "" }, freshNew.metadata)).items.map(
            (item) => item.mangaId,
          ),
        ).to.deep.equal(first.items.map((item) => item.mangaId));
        await settings.setExcludeNSFW(false);
        const optOut = await source.getSearchResults({ title: "" }, cursor);
        expect(optOut.items.map((item) => item.mangaId)).to.deep.equal(
          (await source.getSearchResults({ title: "" })).items.map((item) => item.mangaId),
        );
        await settings.setExcludeNSFW(true);
        // Same preference values after toggle-off/on still invalidate a prior revision's cursor.
        const reset = await source.getSearchResults({ title: "" }, cursor);
        expect(reset.items.map((item) => item.mangaId)).to.deep.equal(
          first.items.map((item) => item.mangaId),
        );
        expect((reset.metadata as { context: string }).context).not.to.equal(
          (cursor as { context: string }).context,
        );
        await settings.setExcludedGenres(["1"]);
        const excluded = await source.getSearchResults({ title: "" }, cursor);
        expect(excluded.items.every((item) => !item.metadata.genres.includes("1"))).to.equal(true);
        expect(excluded.items.map((item) => item.mangaId)).to.deep.equal(
          (await source.getSearchResults({ title: "" })).items.map((item) => item.mangaId),
        );
        expect(JSON.stringify(cursor)).to.equal(snapshot);
      } finally {
        probe.unregisterInterceptor();
        await settings.setExcludedGenres([]);
        await settings.setExcludeNSFW(true);
      }
    },
  );
  suite.test(
    "pagination: malformed bounded cursor metadata harmlessly resets to page one",
    async () => {
      const source = new HijalaExtension(),
        probe = new Probe("Hijala.pagination-malformed");
      probe.registerInterceptor();
      try {
        const first = await source.getSearchResults({ title: "" });
        const cursor = first.metadata as {
          context: string;
          page: number;
          ids: string;
          seen: string[];
          total: number;
        };
        expect(cursor.seen.length).to.be.greaterThan(0);
        const count = probe.requests.length,
          firstId = cursor.seen[0];
        const malformed = [
          { ...cursor, page: 0 },
          { ...cursor, page: 1001 },
          { ...cursor, page: NaN },
          { ...cursor, total: -1 },
          { ...cursor, total: 10001 },
          { ...cursor, total: cursor.seen.length },
          { ...cursor, seen: [] },
          { ...cursor, seen: [firstId, firstId] },
          { ...cursor, seen: ["%"] },
          { ...cursor, seen: ["x".repeat(2049)] },
          { ...cursor, seen: Array(10001).fill(firstId) },
          { ...cursor, seen: "not-an-array" },
          { ...cursor, ids: "x".repeat(40981) },
          { context: cursor.context, page: cursor.page, ids: cursor.ids },
          { ...cursor, context: "another-query" },
        ];
        for (const metadata of malformed) {
          const result = await source.getSearchResults({ title: "" }, metadata);
          expect(result.items.map((item) => item.mangaId)).to.deep.equal(
            first.items.map((item) => item.mangaId),
          );
          expect(result.metadata).to.deep.equal(first.metadata);
        }
        expect(probe.requests.length).to.equal(count);
        logger.log("paginationMalformedCases", malformed.length);
      } finally {
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test(
    "pagination: changing totals missing records and duplicate loops require refresh",
    async () => {
      const posts = [...fullCatalog.values()],
        evidence = [];
      for (const mode of ["increase", "decrease", "missing", "duplicate-loop", "oversized"]) {
        const source = new HijalaExtension(),
          probe = new Probe(`Hijala.pagination-incomplete-${mode}`);
        probe.gate = async (request, data) => {
          const url = new globalThis.URL(request.url);
          if (url.hostname !== "api.en-hijala.com" || url.pathname !== "/api/query") return data;
          const value = JSON.parse(Application.arrayBufferToUTF8String(data));
          const page = Number(url.searchParams.get("page"));
          value.posts =
            page === 1 || mode === "duplicate-loop"
              ? posts.slice(0, 20)
              : mode === "missing"
                ? []
                : posts.slice(20, 40);
          value.totalCount =
            mode === "oversized"
              ? 10001
              : posts.length +
                (page > 1 ? (mode === "increase" ? 1 : mode === "decrease" ? -1 : 0) : 0);
          return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
        };
        probe.registerInterceptor();
        try {
          if (mode === "oversized")
            await rejects(() => source.getSearchResults({ title: "" }), /oversized.*refresh/i);
          else {
            const first = await source.getSearchResults({ title: "" });
            expect(first.metadata).not.to.equal(undefined);
            await rejects(
              () => source.getSearchResults({ title: "" }, first.metadata),
              mode === "increase" || mode === "decrease"
                ? /changed during pagination.*refresh/i
                : mode === "missing"
                  ? /empty page.*refresh/i
                  : /ten catalog pages.*refresh/i,
            );
          }
          const physical = probe.requests.filter(
            (request) => new globalThis.URL(request.url).pathname === "/api/query",
          ).length;
          expect(physical).to.equal(mode === "duplicate-loop" ? 11 : mode === "oversized" ? 1 : 2);
          evidence.push({ mode, physicalRequests: physical, outcome: "explicit-refresh-error" });
        } finally {
          probe.unregisterInterceptor();
        }
      }
      logger.log("paginationIncomplete", evidence);
    },
  );
  suite.test(
    "discover: stale hidden sections and disabled site tabs stay bounded empty",
    async () => {
      await settings.setSections(["featured"]);
      expect((await Hijala.getDiscoverSectionItems(SECTIONS[1])).items).to.be.empty;
      expect((await Hijala.getDiscoverSections()).map((item) => item.id)).to.deep.equal([
        "featured",
      ]);
      await settings.setSections(SECTIONS.map((item) => item.id));
      const source = new HijalaExtension(),
        probe = new Probe("Hijala.disabled-tabs");
      probe.gate = async (request, data) => {
        if (request.url !== `${BASE_URL}/`) return data;
        const text = Application.arrayBufferToUTF8String(data);
        const changed = text.replace(
          /(latestReleaseFilters:\$R\[\d+\]=)\["latest","new"\]/,
          "$1[]",
        );
        expect(changed).not.to.equal(text);
        return new TextEncoder().encode(changed).buffer as ArrayBuffer;
      };
      probe.registerInterceptor();
      try {
        expect((await source.getDiscoverSections()).map((item) => item.id)).to.deep.equal([
          "featured",
          "popular",
          "updates",
        ]);
        expect((await source.getDiscoverSectionItems(SECTIONS[1])).items).to.be.empty;
        expect((await source.getDiscoverSectionItems(SECTIONS[2])).items).to.be.empty;
        expect(probe.requests.length).to.equal(1);
      } finally {
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test(
    "pagination: complete first responses are terminal while partial oversized responses fail",
    async () => {
      const ascending = new HijalaExtension(),
        ascProbe = new Probe("Hijala.chapters-count-ascending");
      let actual: ReturnType<typeof catalog> | undefined;
      ascProbe.gate = async (request, data) => {
        const url = new globalThis.URL(request.url);
        if (
          url.hostname === "api.en-hijala.com" &&
          url.pathname === "/api/query" &&
          url.searchParams.get("orderBy") === "chaptersCount"
        ) {
          expect(url.searchParams.get("orderDirection")).to.equal("asc");
          actual = catalog(Application.arrayBufferToUTF8String(data));
        }
        return data;
      };
      ascProbe.registerInterceptor();
      try {
        const result = await ascending.getSearchResults(
          { title: "", metadata: { direction: "asc" } },
          undefined,
          SORTS[4],
        );
        expect(actual).not.to.equal(undefined);
        expect(result.items.map((item) => item.mangaId)).to.deep.equal(
          actual!.posts
            .map(searchItem)
            .filter((item) => matchesPreferences(item, preferences()))
            .map((item) => item.mangaId),
        );
        if (actual!.posts.length === actual!.totalCount)
          expect(result.metadata).to.equal(undefined);
        logger.log("chaptersCountAscending", {
          raw: actual!.posts.length,
          total: actual!.totalCount,
          visible: result.items.length,
          terminal: !result.metadata,
        });
      } finally {
        ascProbe.unregisterInterceptor();
      }
      const posts = [...fullCatalog.values()];
      expect(posts.length).to.be.greaterThan(21);
      for (const mode of ["complete", "partial"]) {
        const source = new HijalaExtension(),
          probe = new Probe(`Hijala.complete-catalog-${mode}`);
        probe.gate = async (request, data) => {
          const url = new globalThis.URL(request.url);
          if (url.hostname !== "api.en-hijala.com" || url.pathname !== "/api/query") return data;
          const value = JSON.parse(Application.arrayBufferToUTF8String(data));
          // Same verified complete-response shape, using only fresh real source identities.
          value.posts = mode === "complete" ? posts : posts.slice(0, 21);
          value.totalCount = posts.length;
          return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
        };
        probe.registerInterceptor();
        try {
          if (mode === "partial")
            await rejects(
              () => source.getSearchResults({ title: "" }, undefined, SORTS[4]),
              /invalid or oversized catalog.*refresh/i,
            );
          else {
            const result = await source.getSearchResults({ title: "" }, undefined, SORTS[4]);
            expect(result.metadata).to.equal(undefined);
            expect(result.items.map((item) => item.mangaId)).to.deep.equal(
              posts
                .map(searchItem)
                .filter((item) => matchesPreferences(item, preferences()))
                .map((item) => item.mangaId),
            );
            expect(new Set(result.items.map((item) => item.mangaId)).size).to.equal(
              result.items.length,
            );
            const count = probe.requests.length,
              repeat = await source.getSearchResults({ title: "" }, undefined, SORTS[4]);
            expect(repeat.items.map((item) => item.mangaId)).to.deep.equal(
              result.items.map((item) => item.mangaId),
            );
            expect(repeat.metadata).to.equal(undefined);
            expect(probe.requests.length).to.equal(count);
            logger.log("completeCatalogResponse", {
              raw: posts.length,
              visible: result.items.length,
              terminal: !result.metadata,
              repeatedRequests: 0,
            });
          }
          expect(probe.requests.some(isSeriesDetailRequest)).to.equal(false);
        } finally {
          probe.unregisterInterceptor();
        }
      }
    },
  );
  suite.test("search: malformed saved constraints fail before provider requests", async () => {
    const genre = parseGenreOptions(await fetchText(`${BASE_URL}/series/`)).find(
      (item) => !blockedGenre(item.title),
    );
    expect(genre, "Use the current native taxonomy for the valid saved selection").not.to.be.undefined;
    const valid = {
      genres: { [genre!.id]: "included" },
      statuses: ["ONGOING"],
      types: [TYPES[0]],
      direction: "default",
    };
    const malformed = [
      { genres: { ...valid.genres, "not-a-genre": "excluded" } },
      { genres: { [genre!.id]: "invalid" } },
      { genres: [] },
      { statuses: [...valid.statuses, "INVALID"] },
      { statuses: valid.statuses[0] },
      { types: [...valid.types, "INVALID"] },
      { types: valid.types[0] },
      { direction: "sideways" },
      { minChapters: 1 },
      { createdAfter: 2026 },
    ];
    const previous = Application.getState("Hijala.preferences"),
      probe = new Probe("Hijala.saved-filter-integrity");
    probe.registerInterceptor();
    try {
      for (const excludeNSFW of [true, false]) {
        Application.setState({ ...preferences(), excludeNSFW }, "Hijala.preferences");
        for (const invalid of malformed) {
          const source = new HijalaExtension(),
            query = { title: "", metadata: { ...valid, ...invalid } };
          await rejects(() => source.getSearchResults(query), /Hijala saved .* filter is invalid/);
          await rejects(
            () => source.getAdvancedSearchForm(query),
            /Hijala saved .* filter is invalid/,
          );
        }
      }
      expect(probe.requests, "Invalid selections must not fetch even the safety taxonomy").to.be
        .empty;
    } finally {
      probe.unregisterInterceptor();
      Application.setState(previous, "Hijala.preferences");
    }
  });
  suite.test("search: every site sort, native advanced filters and true empty result", async () => {
    for (const sort of SORTS)
      expect((await Hijala.getSearchResults({ title: "" }, undefined, sort)).items).not.to.be.empty;
    const query = {
      title: "",
      metadata: {
        genres: { "1": "included", "4": "excluded" },
        statuses: ["ONGOING"],
        types: ["MANHWA"],
        direction: "desc",
        minChapters: "1",
        maxChapters: "1000",
        createdAfter: "2020-01-01",
        createdBefore: "2027-01-01",
      },
    };
    const url = catalogUrl(query, 1, SORTS[4]);
    for (const text of [
      "genreIds=1",
      "excludedGenreIds=4",
      "seriesStatus=ONGOING",
      "seriesType=MANHWA",
      "minChapters=1",
      "maxChapters=1000",
      "createdAfter=2020-01-01",
      "createdBefore=2027-01-01",
      "orderBy=chaptersCount",
    ])
      expect(url).to.include(text);
    const result = await Hijala.getSearchResults(query, undefined, SORTS[4]);
    expect(result.items).not.to.be.empty;
    for (const item of result.items) {
      expect(item.metadata.genres).to.include("1").and.not.include("4");
      expect(item.metadata.type).to.equal("MANHWA");
    }
    expect((await Hijala.getSearchResults({ title: "zzzxqv-hijala-no-title-843021" })).items).to.be
      .empty;
  });
  suite.test("chapters: complete actual SourceManga reference and paid preference", async () => {
    sample = await Hijala.getMangaDetails("mimosa");
    await settings.setHidePaid(false);
    chapters = await Hijala.getChapters(sample);
    const reference = parseChapters(await fetchText(seriesUrl(sample.mangaId)), sample, new Date());
    expect(chapters.length).to.equal(reference.length);
    expect(chapters.length).to.be.greaterThan(50);
    for (const chapter of chapters) expect(chapter.sourceManga).to.equal(sample);
    expect(chapters.some((chapter) => chapter.additionalInfo?.locked === "true")).to.equal(true);
    const paid = chapters.find((chapter) => chapter.additionalInfo?.locked === "true")!;
    await rejects(() => Hijala.getChapterDetails(paid), /requires access/);
    await settings.setHidePaid(true);
    const free = await Hijala.getChapters(sample);
    expect(free.length).to.be.lessThan(chapters.length);
    expect(free.every((chapter) => chapter.additionalInfo?.locked === "false")).to.equal(true);
    logger.log("mimosaChapterCounts", { total: chapters.length, free: free.length });
  });
  suite.test(
    "reader: actual native Chapter and real first middle last public image bytes",
    async () => {
      const chapter = chapters.find((item) => item.chapterId === "chapter-56")!;
      expect(chapter).not.to.equal(undefined);
      const result = await Hijala.getChapterDetails(chapter);
      expect(result.id).to.equal(chapter.chapterId);
      expect(result.mangaId).to.equal(sample.mangaId);
      if (!("pages" in result)) throw new Error("Expected native comic reader pages");
      expect(result.pages.length).to.be.greaterThan(10);
      logger.log("mimosaReaderImages", await bytes(result.pages));
      logger.log("mimosaReaderPages", result.pages.length);
    },
  );
  suite.test("chapters: real large full list, decimal numbers and source titles", async () => {
    const manga = await Hijala.getMangaDetails("ahiru-no-sora");
    await settings.setHidePaid(false);
    try {
      const html = await fetchText(seriesUrl(manga.mangaId));
      const result = await Hijala.getChapters(manga);
      expect(result.length).to.equal(pageProperty<number>(html, "totalChapterCount"));
      expect(result.length).to.be.greaterThan(300);
      const decimal = result.filter((chapter) => !Number.isInteger(chapter.chapNum));
      expect(decimal.length).to.be.greaterThan(0);
      for (const chapter of result) expect(chapter.sourceManga).to.equal(manga);
      expect(
        result.map((chapter) => [chapter.chapterId, chapter.chapNum, chapter.title]),
      ).to.deep.equal(
        parseChapters(html, manga, new Date()).map((chapter) => [
          chapter.chapterId,
          chapter.chapNum,
          chapter.title,
        ]),
      );
      const publicDecimal = decimal.find((chapter) => chapter.additionalInfo?.locked === "false")!;
      expect(publicDecimal).not.to.equal(undefined);
      const decimalReader = await Hijala.getChapterDetails(publicDecimal);
      if (!("pages" in decimalReader)) throw new Error("Expected native decimal comic reader");
      logger.log("decimalReaderImages", await bytes(decimalReader.pages));
      logger.log("largeChapterList", {
        total: result.length,
        decimals: decimal.length,
        readerChapter: publicDecimal.chapterId,
        readerPages: decimalReader.pages.length,
      });
    } finally {
      await settings.setHidePaid(true);
    }
  });
  suite.test(
    "safety: actual Mature tag and persisted opt-out do not bypass other filters",
    async () => {
      await rejects(() => Hijala.getMangaDetails("fog-land"), /excluded/);
      await settings.setExcludeNSFW(false);
      const explicit = await Hijala.getMangaDetails("fog-land");
      expect(
        explicit.mangaInfo.tagGroups
          ?.flatMap((group) => group.tags)
          .some((tag) => /mature/i.test(tag.title)),
      ).to.equal(true);
      expect((await new HijalaExtension().getMangaDetails("fog-land")).mangaId).to.equal(
        "fog-land",
      );
      const available = (await Hijala.getChapters(explicit)).find(
        (chapter) => chapter.additionalInfo?.locked === "false",
      )!;
      expect(available).not.to.equal(undefined);
      const mature = parseGenreOptions(await fetchText(`${BASE_URL}/series/`)).find((genre) =>
        /mature/i.test(genre.title),
      )!;
      await settings.setExcludedGenres([mature.id]);
      await rejects(() => Hijala.getMangaDetails("fog-land"), /excluded/);
      await settings.setExcludedGenres([]);
      await settings.setTypes(["MANGA"]);
      await rejects(() => Hijala.getMangaDetails("fog-land"), /excluded/);
      await settings.setTypes([...TYPES]);
      await settings.setExcludeNSFW(true);
      for (const target of [Hijala, new HijalaExtension()]) {
        await rejects(() => target.getMangaDetails("fog-land"), /excluded/);
        await rejects(() => target.getChapters(explicit), /excluded/);
        await rejects(() => target.getChapterDetails(available), /excluded/);
      }
    },
  );
  suite.test(
    "safety: missing live metadata fails closed by default but opt-out is explicit",
    async () => {
      const probe = new Probe("Hijala.unknown-metadata");
      let unknown = "";
      probe.gate = async (request, data) => {
        if (request.url.includes("/api/query?") && request.url.includes("searchTerm=Mimosa")) {
          const value = JSON.parse(Application.arrayBufferToUTF8String(data));
          expect(value.posts.length).to.be.greaterThan(0);
          unknown = slugToId(value.posts[0].slug);
          value.posts[0].genres = [];
          return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
        }
        return data;
      };
      probe.registerInterceptor();
      try {
        const safe = await new HijalaExtension().getSearchResults({ title: "Mimosa" });
        expect(safe.items.some((item) => item.mangaId === unknown)).to.equal(false);
        await settings.setExcludeNSFW(false);
        const optedOut = await new HijalaExtension().getSearchResults({ title: "Mimosa" });
        expect(optedOut.items.some((item) => item.mangaId === unknown)).to.equal(true);
        const mature = parseGenreOptions(await fetchText(`${BASE_URL}/series/`)).find((genre) =>
          /mature/i.test(genre.title),
        )!;
        await settings.setExcludedGenres([mature.id]);
        const stillExcluded = await new HijalaExtension().getSearchResults({ title: "Mimosa" });
        expect(stillExcluded.items.some((item) => item.mangaId === unknown)).to.equal(false);
      } finally {
        probe.unregisterInterceptor();
        await settings.setExcludedGenres([]);
        await settings.setExcludeNSFW(true);
      }
    },
  );
  suite.test(
    "native: string and incomplete chapter inputs fail before any network request",
    async () => {
      const probe = new Probe("Hijala.native-object-guards");
      probe.registerInterceptor();
      try {
        await rejects(
          () => Hijala.getChapters("mimosa" as unknown as SourceManga),
          /native SourceManga/,
        );
        await rejects(
          () => Hijala.getChapters({ mangaId: "mimosa" } as SourceManga),
          /native SourceManga/,
        );
        await rejects(
          () => Hijala.getChapterDetails("chapter-56" as unknown as Chapter),
          /native Chapter/,
        );
        await rejects(
          () => Hijala.getChapterDetails({ chapterId: "chapter-56" } as Chapter),
          /native Chapter/,
        );
        expect(probe.requests.length).to.equal(0);
      } finally {
        probe.unregisterInterceptor();
      }
    },
  );
  suite.test("safety: pending cached discovery cannot survive a settings change", async () => {
    const source = new HijalaExtension(),
      probe = new Probe("Hijala.settings-race");
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    probe.gate = async (request, data) => {
      if (request.url === `${BASE_URL}/`) {
        started();
        await gate;
      }
      return data;
    };
    probe.registerInterceptor();
    const pending = source.getDiscoverSectionItems(SECTIONS[0]);
    try {
      await Promise.race([
        ready,
        pending.then(() => {
          throw new Error("Expected live response gate");
        }),
      ]);
      await settings.setExcludeNSFW(false);
      await settings.setExcludeNSFW(true);
      release();
      await rejects(() => pending, /settings changed/);
    } finally {
      release();
      probe.unregisterInterceptor();
    }
    const current = await source.getDiscoverSectionItems(SECTIONS[0]);
    expect(current.items).not.to.be.empty;
  });
  suite.test(
    "reader: live-derived malformed page order and duplicate URLs fail closed",
    async () => {
      const chapter = chapters.find((item) => item.chapterId === "chapter-56")!;
      for (const mode of ["negative-order", "duplicate-url"]) {
        const probe = new Probe(`Hijala.reader-${mode}`);
        probe.gate = async (request, data) => {
          if (request.url !== seriesUrl(chapter.sourceManga.mangaId, chapter.chapterId))
            return data;
          const text = Application.arrayBufferToUTF8String(data);
          const images = pageProperty<{ publicImages: { url: string; order: number }[] }>(
            text,
            "chapter",
          ).publicImages;
          expect(images.length).to.be.greaterThan(1);
          const start = text.indexOf("publicImages:");
          const changed =
            mode === "negative-order"
              ? text.slice(0, start) + text.slice(start).replace(/order:0(?=[,}])/, "order:-1")
              : text.slice(0, start) +
                text
                  .slice(start)
                  .replace(JSON.stringify(images[1].url), JSON.stringify(images[0].url));
          expect(changed).not.to.equal(text);
          const altered = pageProperty<{ publicImages: { url: string; order: number }[] }>(
            changed,
            "chapter",
          ).publicImages;
          if (mode === "negative-order") expect(altered[0].order).to.equal(-1);
          else expect(altered[1].url).to.equal(altered[0].url);
          return new TextEncoder().encode(changed).buffer as ArrayBuffer;
        };
        probe.registerInterceptor();
        try {
          await rejects(
            () => new HijalaExtension().getChapterDetails(chapter),
            /invalid page ordering|duplicate reader pages/,
          );
        } finally {
          probe.unregisterInterceptor();
        }
      }
    },
  );
  suite.test(
    "safety: parser never evaluates current site scripts or weakens access checks",
    async () => {
      const unsafe = home.replace(
        "latestReleaseFilters:",
        'latestReleaseFilters:(()=>{throw new Error("executed")})(),unused:',
      );
      expect(() => pageProperty(unsafe, "latestReleaseFilters")).to.throw(/unsupported|incomplete/);
      const paid = chapters.find((chapter) => chapter.additionalInfo?.locked === "true")!;
      const forced = { ...paid, additionalInfo: { locked: "false" } };
      await rejects(() => Hijala.getChapterDetails(forced), /requires access|no reader pages/);
    },
  );
  try {
    await suite.run();
  } finally {
    Application.setState(saved, "Hijala.preferences");
  }
}
