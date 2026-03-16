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

    const [orderBy, orderDirection] = (sortingOption?.id ?? "lastChapterAddedAt:desc").split(":");

    const url = new URL(VORTEX_API_BASE)
      .addPathComponent("query")
      .setQueryItem("perPage", PAGE_SIZE.toString())
      .setQueryItem("page", page.toString())
      .setQueryItem("orderBy", orderBy)
      .setQueryItem("orderDirection", orderDirection);

    if (searchTerm) {
      url.setQueryItem("searchTerm", searchTerm);
    }

    const statusFilter = query.filters?.find((f) => f.id === "status");
    if (statusFilter?.value) {
      url.setQueryItem("seriesStatus", statusFilter.value as string);
    }

    const typeFilter = query.filters?.find((f) => f.id === "type");
    if (typeFilter?.value) {
      url.setQueryItem("seriesType", typeFilter.value as string);
    }

    const genreFilter = query.filters?.find((f) => f.id === "genres");
    if (
      genreFilter?.value &&
      typeof genreFilter.value === "object" &&
      !Array.isArray(genreFilter.value)
    ) {
      const genreValue = genreFilter.value;
      const included = Object.keys(genreValue).filter((key) => genreValue[key] === "included");
      const excluded = Object.keys(genreValue).filter((key) => genreValue[key] === "excluded");
      if (included.length > 0) {
        url.setQueryItem("genreIds", included.join(","));
      }
      if (excluded.length > 0) {
        url.setQueryItem("excludedGenreIds", excluded.join(","));
      }
    }

    const request: Request = { url: url.toString(), method: "GET" };
    let json = await fetchJSON<VortexQueryResponse>(request);
    let results = parseSearchResults(json);

    // retry with curly apostrophe if straight quote search returns nothing
    if (results.length === 0 && searchTerm.includes("'")) {
      url.setQueryItem("searchTerm", searchTerm.replace(/'/g, "\u2019"));
      const retryRequest: Request = { url: url.toString(), method: "GET" };
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
        { id: "COMPLETED", value: "Completed" },
        { id: "CANCELLED", value: "Cancelled" },
        { id: "DROPPED", value: "Dropped" },
        { id: "MASS_RELEASED", value: "Mass Released" },
        { id: "COMING_SOON", value: "Coming Soon" },
        { id: "HIATUS", value: "Hiatus" },
      ],
      value: "",
    };

    const typeFilter: SearchFilter = {
      type: "dropdown",
      id: "type",
      title: "Type",
      options: [
        { id: "", value: "All" },
        { id: "MANHWA", value: "Manhwa" },
        { id: "MANHUA", value: "Manhua" },
        { id: "MANGA", value: "Manga" },
        { id: "SPANISH", value: "Spanish" },
        { id: "RUSSIAN", value: "Russian" },
      ],
      value: "",
    };

    const genresCacheDate = Number(Application.getState("genres-cache-date") ?? 0);
    let genres: VortexGenre[];

    if (genresCacheDate + 604800 > Date.now() / 1000) {
      genres = JSON.parse(Application.getState("genres") as string) as VortexGenre[];
    } else {
      const genresUrl = `${VORTEX_API_BASE}/genres`;
      const genresRequest: Request = { url: genresUrl, method: "GET" };
      genres = await fetchJSON<VortexGenre[]>(genresRequest);

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
      allowExclusion: true,
      allowEmptySelection: true,
      maximum: undefined,
    };

    return [statusFilter, typeFilter, genreFilter];
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    return [
      { id: "lastChapterAddedAt:desc", label: "Latest Chapters" },
      { id: "totalViews:desc", label: "Most Popular" },
      { id: "createdAt:desc", label: "Newest Added" },
      { id: "createdAt:asc", label: "Oldest First" },
      { id: "postTitle:asc", label: "A-Z" },
    ];
  }
}
