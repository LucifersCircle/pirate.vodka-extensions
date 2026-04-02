import type { SearchResultItem } from "@paperback/types";
import { ContentRating } from "@paperback/types";
import type { QIScansSeriesSearchResponse } from "../shared/models";
import { encodeMangaId } from "../shared/utils";

function formatSearchSubtitle(type?: string, status?: string): string {
  const parts = [type, status]
    .filter((value): value is string => Boolean(value))
    .map((value) =>
      value
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()),
    );

  return parts.join(" • ");
}

export function parseSearchResults(data: QIScansSeriesSearchResponse): SearchResultItem[] {
  return (data.data ?? [])
    .filter((series) => {
      if (!series.title || series.title.trim().length === 0) {
        return false;
      }
      if (series.title.startsWith("http://") || series.title.startsWith("https://")) {
        return false;
      }
      return true;
    })
    .map((series) => {
      const imageUrl = series.cover || "";

      return {
        mangaId: encodeMangaId(series.slug),
        title: Application.decodeHTMLEntities(series.title),
        imageUrl: imageUrl,
        subtitle: formatSearchSubtitle(series.type, series.status),
        contentRating: ContentRating.EVERYONE,
      };
    });
}
