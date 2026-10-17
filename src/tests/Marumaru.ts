/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { type Chapter, type SourceManga, type Metadata, type TestLogger } from "@paperback/types";
import { expect } from "chai";
import { Marumaru } from "../Marumaru/main";
import { TestSuite } from "./suite";

// Real source callbacks only. No saved provider fixture or substitute WebView path.
// A host without actual application HTML/WebView support fails its gate honestly.
function assertReaderCanary(pages: string[]): void {
  expect(pages.length, "Observed chapter 21331 complete inventory").to.equal(19);
  expect(new Set(pages).size).to.equal(pages.length);
  pages.forEach((url, index) => expect(url).to.equal(`https://peer.storagewebtoon.store/api/media/episode/21331/${index + 1}.webp`));
}

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Marumaru native DOM tests", logger);
  let catalogReady = false;
  let next: Metadata | undefined;
  let firstIds: string[] = [];
  let detail: SourceManga | undefined;
  let chapters: Chapter[] | undefined;
  suite.test("Native catalog renders actual canonical Korean cards", async () => {
    await Marumaru.initialise();
    const result = await Marumaru.getSearchResults({ title: "" });
    expect(result.items.length).to.be.greaterThan(1);
    for (const item of result.items) expect(item.mangaId).to.match(/^[1-9]\d*$/);
    firstIds = result.items.map((item) => item.mangaId);
    next = result.metadata; catalogReady = true;
  });
  suite.test("Native observed catalog continuation advances without overlap", async () => {
    expect(catalogReady, "Native catalog prerequisite failed; no retry").to.equal(true);
    expect(next, "Source did not advertise continuation").not.to.equal(undefined);
    const result = await Marumaru.getSearchResults({ title: "" }, next);
    expect(result.items.length).to.be.greaterThan(0);
    expect(result.items.some((item) => firstIds.includes(item.mangaId))).to.equal(false);
  });
  suite.test("Native queried search reads its own scoped form", async () => {
    expect(catalogReady, "Native catalog prerequisite failed; no retry").to.equal(true);
    const result = await Marumaru.getSearchResults({ title: "라멘 아카네코" });
    expect(result.items.some((item) => item.mangaId === "17155")).to.equal(true);
  });
  suite.test("Native details preserve Korean source metadata", async () => {
    expect(catalogReady, "Native catalog prerequisite failed; no retry").to.equal(true);
    detail = await Marumaru.getMangaDetails("17155");
    expect(detail.mangaInfo.primaryTitle).to.equal("라멘 아카네코");
    expect(detail.mangaInfo.author).to.equal("안갸맨");
    expect(detail.mangaInfo.synopsis?.length).to.be.greaterThan(0);
  });
  suite.test("Native chapter inventory preserves special source labels and references", async () => {
    expect(detail, "Native details prerequisite failed; no retry").not.to.equal(undefined);
    chapters = await Marumaru.getChapters(detail!);
    expect(chapters.length, "Observed complete chapter inventory across four UI pages").to.equal(103);
    expect(chapters[0]?.chapterId).to.equal("1738175");
    expect(chapters.at(-1)?.chapterId).to.equal("21333");
    expect(new Set(chapters.map((chapter) => chapter.chapterId)).size).to.equal(chapters.length);
    for (const chapter of chapters) {
      expect(chapter.sourceManga).to.equal(detail);
      expect(chapter.sortingIndex).to.equal(chapter.chapNum);
    }
    const special = chapters.find((chapter) => chapter.chapterId === "21332");
    expect(special?.chapNum).to.equal(2);
    expect(special?.title).to.include("1-2화");
  });
  suite.test("Native reader includes all lazy cuts and valid first/last image bytes", async () => {
    expect(chapters, "Native inventory prerequisite failed; no retry").not.to.equal(undefined);
    const selected = chapters!.find((chapter) => chapter.chapterId === "21331");
    expect(selected).not.to.equal(undefined);
    const result = await Marumaru.getChapterDetails(selected!);
    if (result.type && result.type !== "images") throw new Error("Expected image reader");
    assertReaderCanary(result.pages);
    expect(() => assertReaderCanary(result.pages.slice(0, 9))).to.throw();
    for (const url of [result.pages[0]!, result.pages.at(-1)!]) {
      const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
      expect(response.status).to.equal(200); expect(data.byteLength).to.be.greaterThan(100);
    }
  });
  await suite.run();
}
