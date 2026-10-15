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
    if (request.url.startsWith(`${API_URL}/api/v2/series/`) && response.status === 200)
      this.captures.set(request.url, [response, data]);
    return data;
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
