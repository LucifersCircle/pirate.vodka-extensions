import type {
  PagedResults,
  Request,
  SearchFilter,
  SearchQuery,
  SearchResultItem,
  SortingOption,
} from "@paperback/types";
import { URL } from "@paperback/types";
import { VORTEX_API_BASE } from "../../main";
import type { Metadata, VortexGenre, VortexQueryResponse } from "../shared/models";
import { fetchJSON } from "../../services/network";
import { parseSearchResults } from "./parsers";

const PAGE_SIZE = 48;

export class SearchProvider {
  async getSearchResults(
    query: SearchQuery,
    metadata: Metadata,
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;

    const searchTerm = (query.title ?? "")
      .trim()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, " ");

    let urlBuilder = new URL(VORTEX_API_BASE)
      .addPathComponent("posts")
      .setQueryItem("perPage", PAGE_SIZE.toString())
      .setQueryItem("page", page.toString())
      .setQueryItem("isNovel", "false");

    if (searchTerm) {
      urlBuilder = urlBuilder.setQueryItem("searchTerm", searchTerm);
    }

    // Status filter
    const statusFilter = query.filters?.find((f) => f.id === "status");
    if (statusFilter?.value) {
      urlBuilder = urlBuilder.setQueryItem("seriesStatus", statusFilter.value as string);
    }

    // Genre filter
    const genreFilter = query.filters?.find((f) => f.id === "genres");
    if (
      genreFilter?.value &&
      typeof genreFilter.value === "object" &&
      !Array.isArray(genreFilter.value)
    ) {
      const genreValue = genreFilter.value;
      const selectedGenres = Object.keys(genreValue).filter(
        (key) => genreValue[key] === "included",
      );
      if (selectedGenres.length > 0) {
        urlBuilder = urlBuilder.setQueryItem("genreIds", selectedGenres.join(","));
      }
    }

    // Sorting — default to hot (popular)
    const tag = sortingOption?.id ?? "hot";
    urlBuilder = urlBuilder.setQueryItem("tag", tag);

    const url = urlBuilder.toString();
    const request: Request = { url, method: "GET" };
    let json = await fetchJSON<VortexQueryResponse>(request);
    let results = parseSearchResults(json);

    // If no results and search contains straight apostrophe, try with curly
    if (results.length === 0 && searchTerm.includes("'")) {
      const curlySearchTerm = searchTerm.replace(/'/g, "\u2019");
      urlBuilder = urlBuilder.setQueryItem("searchTerm", curlySearchTerm);
      const retryRequest: Request = { url: urlBuilder.toString(), method: "GET" };
      json = await fetchJSON<VortexQueryResponse>(retryRequest);
      results = parseSearchResults(json);
    }

    const hasNext = json.totalCount
      ? page * PAGE_SIZE < json.totalCount
      : results.length >= PAGE_SIZE;

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

    // Fetch and cache genres
    const genresCacheDate = Number(Application.getState("genres-cache-date") ?? 0);
    let genres: VortexGenre[];

    if (genresCacheDate + 604800 > Date.now() / 1000) {
      genres = JSON.parse(Application.getState("genres") as string) as VortexGenre[];
    } else {
      const url = `${VORTEX_API_BASE}/genres`;
      const request: Request = { url, method: "GET" };
      genres = await fetchJSON<VortexGenre[]>(request);

      Application.setState(JSON.stringify(genres), "genres");
      Application.setState(String(Date.now() / 1000), "genres-cache-date");
    }

    const genreFilter: SearchFilter = {
      type: "multiselect",
      id: "genres",
      title: "Genres",
      options: genres
        .filter((g) => g.name !== "hidden")
        .map((g) => ({
          id: g.id.toString(),
          value: g.name,
        })),
      value: {},
      allowExclusion: false,
      allowEmptySelection: true,
      maximum: undefined,
    };

    return [statusFilter, genreFilter];
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    return [
      { id: "hot", label: "Hot" },
      { id: "new", label: "New" },
    ];
  }
}
