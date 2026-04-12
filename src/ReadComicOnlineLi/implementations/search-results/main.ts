import type {
  PagedResults,
  SearchFilter,
  SearchQuery,
  SearchResultItem,
  SortingOption,
} from "@paperback/types";
import { URL } from "@paperback/types";
import { DOMAIN } from "../shared/models";
import { fetchCheerio } from "../../services/network";
import { getDefaultSearchPage, getDefaultSearchSort } from "../settings-form/forms/main";
import {
  buildSearchFilters,
  parseSearchResults,
  readDropdownFilter,
  readExcludedMultiselectFilter,
  readMultiselectFilter,
} from "./parsers";

type FilterEntry = { id: string; value: string | Record<string, "included" | "excluded"> };

export class SearchProvider {
  async getSearchFilters(): Promise<SearchFilter[]> {
    const $ = await fetchCheerio({
      url: new URL(DOMAIN).addPathComponent("AdvanceSearch").toString(),
      method: "GET",
    });

    return buildSearchFilters($);
  }

  async getSearchResults(
    query: SearchQuery,
    metadata?: { page?: number },
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const searchTerm = query.title?.trim() ?? "";
    const filters = (query.filters ?? []) as FilterEntry[];
    const includedGenres = readMultiselectFilter(filters, "genres");
    const excludedGenres = readExcludedMultiselectFilter(filters, "genres");
    const status = sortingOption?.id ?? getDefaultSearchSort();
    const publicationYear = readDropdownFilter(filters, "publicationYear", "");
    const hasAdvancedSearchInput =
      searchTerm.length > 0 ||
      includedGenres.length > 0 ||
      excludedGenres.length > 0 ||
      publicationYear.length > 0 ||
      status.length > 0;

    if (!hasAdvancedSearchInput) {
      const $ = await fetchCheerio({
        url: buildDefaultSearchPageUrl(page),
        method: "GET",
      });
      const items = parseSearchResults($);

      return {
        items,
        metadata: items.length > 0 ? { page: page + 1 } : undefined,
      };
    }

    const url = new URL(DOMAIN)
      .addPathComponent("AdvanceSearch")
      .setQueryItem("comicName", searchTerm)
      .setQueryItem("ig", formatGenreValues(includedGenres))
      .setQueryItem("eg", formatGenreValues(excludedGenres))
      .setQueryItem("status", status)
      .setQueryItem("pubDate", publicationYear)
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

  async getSortingOptions(): Promise<SortingOption[]> {
    const options: SortingOption[] = [
      { id: "", label: "Any Status" },
      { id: "Ongoing", label: "Ongoing" },
      { id: "Completed", label: "Completed" },
    ];

    const defaultSort = getDefaultSearchSort();
    if (!defaultSort) {
      return options;
    }

    const defaultIndex = options.findIndex((option) => option.id === defaultSort);
    if (defaultIndex <= 0) {
      return options;
    }

    const [defaultOption] = options.splice(defaultIndex, 1);
    options.unshift(defaultOption);
    return options;
  }
}

function formatGenreValues(values: string[]): string {
  return values.length > 0 ? `${values.join(",")},` : "";
}

function buildDefaultSearchPageUrl(page: number): string {
  const path = new URL(DOMAIN).addPathComponent("ComicList");

  switch (getDefaultSearchPage()) {
    case "latest-update":
      path.addPathComponent("LatestUpdate");
      break;

    case "new-comic":
      path.addPathComponent("Newest");
      break;

    default:
      path.addPathComponent("MostPopular");
      break;
  }

  path.setQueryItem("page", String(page));
  return path.toString();
}
