import type {
  PagedResults,
  Request,
  SearchFilter,
  SearchQuery,
  SearchResultItem,
  SortingOption,
} from "@paperback/types";
import { URL } from "@paperback/types";
import { QTOON_API } from "../../main";
import { fetchEncryptedJSON } from "../../services/network";
import type { QToonComicsList } from "../shared/models";
import {
  buildSearchFilters,
  type FilterEntry,
  parseQToonSearchResults,
  readDropdownFilter,
  SORT_OPTIONS,
} from "./parsers";

interface SearchMetadata {
  page: number;
}

export class SearchProvider {
  async getSearchFilters(): Promise<SearchFilter[]> {
    return buildSearchFilters();
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    return SORT_OPTIONS;
  }

  async getSearchResults(
    query: SearchQuery,
    metadata?: SearchMetadata,
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const filters = (query.filters ?? []) as FilterEntry[];
    const title = query.title?.trim() ?? "";
    const tag = readDropdownFilter(filters, "tag", "-1");
    const status = readDropdownFilter(filters, "serialStatus", "-1");
    const sortType = sortingOption?.id ?? "hot";

    const url = new URL(QTOON_API)
      .addPathComponent("api")
      .addPathComponent("w")
      .addPathComponent("search")
      .addPathComponent("comic")
      .addPathComponent("gallery")
      .setQueryItem("area", "-1")
      .setQueryItem("tag", tag)
      .setQueryItem("gender", "-1")
      .setQueryItem("serialStatus", status)
      .setQueryItem("sortType", sortType)
      .setQueryItem("page", String(page))
      .setQueryItem("title", title)
      .toString();

    const request: Request = { url, method: "GET" };
    const data = await fetchEncryptedJSON<QToonComicsList>(request);

    const items = parseQToonSearchResults(data.comics ?? []);
    const hasMore = data.more === 1;

    return {
      items,
      metadata: hasMore ? { page: page + 1 } : undefined,
    };
  }
}
