import type { DiscoverSection, DiscoverSectionItem, PagedResults } from "@paperback/types";
import { DiscoverSectionType, URL } from "@paperback/types";
import { fetchJSON } from "../../services/network";
import {
  DOMAIN_API,
  HOME_SECTION_METADATA_ID,
  type Metadata,
  type VortexCollectionsResponse,
  type VortexGenre,
  type VortexQueryResponse,
} from "../shared/models";
import { contentSettings, withContentSettings } from "../shared/content";
import { buildMangaId, getVortexGenres } from "../shared/utils";
import { parseHomepageItems, parsePopularTodayItems } from "./parsers";
import { HOME_PAGE_SIZE, homeHTML, parseHome, type HomePost } from "./home";

const DISCOVER_SECTIONS: DiscoverSection[] = [
  { id: "featured", title: "Featured", type: DiscoverSectionType.prominentCarousel },
  { id: "popular-today", title: "Popular Today", type: DiscoverSectionType.prominentCarousel },
  { id: "release-filters", title: "Browse releases", type: DiscoverSectionType.genres },
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
    return withContentSettings(() => this.fetchDiscoverSectionItems(section, metadata));
  }
  private async fetchDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: Metadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    switch (section.id) {
      case "featured":
        return {
          items: metadata ? [] : parseHomepageItems(parseHome(await homeHTML()).featured, true),
        };
      case "popular-today":
        return this.getPopularTodayItems();
      case "latest-releases":
        return this.getLatestItems(metadata);
      case "release-filters":
        return getLatestReleaseItems();
      case "collections":
        return this.getCollectionItems();
      case "most-popular":
        return { items: metadata ? [] : parseHomepageItems(parseHome(await homeHTML()).popular) };
      case "genres":
        return this.getGenreItems();
      default:
        throw new Error(`Unknown discover section: ${section.id}`);
    }
  }

  private async getPopularTodayItems(): Promise<PagedResults<DiscoverSectionItem>> {
    const html = await homeHTML();
    return { items: parsePopularTodayItems(html, parseHome(html).today), metadata: undefined };
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

  private async getLatestItems(metadata?: Metadata): Promise<PagedResults<DiscoverSectionItem>> {
    type Cursor = { home: "latest"; page: number; seen: string[]; contentContext: string };
    const contentContext = JSON.stringify(contentSettings());
    const cursor = metadata as Partial<Cursor> | undefined;
    if (!cursor) {
      const posts = parseHome(await homeHTML()).latest;
      const items = parseHomepageItems(posts);
      if (!items.length && posts.length === HOME_PAGE_SIZE)
        return this.getLatestItems({
          home: "latest",
          page: 2,
          seen: posts.map((post) => buildMangaId(post.id, post.slug)),
          contentContext,
        } as Metadata);
      return {
        items,
        metadata:
          posts.length === HOME_PAGE_SIZE
            ? {
                home: "latest",
                contentContext,
                page: 2,
                seen: posts.map((post) => buildMangaId(post.id, post.slug)),
              }
            : undefined,
      };
    }
    if (
      cursor.home !== "latest" ||
      cursor.contentContext !== contentContext ||
      !Number.isSafeInteger(cursor.page) ||
      cursor.page! < 2 ||
      cursor.page! > 100 ||
      !Array.isArray(cursor.seen) ||
      cursor.seen.some((id) => typeof id !== "string" || id.length > 1024) ||
      cursor.seen.length > 10000 ||
      new Set(cursor.seen).size !== cursor.seen.length
    )
      throw new Error("Invalid VortexScans homepage cursor. Refresh to continue.");
    const seen = new Set(cursor.seen);
    for (let page = cursor.page!, attempt = 0; page <= 100 && attempt < 10; page++, attempt++) {
      const data = await fetchJSON<VortexQueryResponse>({
        url: new URL(DOMAIN_API)
          .addPathComponent("posts")
          .setQueryItem("page", String(page))
          .setQueryItem("perPage", String(HOME_PAGE_SIZE))
          .setQueryItem("searchTerm", "")
          .setQueryItem("isNovel", "false")
          .setQueryItem("tag", "latestUpdatePinned")
          .toString(),
        method: "GET",
      });
      if (!Array.isArray(data.posts) || data.posts.length > HOME_PAGE_SIZE)
        throw new Error("VortexScans returned an invalid homepage continuation.");
      const next: HomePost[] = [];
      for (const post of data.posts) {
        const id = buildMangaId(post.id, post.slug);
        if (!seen.has(id)) next.push(post);
        seen.add(id);
      }
      const continues = data.posts.length === HOME_PAGE_SIZE;
      if (seen.size > 10000 || (continues && page === 100))
        throw new Error("VortexScans homepage traversal exceeded its bound. Refresh to continue.");
      const items = parseHomepageItems(next);
      if (items.length || !continues)
        return {
          items,
          metadata: continues
            ? { home: "latest", contentContext, page: page + 1, seen: [...seen] }
            : undefined,
        };
    }
    throw new Error("No new titles in ten VortexScans homepage pages. Refresh to continue.");
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
