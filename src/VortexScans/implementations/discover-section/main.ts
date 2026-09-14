import type { DiscoverSection, DiscoverSectionItem, PagedResults } from "@paperback/types";
import { DiscoverSectionType, URL } from "@paperback/types";
import { fetchJSON, fetchText } from "../../services/network";
import {
  DOMAIN,
  DOMAIN_API,
  HOME_SECTION_METADATA_ID,
  PAGE_SIZE,
  type Metadata,
  type VortexCollectionsResponse,
  type VortexGenre,
  type VortexQueryResponse,
} from "../shared/models";
import { getVortexGenres } from "../shared/utils";
import { parsePopularTodayItems, parseSimpleDiscoverItems } from "./parsers";

const DISCOVER_SECTIONS: DiscoverSection[] = [
  { id: "popular-today", title: "Popular Today", type: DiscoverSectionType.prominentCarousel },
  { id: "latest-releases", title: "Latest Releases", type: DiscoverSectionType.genres },
  { id: "collections", title: "Collections", type: DiscoverSectionType.genres },
  { id: "most-popular", title: "Most Popular", type: DiscoverSectionType.simpleCarousel },
  { id: "genres", title: "Genres", type: DiscoverSectionType.genres },
];

const ACTUAL_GENRES = new Map<string, string>([
  ["action", "Action"],
  ["adventure", "Adventure"],
  ["comedy", "Comedy"],
  ["drama", "Drama"],
  ["fantasy", "Fantasy"],
  ["gender bender", "Gender Bender"],
  ["gore", "Gore"],
  ["harem", "Harem"],
  ["historical", "Historical"],
  ["horror", "Horror"],
  ["isekai", "Isekai"],
  ["josei", "Josei"],
  ["martial arts", "Martial Arts"],
  ["mature", "Mature"],
  ["mystery", "Mystery"],
  ["psychological", "Psychological"],
  ["romance", "Romance"],
  ["school life", "School Life"],
  ["sci-fi", "Sci-Fi"],
  ["scifi", "Sci-Fi"],
  ["seinen", "Seinen"],
  ["shojo", "Shoujo"],
  ["shoujo", "Shoujo"],
  ["shonen", "Shounen"],
  ["shounen", "Shounen"],
  ["slice of life", "Slice of Life"],
  ["sports", "Sports"],
  ["supernatural", "Supernatural"],
  ["thriller", "Thriller"],
  ["tragedy", "Tragedy"],
]);

export class DiscoverProvider {
  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return DISCOVER_SECTIONS;
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: Metadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    switch (section.id) {
      case "popular-today":
        return this.getPopularTodayItems();
      case "latest-releases":
        return getLatestReleaseItems();
      case "collections":
        return this.getCollectionItems();
      case "most-popular":
        return this.getMostPopularItems(metadata?.page ?? 1);
      case "genres":
        return this.getGenreItems();
      default:
        throw new Error(`Unknown discover section: ${section.id}`);
    }
  }

  private async getPopularTodayItems(): Promise<PagedResults<DiscoverSectionItem>> {
    const html = await fetchText({ url: DOMAIN, method: "GET" });
    return { items: parsePopularTodayItems(html), metadata: undefined };
  }

  private async getCollectionItems(): Promise<PagedResults<DiscoverSectionItem>> {
    const data = await fetchJSON<VortexCollectionsResponse>({
      url: new URL(DOMAIN_API).addPathComponent("collections").toString(),
      method: "GET",
    });

    const items = (data.collections ?? [])
      .filter((collection) => collection.isPublished !== false)
      .sort(
        (left, right) =>
          (left.displayOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.displayOrder ?? Number.MAX_SAFE_INTEGER),
      )
      .map((collection) => ({
        type: "genresCarouselItem" as const,
        name: collection.title.trim(),
        searchQuery: {
          title: "",
          metadata: [
            {
              id: HOME_SECTION_METADATA_ID,
              value: `collection:${collection.slug}`,
            },
          ],
        },
      }));

    return { items, metadata: undefined };
  }

  private async getMostPopularItems(page: number): Promise<PagedResults<DiscoverSectionItem>> {
    const url = new URL(DOMAIN_API)
      .addPathComponent("query")
      .setQueryItem("page", page.toString())
      .setQueryItem("perPage", PAGE_SIZE.toString())
      .setQueryItem("view", "archive")
      .setQueryItem("orderBy", "totalViews")
      .setQueryItem("orderDirection", "desc")
      .setQueryItem("isNovel", "false")
      .toString();
    const data = await fetchJSON<VortexQueryResponse>({ url, method: "GET" });

    return {
      items: parseSimpleDiscoverItems(data),
      metadata: page * PAGE_SIZE < (data.totalCount ?? 0) ? { page: page + 1 } : undefined,
    };
  }

  private async getGenreItems(): Promise<PagedResults<DiscoverSectionItem>> {
    return {
      items: buildGenreItems(await getVortexGenres()),
      metadata: undefined,
    };
  }
}

function getLatestReleaseItems(): PagedResults<DiscoverSectionItem> {
  return {
    items: [
      { name: "Latest", value: "latest" },
      { name: "New", value: "new" },
    ].map(({ name, value }) => ({
      type: "genresCarouselItem" as const,
      name,
      searchQuery: {
        title: "",
        metadata: [{ id: HOME_SECTION_METADATA_ID, value }],
      },
    })),
    metadata: undefined,
  };
}

function buildGenreItems(genres: VortexGenre[]): DiscoverSectionItem[] {
  const selected = new Map<string, VortexGenre>();

  for (const genre of genres) {
    const displayName = ACTUAL_GENRES.get(genre.name.trim().toLowerCase());
    if (displayName && !selected.has(displayName)) {
      selected.set(displayName, genre);
    }
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, genre]) => ({
      type: "genresCarouselItem" as const,
      name,
      searchQuery: {
        title: "",
        metadata: [{ id: "genres", value: { [genre.id]: "included" as const } }],
      },
    }));
}
