/* eslint-disable no-unused-expressions */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  ContentRating,
  PaperbackInterceptor,
  SourceIntents,
  SelectForm,
  type Chapter,
  type ChapterDetails,
  type DiscoverSectionItem,
  type Metadata,
  type Request,
  type Response,
  type SearchResultItem,
  type SourceManga,
  type TestLogger,
} from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { Noveli, NoveliExtension } from "../Noveli/main.js";
import sourceInfo from "../Noveli/pbconfig.js";
import { NoveliSearchForm } from "../Noveli/forms.js";
import { assertPublic } from "../Noveli/models.js";
import { assertChapterDetails, TestSuite } from "./suite.js";

const BASE = "https://noveli.to";
const SAMPLE = "432";
const TITLE = "Forty Millenniums of Cultivation";
const SEARCH = "Forty Millenniums";
const SORT_IDS = ["popular", "trending", "rating", "newest", "chapters", "az"];
const HOME = [
  ["translatedRanking", "Translated by Novelito"],
  ["trendingRanking", "Trending Novels"],
  ["recentlyUpdated", "Latest Chapter Updates"],
  ["topRated", "Top Rated by Readers"],
  ["completedRanking", "Completed & Bingeable"],
  ["catalog", "Explore Web Novels"],
];
type RawNovel = {
  id: number; title: string; slug: string; cover_image: string; author: string;
  description: string; genres?: string[]; tags?: string[]; status: string;
  associated_names?: string[] | string; rating: number; rating_count: number;
  type?: string; original_language?: string; chapter_count: number;
};
type RawChapter = {
  id: number; novel_id: number; chapter_number: number; title: string; slug: string;
};
type RawParagraph = { id: string; text: string; html: string; isHoneypot?: boolean };
type RawReader = {
  success: boolean;
  chapter: RawChapter & { paragraphs: RawParagraph[] };
  novel: { id: number; slug: string };
};
type Capture = { request: Request; response: Response; body: string };
// Diagnostics are a finite summary, never response bodies, arbitrary headers or URLs.
const responseDiagnostic = (response: Response, data: ArrayBuffer, body: string) => {
  const header = (name: string) => Object.entries(response.headers).find(([key]) => key.toLowerCase() === name)?.[1];
  const declaredMime = (header("content-type") ?? response.mimeType ?? "").split(";")[0].trim().toLowerCase();
  const mime = ["application/json", "text/html", "text/plain", "application/xhtml+xml", "image/jpeg", "image/png", "image/webp", "image/avif"].includes(declaredMime) ? declaredMime : declaredMime ? "other" : "absent";
  const cfMitigatedChallenge = header("cf-mitigated")?.trim().toLowerCase() === "challenge";
  let classification: "challenge" | "access-denied" | "json" | "shell" | "unknown" = "unknown";
  let json: unknown;
  try { json = JSON.parse(body); classification = "json"; } catch { /* No rejected body enters an error message. */ }
  const pending: unknown[] = [json];
  let nativeDenial = false;
  while (pending.length && !nativeDenial) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    try { if (!Array.isArray(value)) assertPublic(value as Record<string, unknown>); }
    catch { nativeDenial = true; }
    pending.push(...Object.values(value));
  }
  const sample = body.slice(0, 32768);
  if (cfMitigatedChallenge || (classification !== "json" && /(?:\/cdn-cgi\/challenge-platform\/|<title[^>]*>\s*Just a moment(?:\.{3}|…)?\s*<\/title>)/i.test(sample))) classification = "challenge";
  else if (nativeDenial || /^\s*(?:error code:\s*(?:1010|1020)|access denied|forbidden|unauthorized)\s*[.!]?\s*$/i.test(body) || (classification !== "json" && /<title[^>]*>\s*(?:Access denied|Forbidden|Unauthorized)(?:\s*[|:-][^<]*)?\s*<\/title>/i.test(sample)) ||
      (json && typeof json === "object" && !Array.isArray(json) && (json as Record<string, unknown>).success !== true &&
        ["message", "error"].some((key) => typeof (json as Record<string, unknown>)[key] === "string" && /^(?:access denied|forbidden|unauthorized)(?:[.!:\s]|$)/i.test(((json as Record<string, unknown>)[key] as string).trim())))) classification = "access-denied";
  else if (classification !== "json" && /<!doctype\s+html|<html\b|<body\b|<div\b[^>]*\bid=["'](?:root|app)["']/i.test(sample)) classification = "shell";
  let bodyMD5: string | undefined;
  try { const hash = Application.crypto_md5Hash(data); if (/^[a-f0-9]{32}$/i.test(hash)) bodyMD5 = hash; } catch { /* Hashing is optional diagnostic evidence. */ }
  return { status: Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null,
    mime, cfMitigatedChallenge, cfRayPresent: header("cf-ray") !== undefined, serverCloudflare: header("server")?.trim().toLowerCase() === "cloudflare",
    classification, byteLength: data.byteLength, ...(bodyMD5 ? { bodyMD5 } : {}) };
};
// Observe the same native response before production rejects it. Only successful JSON
// can become a later test oracle; rejected body snippets must never reach JSON errors.
class Probe extends PaperbackInterceptor {
  private accessStopped = false;
  constructor(id: string, private logger: TestLogger) { super(id); }
  readonly requests: Request[] = [];
  readonly responses: Capture[] = [];
  requireAccess(): void {
    if (this.accessStopped) throw new Error("Noveli diagnostic access stopped after the first access failure; prerequisite unavailable.");
  }
  override async interceptRequest(request: Request): Promise<Request> {
    if (request.url.startsWith(`${BASE}/`)) {
      this.requireAccess();
      this.requests.push(request);
    }
    return request;
  }
  override async interceptResponse(request: Request, response: Response, data: ArrayBuffer): Promise<ArrayBuffer> {
    if (request.url.startsWith(`${BASE}/`)) {
      let body = "";
      if (request.url.startsWith(`${BASE}/api/`) || response.status !== 200) {
        try { body = Application.arrayBufferToUTF8String(data); } catch { /* Binary/undecodable failures remain unknown. */ }
      }
      const diagnostic = responseDiagnostic(response, data, body);
      if (response.status === 401 || response.status === 403 || diagnostic.classification === "challenge" || diagnostic.classification === "access-denied") this.accessStopped = true;
      this.logger.list("nativeResponseDiagnostics").scope("response").log("evidence", { ...diagnostic, accessStopped: this.accessStopped });
      if (request.url.startsWith(`${BASE}/api/`) && response.status === 200 && diagnostic.classification === "json")
        this.responses.push({ request, response, body });
    }
    return data;
  }
  find(path: string): Capture {
    const capture = this.responses.find(({ request }) => new globalThis.URL(request.url).pathname === path);
    if (!capture) throw new Error("Unmet Noveli prerequisite: successful native response unavailable.");
    return capture;
  }
}
const buffer = (value: unknown): ArrayBuffer => new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
const raw = <T>(capture: Capture | undefined): T => {
  if (!capture) throw new Error("Unmet Noveli prerequisite: successful native response unavailable.");
  return JSON.parse(capture.body) as T;
};
const cards = (items: (DiscoverSectionItem | SearchResultItem)[]) => items.map((item) => {
  if (!("mangaId" in item)) throw new Error("Expected a native novel card");
  return { mangaId: item.mangaId, title: item.title, imageUrl: item.imageUrl };
});
const expectedCards = (novels: RawNovel[]) => novels.map((novel) => ({
  mangaId: String(novel.id), title: novel.title,
  imageUrl: novel.cover_image.startsWith("/") ? BASE + novel.cover_image : novel.cover_image,
}));
const rejects = async (operation: () => Promise<unknown>, pattern: RegExp) => {
  let failure: unknown;
  try { await operation(); } catch (error) { failure = error; }
  expect(String(failure)).not.to.match(/Unexpected (?:replay route|network request|additional request)/);
  expect(String(failure)).to.match(pattern);
};
// Source-local use of the existing native image contract: HTTP, MIME and real magic bytes.
const assertCoverBytes = async (url: string) => {
  const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
  expect(response.status).to.equal(200);
  expect(Object.entries(response.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1]).to.match(/^image\//i);
  const bytes = new Uint8Array(data), magic = String.fromCharCode(...bytes.slice(0, 16));
  expect(bytes.length).to.be.greaterThan(100);
  expect((bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    magic.startsWith("\x89PNG\r\n\x1a\n") || magic.startsWith("GIF8") ||
    (magic.startsWith("RIFF") && magic.slice(8, 12) === "WEBP") || /^....ftypavi[fs]/s.test(magic),
  "Cover contains supported image bytes").to.equal(true);
};
function assertReader(reader: ChapterDetails, chapter: Chapter, payload: RawReader) {
  assertChapterDetails(reader, chapter);
  if (reader.type !== "html") throw new Error("Expected native HTML novel reader");
  expect(payload.success).to.equal(true);
  expect(String(payload.chapter.id)).to.equal(chapter.chapterId);
  expect(String(payload.chapter.novel_id)).to.equal(chapter.sourceManga.mangaId);
  expect(String(payload.novel.id)).to.equal(chapter.sourceManga.mangaId);
  const $ = cheerio.load(reader.html);
  expect($("script,iframe,object,embed,img,audio,video,link").length).to.equal(0);
  const paragraphs = $("body p").toArray();
  expect(paragraphs).to.have.length(payload.chapter.paragraphs.length);
  expect(new Set(paragraphs.map((node) => $(node).attr("id"))).size).to.equal(paragraphs.length);
  payload.chapter.paragraphs.forEach((paragraph, index) => {
    const element = $(paragraphs[index]);
    expect(element.attr("id"), `Paragraph identity/order ${index}`).to.equal(paragraph.id);
    const text = element.clone();
    text.find("br").replaceWith("\n");
    // Boolean assertions keep prose out of diagnostic errors even if equality fails.
    expect(text.text() === paragraph.text.replace(/\r\n?/g, "\n"), `Exact paragraph text ${index}`).to.equal(true);
    expect(element.children().toArray().every((child) => child.tagName === "br"), `Escaped paragraph markup ${index}`).to.equal(true);
    if (paragraph.isHoneypot === true) {
      expect(element.attr("hidden")).to.equal("hidden");
      expect(element.attr("aria-hidden")).to.equal("true");
      expect(element.attr("style")).to.equal("display:none");
    } else {
      expect(element.attr("hidden")).to.equal(undefined);
      expect(element.attr("aria-hidden")).to.equal(undefined);
    }
  });
  const visible = payload.chapter.paragraphs.filter((paragraph) => !paragraph.isHoneypot);
  expect(visible.length).to.be.greaterThan(1);
  expect(visible.some((paragraph) => /provided by noveli\.to/i.test(paragraph.text)), "Provider attribution preserved").to.equal(true);
  expect(visible.some((paragraph) => /support.*free releases.*noveli\.to/i.test(paragraph.text)), "Closing provider credit preserved").to.equal(true);
}

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Noveli tests", logger);
  const probe = new Probe("Noveli.native-test-evidence", logger);
  // A stopped prerequisite remains a failed test, never a skip or a fake pass.
  const test = (name: string, operation: () => Promise<void>) => suite.test(name, async () => {
    probe.requireAccess();
    await operation();
  });
  let source: SourceManga;
  let chapters: Chapter[];
  let catalog: Awaited<ReturnType<typeof Noveli.getSearchResults>>;
  let firstReader: ChapterDetails;
  const rankingRows = new Map<string, Awaited<ReturnType<typeof Noveli.getDiscoverSectionItems>>>();
  const replay = async (captures: Capture[], mutate: (payload: Record<string, unknown>, request: Request) => void, operation: (extension: NoveliExtension) => Promise<void>) => {
    const schedule = Application.scheduleRequest, requestCount = probe.requests.length;
    try {
      const replacement: typeof schedule = async (request) => {
        const capture = captures.find((entry) => entry.request.url === request.url);
        if (!capture) throw new Error(`Unexpected replay route: ${new globalThis.URL(request.url).pathname}`);
        const payload = raw<Record<string, unknown>>(capture);
        mutate(payload, request);
        return [capture.response, buffer(payload)];
      };
      Application.scheduleRequest = replacement;
      if (Application.scheduleRequest !== replacement) throw new Error("Native runtime cannot replace scheduleRequest");
      await operation(new NoveliExtension());
      expect(probe.requests.length).to.equal(requestCount);
    } finally {
      Application.scheduleRequest = schedule;
      // Fresh mutation instances do not initialise, but restore the real singleton
      // registrations explicitly before any later native media/discovery callbacks.
      await Noveli.initialise();
      probe.registerInterceptor();
    }
  };

  test("initialisation: pinned native capabilities and metadata", async () => {
    await Noveli.initialise();
    // alpha.92 invokes response interceptors in reverse registration order.
    // Register last to observe, not alter, the same response before source rejection.
    probe.registerInterceptor();
    expect(sourceInfo.name).to.equal("Noveli");
    expect(sourceInfo.capabilities).to.include(SourceIntents.CHAPTER_PROVIDING);
    expect(sourceInfo.capabilities).to.include(SourceIntents.SEARCH_RESULT_PROVIDING);
    expect(sourceInfo.capabilities).to.include(SourceIntents.DISCOVER_SECTION_PROVIDING);
  });
  test("getSortingOptions: all six source-supported sorts", async () => {
    expect((await Noveli.getSortingOptions({ title: "" })).map((sort) => sort.id)).to.deep.equal(SORT_IDS);
  });
  test("home: six real rows, exact consumed membership and bounded requests", async () => {
    const sections = await Noveli.getDiscoverSections();
    expect(sections.map((section) => [section.id, section.title])).to.deep.equal(HOME);
    const start = probe.requests.length;
    for (const section of sections) rankingRows.set(section.id, await Noveli.getDiscoverSectionItems(section));
    expect(probe.requests.length - start, "One ranking request plus one catalog request; no per-title enrichment").to.equal(2);
    const rankings = raw<{ rankings: Record<string, RawNovel[]> }>(probe.find("/api/novels/rankings"));
    for (const [id] of HOME.filter(([id]) => id !== "catalog")) {
      const result = rankingRows.get(id)!;
      expect(cards(result.items), id).to.deep.equal(expectedCards(rankings.rankings[id]));
      expect(result.items).not.to.be.empty;
      expect(result.metadata).to.equal(undefined);
    }
    const page = raw<{ data: RawNovel[] }>(probe.find("/api/novels"));
    expect(cards(rankingRows.get("catalog")!.items)).to.deep.equal(expectedCards(page.data));
    const warm = probe.requests.length;
    for (const metadata of [undefined, null, {}, Object.create(null)] as Metadata[]) {
      for (const section of sections)
        expect(await Noveli.getDiscoverSectionItems(section, metadata)).to.deep.equal(rankingRows.get(section.id));
    }
    expect(probe.requests.length, "Warm home and every native first-page representation reuse both responses").to.equal(warm);
  });
  test("getSearchResults: native first pages, exact next-page order and terminal keyword search", async () => {
    catalog = await Noveli.getSearchResults({ title: "" });
    const warm = probe.requests.length;
    for (const metadata of [null, {}, Object.create(null)] as Metadata[])
      expect(await Noveli.getSearchResults({ title: "" }, metadata)).to.deep.equal(catalog);
    expect(probe.requests.length).to.equal(warm);
    expect(cards(catalog.items)).to.deep.equal(cards(rankingRows.get("catalog")!.items));
    expect(catalog.metadata).not.to.equal(undefined);
    const second = await Noveli.getSearchResults({ title: "" }, catalog.metadata);
    const consumed = probe.responses.filter(({ request }) => new globalThis.URL(request.url).pathname === "/api/novels");
    const secondRaw = raw<{ data: RawNovel[]; pagination: { page: number } }>(consumed.find(({ request }) => new globalThis.URL(request.url).searchParams.get("page") === "2")!);
    expect(secondRaw.pagination.page).to.equal(2);
    expect(cards(second.items)).to.deep.equal(expectedCards(secondRaw.data));
    expect(new Set([...catalog.items, ...second.items].map((item) => item.mangaId)).size).to.equal(catalog.items.length + second.items.length);
    const keyword = await Noveli.getSearchResults({ title: SEARCH });
    const keywordRaw = raw<{ data: RawNovel[] }>(probe.responses.find(({ request }) => new globalThis.URL(request.url).searchParams.get("search") === SEARCH)!);
    expect(cards(keyword.items)).to.deep.equal(expectedCards(keywordRaw.data));
    expect(keyword.items.some((item) => item.mangaId === SAMPLE)).to.equal(true);
    expect(keyword.metadata).to.equal(undefined);
  });
  test("advanced search: live taxonomy, native selection and reset callbacks", async () => {
    const form = await Noveli.getAdvancedSearchForm({ title: TITLE });
    expect(form).to.be.instanceOf(NoveliSearchForm);
    const taxonomy = raw<{ tags: string[] }>(probe.find("/api/novels/tags")).tags;
    const section = form.getSections()[0];
    const genres = section.items.find((item) => item.id === "genres")!;
    const status = section.items.find((item) => item.id === "status")!;
    if (!("form" in genres) || !(genres.form instanceof SelectForm) || !("form" in status) || !(status.form instanceof SelectForm))
      throw new Error("Missing native selection forms");
    const genreForm = genres.form, statusForm = status.form;
    expect(Array.from(genreForm.getSections()[0].items, (item) => item.id)).to.deep.equal([...new Set(taxonomy)]);
    expect(Array.from(statusForm.getSections()[0].items, (item) => item.id)).to.deep.equal(["", "Ongoing", "Completed"]);
    const select = async (selection: SelectForm, id: string) => {
      const row = selection.getSections()[0].items.find((item) => item.id === id)!;
      if (!("onSelect" in row) || typeof row.onSelect !== "string") throw new Error("Missing native selection callback");
      await Application.SelectorRegistry.selector<() => Promise<void>>(row.onSelect)();
    };
    for (const genre of taxonomy.slice(0, 2)) await select(genreForm, genre);
    await genreForm.formDidSubmit();
    await select(statusForm, "Completed");
    await statusForm.formDidSubmit();
    expect(form.getSearchQueryMetadata()).to.deep.equal({ genres: taxonomy.slice(0, 2), status: "Completed" });
    await rejects(() => form.setGenres(["not-an-advertised-Noveli-genre"]), /unknown|genre/i);
    await rejects(() => form.setStatus(["Completed", "Ongoing"]), /status/i);
    await form.reset();
    expect(form.getSearchQueryMetadata()).to.deep.equal({ genres: [], status: "" });
  });
  test("search routing: keyword, multi-genre, status and all native sorts without extra provider requests", async () => {
    const schedule = Application.scheduleRequest;
    const requests: Request[] = [];
    try {
      Application.scheduleRequest = async (request) => {
        if (new globalThis.URL(request.url).pathname === "/api/novels/tags") {
          const capture = probe.find("/api/novels/tags");
          return [capture.response, buffer(raw(capture))];
        }
        requests.push(request); throw new Error("Native route observed; no provider request");
      };
      for (const sort of await Noveli.getSortingOptions({ title: "" })) {
        const cold = new NoveliExtension();
        const status = sort.id === "az" ? "Ongoing" : "Completed";
        await rejects(() => cold.getSearchResults({ title: "A & B", metadata: { genres: ["Action", "Slice of Life"], status } }, undefined, sort), /Native route observed/);
        const request = requests.at(-1)!;
        const url = new globalThis.URL(request.url);
        expect(url.origin + url.pathname).to.equal(`${BASE}/api/novels`);
        expect(Object.fromEntries(url.searchParams)).to.deep.equal({ sort: sort.id, page: "1", limit: "36", search: "A & B", genres: "Action,Slice of Life", status });
        expect(request.method).to.equal("GET");
        expect(request.body).to.equal(undefined);
        expect(request.cookies).to.equal(undefined);
      }
      expect(requests).to.have.length(SORT_IDS.length);
    } finally { Application.scheduleRequest = schedule; }
  });
  test("getMangaDetails: canonical native novel metadata and original cover bytes", async () => {
    source = await Noveli.getMangaDetails(SAMPLE);
    const detail = raw<{ data: RawNovel }>(probe.find(`/api/novels/${SAMPLE}`)).data;
    expect(source.mangaId).to.equal(SAMPLE);
    expect(source.mangaInfo.contentType).to.equal("novel");
    expect(source.mangaInfo.primaryTitle).to.equal(detail.title);
    expect(source.mangaInfo.author).to.equal(detail.author);
    expect(source.mangaInfo.status).to.equal(detail.status);
    expect(source.mangaInfo.artist).to.equal(undefined);
    expect(source.mangaInfo.additionalInfo?.["Type"]).to.equal(detail.type);
    expect(source.mangaInfo.additionalInfo?.["Original language"]).to.equal(detail.original_language);
    expect(source.mangaInfo.additionalInfo?.["Reading language"]).to.equal("English");
    expect(source.mangaInfo.tagGroups?.find((group) => group.id === "genres")?.tags.map((tag) => tag.title)).to.deep.equal([...new Set(detail.genres)]);
    expect(source.mangaInfo.tagGroups?.find((group) => group.id === "tags")?.tags.map((tag) => tag.title)).to.deep.equal([...new Set(detail.tags)].filter((tag) => !detail.genres?.includes(tag)));
    expect(source.mangaInfo.shareUrl).to.equal(`${BASE}/novel/${detail.slug}`);
    const description = cheerio.load(detail.description);
    description("script,style").remove();
    description("br").replaceWith("\n");
    description("p").append("\n\n");
    expect(source.mangaInfo.synopsis === description.root().text().trim(), "Exact source synopsis as plain text").to.equal(true);
    expect(source.mangaInfo.secondaryTitles).to.deep.equal(typeof detail.associated_names === "string" ? JSON.parse(detail.associated_names) : detail.associated_names);
    expect(source.mangaInfo.thumbnailUrl).to.equal(BASE + detail.cover_image);
    expect(source.mangaInfo.rating).to.equal(detail.rating / 5);
    expect(source.mangaInfo.contentRating).not.to.equal(ContentRating.EVERYONE);
    await assertCoverBytes(source.mangaInfo.thumbnailUrl);
  });
  test("getChapters: complete source order, stable IDs and no invented dates or volumes", async () => {
    const saved = JSON.parse(JSON.stringify(source)) as SourceManga;
    chapters = await Noveli.getChapters(saved);
    const detail = raw<{ data: RawNovel }>(probe.find(`/api/novels/${SAMPLE}`)).data;
    const actual = raw<{ chapters: RawChapter[] }>(probe.find(`/api/novels/${detail.slug}/chapters`)).chapters;
    expect(chapters).not.to.be.empty;
    expect(chapters.map((chapter) => chapter.chapterId)).to.deep.equal(actual.map((chapter) => String(chapter.id)));
    expect(new Set(chapters.map((chapter) => chapter.chapterId)).size).to.equal(chapters.length);
    chapters.forEach((chapter, index) => {
      expect(chapter.sourceManga).to.equal(saved);
      expect(chapter.sourceManga.mangaId).to.equal(String(actual[index].novel_id));
      expect(chapter.chapNum).to.equal(actual[index].chapter_number);
      expect(chapter.langCode).to.equal("en");
      const bare = /^chapter\s+(\d+(?:\.\d+)?)$/i.exec(actual[index].title.trim());
      expect(chapter.title).to.equal(bare && Number(bare[1]) === actual[index].chapter_number ? undefined : actual[index].title);
      expect(chapter.publishDate).to.equal(undefined);
      expect(chapter.creationDate).to.equal(undefined);
      expect(chapter.volume).to.equal(0);
    });
  });
  test("getChapterDetails: actual first and last HTML readers preserve paragraphs, credits and hidden records", async () => {
    for (const chapter of new Set([chapters[0], chapters[chapters.length - 1]])) {
      const saved = JSON.parse(JSON.stringify(chapter)) as Chapter;
      const reader = await Noveli.getChapterDetails(saved);
      const payload = raw<RawReader>(probe.find(`/api/novels/${SAMPLE}/chapters/${chapter.chapterId}`));
      assertReader(reader, chapter, payload);
      if (chapter === chapters[0]) firstReader = reader;
    }
    logger.log("readerProof", { mangaId: SAMPLE, chapterCount: chapters.length, firstChapterId: chapters[0].chapterId, lastChapterId: chapters[chapters.length - 1].chapterId, nativeType: "html" });
  });
  test("shared runner: HTML requires novel content; comic image validation stays strict", async () => {
    const chapter = chapters[0];
    assertChapterDetails(firstReader, chapter);
    for (const contentType of [undefined, "comic"] as const) {
      const comic = { ...chapter, sourceManga: { ...chapter.sourceManga, mangaInfo: { ...chapter.sourceManga.mangaInfo, contentType } } };
      expect(() => assertChapterDetails(firstReader, comic)).to.throw();
      assertChapterDetails({ id: chapter.chapterId, mangaId: SAMPLE, pages: [source.mangaInfo.thumbnailUrl] }, comic);
      for (const pages of [[], ["http://invalid.example/page.jpg"]])
        expect(() => assertChapterDetails({ id: chapter.chapterId, mangaId: SAMPLE, pages }, comic)).to.throw();
    }
    for (const html of ["", " \n\t", "<html><head><title>Chapter</title></head><body></body></html>", "<p hidden>Hidden only</p>", "<div aria-hidden='true'><p>Hidden descendant</p></div>", "<p style='display:none'>Hidden only</p>", "<script>not visible text</script>"])
      expect(() => assertChapterDetails({ id: chapter.chapterId, mangaId: SAMPLE, type: "html", html }, chapter)).to.throw();
    expect(() => assertChapterDetails({ id: "wrong", mangaId: SAMPLE, type: "html", html: "x" }, chapter)).to.throw();
    expect(() => assertChapterDetails({ id: chapter.chapterId, mangaId: "wrong", type: "html", html: "x" }, chapter)).to.throw();
    expect(() => assertChapterDetails({ id: chapter.chapterId, mangaId: SAMPLE, pages: [source.mangaInfo.thumbnailUrl] }, chapter)).to.throw();
    for (const contentType of [undefined, "comic", "novel"] as const)
      expect(() => assertChapterDetails({ id: chapter.chapterId, mangaId: SAMPLE, type: "file", format: "epub", request: { url: BASE, method: "GET" } }, {
        ...chapter, sourceManga: { ...source, mangaInfo: { ...source.mangaInfo, contentType } },
      })).to.throw();
  });
  test("continuations and identities: malformed native inputs fail before network", async () => {
    const schedule = Application.scheduleRequest;
    let calls = 0;
    try {
      Application.scheduleRequest = async () => { calls++; throw new Error("Unexpected network request"); };
      const cold = new NoveliExtension();
      for (const value of [[], false, 0, "", new Date(), Object.create({ inherited: true }), { [Symbol("extra")]: true }, { page: 0 }, { page: 2 }, { ...(catalog.metadata as Record<string, unknown>), page: -1 }, { ...(catalog.metadata as Record<string, unknown>), extra: true }])
        await rejects(() => cold.getSearchResults({ title: "" }, value as Metadata), /Noveli|metadata|cursor|pagination|continuation/i);
      await rejects(() => cold.getSearchResults({ title: "changed" }, catalog.metadata), /metadata|cursor|query|continuation|pagination/i);
      for (const metadata of [{ genres: "Action" }, { genres: ["Action", "Action"] }, { genres: ["Action,Drama"] }, { status: "All" }, { unknown: true }])
        await rejects(() => cold.getSearchResults({ title: "", metadata }), /Noveli|filter/i);
      await rejects(() => cold.getSearchResults({ title: "" }, undefined, { id: "unsupported", label: "unsupported" }), /Noveli|sort/i);
      const sections = await cold.getDiscoverSections();
      const ranking = sections.find((section) => section.id !== "catalog")!;
      for (const metadata of [{ page: 2 }, [], false, 0, ""])
        await rejects(() => cold.getDiscoverSectionItems(ranking, metadata), /finite|pagination/i);
      await rejects(() => cold.getDiscoverSectionItems(sections.find((section) => section.id === "catalog")!, catalog.metadata), /pagination/i);
      for (const id of ["0", "0432", "-1", "432/chapters", "https://noveli.to/novel/a", "432?x=1"])
        await rejects(() => cold.getMangaDetails(id), /identity|invalid|id/i);
      expect(calls).to.equal(0);
    } finally { Application.scheduleRequest = schedule; }
  });
  test("content: same-ID explicit Adult classification survives sparse ranking metadata", async () => {
    const catalogCapture = probe.responses.find(({ request }) => request.url === `${BASE}/api/novels?sort=popular&page=1&limit=36`)!;
    const rankingCapture = probe.find("/api/novels/rankings");
    const catalogData = raw<{ data: RawNovel[] }>(catalogCapture);
    const rankings = raw<{ rankings: Record<string, RawNovel[]> }>(rankingCapture).rankings;
    const matching = catalogData.data.find((novel) => rankings.translatedRanking.some((entry) => entry.id === novel.id)) ??
      catalogData.data.find((novel) => Object.values(rankings).some((rows) => rows.some((entry) => entry.id === novel.id)));
    expect(matching, "At least one actual ranking/catalog overlap").not.to.equal(undefined);
    const rowId = HOME.find(([id]) => id !== "catalog" && rankings[id].some((entry) => entry.id === matching!.id))![0];
    const section = (await Noveli.getDiscoverSections()).find((entry) => entry.id === rowId)!;
    await replay(probe.responses, (payload, request) => {
      if (request.url === catalogCapture.request.url) {
        const row = (payload as unknown as { data: RawNovel[] }).data.find((entry) => entry.id === matching!.id)!;
        row.genres = ["Adult"]; row.tags = ["Adult"];
      }
      if (request.url === rankingCapture.request.url)
        for (const rows of Object.values((payload as unknown as { rankings: Record<string, RawNovel[]> }).rankings))
          for (const row of rows) if (row.id === matching!.id) { delete row.genres; delete row.tags; }
    }, async (cold) => {
      const first = await cold.getSearchResults({ title: "" });
      expect(first.items.find((item) => item.mangaId === String(matching!.id))?.contentRating).to.equal(ContentRating.ADULT);
      const sparse = await cold.getDiscoverSectionItems(section);
      expect(sparse.items.find((item) => "mangaId" in item && item.mangaId === String(matching!.id))?.contentRating).to.equal(ContentRating.ADULT);
      expect(sparse.items.every((item) => !("contentRating" in item) || item.contentRating !== ContentRating.EVERYONE)).to.equal(true);
      const original = Object.getOwnPropertyDescriptor(Application, "filterAdultTitles")!;
      try {
        Object.defineProperty(Application, "filterAdultTitles", { ...original, value: true });
        expect((await cold.getDiscoverSectionItems(section)).items.some((item) => "mangaId" in item && item.mangaId === String(matching!.id))).to.equal(false);
      } finally { Object.defineProperty(Application, "filterAdultTitles", original); }
    });
  });
  test("pagination: native-filtered pages advance with complete raw IDs or end honestly", async () => {
    const first = probe.responses.find(({ request }) => request.url === `${BASE}/api/novels?sort=popular&page=1&limit=36`)!;
    const second = probe.responses.find(({ request }) => request.url === `${BASE}/api/novels?sort=popular&page=2&limit=36`)!;
    const original = Object.getOwnPropertyDescriptor(Application, "filterAdultTitles")!;
    try {
      Object.defineProperty(Application, "filterAdultTitles", { ...original, value: true });
      await replay([first, second], (payload, request) => {
        for (const row of (payload as unknown as { data: RawNovel[] }).data) {
          row.genres = request.url === first.request.url ? ["Adult"] : [];
          row.tags = [...row.genres];
        }
      }, async (cold) => {
        const result = await cold.getSearchResults({ title: "" });
        const one = raw<{ data: RawNovel[] }>(first).data, two = raw<{ data: RawNovel[] }>(second).data;
        expect(cards(result.items)).to.deep.equal(expectedCards(two));
        expect((result.metadata as { page: number }).page).to.equal(3);
        expect((result.metadata as { seen: string[] }).seen).to.deep.equal(Array.from([...one, ...two], (row) => String(row.id)));
      });
      await replay([first], (payload) => {
        const data = payload as unknown as { data: RawNovel[]; pagination: { total: number } };
        for (const row of data.data) { row.genres = ["Adult"]; row.tags = ["Adult"]; }
        data.pagination.total = data.data.length;
      }, async (cold) => {
        const terminal = await cold.getSearchResults({ title: "" });
        expect(terminal.items).to.be.empty;
        expect(terminal.metadata).to.equal(undefined);
      });
    } finally { Object.defineProperty(Application, "filterAdultTitles", original); }
  });
  test("content: independent native Adult and Mature caps use the strongest current novel classification", async () => {
    const detailCapture = probe.find(`/api/novels/${SAMPLE}`);
    const readerCapture = probe.find(`/api/novels/${SAMPLE}/chapters/${chapters[0].chapterId}`);
    const mature = Object.getOwnPropertyDescriptor(Application, "filterMatureTitles")!;
    const adult = Object.getOwnPropertyDescriptor(Application, "filterAdultTitles")!;
    try {
      for (const explicitAdult of [false, true]) for (const filterMatureTitles of [false, true]) for (const filterAdultTitles of [false, true]) {
        Object.defineProperty(Application, "filterMatureTitles", { ...mature, value: filterMatureTitles });
        Object.defineProperty(Application, "filterAdultTitles", { ...adult, value: filterAdultTitles });
        await replay(probe.responses, (payload, request) => {
          if (explicitAdult && request.url === detailCapture.request.url) {
            const data = payload.data as Record<string, unknown>;
            data.genres = ["Adult"]; data.tags = ["Adult"];
          }
        }, async (cold) => {
          if (explicitAdult ? filterAdultTitles : filterMatureTitles)
            await rejects(() => cold.getChapterDetails(chapters[0]), /excluded|filter/i);
          else assertReader(await cold.getChapterDetails(chapters[0]), chapters[0], raw<RawReader>(readerCapture));
        });
      }
    } finally {
      Object.defineProperty(Application, "filterMatureTitles", mature);
      Object.defineProperty(Application, "filterAdultTitles", adult);
    }
  });
  test("content: native Mature cap blocks restored novel, inventory and reader before prose", async () => {
    const original = Object.getOwnPropertyDescriptor(Application, "filterMatureTitles")!;
    try {
      Object.defineProperty(Application, "filterMatureTitles", { ...original, value: true });
      await replay(probe.responses, () => {}, async (cold) => {
        await rejects(() => cold.getMangaDetails(SAMPLE), /excluded|filter/i);
        await rejects(() => cold.getChapters(source), /excluded|filter/i);
        await rejects(() => cold.getChapterDetails(chapters[0]), /excluded|filter/i);
      });
    } finally { Object.defineProperty(Application, "filterMatureTitles", original); }
  });
  test("metadata: wrong identity, duplicate rows and changed inventory fail closed without network", async () => {
    const detailCapture = probe.find(`/api/novels/${SAMPLE}`);
    const detail = raw<{ data: RawNovel }>(detailCapture).data;
    const listCapture = probe.find(`/api/novels/${detail.slug}/chapters`);
    const cases: [Capture, (payload: Record<string, unknown>) => void, (cold: NoveliExtension) => Promise<unknown>][] = [
      [detailCapture, (payload) => { (payload.data as RawNovel).id++; }, (cold) => cold.getMangaDetails(SAMPLE)],
      [detailCapture, (payload) => { (payload.data as Record<string, unknown>).requiresLogin = true; }, (cold) => cold.getMangaDetails(SAMPLE)],
      [listCapture, (payload) => { (payload.chapters as RawChapter[])[0].novel_id++; }, (cold) => cold.getChapters(source)],
      [listCapture, (payload) => { const rows = payload.chapters as RawChapter[]; rows[1].id = rows[0].id; }, (cold) => cold.getChapters(source)],
      [listCapture, (payload) => { (payload.chapters as RawChapter[]).shift(); }, (cold) => cold.getChapterDetails(chapters[0])],
      [listCapture, (payload) => { const rows = payload.chapters as RawChapter[]; rows.splice(Math.floor(rows.length / 2), 1); }, (cold) => cold.getChapters(source)],
      [listCapture, (payload) => { payload.chapters = []; }, (cold) => cold.getChapters(source)],
      [detailCapture, (payload) => { ((payload.data as Record<string, unknown>).firstChapter as Record<string, unknown>).id = Number(chapters[1].chapterId); }, (cold) => cold.getChapters(source)],
      [detailCapture, (payload) => { ((payload.data as Record<string, unknown>).latestChapter as Record<string, unknown>).chapter_number = -1; }, (cold) => cold.getChapters(source)],
    ];
    for (const [capture, mutate, operation] of cases)
      await replay(probe.responses, (payload, request) => { if (request.url === capture.request.url) mutate(payload); }, async (cold) => {
        await rejects(() => operation(cold), /Noveli|identity|inventory|access/i);
      });
    await replay(probe.responses, (payload, request) => {
      if (request.url === detailCapture.request.url) {
        const detail = payload.data as Record<string, unknown>;
        detail.chapter_count = 0; detail.firstChapter = null; detail.latestChapter = null;
      }
      if (request.url === listCapture.request.url) payload.chapters = [];
    }, async (cold) => { expect(await cold.getChapters(source)).to.be.empty; });
    const catalogCapture = probe.find("/api/novels");
    for (const mutation of [
      (payload: Record<string, unknown>) => { const rows = payload.data as RawNovel[]; rows[1].id = rows[0].id; },
      (payload: Record<string, unknown>) => { (payload.pagination as Record<string, unknown>).page = 2; },
    ]) await replay([catalogCapture], mutation, async (cold) => {
      await rejects(() => cold.getSearchResults({ title: "" }), /Noveli|duplicate|pagination/i);
    });
  });
  test("metadata: absent optional fields stay absent, malformed fields fail, and ratings use the source scale", async () => {
    const capture = probe.find(`/api/novels/${SAMPLE}`);
    const optional = ["author", "status", "type", "original_language", "description", "associated_names"];
    for (const missing of [null, undefined]) await replay([capture], (payload) => {
      for (const key of optional) (payload.data as Record<string, unknown>)[key] = missing;
    }, async (cold) => {
      const info = (await cold.getMangaDetails(SAMPLE)).mangaInfo;
      expect(info.author).to.equal(undefined);
      expect(info.artist).to.equal(undefined);
      expect(info.status).to.equal(undefined);
      expect(info.synopsis).to.equal("");
      expect(info.secondaryTitles).to.be.empty;
      expect(info.additionalInfo).to.deep.equal({ "Reading language": "English" });
    });
    for (const key of optional) await replay([capture], (payload) => {
      (payload.data as Record<string, unknown>)[key] = 42;
    }, async (cold) => { await rejects(() => cold.getMangaDetails(SAMPLE), /Noveli|text|taxonomy/i); });
    for (const rating of [0, 5, null, undefined, -1, 6, "4"]) await replay([capture], (payload) => {
      (payload.data as Record<string, unknown>).rating = rating;
      (payload.data as Record<string, unknown>).rating_count = 0;
    }, async (cold) => {
      expect((await cold.getMangaDetails(SAMPLE)).mangaInfo.rating).to.equal(rating === 0 || rating === 5 ? rating / 5 : undefined);
    });
  });
  test("reader: wrong identities, access failures and malformed payloads fail closed without network", async () => {
    const capture = probe.find(`/api/novels/${SAMPLE}/chapters/${chapters[0].chapterId}`);
    const mutateReader: ((payload: RawReader) => void)[] = [
      (payload) => { payload.success = false; },
      (payload) => { (payload as unknown as Record<string, unknown>).accessDenied = true; },
      (payload) => { (payload.chapter as unknown as Record<string, unknown>).isLocked = true; },
      (payload) => { payload.chapter.id++; },
      (payload) => { payload.chapter.novel_id++; },
      (payload) => { payload.novel.id++; },
      (payload) => { payload.novel.slug += "-wrong"; },
      (payload) => { payload.chapter.chapter_number++; },
      (payload) => { payload.chapter.paragraphs = []; },
      (payload) => { delete (payload.chapter as unknown as Record<string, unknown>).paragraphs; },
      (payload) => { delete (payload.chapter.paragraphs[0] as unknown as Record<string, unknown>).text; },
      (payload) => { (payload.chapter.paragraphs[0] as unknown as Record<string, unknown>).isHoneypot = "false"; },
      (payload) => { payload.chapter.paragraphs.forEach((paragraph) => { paragraph.isHoneypot = true; }); },
      (payload) => { payload.chapter.paragraphs[0].text += "\u0000"; },
      (payload) => { payload.chapter.paragraphs[1].id = payload.chapter.paragraphs[0].id; },
    ];
    for (const mutate of mutateReader)
      await replay(probe.responses, (payload, request) => { if (request.url === capture.request.url) mutate(payload as unknown as RawReader); }, async (cold) => {
        await rejects(() => cold.getChapterDetails(chapters[0]), /Noveli|chapter|identity|paragraph|response/i);
      });
  });
  test("reader: newly returned Adult warning and an in-flight app policy change cannot release text", async () => {
    const capture = probe.find(`/api/novels/${SAMPLE}/chapters/${chapters[0].chapterId}`);
    const original = Object.getOwnPropertyDescriptor(Application, "filterAdultTitles")!;
    try {
      Object.defineProperty(Application, "filterAdultTitles", { ...original, value: true });
      await replay(probe.responses, (payload, request) => {
        if (request.url === capture.request.url) (payload.novel as Record<string, unknown>).genres = ["Adult"];
      }, async (cold) => { await rejects(() => cold.getChapterDetails(chapters[0]), /excluded|filter/i); });
      Object.defineProperty(Application, "filterAdultTitles", original);
      await replay(probe.responses, (_payload, request) => {
        if (request.url === capture.request.url) Object.defineProperty(Application, "filterAdultTitles", { ...original, value: true });
      }, async (cold) => { await rejects(() => cold.getChapterDetails(chapters[0]), /filters changed/i); });
    } finally { Object.defineProperty(Application, "filterAdultTitles", original); }
  });
  test("transport: denied, redirected, non-JSON and malformed responses have no fallback requests", async () => {
    const capture = probe.find(`/api/novels/${SAMPLE}`);
    const schedule = Application.scheduleRequest;
    try {
      for (const [response, body] of [
        [{ ...capture.response, status: 403 }, capture.body],
        [{ ...capture.response, status: 302 }, capture.body],
        [{ ...capture.response, url: `${BASE}/login` }, capture.body],
        [{ ...capture.response, headers: { "content-type": "text/html" } }, capture.body],
        [capture.response, "{"],
      ] as [Response, string][]) {
        let calls = 0;
        Application.scheduleRequest = async (request) => {
          if (++calls !== 1) throw new Error("Unexpected additional request");
          expect(request.url).to.equal(capture.request.url);
          return [response, new TextEncoder().encode(body).buffer as ArrayBuffer];
        };
        await rejects(() => new NoveliExtension().getMangaDetails(SAMPLE), /Noveli|request|JSON/i);
        expect(calls).to.equal(1);
      }
    } finally { Application.scheduleRequest = schedule; }
  });
  test("reader: text escaping and line breaks never execute provider markup", async () => {
    const capture = probe.find(`/api/novels/${SAMPLE}/chapters/${chapters[0].chapterId}`);
    let changed!: RawReader;
    await replay(probe.responses, (payload, request) => {
      if (request.url !== capture.request.url) return;
      changed = payload as unknown as RawReader;
      const paragraph = changed.chapter.paragraphs.find((entry) => !entry.isHoneypot)!;
      paragraph.text += '\n<&"\'><script>alert(1)</script>\nsecond line';
      paragraph.html = '<script>alert(1)</script>';
    }, async (cold) => assertReader(await cold.getChapterDetails(chapters[0]), chapters[0], changed));
  });

  try { await suite.run(); }
  finally { probe.unregisterInterceptor(); }
}
