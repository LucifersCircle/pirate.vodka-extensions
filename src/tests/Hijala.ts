/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
import { type TestLogger } from "@paperback/types";
import { expect } from "chai";
import { Hijala } from "../Hijala/main";
import sourceInfo from "../Hijala/pbconfig";
import { HijalaSearchForm, preferences } from "../Hijala/forms";
import { pageProperty, seriesUrl, slugToId } from "../Hijala/parsers";
import { type Post, type SiteChapter, type ReaderChapter } from "../Hijala/models";
import { TestSuite, registerNativeContracts, rejects } from "./suite";
export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Hijala native contracts", logger);
  const probe = registerNativeContracts(suite, Hijala, sourceInfo, {
    discoverySectionId: "new",
    query: { title: "Mimosa" },
    mangaId: "mimosa",
    assertInventory({ probe, source, chapters }) {
      const html = probe.text(({ request }) => request.url === seriesUrl(source.mangaId));
      const post = pageProperty<Post>(html, "post");
      const router = html.includes("$_TSR.router=");
      const complete = router
        ? pageProperty<SiteChapter[]>(html, "initialChapters")
        : post.chapters!;
      if (router)
        expect(pageProperty<number>(html, "totalChapterCount")).to.equal(post._count!.chapters);
      expect(complete, "complete declared chapter inventory").to.have.length(post._count!.chapters);
      const locked = (chapter: SiteChapter) =>
        chapter.isLocked === true ||
        chapter.isAccessible === false ||
        (chapter.isAccessible !== true &&
          (chapter.isLockedByCoins === true ||
            chapter.isShortLinkLocked === true ||
            !!chapter.isPermanentlyLocked ||
            (chapter.price ?? 0) > 0));
      const visible = complete
        .filter((chapter) => !preferences().hidePaid || !locked(chapter))
        .sort((a, b) => b.number - a.number);
      expect(
        chapters.map((chapter) => [chapter.chapterId, chapter.chapNum, chapter.sortingIndex]),
      ).to.deep.equal(
        visible.map((chapter) => [slugToId(chapter.slug), chapter.number, chapter.number]),
      );
    },
    assertReader({ probe, chapter, reader }) {
      const raw = probe.text(
        ({ request }) => request.url === seriesUrl(chapter.sourceManga.mangaId, chapter.chapterId),
      );
      const data = pageProperty<ReaderChapter>(raw, "chapter");
      expect(slugToId(data.slug)).to.equal(chapter.chapterId);
      expect(slugToId(data.seriesSlug ?? data.mangaPost!.slug)).to.equal(
        chapter.sourceManga.mangaId,
      );
      const images = data.publicImages ?? data.images;
      expect(images).to.be.an("array");
      expect(images!.length).to.be.greaterThan(0);
      const ordered = [...images!].sort((a, b) => a.order - b.order);
      expect(new Set(ordered.map((image) => image.order)).size).to.equal(ordered.length);
      if (!("pages" in reader)) throw new Error("Expected image reader");
      expect(reader.pages).to.deep.equal(
        ordered.map(
          (image) => new globalThis.URL(image.url, seriesUrl(chapter.sourceManga.mangaId)).href,
        ),
      );
    },
    async filter(form) {
      expect(form).to.be.instanceOf(HijalaSearchForm);
      await (form as HijalaSearchForm).setTypes(["MANGA"]);
      return { title: "", metadata: form.getSearchQueryMetadata() };
    },
    assertFiltered({ probe }) {
      const capture = probe.find(
        ({ request }) => new globalThis.URL(request.url).searchParams.get("seriesType") === "MANGA",
      );
      expect(new globalThis.URL(capture.request.url).searchParams.get("seriesType")).to.equal(
        "MANGA",
      );
    },
    async guard({ extension, chapters }) {
      expect(preferences().excludeNSFW).to.equal(true);
      expect(preferences().hidePaid).to.equal(true);
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
