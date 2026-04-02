import type { SearchFilter, SearchResultItem } from "@paperback/types";
import { ContentRating } from "@paperback/types";
import type { VortexGenre, VortexQueryResponse } from "../shared/models";

type FilterValue = string | Record<string, "included" | "excluded">;
type FilterEntry = { id: string; value: FilterValue };
type DropdownOption = { id: string; value: string };

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

export function buildSearchFilters(
  genres: VortexGenre[],
  statusOptions: DropdownOption[],
  typeOptions: DropdownOption[],
): SearchFilter[] {
  return [
    {
      type: "dropdown",
      id: "status",
      title: "Status",
      options: statusOptions,
      value: "",
    },
    {
      type: "dropdown",
      id: "type",
      title: "Type",
      options: typeOptions,
      value: "",
    },
    {
      type: "multiselect",
      id: "genres",
      title: "Genres",
      options: genres
        .filter((genre) => genre.name !== "hidden")
        .map((genre) => ({
          id: genre.id.toString(),
          value: genre.name,
        })),
      value: {},
      allowExclusion: true,
      allowEmptySelection: true,
      maximum: undefined,
    },
  ];
}

export function parseSearchResults(data: VortexQueryResponse): SearchResultItem[] {
  return (data.posts ?? [])
    .filter((post) => post.postTitle && post.postTitle.trim().length > 0 && !post.isNovel)
    .map((post) => {
      const mangaId = post.id.toString();

      return {
        mangaId,
        title: Application.decodeHTMLEntities(post.postTitle),
        imageUrl: post.featuredImage || "",
        subtitle: `${post._count?.chapters ?? 0} Chapters`,
        contentRating: ContentRating.EVERYONE,
      };
    });
}
