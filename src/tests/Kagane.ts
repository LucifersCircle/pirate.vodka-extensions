/* eslint-disable no-unused-expressions */
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex; 2026 Lucifers Circle */
import { type TestLogger } from "@paperback/types";
import { expect } from "chai";
import { Kagane, type KaganeImplementation } from "../Kagane/main";
import sourceInfo from "../Kagane/pbconfig";
import {
  API_URL,
  type ChapterBook,
  type ChapterIndexDto,
  type ChapterPageDto,
  type DetailsDto,
  type ChallengeDto,
} from "../Kagane/implementations/shared/models";
import { TestSuite, registerNativeContracts, rejects, type NativeExtension } from "./suite";
export async function runTests(logger: TestLogger) {
  const source = Kagane as typeof Kagane & KaganeImplementation;
  const suite = new TestSuite("Kagane native contracts", logger);
  const probe = registerNativeContracts(suite, source as unknown as NativeExtension, sourceInfo, {
    // The recent simple list does not trigger Featured's five detail enrichments.
    discoverySectionId: "recently-added",
    detailMangaId: "019c2084-fa67-791d-8ba5-494744577445",
    documentBudget: {
      maximum: 20,
      reason:
        "Native preflight measured 15 documents: taxonomy bootstrap, discovery, 3 search calls, fixed >200-chapter detail/index/cursor pages, integrity/reader manifest and one filter roundtrip. These require the documented 20-document exception. Complete inventory pagination is exercised, never truncated.",
    },
    assertInventory({ probe, source, chapters, logger }) {
      const base = `${API_URL}/api/v2/series/${source.mangaId}`;
      const details = probe.json<DetailsDto>(({ request }) => request.url === base);
      let books: ChapterBook[];
      if (details.series_books) books = details.series_books;
      else {
        const index = probe.json<ChapterIndexDto>(
          ({ request }) => request.url === base + "/books/index",
        );
        const pages = probe.captures.filter(({ request }) =>
          request.url.startsWith(base + "/books?"),
        );
        expect(index.count, "fixed canary exercises inventory pagination").to.be.greaterThan(200);
        expect(
          pages.length,
          "native inventory consumes the offered continuation",
        ).to.be.greaterThan(1);
        logger.log("pagination", { pages: pages.length, declaredChapters: index.count });
        books = pages.flatMap(
          ({ data }) =>
            (JSON.parse(Application.arrayBufferToUTF8String(data)) as ChapterPageDto).items,
        );
        expect(books.length, "full chapter index, never a budget slice").to.equal(index.count);
        const field = index.fields.indexOf("book_id");
        expect(field).to.be.at.least(0);
        expect(new Set(books.map((book) => book.book_id))).to.deep.equal(
          new Set(index.books.map((row) => row[field])),
        );
        const last = JSON.parse(
          Application.arrayBufferToUTF8String(pages.at(-1)!.data),
        ) as ChapterPageDto;
        expect(last.next_cursor, "native chapter inventory reached its terminal page").to.equal(
          null,
        );
      }
      expect(chapters.map((chapter) => chapter.chapterId)).to.deep.equal(
        books.map((book) => book.book_id),
      );
      expect(chapters.map((chapter) => chapter.sortingIndex)).to.deep.equal(books.map((_, i) => i));
    },
    assertReader({ probe, chapter, reader }) {
      const manifest = probe.json<ChallengeDto>(({ request }) =>
        request.url.startsWith(`${API_URL}/api/v2/books/${chapter.chapterId}?`),
      );
      if (!("pages" in reader)) throw new Error("Expected image reader");
      const pages = [...(manifest.manifest?.pages ?? [])].sort((a, b) => a.page_no - b.page_no);
      expect(reader.pages).to.have.length(pages.length);
      pages.forEach((page, index) => {
        const native = new globalThis.URL(reader.pages[index]);
        expect(
          native.origin === new globalThis.URL(manifest.cache_url).origin,
          "source-issued reader cache origin",
        ).to.equal(true);
        expect(native.pathname).to.equal(
          `/api/v2/books/page/${chapter.chapterId}/${page.page_id}.${page.ext ?? "jxl"}`,
        );
        expect(
          native.searchParams.get("token") === manifest.access_token,
          "exact source-issued reader authorization",
        ).to.equal(true);
      });
    },
    async prepareForms() {
      await source.getSearchFilters();
    },
    async filter(form) {
      const row = form
        .getSections()
        .flatMap((section) => section.items)
        .find((item) => item.id === "current_books_min");
      if (!row || !("onValueChange" in row)) throw new Error("Missing native chapter-count input");
      await Application.SelectorRegistry.selector<(value: string) => Promise<void>>(
        row.onValueChange as string,
      )("1");
      return { title: "", metadata: form.getSearchQueryMetadata() };
    },
    assertFiltered({ probe, items }) {
      const capture = probe.find(({ request }) => {
        if (typeof request.body !== "string" || !request.url.includes("/search/series"))
          return false;
        return JSON.parse(request.body).current_books?.min === 1;
      });
      const raw = JSON.parse(Application.arrayBufferToUTF8String(capture.data)) as {
        content: { series_id: string; current_books: number }[];
      };
      for (const item of items)
        expect(
          raw.content.find((row) => row.series_id === item.mangaId)?.current_books,
        ).to.be.at.least(1);
    },
    async guard() {
      await rejects(() => source.getSearchResults({ title: "" }, { page: 0 }), /pagination/);
      await rejects(
        () =>
          source.getSearchResults({
            title: "",
            metadata: [{ id: "current_books_min", value: "-1" }],
          }),
        /numeric range/,
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
