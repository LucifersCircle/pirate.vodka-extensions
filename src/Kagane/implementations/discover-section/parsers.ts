/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type { DiscoverSectionItem } from "@paperback/types";

import type { DetailsDto, KaganeSearchBook, SourceDto } from "../shared/models";
import {
  buildImageUrl,
  getPaperbackContentRating,
  joinUnique,
  parseKaganeDate,
} from "../shared/utils";

export function mapSimpleDiscoverItem(
  book: KaganeSearchBook,
  sources: SourceDto[],
  showSource: boolean,
): DiscoverSectionItem {
  return {
    type: "simpleCarouselItem",
    mangaId: book.series_id,
    title: buildDisplayTitle(book, sources, showSource),
    imageUrl: buildImageUrl(book.cover_image_id),
    subtitle: typeof book.current_books === "number" ? `${book.current_books} Chapters` : undefined,
    contentRating: getPaperbackContentRating(book.content_rating),
  };
}

export function mapChapterUpdateItem(
  book: KaganeSearchBook,
  sources: SourceDto[],
  showSource: boolean,
): DiscoverSectionItem | undefined {
  const latest = book.latest_chapters?.[0];
  if (!latest?.book_id) return undefined;

  return {
    type: "chapterUpdatesCarouselItem",
    mangaId: book.series_id,
    chapterId: latest.book_id,
    title: buildDisplayTitle(book, sources, showSource),
    imageUrl: buildImageUrl(book.cover_image_id),
    subtitle: buildChapterLabel(latest.volume_no, latest.chapter_no),
    publishDate: parseKaganeDate(latest.available_at ?? latest.created_at),
    contentRating: getPaperbackContentRating(book.content_rating),
  };
}

export function mapFeaturedDiscoverItem(
  book: KaganeSearchBook,
  details: DetailsDto | undefined,
  sources: SourceDto[],
  showSource: boolean,
): DiscoverSectionItem {
  const rating = details?.average_rating ?? details?.bayesian_rating;
  const views = details?.total_views;
  const infoItems = buildInfoItems(rating, views);
  const authors = (details?.series_staff ?? [])
    .filter((person) => /author|story/i.test(person.role))
    .map((person) => person.name);

  return {
    type: "featuredCarouselItem",
    mangaId: book.series_id,
    title: buildDisplayTitle(book, sources, showSource),
    imageUrl: buildImageUrl(book.cover_image_id),
    supertitle: joinUnique(authors),
    summary: details?.description?.trim() || undefined,
    infoItems,
    contentRating: getPaperbackContentRating(book.content_rating),
  };
}

function buildDisplayTitle(
  book: KaganeSearchBook,
  sources: SourceDto[],
  showSource: boolean,
): string {
  const sourceName = book.source_id
    ? sources.find((source) => source.source_id === book.source_id)?.title
    : undefined;
  return showSource && sourceName ? `${book.title.trim()} [${sourceName}]` : book.title.trim();
}

function buildChapterLabel(
  volumeNo?: string | null,
  chapterNo?: string | null,
): string | undefined {
  const parts = [
    volumeNo?.trim() ? `Vol. ${volumeNo.trim()}` : undefined,
    chapterNo?.trim() ? `Ch. ${chapterNo.trim()}` : undefined,
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function buildInfoItems(
  rating?: number | null,
  views?: number | null,
):
  | [{ symbol: string; text: string }]
  | [{ symbol: string; text: string }, { symbol: string; text: string }]
  | undefined {
  const ratingItem =
    typeof rating === "number" && Number.isFinite(rating)
      ? { symbol: "star.fill", text: `${formatRating(rating)}/10` }
      : undefined;
  const viewsItem =
    typeof views === "number" && Number.isFinite(views)
      ? { symbol: "eye.fill", text: `${formatCompactNumber(views)} views` }
      : undefined;

  if (ratingItem && viewsItem) return [ratingItem, viewsItem];
  if (ratingItem) return [ratingItem];
  if (viewsItem) return [viewsItem];
  return undefined;
}

function formatRating(value: number): string {
  const rating = value > 10 ? value / 10 : value;
  return rating.toFixed(1);
}

function formatCompactNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}
