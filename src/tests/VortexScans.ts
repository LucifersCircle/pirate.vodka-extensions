/* eslint-disable no-unused-expressions */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle; original extension contributors */
import { ContentRating, type TestLogger } from "@paperback/types";
import { expect } from "chai";
import { VortexScans, type VortexScansImplementation } from "../VortexScans/main";
import sourceInfo from "../VortexScans/pbconfig";
import {
  DOMAIN,
  DOMAIN_API,
  type VortexChaptersResponse,
} from "../VortexScans/implementations/shared/models";
import { assertMangaAllowed, contentSettings } from "../VortexScans/implementations/shared/content";
import * as cheerio from "cheerio";
import { TestSuite, registerNativeContracts, rejects, type NativeExtension } from "./suite";
export async function runTests(logger: TestLogger) {
  const source = VortexScans as typeof VortexScans & VortexScansImplementation;
  const suite = new TestSuite("VortexScans native contracts", logger);
  const probe = registerNativeContracts(suite, source as unknown as NativeExtension, sourceInfo, {
    discoverySectionId: "featured",
    query: { title: "Got a Gallery in the Wild" },
    mangaId: "658:got-a-gallery-in-the-wild",
    assertInventory({ probe, source, chapters }) {
      const raw = probe.json<VortexChaptersResponse>(
        ({ request }) =>
          request.url.startsWith(`${DOMAIN_API}/chapters?`) &&
          request.url.includes(`postId=${source.mangaId.split(":")[0]}&`),
      );
      const all = raw.post?.chapters;
      expect(all).to.be.an("array").and.not.empty;
      expect(all, "complete server chapter inventory, not the request take limit").to.have.length(
        raw.totalChapterCount,
      );
      const expected = [...all!]
        .filter((chapter) => !chapter.isLocked)
        .sort((a, b) => a.number - b.number || Date.parse(a.createdAt) - Date.parse(b.createdAt));
      expect(
        chapters.map((chapter) => [chapter.chapterId, chapter.chapNum, chapter.sortingIndex]),
      ).to.deep.equal(expected.map((chapter, i) => [chapter.slug, chapter.number, i]));
    },
    assertReader({ probe, chapter, reader }) {
      const slug =
        chapter.sourceManga.mangaInfo.additionalInfo?.slug ??
        chapter.sourceManga.mangaId.split(":")[1];
      const url = `${DOMAIN}/series/${slug}/${chapter.chapterId}`;
      const $ = cheerio.load(probe.text(({ request }) => request.url === url));
      const canonical = $("link[rel=canonical]").attr("href");
      if (canonical) expect(canonical).to.equal(url);
      const images = $("img[data-reader-page-image=true]")
        .toArray()
        .map((node) => ({
          index: Number($(node).attr("data-reader-index")),
          url: $(node).attr("src"),
        }))
        .sort((a, b) => a.index - b.index);
      expect(images, "actual marked native reader manifest").not.empty;
      expect(images.map((image) => image.index)).to.deep.equal(images.map((_, index) => index));
      if (!("pages" in reader)) throw new Error("Expected image reader");
      expect(reader.pages).to.deep.equal(
        images.map((image) =>
          new globalThis.URL(image.url!, url).href.replace(/([^:])\/\/+/g, "$1/"),
        ),
      );
    },
    async prepareForms() {
      await source.getSearchFilters();
    },
    async filter(form) {
      const section = form.getSections().find((entry) => entry.id === "status");
      const row = section?.items.find((item) => item.id === "ONGOING");
      if (!row || !("onSelect" in row)) throw new Error("Missing native status selector");
      await Application.SelectorRegistry.selector<() => Promise<void>>(row.onSelect as string)();
      return { title: "", metadata: form.getSearchQueryMetadata() };
    },
    assertFiltered({ probe }) {
      const capture = probe.find(
        ({ request }) =>
          new globalThis.URL(request.url).searchParams.get("seriesStatus") === "ONGOING",
      );
      expect(new globalThis.URL(capture.request.url).searchParams.get("seriesStatus")).to.equal(
        "ONGOING",
      );
    },
    async guard({ source: manga }) {
      expect(contentSettings().excludeNSFW).to.equal(true);
      expect(manga).not.to.equal(undefined);
      expect(() =>
        assertMangaAllowed({
          ...manga!,
          mangaInfo: { ...manga!.mangaInfo, contentRating: ContentRating.ADULT },
        }),
      ).to.throw(/hidden/);
      await rejects(() => source.getSearchResults({ title: "" }, { page: 0 }), /cursor/);
    },
  });
  try {
    await suite.run();
  } finally {
    logger.log("requestCounts", probe.counts());
    probe.unregisterInterceptor();
  }
}
