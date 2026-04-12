import type { SearchFilter, SearchResultItem } from "@paperback/types";
import { ContentRating } from "@paperback/types";
import type { CheerioAPI } from "cheerio";
import { DOMAIN } from "../shared/models";

type FilterValue = string | Record<string, "included" | "excluded">;
type FilterEntry = { id: string; value: FilterValue };

export function parseSearchResults($: CheerioAPI): SearchResultItem[] {
  const results: SearchResultItem[] = [];

  $("div.item-list div.section.group.list").each((_, el) => {
    const cover = $("div.col.cover", el);
    const info = $("div.col.info", el);

    const href = $("a", cover).attr("href") ?? "";
    const img = $("img", cover);
    const title = img.attr("title") ?? $("a", info).first().text().trim() ?? "";
    const imageUrl = img.attr("src") ?? "";
    const subtitle = info.find("p").eq(1).text().trim();

    const mangaId = href.replace(/^\/Comic\//, "").replace(/\/$/, "");

    if (!mangaId || !title) return;

    const fullImageUrl = imageUrl.startsWith("/") ? DOMAIN + imageUrl : imageUrl;

    results.push({
      mangaId,
      title: Application.decodeHTMLEntities(title),
      imageUrl: fullImageUrl,
      subtitle,
      contentRating: ContentRating.EVERYONE,
    });
  });

  return results;
}

export function readDropdownFilter(
  filters: FilterEntry[],
  filterId: string,
  fallback: string,
): string {
  const entry = filters.find((filter) => filter.id === filterId);
  if (!entry) return fallback;

  const value = entry.value;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function readMultiselectFilter(filters: FilterEntry[], filterId: string): string[] {
  const entry = filters.find((filter) => filter.id === filterId);
  if (!entry) return [];

  const value = entry.value;
  if (typeof value === "string") return [];

  return Object.entries(value)
    .filter(([, state]) => state === "included")
    .map(([id]) => id);
}

export function readExcludedMultiselectFilter(filters: FilterEntry[], filterId: string): string[] {
  const entry = filters.find((filter) => filter.id === filterId);
  if (!entry) return [];

  const value = entry.value;
  if (typeof value === "string") return [];

  return Object.entries(value)
    .filter(([, state]) => state === "excluded")
    .map(([id]) => id);
}

export function buildSearchFilters($: CheerioAPI): SearchFilter[] {
  const genreOptions = $("ul#genres li")
    .map((_, element) => {
      const select = $("select[gid]", element);
      const id = select.attr("gid")?.trim() ?? "";
      const value = $("a[name='aGenre']", element).text().trim();

      if (!id || !value) {
        return undefined;
      }

      return { id, value: Application.decodeHTMLEntities(value) };
    })
    .get()
    .filter((option): option is { id: string; value: string } => option !== undefined);

  const yearOptions = $("select#pubDate option")
    .map((_, element) => ({
      id: $(element).attr("value")?.trim() ?? "",
      value: $(element).text().trim(),
    }))
    .get();

  return [
    {
      type: "multiselect",
      id: "genres",
      title: "Genres",
      options: genreOptions,
      value: {},
      allowExclusion: true,
      allowEmptySelection: true,
      maximum: undefined,
    },
    {
      type: "dropdown",
      id: "publicationYear",
      title: "Year",
      options: yearOptions,
      value: "",
    },
  ];
}
