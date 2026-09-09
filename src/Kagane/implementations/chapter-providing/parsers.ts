/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type { Chapter, SourceManga } from "@paperback/types";

import type { ChapterBook, DetailsDto, SourceDto } from "../shared/models";
import { buildChapterTitle, parseChapterNumber, parseKaganeDate } from "../shared/utils";

const SOURCE_CHAPTER_NUMBER_FORMATS = new Set([
  "Dark Horse Comics",
  "Flame Comics",
  "MangaDex",
  "Square Enix Manga",
]);

export function parseChapterList(
  data: DetailsDto,
  sourceManga: SourceManga,
  chapterTitleMode: string,
  langCode: string,
  sources: SourceDto[],
): Chapter[] {
  const useSourceChapterNumber = shouldUseSourceChapterNumber(data, sources);
  const isOfficial = Boolean(
    data.source_id &&
    sources.find((source) => source.source_id === data.source_id)?.source_type.toLowerCase() ===
      "official",
  );
  const books = data.series_books ?? [];

  return books.map((book, index) =>
    mapChapter(
      book,
      sourceManga,
      chapterTitleMode,
      langCode,
      useSourceChapterNumber,
      isOfficial,
      index,
    ),
  );
}

function shouldUseSourceChapterNumber(data: DetailsDto, sources: SourceDto[]): boolean {
  if (data.format && SOURCE_CHAPTER_NUMBER_FORMATS.has(data.format)) {
    return true;
  }

  const sourceName = data.source_id
    ? sources.find((source) => source.source_id === data.source_id)?.title
    : undefined;
  return Boolean(sourceName && SOURCE_CHAPTER_NUMBER_FORMATS.has(sourceName));
}

function mapChapter(
  book: ChapterBook,
  sourceManga: SourceManga,
  chapterTitleMode: string,
  langCode: string,
  useSourceChapterNumber: boolean,
  isOfficial: boolean,
  sortingIndex: number,
): Chapter {
  const chapterNumber = parseChapterNumber(book.chapter_no);
  const volume = parseChapterNumber(book.volume_no);
  const hasVolumeOnly = volume !== undefined && chapterNumber === undefined;

  const chapter: Chapter = {
    chapterId: book.book_id,
    sourceManga,
    title: buildChapterTitle(book.title, book.chapter_no, book.volume_no, chapterTitleMode, [
      String(book.sort_no),
    ]),
    chapNum: hasVolumeOnly ? 0 : useSourceChapterNumber ? book.sort_no : (chapterNumber ?? 0),
    volume: volume ?? 0,
    langCode,
    version: buildVersion(book, isOfficial),
    publishDate: parseKaganeDate(book.created_at),
    sortingIndex,
  };

  return chapter;
}

function buildVersion(book: ChapterBook, isOfficial: boolean): string | undefined {
  const groups = book.groups
    ?.map((group) => group.title.trim())
    .filter(Boolean)
    .join(", ");
  if (!isOfficial) return groups || undefined;
  return groups ? `${groups} ⭐` : "Official ⭐";
}
