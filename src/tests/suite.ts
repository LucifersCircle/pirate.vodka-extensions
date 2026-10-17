/* eslint-disable no-unused-expressions */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
// Runner/logger derived from @paperback/toolchain alpha.92 suite.template.ts.
// Custom contracts call the real SDK methods, with no alternate transport or mock source.
import {
  ContentRating,
  DiscoverSectionType,
  PaperbackInterceptor,
  SourceIntents,
  type AdvancedSearchForm,
  type Chapter,
  type ChapterDetails,
  type DiscoverSectionProviding,
  type Extension,
  type ExtensionInfo,
  type Form,
  type Metadata,
  type Request,
  type Response,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type ChapterProviding,
  type SourceManga,
  type TestLogger,
} from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { verifyRasterImageBytes } from "./image";

export class TestSuite {
  readonly state: Record<string, unknown> = {};
  private readonly notApplicable: { contract: string; reason: string }[] = [];
  na(contract: string, reason: string): void {
    this.notApplicable.push({ contract, reason });
  }
  private readonly tests: { name: string; fn: (logger: TestLogger) => Promise<void> }[] = [];
  constructor(
    name: string,
    private readonly logger: TestLogger,
  ) {
    logger.log("name", name);
  }
  test(name: string, fn: (logger: TestLogger) => Promise<void>): void {
    this.tests.push({ name, fn });
  }
  async run(): Promise<void> {
    const started = Date.now(),
      tests = this.logger.list("tests");
    let passed = 0,
      failed = 0;
    for (const test of this.tests) {
      const logger = tests.scope(test.name),
        start = Date.now();
      try {
        await test.fn(logger.scope("runner"));
        passed++;
        logger.log("status", "pass");
      } catch (error) {
        failed++;
        logger.log("status", "fail");
        logger.log("error", String(error));
      }
      logger.log("duration", Date.now() - start);
    }
    this.logger.log("notApplicable", this.notApplicable);
    this.logger.log("summary", {
      passed,
      failed,
      total: this.tests.length,
      duration: Date.now() - started,
    });
  }
}

export type NativeExtension = Extension &
  SearchResultsProviding &
  ChapterProviding &
  DiscoverSectionProviding &
  Partial<SettingsFormProviding>;
export type Capture = { request: Request; response: Response; data: ArrayBuffer };
export class NativeProbe extends PaperbackInterceptor {
  constructor(
    identifier: string,
    private readonly documentMaximum = 12,
  ) {
    super(identifier);
  }
  readonly requests: Request[] = [];
  readonly captures: Capture[] = [];
  readonly imageURLs = new Set<string>();
  noNetwork = false;
  private stopped = false;
  private blockedAttempts = 0;
  private refuse(message: string): never {
    this.blockedAttempts++;
    throw new Error(message);
  }
  override async interceptRequest(request: Request): Promise<Request> {
    this.requests.push(request);
    if (this.stopped) this.refuse("Native access prerequisite failed; no automatic retry.");
    if (this.noNetwork) this.refuse("Unexpected network request in local guard contract");
    const counts = this.counts();
    if (counts.documentAttempts > this.documentMaximum || counts.imageAttempts > 3)
      this.refuse(
        "Native request budget exceeded before dispatch; inventory is not accepted partially",
      );
    return request;
  }
  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    const mime = header(response, "content-type") ?? "";
    const challenge = header(response, "cf-mitigated") === "challenge";
    if (response.status === 401 || response.status === 403 || challenge) this.stopped = true;
    this.captures.push({ request, response, data });
    if (/^image\//i.test(mime)) this.imageURLs.add(request.url);
    return data;
  }
  requireAccess(): void {
    if (this.stopped) throw new Error("Native access prerequisite failed; no automatic retry.");
  }
  find(match: (capture: Capture) => boolean): Capture {
    const capture = this.captures.findLast(match);
    if (!capture) throw new Error("Missing successful consumed native response prerequisite");
    expect(capture.response.status).to.equal(200);
    return capture;
  }
  text(match: (capture: Capture) => boolean): string {
    return Application.arrayBufferToUTF8String(this.find(match).data);
  }
  json<T>(match: (capture: Capture) => boolean): T {
    return JSON.parse(this.text(match)) as T;
  }
  counts() {
    const images = this.requests.filter((request) => this.imageURLs.has(request.url)).length;
    return {
      documentAttempts: this.requests.length - images,
      imageAttempts: images,
      totalAttempts: this.requests.length,
      blockedAttempts: this.blockedAttempts,
    };
  }
}
export type NativeContext = {
  extension: NativeExtension;
  probe: NativeProbe;
  logger: TestLogger;
  source?: SourceManga;
  chapters?: Chapter[];
  chapter?: Chapter;
  reader?: ChapterDetails;
};
export type NativeContractOptions = {
  discoverySectionId: string;
  query?: SearchQuery<Metadata>;
  mangaId?: string;
  // Optional fixed detail/inventory canary, independent of the catalog search round-trip.
  detailMangaId?: string;
  chooseResult?: (items: SearchResultItem[]) => SearchResultItem;
  chooseChapter?: (chapters: Chapter[]) => Chapter;
  // Assertions use the responses the normal methods consumed, never fresh oracle fetches.
  assertInventory: (context: NativeContext & { source: SourceManga; chapters: Chapter[] }) => void;
  assertReader?: (context: NativeContext & { chapter: Chapter; reader: ChapterDetails }) => void;
  filter?: (form: AdvancedSearchForm, context: NativeContext) => Promise<SearchQuery<Metadata>>;
  prepareForms?: () => Promise<void>;
  assertFiltered?: (
    context: NativeContext & { query: SearchQuery<Metadata>; items: SearchResultItem[] },
  ) => void;
  guard: (context: NativeContext) => Promise<void>;
  documentBudget?: { maximum: number; reason: string };
};
const header = (response: Response, name: string): string | undefined =>
  Object.entries(response.headers)
    .find(([key]) => key.toLowerCase() === name)?.[1]
    ?.trim();
const text = (value: unknown, label: string): void => {
  expect(typeof value === "string" && value.trim().length > 0, label).to.equal(true);
};
const https = (value: unknown): void => {
  expect(
    typeof value === "string" && /^https:\/\/[^\s]+$/.test(value),
    "native HTTPS URL",
  ).to.equal(true);
};
const rows = (items: SearchResultItem[]): void => {
  expect(items).to.be.an("array");
  expect(new Set(items.map((item) => item.mangaId)).size, "unique card IDs").to.equal(items.length);
  for (const item of items) {
    text(item.mangaId, "card ID");
    text(item.title, "card title");
    https(item.imageUrl);
  }
};
export async function rejects(operation: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  let failure: unknown;
  try {
    await operation();
  } catch (error) {
    failure = error;
  }
  expect(failure, "operation must fail closed").not.to.equal(undefined);
  expect(String(failure)).not.to.match(/Unexpected network request/);
  expect(String(failure)).to.match(pattern);
}
export function assertChapterDetails(details: ChapterDetails, chapter: Chapter): void {
  expect(details.id).to.equal(chapter.chapterId);
  expect(details.mangaId).to.equal(chapter.sourceManga.mangaId);
  if (chapter.sourceManga.mangaInfo.contentType === "novel") expect(details.type).to.equal("html");
  if (details.type === "html") {
    expect(chapter.sourceManga.mangaInfo.contentType).to.equal("novel");
    const $ = cheerio.load(details.html);
    $("script,style,template,[hidden],[aria-hidden='true']").remove();
    $("[style]").each((_, element) => {
      if (
        /(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:\s*!important)?\s*(?:;|$)/i.test(
          $(element).attr("style") ?? "",
        )
      )
        $(element).remove();
    });
    expect($("body").text().trim().length > 0, "native visible novel text").to.equal(true);
  } else {
    if (!("pages" in details)) throw new Error("Expected native image reader");
    expect(details.pages).to.be.an("array").and.not.empty;
    expect(new Set(details.pages).size, "unique ordered native pages").to.equal(
      details.pages.length,
    );
    for (const page of details.pages) https(page);
  }
}
// Full GET, no Range, complete transfer plus supported image framing. Never log signed URLs.
export async function assertImage(url: string, probe: NativeProbe) {
  https(url);
  probe.imageURLs.add(url);
  const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
  expect(response.status, "image HTTP status").to.equal(200);
  const mime = header(response, "content-type") ?? "";
  const binary = /^application\/octet-stream(?:;|$)/i.test(mime);
  expect(/^image\//i.test(mime) || binary, "image MIME or validated native binary cover").to.equal(
    true,
  );
  const bytes = new Uint8Array(data);
  expect(bytes.length, "complete image bytes").to.be.greaterThan(100);
  const length = header(response, "content-length"),
    encoding = header(response, "content-encoding");
  const identity = !encoding || encoding === "identity";
  if (length !== undefined) {
    expect(
      /^\d+$/.test(length) && Number.isSafeInteger(Number(length)),
      "valid Content-Length",
    ).to.equal(true);
    if (identity) expect(bytes.length, "complete transfer").to.equal(Number(length));
  }
  const measured = verifyRasterImageBytes(bytes);
  if (!binary)
    expect(mime.toLowerCase().split(";")[0].trim(), "MIME matches native image bytes").to.equal(
      { JPEG: "image/jpeg", PNG: "image/png", WebP: "image/webp" }[measured.format],
    );
  return { bytes: bytes.length, ...measured };
}
async function assertForm(form: Form): Promise<void> {
  // Compatibility forms resolve cached native taxonomy asynchronously. Never accept Loading/Error as a valid form.
  for (let i = 0; i < 100 && form.getSections().some((section) => section.id === "loading"); i++)
    await Promise.resolve();
  const sections = form.getSections();
  expect(sections).to.be.an("array").and.not.empty;
  expect(new Set(sections.map((section) => section.id)).size).to.equal(sections.length);
  for (const section of sections) {
    text(section.id, "form section ID");
    expect(["loading", "error"].includes(section.id), "form has loaded successfully").to.equal(
      false,
    );
    expect(["listSection", "flowSection"]).to.include(section.type);
    expect(section.items).to.be.an("array");
    expect(new Set(section.items.map((item) => item.id)).size).to.equal(section.items.length);
    for (const item of section.items) {
      // Native SelectSection deliberately permits the empty string for an All option.
      expect(item.id, "native string form item ID").to.be.a("string");
      expect(
        [
          "labelRow",
          "oauthButtonRow",
          "navigationRow",
          "buttonRow",
          "toggleRow",
          "inputRow",
          "stepperRow",
          "webViewRow",
        ],
        "native form item variant",
      ).to.include(item.type);
      expect("title" in item, "native form item title").to.equal(true);
      if ("title" in item) text(item.title, "form item title");
      expect(item.isHidden, "native visibility flag").to.be.a("boolean");
    }
  }
}

export function registerNativeContracts(
  suite: TestSuite,
  extension: NativeExtension,
  info: ExtensionInfo,
  options: NativeContractOptions,
): NativeProbe {
  const probe = new NativeProbe(
    `${info.name}.compact-native-evidence`,
    options.documentBudget?.maximum ?? 12,
  );
  let initialized = false,
    selected: SearchResultItem | undefined;
  const caps = Array.isArray(info.capabilities)
    ? info.capabilities.reduce((a, b) => a | b, 0)
    : info.capabilities;
  const context = (logger: TestLogger): NativeContext => ({
    extension,
    probe,
    logger,
    source: suite.state.source as SourceManga | undefined,
    chapters: suite.state.chapters as Chapter[] | undefined,
    chapter: suite.state.chapter as Chapter | undefined,
    reader: suite.state.reader as ChapterDetails | undefined,
  });
  const test = (name: string, fn: (logger: TestLogger) => Promise<void>) =>
    suite.test(name, async (logger) => {
      expect(initialized, "initialisation prerequisite").to.equal(true);
      probe.requireAccess();
      const before = probe.counts();
      try {
        await fn(logger);
      } finally {
        const after = probe.counts();
        logger.log("requests", {
          documents: after.documentAttempts - before.documentAttempts,
          images: after.imageAttempts - before.imageAttempts,
        });
      }
    });
  suite.test("01 initialise and advertised native methods", async () => {
    probe.registerInterceptor();
    text(info.name, "extension name");
    text(info.version, "extension version");
    for (const method of ["initialise", "getMangaDetails"])
      expect(typeof extension[method as keyof NativeExtension], method).to.equal("function");
    const advertised: [SourceIntents, string[]][] = [
      [SourceIntents.CHAPTER_PROVIDING, ["getChapters", "getChapterDetails"]],
      [
        SourceIntents.DISCOVER_SECTION_PROVIDING,
        ["getDiscoverSections", "getDiscoverSectionItems"],
      ],
      [SourceIntents.SEARCH_RESULT_PROVIDING, ["getSearchResults"]],
      [SourceIntents.SETTINGS_FORM_PROVIDING, ["getSettingsForm"]],
    ];
    for (const [intent, methods] of advertised)
      if (caps & intent)
        for (const method of methods)
          expect(
            typeof extension[method as keyof NativeExtension],
            `advertised ${method}`,
          ).to.equal("function");
    const supported = advertised.reduce(
      (mask, [intent]) => mask | intent,
      SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
    );
    expect(caps & ~supported, "unsupported advertised capability needs a native contract").to.equal(
      0,
    );
    // alpha.92 declares both Cloudflare completion hooks optional. Advertising the
    // system bypass UI does not require a custom callback or permission to solve it.
    if (caps & SourceIntents.CLOUDFLARE_BYPASS_PROVIDING) {
      const hooks = extension as unknown as Record<string, unknown>;
      for (const name of ["cloudflareBypassCompleted", "saveCloudflareBypassCookies"])
        if (hooks[name] !== undefined) expect(typeof hooks[name], name).to.equal("function");
    }
    // Keep observer first: alpha.92 passes the original request to each interceptor.
    // Moving this no-op observer last would discard source-created header copies.
    await extension.initialise();
    initialized = true;
  });
  if (caps & SourceIntents.DISCOVER_SECTION_PROVIDING)
    test("02 discover schema and one content section", async (logger) => {
      const sections = await extension.getDiscoverSections();
      expect(sections).to.be.an("array").and.not.empty;
      expect(new Set(sections.map((section) => section.id)).size).to.equal(sections.length);
      for (const section of sections) {
        text(section.id, "section ID");
        text(section.title, "section title");
        expect(typeof section.type, "native section enum").to.equal("number");
        expect(Object.values(DiscoverSectionType), "native section type").to.include(section.type);
      }
      const section = sections.find((entry) => entry.id === options.discoverySectionId);
      expect(section, "explicit content section").not.to.equal(undefined);
      const result = await extension.getDiscoverSectionItems(section!);
      for (const item of result.items)
        expect(
          [
            "featuredCarouselItem",
            "simpleCarouselItem",
            "prominentCarouselItem",
            "chapterUpdatesCarouselItem",
          ],
          "native content-card variant",
        ).to.include(item.type);
      rows(result.items as SearchResultItem[]);
      expect(result.items).not.empty;
      logger.log("coverage", {
        advertisedSections: sections.length,
        exercisedSections: [section!.id],
        items: result.items.length,
      });
    });
  if (caps & SourceIntents.SEARCH_RESULT_PROVIDING)
    test("03 search schema, exact title identity and one continuation", async (logger) => {
      const query = options.query ?? { title: "" };
      const first = await extension.getSearchResults(query, undefined, undefined);
      rows(first.items);
      expect(first.items).not.empty;
      selected = options.mangaId
        ? first.items.find((item) => item.mangaId === options.mangaId)
        : (options.chooseResult?.(first.items) ?? first.items[0]);
      expect(selected, "search must expose the canonical sample ID").not.to.equal(undefined);
      const exact = await extension.getSearchResults(
        { title: selected!.title },
        undefined,
        undefined,
      );
      rows(exact.items);
      expect(
        exact.items.some((item) => item.mangaId === selected!.mangaId),
        "exact displayed title returns the same ID",
      ).to.equal(true);
      if (first.metadata != null) {
        const next = await extension.getSearchResults(query, first.metadata, undefined);
        rows(next.items);
        if (next.items.length)
          expect(
            next.items.some(
              (item) => !first.items.some((previous) => previous.mangaId === item.mangaId),
            ),
            "continuation provides a new native ID",
          ).to.equal(true);
        expect(
          next.items.length > 0 || next.metadata == null,
          "continuation makes progress or terminates",
        ).to.equal(true);
        expect(
          next.metadata == null || JSON.stringify(next.metadata) !== JSON.stringify(first.metadata),
          "continuation advances",
        ).to.equal(true);
        logger.log("continuation", { status: "exercised", items: next.items.length });
      } else logger.log("continuation", "N/A: source offered no next page for this query");
    });
  test("04 native details identity, schema and complete cover bytes", async (logger) => {
    expect(selected, "search prerequisite").not.to.equal(undefined);
    const mangaId = options.detailMangaId ?? selected!.mangaId;
    const source = await extension.getMangaDetails(mangaId);
    suite.state.source = source;
    expect(source.mangaId).to.equal(mangaId);
    text(source.mangaInfo.primaryTitle, "detail title");
    expect(source.mangaInfo.synopsis).to.be.a("string");
    expect(source.mangaInfo.secondaryTitles).to.be.an("array");
    for (const title of source.mangaInfo.secondaryTitles) text(title, "secondary title");
    expect(Object.values(ContentRating), "native content rating").to.include(
      source.mangaInfo.contentRating,
    );
    https(source.mangaInfo.thumbnailUrl);
    if (source.mangaInfo.rating !== undefined) expect(source.mangaInfo.rating).to.be.within(0, 1);
    logger.log("cover", await assertImage(source.mangaInfo.thumbnailUrl, probe));
  });
  if (caps & SourceIntents.CHAPTER_PROVIDING)
    test("05 complete native chapter inventory, references and order", async (logger) => {
      const ctx = context(logger);
      expect(ctx.source, "details prerequisite").not.to.equal(undefined);
      const source = ctx.source!,
        chapters = await extension.getChapters(source);
      expect(chapters).to.be.an("array").and.not.empty;
      expect(new Set(chapters.map((chapter) => chapter.chapterId)).size).to.equal(chapters.length);
      for (const chapter of chapters) {
        text(chapter.chapterId, "chapter ID");
        text(chapter.langCode, "chapter language");
        expect(chapter.sourceManga, "exact native SourceManga reference").to.equal(source);
        expect(Number.isFinite(chapter.chapNum), "finite chapter number").to.equal(true);
        if (chapter.publishDate !== undefined)
          expect(
            Number.isFinite(Date.prototype.getTime.call(chapter.publishDate)),
            "native Date brand and valid publish date",
          ).to.equal(true);
        if (chapter.sortingIndex !== undefined)
          expect(Number.isFinite(chapter.sortingIndex)).to.equal(true);
      }
      options.assertInventory({ ...ctx, source, chapters });
      suite.state.chapters = chapters;
      logger.log("inventory", { complete: true, chapters: chapters.length });
    });
  if (caps & SourceIntents.CHAPTER_PROVIDING)
    test("06 native reader identity and real first/last images or novel text", async (logger) => {
      const ctx = context(logger);
      expect(ctx.chapters, "complete inventory prerequisite").not.to.equal(undefined);
      const chapter =
        options.chooseChapter?.(ctx.chapters!) ??
        ctx.chapters!.find((entry) => entry.additionalInfo?.locked !== "true");
      expect(chapter, "public chapter").not.to.equal(undefined);
      expect(ctx.chapters!.includes(chapter!), "original native Chapter object").to.equal(true);
      const reader = await extension.getChapterDetails(chapter!);
      assertChapterDetails(reader, chapter!);
      suite.state.chapter = chapter;
      suite.state.reader = reader;
      options.assertReader?.({ ...ctx, chapter: chapter!, reader });
      if ("pages" in reader) {
        const evidence = [];
        for (const url of new Set([reader.pages[0], reader.pages.at(-1)!]))
          evidence.push(await assertImage(url, probe));
        logger.log("reader", {
          type: "images",
          manifestPages: reader.pages.length,
          transfers: evidence,
        });
      } else logger.log("reader", { type: "html", visibleText: true });
    });
  if (
    caps & SourceIntents.SETTINGS_FORM_PROVIDING ||
    extension.getAdvancedSearchForm ||
    extension.getSortingOptions
  )
    test("07 advertised forms, sorts and one representative filter roundtrip", async (logger) => {
      const hasSettings = !!(caps & SourceIntents.SETTINGS_FORM_PROVIDING);
      if (hasSettings) await assertForm(await extension.getSettingsForm!());
      else logger.log("settings", "N/A: not advertised");
      let representativeSort: SortingOption | undefined;
      if (extension.getSortingOptions) {
        const sorts = await extension.getSortingOptions({ title: "" });
        expect(sorts).to.be.an("array");
        expect(new Set(sorts.map((sort) => sort.id)).size).to.equal(sorts.length);
        for (const sort of sorts) {
          expect(sort.id).to.be.a("string");
          text(sort.label, "sort label");
        }
        representativeSort = sorts[0];
        logger.log("sortOptions", sorts.length);
      } else logger.log("sorts", "N/A: optional method absent");
      if (extension.getAdvancedSearchForm) {
        await options.prepareForms?.();
        const form = await extension.getAdvancedSearchForm({ title: "" });
        await assertForm(form);
        expect(options.filter, "advanced form needs a representative native filter").to.be.a(
          "function",
        );
        const query = await options.filter!(form, context(logger));
        await form.formDidSubmit();
        expect(query.metadata).to.deep.equal(form.getSearchQueryMetadata());
        const result = await extension.getSearchResults(query, undefined, representativeSort);
        rows(result.items);
        options.assertFiltered?.({ ...context(logger), query, items: result.items });
        logger.log("filter", { status: "exercised", results: result.items.length });
      } else logger.log("advancedFilter", "N/A: optional method absent");
    });
  suite.test("08 fail-closed ownership/policy guard and request budget", async (logger) => {
    expect(initialized, "initialisation prerequisite").to.equal(true);
    const before = probe.requests.length;
    probe.noNetwork = true;
    try {
      await options.guard(context(logger));
    } finally {
      probe.noNetwork = false;
    }
    expect(probe.requests.length, "guard makes zero live requests").to.equal(before);
    const counts = probe.counts(),
      maximum = options.documentBudget?.maximum ?? 12;
    logger.log("requestBudget", {
      ...counts,
      documentTarget: 12,
      documentMaximum: maximum,
      imageMaximum: 3,
      ...(options.documentBudget ? { exception: options.documentBudget.reason } : {}),
    });
    expect(maximum).to.be.at.most(20);
    expect(
      counts.documentAttempts,
      "document/API budget (complete inventories are never truncated)",
    ).to.be.at.most(maximum);
    expect(counts.imageAttempts, "cover plus first/last unique reader images").to.be.at.most(3);
  });
  if (
    !(
      caps & SourceIntents.SETTINGS_FORM_PROVIDING ||
      extension.getAdvancedSearchForm ||
      extension.getSortingOptions
    )
  )
    suite.na("07 controls", "Settings, advanced filters and sorting are not advertised");
  if (!(caps & SourceIntents.DISCOVER_SECTION_PROVIDING))
    suite.na("02 discover", "Discovery not advertised");
  if (!(caps & SourceIntents.SEARCH_RESULT_PROVIDING))
    suite.na("03 search", "Search not advertised");
  if (!(caps & SourceIntents.CHAPTER_PROVIDING))
    suite.na("05 inventory / 06 reader", "Chapters not advertised");
  return probe;
}
