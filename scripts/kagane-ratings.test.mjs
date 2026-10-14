import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { ContentRating } from "@paperback/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../src/Kagane");
const require = createRequire(import.meta.url);
const ratings = ["safe", "suggestive", "erotica", "pornographic"];
const legacyRatings = ["Safe", "Suggestive", "Erotica", "Pornographic"];
const ages = ["Safe", "FifteenPlus", "EighteenPlus", "EighteenPlus"];
const paperbackRatings = [
  ContentRating.EVERYONE,
  ContentRating.MATURE,
  ContentRating.MATURE,
  ContentRating.ADULT,
];

function harness() {
  const state = new Map();
  const requests = [];
  const cache = new Map();
  const application = {
    getState: (key) => state.get(key),
    setState: (value, key) => state.set(key, value),
  };
  const context = {
    state,
    requests,
    content: [],
    last: true,
    pages: new Map(),
    details: new Map(),
    onSearch: undefined,
    load(relative) {
      return load(resolve(root, relative));
    },
  };

  async function fetchJSON(request) {
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname === "/api/v2/genres/list") return [];
    if (url.pathname === "/api/v2/sources/list") return { sources: [] };
    if (url.pathname === "/api/v2/search/series") {
      const page = Number(url.searchParams.get("page"));
      context.onSearch?.(page);
      if (context.pages.has(page)) return context.pages.get(page);
      return { content: context.content, last: context.last };
    }
    if (url.pathname.startsWith("/api/v2/series/")) {
      return context.details.get(url.pathname.split("/").pop()) ?? {};
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  }

  function load(path) {
    if (path === resolve(root, "services/network.ts")) return { fetchJSON };
    if (cache.has(path)) return cache.get(path).exports;
    const source = readFileSync(path, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: path,
    }).outputText;
    const module = { exports: {} };
    cache.set(path, module);
    const localRequire = (specifier) => {
      if (!specifier.startsWith(".")) return require(specifier);
      return load(resolve(dirname(path), specifier.replace(/\.(js|ts)$/, "") + ".ts"));
    };
    compileFunction(compiled, ["require", "module", "exports", "Application"], { filename: path })(
      localRequire,
      module,
      module.exports,
      application,
    );
    return module.exports;
  }

  return context;
}

function modernBook(index, overrides = {}) {
  return {
    series_id: ratings[index],
    title: legacyRatings[index],
    cover_image_id: `cover-${index}`,
    age_rating: ages[index],
    is_pornographic: index === 3,
    latest_chapters: [{ book_id: `chapter-${index}` }],
    ...overrides,
  };
}

function selections() {
  return Array.from({ length: 15 }, (_, mask) =>
    ratings.filter((_, index) => (mask + 1) & (1 << index)),
  );
}

void test("maps every exact rating selection to modern filters without losing legacy support", () => {
  const { buildContentRatingFilter } = harness().load("implementations/shared/rating.ts");
  for (const selected of selections()) {
    const filter = buildContentRatingFilter(selected);
    const indices = selected.map((rating) => ratings.indexOf(rating));
    assert.deepEqual(
      filter.content_rating,
      indices.map((index) => legacyRatings[index]),
    );
    assert.deepEqual(filter.age_rating, [...new Set(indices.map((index) => ages[index]))]);
    if (!selected.includes("pornographic")) assert.equal(filter.is_pornographic, false);
    else if (selected.length === 1) assert.equal(filter.is_pornographic, true);
    else assert.equal(Object.hasOwn(filter, "is_pornographic"), false);
  }
  assert.deepEqual(buildContentRatingFilter(["pornographic", "safe", "safe"]), {
    content_rating: ["Safe", "Pornographic"],
    age_rating: ["Safe", "EighteenPlus"],
  });
  assert.deepEqual(buildContentRatingFilter([]), {
    content_rating: [],
    age_rating: [],
    is_pornographic: false,
  });
});

void test("classifies modern and legacy ratings consistently and enforces exact selections", () => {
  const { getKaganeContentRating, getPaperbackBookContentRating, isContentRatingAllowed } =
    harness().load("implementations/shared/rating.ts");
  for (const [index, rating] of ratings.entries()) {
    for (const book of [modernBook(index), { content_rating: ` ${legacyRatings[index]} ` }]) {
      assert.equal(getKaganeContentRating(book), rating);
      assert.equal(getPaperbackBookContentRating(book), paperbackRatings[index]);
      for (const selected of selections()) {
        assert.equal(isContentRatingAllowed(book, selected), selected.includes(rating));
      }
      assert.equal(isContentRatingAllowed(book, []), false);
    }
  }
});

void test("rejects unknown, missing, malformed and conflicting rating metadata even with all selected", () => {
  const { getKaganeContentRating, getPaperbackBookContentRating, isContentRatingAllowed } =
    harness().load("implementations/shared/rating.ts");
  const malformed = [
    null,
    undefined,
    [],
    "Safe",
    {},
    { content_rating: null },
    { content_rating: 0 },
    { content_rating: "Unknown" },
    { age_rating: "Safe" },
    { is_pornographic: false },
    { age_rating: "Unknown", is_pornographic: false },
    { age_rating: "EighteenPlus", is_pornographic: "false" },
    { age_rating: "EighteenPlus", is_pornographic: null },
    { age_rating: "Safe", is_pornographic: true },
    { age_rating: "FifteenPlus", is_pornographic: true },
    { age_rating: null, content_rating: "Safe" },
    { age_rating: "Safe", content_rating: "Safe" },
    { age_rating: "Unknown", is_pornographic: false, content_rating: "Safe" },
    { age_rating: "EighteenPlus", is_pornographic: true, content_rating: "Safe" },
    { age_rating: "Safe", is_pornographic: false, content_rating: "Pornographic" },
  ];
  for (const book of malformed) {
    assert.equal(getKaganeContentRating(book), undefined, JSON.stringify(book));
    assert.equal(isContentRatingAllowed(book, ratings), false, JSON.stringify(book));
    assert.equal(getPaperbackBookContentRating(book), ContentRating.ADULT, JSON.stringify(book));
  }
  assert.equal(getKaganeContentRating({ ...modernBook(0), content_rating: "Safe" }), "safe");
});

void test("search defaults request only safe and suggestive without changing content languages", async () => {
  const app = harness();
  const { buildSearchBody } = app.load("implementations/search-results/main.ts");
  const metadata = { genres: {}, sources: [] };
  assert.deepEqual(await buildSearchBody({ title: "" }, metadata), {
    content_rating: ["Safe", "Suggestive"],
    age_rating: ["Safe", "FifteenPlus"],
    is_pornographic: false,
    content_lang: ["en"],
  });
  app.state.set("kagane-content-rating", ["safe", "pornographic"]);
  app.state.set("kagane-content-languages", ["en", "ja"]);
  assert.deepEqual(await buildSearchBody({ title: " Title " }, metadata), {
    content_rating: ["Safe", "Pornographic"],
    age_rating: ["Safe", "EighteenPlus"],
    content_lang: ["en", "ja"],
    title: "Title",
  });
});

void test("search filters ignored server results locally for every exact selection", async () => {
  const app = harness();
  app.content = [
    ...ratings.map((_, index) => modernBook(index)),
    ...ratings.map((_, index) => ({
      series_id: `legacy-${ratings[index]}`,
      title: legacyRatings[index],
      cover_image_id: `legacy-cover-${index}`,
      content_rating: legacyRatings[index],
    })),
    modernBook(0, { series_id: "unknown", age_rating: "Unknown" }),
    modernBook(0, { series_id: "missing-cover", cover_image_id: "" }),
    null,
  ];
  const { SearchProvider } = app.load("implementations/search-results/main.ts");
  const provider = new SearchProvider();
  for (const selected of selections()) {
    app.state.set("kagane-content-rating", selected);
    const result = await provider.getSearchResults({ title: "" });
    assert.deepEqual(
      result.items.map((item) => item.mangaId),
      [...selected, ...selected.map((rating) => `legacy-${rating}`)],
    );
    assert.deepEqual(
      result.items.map((item) => item.contentRating),
      [...selected, ...selected].map((rating) => paperbackRatings[ratings.indexOf(rating)]),
    );
  }
});

void test("filtered-out search pages preserve continuation and request-time settings", async () => {
  const app = harness();
  app.pages.set(1, { content: [modernBook(3)], last: false });
  app.pages.set(2, { content: [modernBook(2)], last: false });
  app.pages.set(3, { content: [modernBook(0)], last: false });
  app.onSearch = () => app.state.set("kagane-content-rating", ["pornographic"]);
  const { SearchProvider } = app.load("implementations/search-results/main.ts");
  const result = await new SearchProvider().getSearchResults({ title: "" }, { page: 2 });
  assert.deepEqual(
    result.items.map((item) => item.mangaId),
    ["safe"],
  );
  assert.deepEqual(result.metadata, { page: 5 });
  const searches = app.requests.filter((request) => request.url.includes("/search/series"));
  assert.deepEqual(
    searches.map((request) => new URL(request.url).searchParams.get("page")),
    ["1", "2", "3"],
  );
  for (const request of searches) {
    assert.deepEqual(JSON.parse(request.body).content_rating, ["Safe", "Suggestive"]);
  }
});

void test("blocked pages return empty only after the server confirms exhaustion", async () => {
  const app = harness();
  app.pages.set(0, { content: [modernBook(3)], last: false });
  app.pages.set(1, { content: [modernBook(2)], last: true });
  const { SearchProvider } = app.load("implementations/search-results/main.ts");
  const result = await new SearchProvider().getSearchResults({ title: "" });
  assert.deepEqual(result, { items: [], metadata: undefined });
  assert.equal(app.requests.filter((request) => request.url.includes("/search/series")).length, 2);
});

void test("repeated blocked pages and missing last status fail instead of silently truncating", async () => {
  const app = harness();
  app.content = [modernBook(3)];
  app.last = false;
  const { SearchProvider } = app.load("implementations/search-results/main.ts");
  const provider = new SearchProvider();
  await assert.rejects(provider.getSearchResults({ title: "" }), /pagination did not advance/);
  assert.equal(app.requests.filter((request) => request.url.includes("/search/series")).length, 2);
  app.last = undefined;
  await assert.rejects(provider.getSearchResults({ title: "" }), /pagination status/);
});

void test("nonempty pages require a boolean last status and malformed content cannot imply exhaustion", async () => {
  const app = harness();
  const { SearchProvider } = app.load("implementations/search-results/main.ts");
  const provider = new SearchProvider();
  for (const last of [undefined, null, "false", 0]) {
    app.pages.set(0, { content: [modernBook(0)], last });
    await assert.rejects(provider.getSearchResults({ title: "" }), /pagination status/);
  }
  for (const page of [null, undefined, {}, { last: true }, { content: {}, last: true }]) {
    app.pages.set(0, page);
    await assert.rejects(provider.getSearchResults({ title: "" }), /invalid result page/);
  }
});

void test("an unbounded stream of unique blocked pages fails explicitly at the safety cap", async () => {
  const app = harness();
  app.last = false;
  app.onSearch = (page) => {
    app.content = [modernBook(3, { series_id: `blocked-${page}` })];
  };
  const { SearchProvider } = app.load("implementations/search-results/main.ts");
  await assert.rejects(new SearchProvider().getSearchResults({ title: "" }), /safety limit/);
  assert.equal(app.requests.filter((request) => request.url.includes("/search/series")).length, 20);
});

void test("all discovery carousels advance through blocked pages, including nonpaged popular", async () => {
  const app = harness();
  app.pages.set(0, { content: [modernBook(3)], last: false });
  app.pages.set(1, { content: [modernBook(0)], last: false });
  const { DiscoverProvider } = app.load("implementations/discover-section/main.ts");
  const provider = new DiscoverProvider();
  for (const id of ["popular", "latest", "recently-added"]) {
    const result = await provider.getDiscoverSectionItems({ id });
    assert.deepEqual(
      result.items.map((item) => item.mangaId),
      ["safe"],
    );
    assert.deepEqual(result.metadata, id === "popular" ? undefined : { page: 3 });
  }
  const searches = app.requests.filter((request) => request.url.includes("/search/series"));
  assert.deepEqual(
    searches.map((request) => new URL(request.url).searchParams.get("page")),
    ["0", "1", "0", "1", "0", "1"],
  );
  assert.deepEqual(
    app.requests
      .filter((request) => new URL(request.url).pathname.startsWith("/api/v2/series/"))
      .map((request) => new URL(request.url).pathname.split("/").pop()),
    ["safe"],
  );
});

void test("popular reports real exhaustion but does not hide repeated blocked pages", async () => {
  const app = harness();
  app.pages.set(0, { content: [modernBook(3)], last: false });
  app.pages.set(1, { content: [modernBook(2)], last: true });
  const { DiscoverProvider } = app.load("implementations/discover-section/main.ts");
  const provider = new DiscoverProvider();
  assert.deepEqual(await provider.getDiscoverSectionItems({ id: "popular" }), {
    items: [],
    metadata: undefined,
  });
  app.pages.set(1, { content: [modernBook(3)], last: false });
  await assert.rejects(
    provider.getDiscoverSectionItems({ id: "popular" }),
    /pagination did not advance/,
  );
});

void test("all discovery carousels exclude unselected ratings before fetching featured details", async () => {
  const app = harness();
  app.state.set("kagane-content-rating", ["safe", "pornographic"]);
  app.content = [
    ...ratings.map((_, index) => modernBook(index)),
    modernBook(0, { series_id: "unknown", is_pornographic: null }),
  ];
  app.last = false;
  const { DiscoverProvider } = app.load("implementations/discover-section/main.ts");
  const provider = new DiscoverProvider();
  for (const id of ["popular", "latest", "recently-added"]) {
    const result = await provider.getDiscoverSectionItems({ id });
    assert.deepEqual(
      result.items.map((item) => item.mangaId),
      ["safe", "pornographic"],
    );
    assert.deepEqual(
      result.items.map((item) => item.contentRating),
      [ContentRating.EVERYONE, ContentRating.ADULT],
    );
    assert.deepEqual(result.metadata, id === "popular" ? undefined : { page: 2 });
  }
  assert.deepEqual(
    app.requests
      .filter((request) => new URL(request.url).pathname.startsWith("/api/v2/series/"))
      .map((request) => new URL(request.url).pathname.split("/").pop()),
    ["safe", "pornographic"],
  );
});

void test("manga details use modern Paperback classifications including explicit and unknown", () => {
  const { parseMangaDetails } = harness().load("implementations/manga/parsers.ts");
  for (const [index, expected] of paperbackRatings.entries()) {
    const details = { ...modernBook(index), upload_status: "Ongoing" };
    const result = parseMangaDetails("series", details, undefined, {});
    assert.equal(result.mangaInfo.contentRating, expected);
  }
  assert.equal(
    parseMangaDetails("series", { title: "Unknown", upload_status: "Ongoing" }, undefined, {})
      .mangaInfo.contentRating,
    ContentRating.ADULT,
  );
});

void test("featured cards omit unknown, conflicting, disallowed or different-rated enrichment", async () => {
  const app = harness();
  app.content = [modernBook(0)];
  const { DiscoverProvider } = app.load("implementations/discover-section/main.ts");
  const provider = new DiscoverProvider();
  const enrichment = {
    description: "Untrusted synopsis",
    series_staff: [{ name: "Untrusted author", role: "Author" }],
    average_rating: 8,
    total_views: 100,
  };
  for (const details of [
    modernBook(3),
    {},
    modernBook(0, { content_rating: "Pornographic" }),
    modernBook(1),
  ]) {
    app.details.set("safe", { ...enrichment, ...details });
    const result = await provider.getDiscoverSectionItems({ id: "popular" });
    assert.equal(result.items.length, 1);
    const card = result.items[0];
    assert.equal(card.mangaId, "safe");
    assert.equal(card.title, "Safe");
    assert.equal(card.contentRating, ContentRating.EVERYONE);
    assert.equal(card.summary, undefined);
    assert.equal(card.supertitle, undefined);
    assert.equal(card.infoItems, undefined);
  }
});

void test("matching featured enrichment retains request-time selection despite settings changes", async () => {
  const app = harness();
  app.content = [modernBook(0)];
  app.onSearch = () => app.state.set("kagane-content-rating", ["pornographic"]);
  const { DiscoverProvider } = app.load("implementations/discover-section/main.ts");
  const provider = new DiscoverProvider();
  for (const details of [modernBook(0), { content_rating: "Safe" }]) {
    app.state.set("kagane-content-rating", ["safe"]);
    app.details.set("safe", {
      ...details,
      description: "Matching synopsis",
      series_staff: [{ name: "Matching author", role: "Author" }],
      average_rating: 8,
    });
    const result = await provider.getDiscoverSectionItems({ id: "popular" });
    assert.equal(result.items[0].summary, "Matching synopsis");
    assert.equal(result.items[0].supertitle, "Matching author");
    assert.deepEqual(result.items[0].infoItems, [{ symbol: "star.fill", text: "8.0/10" }]);
    assert.equal(result.items[0].contentRating, ContentRating.EVERYONE);
  }
});
