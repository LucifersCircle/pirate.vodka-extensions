/* SPDX-License-Identifier: GPL-3.0-or-later */
import { ContentRating, type SourceManga, type Chapter } from "@paperback/types";
import { DOMAIN, type Detail } from "./MarumaruAPI";
export function sourceManga(detail: Detail): SourceManga {
  return {
    mangaId: detail.id,
    mangaInfo: {
      primaryTitle: detail.title,
      secondaryTitles: [],
      thumbnailUrl: detail.cover,
      synopsis: detail.summary ?? "",
      author: detail.author,
      contentRating: detail.explicitlyAdult ? ContentRating.ADULT : ContentRating.MATURE,
      shareUrl: `${DOMAIN}/manhwa/${detail.id}`,
      tagGroups: [
        {
          id: "genres",
          title: "Genres",
          tags: detail.genres.map((title) => ({ id: encodeURIComponent(title), title })),
        },
      ],
      ...(detail.rating === undefined ? {} : { rating: detail.rating }),
      additionalInfo: {
        sourceContentRating: detail.explicitlyAdult
          ? "Source explicitly marks adult"
          : "Unclassified; Mature is a compatibility fallback, not a site age rating.",
      },
    },
  };
}
export function chapters(detail: Detail, source: SourceManga): Chapter[] {
  if (source.mangaId !== detail.id || !source.mangaInfo)
    throw new Error("Marumaru SourceManga identity mismatch");
  // parseDetail validates the complete inventory before this availability filter.
  // Missing or unknown readiness is not evidence that a chapter is unavailable.
  return detail.chapters
    .filter((chapter) => chapter.ready !== false)
    .map((chapter) => ({
      chapterId: chapter.id,
      sourceManga: source,
      chapNum: chapter.sourceNumber,
      title: chapter.title,
      publishDate: chapter.date,
      langCode: "ko",
      sortingIndex: chapter.sourceNumber,
      additionalInfo: { sourceNumber: String(chapter.sourceNumber) },
    }));
}
