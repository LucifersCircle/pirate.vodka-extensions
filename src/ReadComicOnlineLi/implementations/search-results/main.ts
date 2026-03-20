import type { PagedResults, SearchFilter, SearchQuery, SearchResultItem } from "@paperback/types";
import { URL } from "@paperback/types";
import { DOMAIN } from "../shared/models";
import { fetchCheerio } from "../../services/network";
import { buildSearchFilters, parseSearchResults } from "./parsers";

export class SearchProvider {
  async getSearchFilters(): Promise<SearchFilter[]> {
    return buildSearchFilters();
  }

  async getSearchResults(
    query: SearchQuery,
    metadata?: { page?: number },
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const searchTerm = query.title?.trim() ?? "";

    const url = new URL(DOMAIN)
      .addPathComponent("AdvanceSearch")
      .setQueryItem("comicName", searchTerm)
      .setQueryItem("ig", "")
      .setQueryItem("eg", "")
      .setQueryItem("status", "")
      .setQueryItem("pubDate", "")
      .setQueryItem("page", String(page))
      .toString();

    const request = { url, method: "GET" as const };
    const $ = await fetchCheerio(request);
    const items = parseSearchResults($);

    return {
      items,
      metadata: items.length > 0 ? { page: page + 1 } : undefined,
    };
  }
}
