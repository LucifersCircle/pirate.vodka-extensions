import type {
  PagedResults,
  Request,
  SearchFilter,
  SearchQuery,
  SearchResultItem,
  SortingOption,
} from "@paperback/types";
import { URL } from "@paperback/types";
import { QISCANS_API_BASE } from "../../main";
import type { Metadata, QIScansSeriesSearchResponse } from "../shared/models";
import { normalizeSearchTerm } from "../shared/utils";
import { fetchJSON } from "../../services/network";
import { parseSearchResults } from "./parsers";

const PAGE_SIZE = 20;
const MIN_SEARCH_TERM_LENGTH = 2;

async function fetchSeriesSearchResults(
  url: string,
  searchTerm: string,
): Promise<QIScansSeriesSearchResponse> {
  try {
    return await fetchJSON<QIScansSeriesSearchResponse>({ url, method: "GET" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (searchTerm.length < MIN_SEARCH_TERM_LENGTH && message.includes("status 400")) {
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

    if (searchTerm.length > 0 && searchTerm.length < MIN_SEARCH_TERM_LENGTH) {
      return {
        items: [],
        metadata: undefined,
      };
    }

    let urlBuilder = searchTerm
      ? new URL(QISCANS_API_BASE)
          .addPathComponent("v1")
          .addPathComponent("series")
          .addPathComponent("search")
          .setQueryItem("q", searchTerm)
          .setQueryItem("page", page.toString())
          .setQueryItem("perPage", PAGE_SIZE.toString())
      : new URL(QISCANS_API_BASE)
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
    }

    const url = urlBuilder.toString();
    let data = searchTerm
      ? await fetchSeriesSearchResults(url, searchTerm)
      : await fetchJSON<QIScansSeriesSearchResponse>({ url, method: "GET" } as Request);
    let results = parseSearchResults(data);

    if (results.length === 0 && searchTerm.includes("'")) {
      const curlySearchTerm = searchTerm.replace(/'/g, "\u2019");
      urlBuilder = new URL(QISCANS_API_BASE)
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

    return [statusFilter];
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    return [
      { id: "latest", label: "Latest" },
      { id: "newest", label: "Newest" },
    ];
  }
}
