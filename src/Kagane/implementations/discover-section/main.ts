/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type { DiscoverSection, DiscoverSectionItem, PagedResults, Request } from "@paperback/types";
import { DiscoverSectionType, URL } from "@paperback/types";

import { fetchJSON } from "../../services/network";
import { getShowSource } from "../settings-form/main";
import { API_URL, PAGE_SIZE, type SearchDto } from "../shared/models";
import { getKaganeMetadata, hasCoverImage } from "../shared/utils";
import { buildSearchBody } from "../search-results/main";
import { mapDiscoverItem } from "./parsers";

const DISCOVER_SECTIONS: DiscoverSection[] = [
  { id: "popular", title: "Popular", type: DiscoverSectionType.simpleCarousel },
  { id: "latest", title: "Latest Updates", type: DiscoverSectionType.simpleCarousel },
];

const SORTS: Record<string, string> = {
  popular: "total_views,desc",
  latest: "updated_at,desc",
};

export class DiscoverProvider {
  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return DISCOVER_SECTIONS;
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: { page?: number },
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const sort = SORTS[section.id];
    if (!sort) {
      throw new Error(`Unknown discover section: ${section.id}`);
    }

    const kaganeMetadata = await getKaganeMetadata();
    const body = buildSearchBody({ title: "", metadata: [] }, kaganeMetadata);
    const url = new URL(API_URL)
      .addPathComponent("api")
      .addPathComponent("v2")
      .addPathComponent("search")
      .addPathComponent("series")
      .setQueryItem("page", String(page - 1))
      .setQueryItem("size", String(PAGE_SIZE))
      .setQueryItem("sort", sort)
      .toString();

    const request: Request = {
      url,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    };
    const data = await fetchJSON<SearchDto>(request);
    const items = (data.content ?? [])
      .filter(hasCoverImage)
      .map((book) => mapDiscoverItem(book, kaganeMetadata.sources, getShowSource()));

    return {
      items,
      metadata: data.last === false && items.length > 0 ? { page: page + 1 } : undefined,
    };
  }
}
