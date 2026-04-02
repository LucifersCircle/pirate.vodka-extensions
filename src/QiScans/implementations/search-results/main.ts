import type {
  PagedResults,
  Request,
  SearchFilter,
  SearchQuery,
  SearchResultItem,
  SortingOption,
} from "@paperback/types";
import { URL } from "@paperback/types";
import { DOMAIN_API, PAGE_SIZE } from "../shared/models";
import type { Metadata, QIScansSeriesSearchResponse } from "../shared/models";
import { normalizeSearchTerm } from "../shared/utils";
import { fetchJSON } from "../../services/network";
import { parseSearchResults } from "./parsers";

async function fetchSeriesSearchResults(
  url: string,
  searchTerm: string,
): Promise<QIScansSeriesSearchResponse> {
  const request: Request = { url, method: "GET" };

  try {
    return await fetchJSON<QIScansSeriesSearchResponse>(request);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (searchTerm.length < 2 && message.includes("status 400")) {
      return { data: [] };
    }

    throw error;
  }
}

export class SearchProvider {
  async getSearchResults(
    query: SearchQuery,
    metadata?: Metadata,
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const searchTerm = normalizeSearchTerm(query.title ?? "");

    if (searchTerm.length > 0 && searchTerm.length < 2) {
      return {
        items: [],
        metadata: undefined,
      };
    }

    let urlBuilder = searchTerm
      ? new URL(DOMAIN_API)
          .addPathComponent("v1")
          .addPathComponent("series")
          .addPathComponent("search")
          .setQueryItem("q", searchTerm)
          .setQueryItem("page", page.toString())
          .setQueryItem("perPage", PAGE_SIZE.toString())
      : new URL(DOMAIN_API)
          .addPathComponent("v1")
          .addPathComponent("series")
          .setQueryItem("page", page.toString())
          .setQueryItem("perPage", PAGE_SIZE.toString())
          .setQueryItem("sort", sortingOption?.id ?? "latest");

    if (!searchTerm) {
      const statusFilter = query.filters?.find((filter) => filter.id === "status");
      if (typeof statusFilter?.value === "string" && statusFilter.value.trim()) {
        urlBuilder = urlBuilder.setQueryItem("status", statusFilter.value);
      }

      const typeFilter = query.filters?.find((filter) => filter.id === "type");
      if (typeof typeFilter?.value === "string" && typeFilter.value.trim()) {
        urlBuilder = urlBuilder.setQueryItem("type", typeFilter.value);
      }
    }

    const url = urlBuilder.toString();
    const request: Request = { url, method: "GET" };
    let data = searchTerm
      ? await fetchSeriesSearchResults(url, searchTerm)
      : await fetchJSON<QIScansSeriesSearchResponse>(request);
    let results = parseSearchResults(data);

    if (results.length === 0 && searchTerm.includes("'")) {
      const curlySearchTerm = searchTerm.replace(/'/g, "\u2019");
      urlBuilder = new URL(DOMAIN_API)
        .addPathComponent("v1")
        .addPathComponent("series")
        .addPathComponent("search")
        .setQueryItem("q", curlySearchTerm)
        .setQueryItem("page", page.toString())
        .setQueryItem("perPage", PAGE_SIZE.toString());

      const retryUrl = urlBuilder.toString();
      data = await fetchSeriesSearchResults(retryUrl, curlySearchTerm);
      results = parseSearchResults(data);
    }

    const hasNext = (data.data?.length ?? 0) >= PAGE_SIZE;

    return {
      items: results,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    const statusFilter: SearchFilter = {
      type: "dropdown",
      id: "status",
      title: "Status",
      options: [
        { id: "", value: "All" },
        { id: "ONGOING", value: "Ongoing" },
        { id: "HIATUS", value: "Hiatus" },
        { id: "DROPPED", value: "Dropped" },
        { id: "COMPLETED", value: "Completed" },
      ],
      value: "",
    };

    const typeFilter: SearchFilter = {
      type: "dropdown",
      id: "type",
      title: "Type",
      options: [
        { id: "", value: "All Types" },
        { id: "MANGA", value: "Manga" },
        { id: "MANHWA", value: "Manhwa" },
        { id: "MANHUA", value: "Manhua" },
      ],
      value: "",
    };

    return [statusFilter, typeFilter];
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    return [
      { id: "latest", label: "Latest Updated" },
      { id: "newest", label: "Newest" },
      { id: "popular", label: "Popular" },
      { id: "alphabetical", label: "A-Z" },
    ];
  }
}
