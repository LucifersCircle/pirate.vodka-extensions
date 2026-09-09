/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

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

import { fetchJSON } from "../../services/network";
import {
  getContentLanguages,
  getContentRatingSetting,
  getExcludedGenres,
  getShowSource,
  getSourceDisplayMode,
} from "../settings-form/main";
import {
  API_URL,
  PAGE_SIZE,
  SORTING_OPTIONS,
  type KaganeMetadata,
  type KaganeSearchBook,
  type SearchDto,
} from "../shared/models";
import {
  buildImageUrl,
  getContentRatingValues,
  getKaganeMetadata,
  getPaperbackContentRating,
  hasCoverImage,
} from "../shared/utils";
import {
  buildSearchFilters,
  findIdsByName,
  readDropdownFilter,
  readMultiselectFilter,
} from "./parsers";

export class SearchProvider {
  async getSearchFilters(): Promise<SearchFilter[]> {
    const metadata = await getKaganeMetadata();
    return buildSearchFilters(metadata, getSourceDisplayMode());
  }

  getAdvancedSearchForm(query: SearchQuery<SearchFilterValue[]>) {
    return new SearchFilterForm(query.metadata, this.getSearchFilters());
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    return SORTING_OPTIONS;
  }

  async getSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata?: { page?: number },
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const kaganeMetadata = await getKaganeMetadata();
    const searchBody = buildSearchBody(query, kaganeMetadata);
    const sort = sortingOption?.id ?? "relevance";

    const url = new URL(API_URL)
      .addPathComponent("api")
      .addPathComponent("v2")
      .addPathComponent("search")
      .addPathComponent("series")
      .setQueryItem("page", String(page - 1))
      .setQueryItem("size", String(PAGE_SIZE));

    if (sort !== "relevance") {
      url.setQueryItem("sort", sort);
    }

    const request: Request = {
      url: url.toString(),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(searchBody),
    };

    const data = await fetchJSON<SearchDto>(request);
    const sourceMap = new Map(
      kaganeMetadata.sources.map((source) => [source.source_id, source.title]),
    );
    const showSource = getShowSource();

    const items = (data.content ?? [])
      .filter(hasCoverImage)
      .map((book) => mapSearchResult(book, sourceMap, showSource));

    return {
      items,
      metadata: data.last === false && items.length > 0 ? { page: page + 1 } : undefined,
    };
  }
}

export function buildSearchBody(
  query: SearchQuery<SearchFilterValue[]>,
  metadata: KaganeMetadata,
): Record<string, unknown> {
  const filters = query.metadata ?? [];
  const body: Record<string, unknown> = {
    source_type:
      getSourceDisplayMode() === "official" ? ["Official"] : ["Official", "Unofficial", "Mixed"],
    content_rating: getContentRatingValues(getContentRatingSetting()),
    content_lang: getContentLanguages(),
  };

  const title = query.title?.trim();
  if (title) {
    body.title = title;
  }

  const formats = readMultiselectFilter(filters, "formats");
  if (formats.length > 0) {
    body.format = formats;
  }

  const statuses = readMultiselectFilter(filters, "statuses");
  if (statuses.length > 0) {
    body.upload_status = statuses;
  }

  const sources = readMultiselectFilter(filters, "sources");
  if (sources.length > 0) {
    body.source_id = sources;
  }

  const includedGenres = readMultiselectFilter(filters, "genres");
  const excludedGenres = [
    ...readMultiselectFilter(filters, "genres", "excluded"),
    ...findIdsByName(getExcludedGenres(), metadata.genres),
  ];
  if (includedGenres.length > 0 || excludedGenres.length > 0) {
    body.genres = buildCompoundFilter(
      includedGenres,
      excludedGenres,
      readDropdownFilter(filters, "genres_match_all", "true") === "true",
    );
  }

  return body;
}

function buildCompoundFilter(
  included: string[],
  excluded: string[],
  matchAll: boolean,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    values: included,
  };

  if (matchAll) {
    filter.match_all = true;
  }
  if (excluded.length > 0) {
    filter.exclude = [...new Set(excluded)];
  }

  return filter;
}

function mapSearchResult(
  book: KaganeSearchBook,
  sources: Map<string, string>,
  showSource: boolean,
): SearchResultItem {
  const sourceName = book.source_id ? sources.get(book.source_id) : undefined;
  const title =
    showSource && sourceName ? `${book.title.trim()} [${sourceName}]` : book.title.trim();
  const subtitles = [
    typeof book.current_books === "number" ? `${book.current_books} Chapters` : undefined,
    book.start_year ? String(book.start_year) : undefined,
  ].filter((value): value is string => Boolean(value));

  return {
    mangaId: book.series_id,
    title,
    imageUrl: buildImageUrl(book.cover_image_id),
    subtitle: subtitles.join(" - "),
    contentRating: getPaperbackContentRating(book.content_rating),
  };
}
