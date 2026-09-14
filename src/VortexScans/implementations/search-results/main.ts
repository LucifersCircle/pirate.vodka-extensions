import type {
  PagedResults,
  Request,
  SearchQuery,
  SearchResultItem,
  SortingOption,
} from "@paperback/types";
import { URL } from "@paperback/types";
import {
  SearchFilterForm,
  type SearchFilter,
  type SearchFilterValue,
} from "@paperback/types/lib/compat/0.8";
import { HomeSectionSearchForm } from "./forms";
import {
  DOMAIN_API,
  PAGE_SIZE,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
} from "../shared/models";
import type {
  Metadata,
  VortexCollectionDetailResponse,
  VortexQueryResponse,
} from "../shared/models";
import { fetchJSON } from "../../services/network";
import { getVortexGenres } from "../shared/utils";
import {
  buildSearchFilters,
  parseCollectionSearchResults,
  parseSearchResults,
  readDropdownFilter,
  readExcludedMultiselectFilter,
  readHomeSectionFilter,
  readMultiselectFilter,
} from "./parsers";

export class SearchProvider {
  async getSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata?: Metadata,
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const filters = query.metadata ?? [];
    const homeSection = readHomeSectionFilter(filters);

    if (homeSection?.kind === "collection") {
      return this.getCollectionResults(homeSection.slug);
    }

    if (homeSection?.kind === "latest" || homeSection?.kind === "new") {
      return this.getTaggedResults(
        page,
        homeSection.kind === "latest" ? "latestUpdatePinned" : "new",
      );
    }

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
    return buildSearchFilters(await getVortexGenres(), STATUS_OPTIONS, TYPE_OPTIONS);
  }

  getAdvancedSearchForm(query: SearchQuery<SearchFilterValue[]>) {
    if (readHomeSectionFilter(query.metadata)) {
      return new HomeSectionSearchForm(query.metadata ?? []);
    }
    return new SearchFilterForm(query.metadata, this.getSearchFilters());
  }

  async getSortingOptions(query?: SearchQuery<SearchFilterValue[]>): Promise<SortingOption[]> {
    if (readHomeSectionFilter(query?.metadata)) return [];
    return SORT_OPTIONS;
  }

  private async getTaggedResults(
    page: number,
    tag: "latestUpdatePinned" | "new",
  ): Promise<PagedResults<SearchResultItem>> {
    const url = new URL(DOMAIN_API)
      .addPathComponent("posts")
      .setQueryItem("page", page.toString())
      .setQueryItem("perPage", PAGE_SIZE.toString())
      .setQueryItem("searchTerm", "")
      .setQueryItem("isNovel", "false")
      .setQueryItem("tag", tag)
      .toString();

    const data = await fetchJSON<VortexQueryResponse>({ url, method: "GET" });
    const items = parseSearchResults(data);

    return {
      items,
      metadata: (data.posts?.length ?? 0) >= PAGE_SIZE ? { page: page + 1 } : undefined,
    };
  }

  private async getCollectionResults(slug: string): Promise<PagedResults<SearchResultItem>> {
    const url = new URL(DOMAIN_API)
      .addPathComponent("collections")
      .addPathComponent(slug)
      .toString();
    const data = await fetchJSON<VortexCollectionDetailResponse>({ url, method: "GET" });

    return {
      items: parseCollectionSearchResults(data),
      metadata: undefined,
    };
  }
}
