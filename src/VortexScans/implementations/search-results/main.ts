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
import { contentSettings, withContentSettings } from "../shared/content";
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
    return withContentSettings(() => this.fetchSearchResults(query, metadata, sortingOption));
  }
  private async fetchSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata?: Metadata,
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const contentContext = JSON.stringify(contentSettings());
    const filters = query.metadata ?? [];
    const homeSection = readHomeSectionFilter(filters);

    if (homeSection?.kind === "collection") {
      return this.getCollectionResults(homeSection.slug);
    }

    if (metadata != null && (typeof metadata !== "object" || Array.isArray(metadata)))
      throw new Error("Invalid VortexScans search cursor. Reload this page.");
    // A changed content policy has always restarted pagination, even when the
    // discarded cursor's page is malformed. Validate only the selected page.
    let page =
      metadata?.contentContext && metadata.contentContext !== contentContext
        ? 1
        : (metadata?.page ?? 1);
    if (!Number.isSafeInteger(page) || page < 1)
      throw new Error("Invalid VortexScans search cursor. Reload this page.");

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

    for (let attempt = 0; attempt < 10; attempt++, page++) {
      url.setQueryItem("page", String(page));
      const request: Request = { url: url.toString(), method: "GET" };
      let data = await fetchJSON<VortexQueryResponse>(request);
      let results = parseSearchResults(data);

      // retry with curly apostrophe if straight quote search returns nothing
      if (!data.posts?.length && searchTerm.includes("'")) {
        url.setQueryItem("searchTerm", searchTerm.replace(/'/g, "\u2019"));
        const retryRequest: Request = { url: url.toString(), method: "GET" };
        data = await fetchJSON<VortexQueryResponse>(retryRequest);
        results = parseSearchResults(data);
      }

      // use raw post count for pagination to avoid early termination from novel filtering
      const hasNext = data.totalCount
        ? page * PAGE_SIZE < data.totalCount
        : (data.posts?.length ?? 0) >= PAGE_SIZE;

      if (hasNext && !Number.isSafeInteger(page + 1))
        throw new Error("Invalid VortexScans search cursor. Reload this page.");

      if (results.length || !hasNext)
        return {
          items: results,
          metadata: hasNext ? { page: page + 1, contentContext } : undefined,
        };
    }
    throw new Error("No visible titles in ten VortexScans pages. Refine your search.");
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
    const contentContext = JSON.stringify(contentSettings());
    for (let attempt = 0; attempt < 10; attempt++, page++) {
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

      const hasNext = (data.posts?.length ?? 0) >= PAGE_SIZE;
      if (hasNext && !Number.isSafeInteger(page + 1))
        throw new Error("Invalid VortexScans search cursor. Reload this page.");
      if (items.length || !hasNext)
        return {
          items,
          metadata: hasNext ? { page: page + 1, contentContext } : undefined,
        };
    }
    throw new Error("No visible titles in ten VortexScans pages. Refine your search.");
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
