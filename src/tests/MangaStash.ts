/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
import { type TestLogger } from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { MangaStash } from "../MangaStash/main";
import sourceInfo from "../MangaStash/pbconfig";
import { MangaStashSearchForm } from "../MangaStash/forms";
import { chapterURL, imageURL, seriesURL } from "../MangaStash/urls";
import { TestSuite, registerNativeContracts, rejects } from "./suite";
export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaStash native contracts", logger);
  const probe = registerNativeContracts(suite, MangaStash, sourceInfo, {
    discoverySectionId: "popular",
    query: { title: "Ayashimon" },
    mangaId: "ayashimon",
    chooseChapter(chapters) {
      const chapter = chapters.find((row) => row.chapterId === "ayashimon/chapter-1");
      expect(chapter, "native first-chapter navigation canary").not.to.equal(undefined);
      return chapter!;
    },
    assertInventory({ probe, source, chapters }) {
      const $ = cheerio.load(
        probe.text(({ request }) => request.url === seriesURL(source.mangaId)),
      );
      const all = $("#chapter-list > a.chapter-row").toArray();
      const count = $("#chapters .cl-toolbar h2")
        .text()
        .trim()
        .match(/^Chapters \((\d+)\)$/);
      expect(count).not.to.equal(null);
      expect(all).to.have.length(Number(count![1]));
      const visible = all.filter(
        (node) =>
          !$(node).is(".locked, [data-locked=true], [aria-disabled=true]") &&
          !/locked|premium|login|purchase|subscribe/i.test($(node).find(".chapter-meta").text()),
      );
      expect(chapters.map((chapter) => chapter.chapterId)).to.deep.equal(
        visible.map((node) => $(node).attr("href")!.replace(/^\//, "")),
      );
      expect(chapters.map((chapter) => chapter.sortingIndex)).to.deep.equal(
        visible.map((_, i) => i),
      );
    },
    assertReader({ probe, chapter, reader }) {
      const url = chapterURL(chapter.chapterId, chapter.sourceManga.mangaId);
      const $ = cheerio.load(probe.text(({ request }) => request.url === url));
      expect($("link[rel=canonical]").attr("href")).to.equal(url);
      const selected = $(".chapter-select option[selected]");
      expect(selected).to.have.length(1);
      expect(new globalThis.URL(selected.attr("value")!, url).href).to.equal(url);
      const rows = $("#reader-pages > .reader-page").toArray();
      const config = $("script:not([src])")
        .toArray()
        .map((node) => $(node).text())
        .find((text) => /\bconst readerConfig\s*=/.test(text));
      expect(config).to.be.a("string");
      const total = /\btotalPages:\s*(\d+),/.exec(config!);
      expect(total).not.to.equal(null);
      expect(rows).to.have.length(Number(total![1]));
      if (!("pages" in reader)) throw new Error("Expected image reader");
      expect(reader.pages).to.deep.equal(
        rows.map((node, index) => {
          const row = $(node),
            image = row.find(".reader-page-inner > img");
          expect(row.attr("data-page")).to.equal(String(index + 1));
          expect(image).to.have.length(1);
          const raw = image.attr("data-src") || image.attr("src");
          expect(raw).to.be.a("string");
          expect(raw!.length).to.be.greaterThan(0);
          return new globalThis.URL(raw!, url).href;
        }),
      );
    },
    async filter(form) {
      expect(form).to.be.instanceOf(MangaStashSearchForm);
      await (form as MangaStashSearchForm).setlanguage(["EN"]);
      return { title: "", metadata: form.getSearchQueryMetadata() };
    },
    assertFiltered({ probe }) {
      const capture = probe.find(
        ({ request }) => new globalThis.URL(request.url).searchParams.get("language[]") === "EN",
      );
      expect(new globalThis.URL(capture.request.url).searchParams.get("language[]")).to.equal("EN");
    },
    guardPrerequisites: ["source", "chapters"],
    async guard({ extension, chapters, source }) {
      expect(chapters).not.to.equal(undefined);
      expect(source).not.to.equal(undefined);
      expect(() => imageURL(source!.mangaInfo.thumbnailUrl, "wrong-owner")).to.throw(/owner/);
      await rejects(
        () => extension.getChapterDetails({ ...chapters![0], additionalInfo: { locked: "true" } }),
        /requires website access/,
      );
    },
  });
  try {
    await suite.run();
  } finally {
    logger.log("requestCounts", probe.counts());
    probe.unregisterInterceptor();
  }
}
