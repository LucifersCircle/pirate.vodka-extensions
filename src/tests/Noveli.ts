/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
import { type TestLogger } from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { Noveli } from "../Noveli/main";
import sourceInfo from "../Noveli/pbconfig";
import { NoveliSearchForm } from "../Noveli/forms";
import { ContentPolicy } from "../Noveli/policy";
import { TestSuite, registerNativeContracts, rejects } from "./suite";
type Row = { id: number; novel_id: number; chapter_number: number };
type Reader = {
  success: boolean;
  chapter: Row & { paragraphs: { id: string; text: string; isHoneypot?: boolean }[] };
  novel: { id: number };
};
export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Noveli native contracts", logger);
  const probe = registerNativeContracts(suite, Noveli, sourceInfo, {
    discoverySectionId: "catalog",
    query: { title: "Forty Millenniums" },
    mangaId: "432",
    assertInventory({ probe, source, chapters }) {
      const details = probe.json<{ data: { slug: string; chapter_count: number } }>(
        ({ request }) => request.url === `https://noveli.to/api/novels/${source.mangaId}`,
      ).data;
      const raw = probe.json<{ chapters: Row[] }>(
        ({ request }) => request.url === `https://noveli.to/api/novels/${details.slug}/chapters`,
      );
      expect(raw.chapters).to.have.length(details.chapter_count);
      expect(
        chapters.map((chapter) => [chapter.chapterId, chapter.chapNum, chapter.sortingIndex]),
      ).to.deep.equal(
        raw.chapters.map((chapter, i) => [String(chapter.id), chapter.chapter_number, i]),
      );
      expect(raw.chapters.every((chapter) => String(chapter.novel_id) === source.mangaId)).to.equal(
        true,
      );
    },
    assertReader({ probe, chapter, reader }) {
      const raw = probe.json<Reader>(
        ({ request }) =>
          request.url ===
          `https://noveli.to/api/novels/${chapter.sourceManga.mangaId}/chapters/${chapter.chapterId}`,
      );
      expect(raw.success).to.equal(true);
      expect(String(raw.chapter.id)).to.equal(chapter.chapterId);
      expect(String(raw.chapter.novel_id)).to.equal(chapter.sourceManga.mangaId);
      expect(String(raw.novel.id)).to.equal(chapter.sourceManga.mangaId);
      if (reader.type !== "html") throw new Error("Expected native novel HTML");
      const $ = cheerio.load(reader.html),
        paragraphs = $("body p").toArray();
      expect($("script,iframe,object,embed,img,audio,video,link").length).to.equal(0);
      expect(paragraphs).to.have.length(raw.chapter.paragraphs.length);
      raw.chapter.paragraphs.forEach((paragraph, i) => {
        const row = $(paragraphs[i]),
          content = row.clone();
        content.find("br").replaceWith("\n");
        expect(row.attr("id")).to.equal(paragraph.id);
        expect(
          content.text() === paragraph.text.replace(/\r\n?/g, "\n"),
          "exact source paragraph text and attribution",
        ).to.equal(true);
        expect(row.attr("hidden") === "hidden", "native honeypot visibility").to.equal(
          paragraph.isHoneypot === true,
        );
        expect(
          row
            .children()
            .toArray()
            .every((child) => child.tagName === "br"),
          "escaped source markup",
        ).to.equal(true);
      });
      expect(
        raw.chapter.paragraphs.filter((paragraph) => !paragraph.isHoneypot).length,
      ).to.be.greaterThan(1);
    },
    async filter(form) {
      expect(form).to.be.instanceOf(NoveliSearchForm);
      await (form as NoveliSearchForm).setStatus(["Completed"]);
      return { title: "", metadata: form.getSearchQueryMetadata() };
    },
    assertFiltered({ probe }) {
      const capture = probe.find(
        ({ request }) => new globalThis.URL(request.url).searchParams.get("status") === "Completed",
      );
      expect(new globalThis.URL(capture.request.url).searchParams.get("status")).to.equal(
        "Completed",
      );
    },
    guardPrerequisites: ["source", "chapters"],
    async guard({ extension, source, chapters }) {
      expect(source).not.to.equal(undefined);
      expect(chapters).not.to.equal(undefined);
      expect(() => new ContentPolicy().authorize(source!.mangaInfo.thumbnailUrl)).to.throw(
        /evidence.*missing/,
      );
      await rejects(
        () =>
          extension.getChapterDetails({ ...chapters![0], chapNum: chapters![0].chapNum + 0.123 }),
        /absent from.*inventory/,
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
