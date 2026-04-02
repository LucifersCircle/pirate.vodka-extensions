import type {
  PagedResults,
  Request,
  SearchFilter,
  SearchQuery,
  SearchResultItem,
  SortingOption,
} from "@paperback/types";
import { URL } from "@paperback/types";
import {
  DOMAIN_API,
  PAGE_SIZE,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
} from "../shared/models";
import type { Metadata, VortexGenre, VortexQueryResponse } from "../shared/models";
import { fetchJSON } from "../../services/network";
import {
  buildSearchFilters,
  parseSearchResults,
  readDropdownFilter,
  readExcludedMultiselectFilter,
  readMultiselectFilter,
} from "./parsers";

export class SearchProvider {
  async getSearchResults(
    query: SearchQuery,
    metadata: Metadata,
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    type FilterEntry = { id: string; value: string | Record<string, "included" | "excluded"> };
    const filters = (query.filters ?? []) as FilterEntry[];

    const searchTerm = (query.title ?? "")
      .trim()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, " ");

    const [orderBy, orderDirection] = (sortingOption?.id ?? "lastChapterAddedAt:desc").split(":");
    const status = readDropdownFilter(filters, "status", "");
    const type = readDropdownFilter(filters, "type", "");
    const includedGenres = readMultiselectFilter(filters, "genres");
    const excludedGenres = readExcludedMultiselectFilter(filters, "genres");

    const url = new URL(DOMAIN_API)
      .addPathComponent("query")
      .setQueryItem("perPage", PAGE_SIZE.toString())
      .setQueryItem("page", page.toString())
      .setQueryItem("orderBy", orderBy)
      .setQueryItem("orderDirection", orderDirection);

    if (searchTerm) {
      url.setQueryItem("searchTerm", searchTerm);
    }

    if (status) {
      url.setQueryItem("seriesStatus", status);
    }

    if (type) {
      url.setQueryItem("seriesType", type);
    }

    if (includedGenres.length > 0) {
      url.setQueryItem("genreIds", includedGenres.join(","));
    }
    if (excludedGenres.length > 0) {
      url.setQueryItem("excludedGenreIds", excludedGenres.join(","));
    }

    const request: Request = { url: url.toString(), method: "GET" };
    let data = await fetchJSON<VortexQueryResponse>(request);
    let results = parseSearchResults(data);

    // retry with curly apostrophe if straight quote search returns nothing
    if (results.length === 0 && searchTerm.includes("'")) {
      url.setQueryItem("searchTerm", searchTerm.replace(/'/g, "\u2019"));
      const retryRequest: Request = { url: url.toString(), method: "GET" };
      data = await fetchJSON<VortexQueryResponse>(retryRequest);
      results = parseSearchResults(data);
    }

    // use raw post count for pagination to avoid early termination from novel filtering
    const hasNext = data.totalCount
      ? page * PAGE_SIZE < data.totalCount
      : (data.posts?.length ?? 0) >= PAGE_SIZE;

    return {
      items: results,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    const genresCacheDate = Number(Application.getState("genres-cache-date") ?? 0);
    let genres: VortexGenre[];

    if (genresCacheDate + 604800 > Date.now() / 1000) {
      genres = JSON.parse(Application.getState("genres") as string) as VortexGenre[];
    } else {
      const genresUrl = `${DOMAIN_API}/genres`;
      const genresRequest: Request = { url: genresUrl, method: "GET" };
      genres = await fetchJSON<VortexGenre[]>(genresRequest);

      Application.setState(JSON.stringify(genres), "genres");
      Application.setState(String(Date.now() / 1000), "genres-cache-date");
    }

    return buildSearchFilters(genres, STATUS_OPTIONS, TYPE_OPTIONS);
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    return SORT_OPTIONS;
  }
}
