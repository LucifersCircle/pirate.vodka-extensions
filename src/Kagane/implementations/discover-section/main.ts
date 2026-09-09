/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type { DiscoverSection, DiscoverSectionItem, PagedResults, Request } from "@paperback/types";
import { CloudflareError, DiscoverSectionType, URL } from "@paperback/types";

import { fetchJSON } from "../../services/network";
import { getShowSource } from "../settings-form/main";
import {
  API_URL,
  HOME_SECTION_METADATA_ID,
  PAGE_SIZE,
  type DetailsDto,
  type KaganeMetadata,
  type KaganeSearchBook,
  type SearchDto,
} from "../shared/models";
import { getKaganeGenres, getKaganeMetadata, hasCoverImage } from "../shared/utils";
import { buildSearchBody } from "../search-results/main";
import { mapChapterUpdateItem, mapFeaturedDiscoverItem, mapSimpleDiscoverItem } from "./parsers";

const DISCOVER_SECTIONS: DiscoverSection[] = [
  { id: "popular", title: "Popular", type: DiscoverSectionType.featured },
  { id: "trending", title: "Trending", type: DiscoverSectionType.genres },
  { id: "latest", title: "Latest Updates", type: DiscoverSectionType.chapterUpdates },
  { id: "recently-added", title: "Recently Added", type: DiscoverSectionType.simpleCarousel },
  { id: "genres", title: "Genres", type: DiscoverSectionType.genres },
];

const SORTS: Record<string, string> = {
  popular: "total_views,desc",
  latest: "updated_at,desc",
  "recently-added": "created_at,desc",
};

const TRENDING_RANGES = [
  { title: "Today", sort: "avg_views_today,desc" },
  { title: "This Week", sort: "avg_views_week,desc" },
  { title: "This Month", sort: "avg_views_month,desc" },
  { title: "All Time", sort: "avg_views,desc" },
];

export class DiscoverProvider {
  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return DISCOVER_SECTIONS;
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: { page?: number },
  ): Promise<PagedResults<DiscoverSectionItem>> {
    if (section.id === "trending") return getTrendingItems();
    if (section.id === "genres") return getGenreItems();

    const page = metadata?.page ?? 1;
    const sort = SORTS[section.id];
    if (!sort) {
      throw new Error(`Unknown discover section: ${section.id}`);
    }

    const kaganeMetadata = await getKaganeMetadata();
    const body = await buildSearchBody({ title: "", metadata: [] }, kaganeMetadata);
    const size = section.id === "popular" ? 5 : PAGE_SIZE;
    const url = new URL(API_URL)
      .addPathComponent("api")
      .addPathComponent("v2")
      .addPathComponent("search")
      .addPathComponent("series")
      .setQueryItem("page", String(page - 1))
      .setQueryItem("size", String(size))
      .setQueryItem("sort", sort)
      .toString();

    const request: Request = {
      url,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    };
    const data = await fetchJSON<SearchDto>(request);
    const books = (data.content ?? []).filter(hasCoverImage);
    const items = await mapSectionItems(section.id, books, kaganeMetadata);

    return {
      items,
      metadata: section.id !== "popular" && data.last === false ? { page: page + 1 } : undefined,
    };
  }
}

async function mapSectionItems(
  sectionId: string,
  books: Array<KaganeSearchBook & { cover_image_id: string }>,
  metadata: KaganeMetadata,
): Promise<DiscoverSectionItem[]> {
  const showSource = getShowSource();
  if (sectionId === "popular") {
    const details = await Promise.all(books.map((book) => safeDetails(book.series_id)));
    return books.map((book, index) =>
      mapFeaturedDiscoverItem(book, details[index], metadata.sources, showSource),
    );
  }

  if (sectionId === "latest") {
    return books
      .map((book) => mapChapterUpdateItem(book, metadata.sources, showSource))
      .filter((item): item is DiscoverSectionItem => item !== undefined);
  }

  return books.map((book) => mapSimpleDiscoverItem(book, metadata.sources, showSource));
}

async function safeDetails(seriesId: string): Promise<DetailsDto | undefined> {
  try {
    return await fetchJSON<DetailsDto>({
      url: new URL(API_URL)
        .addPathComponent("api")
        .addPathComponent("v2")
        .addPathComponent("series")
        .addPathComponent(seriesId)
        .toString(),
      method: "GET",
    });
  } catch (error) {
    if (error instanceof CloudflareError) throw error;
    return undefined;
  }
}

function getTrendingItems(): PagedResults<DiscoverSectionItem> {
  return {
    items: TRENDING_RANGES.map((range) => ({
      type: "genresCarouselItem" as const,
      name: range.title,
      searchQuery: {
        title: "",
        metadata: [{ id: HOME_SECTION_METADATA_ID, value: range.sort }],
      },
    })),
    metadata: undefined,
  };
}

async function getGenreItems(): Promise<PagedResults<DiscoverSectionItem>> {
  const genres = (await getKaganeGenres())
    .filter((genre) => !genre.genre_type || genre.genre_type.toLowerCase() === "genre")
    .sort((left, right) => left.genre_name.localeCompare(right.genre_name));

  return {
    items: genres.map((genre) => ({
      type: "genresCarouselItem" as const,
      name: genre.genre_name,
      searchQuery: {
        title: "",
        metadata: [{ id: "genres", value: { [genre.id]: "included" as const } }],
      },
    })),
    metadata: undefined,
  };
}
