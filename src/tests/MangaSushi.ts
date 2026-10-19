/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
import { type TestLogger } from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { MangaSushi } from "../MangaSushi/main";
import sourceInfo from "../MangaSushi/pbconfig";
import { MangaSushiSearchForm, preferences } from "../MangaSushi/forms";
import { seriesUrl } from "../MangaSushi/parsers";
import { TestSuite, registerNativeContracts, rejects } from "./suite";
export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaSushi native contracts", logger);
  const probe = registerNativeContracts(suite, MangaSushi, sourceInfo, {
    discoverySectionId: "latest",
    assertInventory({ probe, source, chapters }) {
      const html = probe.text(
          ({ request }) => request.url === `${seriesUrl(source.mangaId)}ajax/chapters/`,
        ),
        $ = cheerio.load(html);
      const expected = $("li.wp-manga-chapter > a")
        .toArray()
        .map((node) =>
          $(node).attr("href")!.slice(seriesUrl(source.mangaId).length).replace(/\/$/, ""),
        );
      expect(chapters.map((chapter) => chapter.chapterId)).to.deep.equal(expected);
      expect(chapters.map((chapter) => chapter.sortingIndex)).to.deep.equal(
        expected.map((_, i) => expected.length - i),
      );
    },
    assertReader({ probe, chapter, reader }) {
      const url = seriesUrl(chapter.sourceManga.mangaId, chapter.chapterId);
      const $ = cheerio.load(probe.text(({ request }) => request.url === url));
      expect($("#wp-manga-current-chap").attr("value")).to.equal(chapter.chapterId);
      expect($(`a[href="${seriesUrl(chapter.sourceManga.mangaId)}"]`).length).to.be.greaterThan(0);
      const canonical = $("link[rel=canonical]").attr("href");
      if (canonical) expect(canonical).to.equal(url);
      const images = $(".reading-content img.wp-manga-chapter-img").toArray();
      expect(images.length).to.be.greaterThan(0);
      if (!("pages" in reader)) throw new Error("Expected image reader");
      expect(reader.pages).to.deep.equal(
        images.map((node, index) => {
          const image = $(node);
          if (image.attr("id")) expect(image.attr("id")).to.equal(`image-${index}`);
          const raw = image.attr("data-src") || image.attr("data-lazy-src") || image.attr("src");
          expect(raw).to.be.a("string");
          expect(raw!.length).to.be.greaterThan(0);
          return new globalThis.URL(raw!.trim(), url).href;
        }),
      );
    },
    async filter(form) {
      expect(form).to.be.instanceOf(MangaSushiSearchForm);
      await (form as MangaSushiSearchForm).setStatuses(["on-going"]);
      return { title: "", metadata: form.getSearchQueryMetadata() };
    },
    assertFiltered({ probe }) {
      const capture = probe.find(
        ({ request }) =>
          new globalThis.URL(request.url).searchParams.get("status[0]") === "on-going",
      );
      expect(new globalThis.URL(capture.request.url).searchParams.get("status[0]")).to.equal(
        "on-going",
      );
    },
    guardPrerequisites: ["chapters"],
    async guard({ extension, chapters }) {
      expect(preferences().excludeNSFW).to.equal(true);
      expect(chapters).not.to.equal(undefined);
      await rejects(
        () => extension.getChapterDetails({ ...chapters![0], additionalInfo: { locked: "true" } }),
        /requires access/,
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
