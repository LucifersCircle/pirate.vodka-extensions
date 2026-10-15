import {
  PaperbackInterceptor,
  type Chapter,
  type Request,
  type Response,
  type SourceManga,
  type TestLogger,
} from "@paperback/types";
import { expect } from "chai";
import { TestSuite, registerDefaultTests } from "./suite.js";
import { Kagane, type KaganeImplementation } from "../Kagane/main.js";
import sourceInfo from "../Kagane/pbconfig.js";
import { API_URL, CONTENT_LANGUAGES_KEY } from "../Kagane/implementations/shared/models.js";
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
