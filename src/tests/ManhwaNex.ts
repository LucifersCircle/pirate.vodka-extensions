/* eslint-disable no-unused-expressions */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
import { type TestLogger } from "@paperback/types";
import { expect } from "chai";
import * as cheerio from "cheerio";
import { ManhwaNex } from "../ManhwaNex/main";
import sourceInfo from "../ManhwaNex/pbconfig";
import { ManhwaNexSearchForm, preferences } from "../ManhwaNex/forms";
import { seriesUrl } from "../ManhwaNex/parsers";
import { TestSuite, registerNativeContracts, rejects } from "./suite";
export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("ManhwaNex native contracts", logger);
  const probe = registerNativeContracts(suite, ManhwaNex, sourceInfo, {
    discoverySectionId: "latest",
    query: { title: "Logging 10,000 Years into the Future" },
    mangaId: "logging-10000-years-into-the-future",
    assertInventory({ probe, source, chapters }) {
      const captures = probe.captures.filter(({ request }) =>
        request.url.startsWith(`${seriesUrl(source.mangaId)}ajax/chapters/?t=`),
      );
      expect(captures).not.empty;
      const visited = new Set(
        captures.map(({ request }) =>
          Number(new globalThis.URL(request.url).searchParams.get("t")),
        ),
      );
      const declared = new Set([1]);
      for (const { data } of captures) {
        const $ = cheerio.load(Application.arrayBufferToUTF8String(data));
        $(".listing-chapters_wrap .pagination .page a[data-page]").each((_, node) => {
          declared.add(Number($(node).attr("data-page")));
        });
      }
      expect(visited, "all advertised inventory pages consumed").to.deep.equal(declared);
      const expected = captures.flatMap(({ data }) => {
        const $ = cheerio.load(Application.arrayBufferToUTF8String(data));
        return $("li.wp-manga-chapter > a")
          .toArray()
          .map((node) =>
            $(node).attr("href")!.slice(seriesUrl(source.mangaId).length).replace(/\/$/, ""),
          );
      });
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
      expect(images).not.empty;
      if (!("pages" in reader)) throw new Error("Expected image reader");
      expect(reader.pages).to.deep.equal(
        images.map((node, index) => {
          const image = $(node);
          if (image.attr("id")) expect(image.attr("id")).to.equal(`image-${index}`);
          const raw = image.attr("data-src") || image.attr("data-lazy-src") || image.attr("src");
          expect(raw).to.be.a("string").and.not.empty;
          return new globalThis.URL(raw!.trim(), url).href;
        }),
      );
    },
    async filter(form) {
      expect(form).to.be.instanceOf(ManhwaNexSearchForm);
      await (form as ManhwaNexSearchForm).setStatuses(["on-going"]);
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
