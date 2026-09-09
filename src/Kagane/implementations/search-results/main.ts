/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type {
  PagedResults,
  Request,
  SearchQuery,
  SearchResultItem,
  SortingOption,
} from "@paperback/types";
import { CloudflareError, URL } from "@paperback/types";
import {
  SearchFilterForm,
  type SearchFilter,
  type SearchFilterValue,
} from "@paperback/types/lib/compat/0.8";

import { fetchJSON } from "../../services/network";
import { HomeSectionSearchForm } from "./forms";
import {
  getContentLanguages,
  getContentRatingSettings,
  getCustomHiddenTags,
  getExcludedGenres,
  getHiddenTagCategories,
  getShowSource,
  getSourceDisplayMode,
  resolveExcludedGenreIds,
} from "../settings-form/main";
import {
  API_URL,
  PAGE_SIZE,
  SORTING_OPTIONS,
  type KaganeMetadata,
  type KaganeSearchBook,
  type SearchDto,
} from "../shared/models";
import { HIDDEN_TAG_CATEGORIES } from "../shared/tag-options";
import {
  buildPopularTagOptions,
  buildTagNameIndex,
  getKaganeTagEntries,
  parseTagInput,
  resolveSelectedTagValues,
  resolveTagNames,
} from "../shared/tags";
import {
  buildImageUrl,
  getContentRatingValues,
  getKaganeMetadata,
  getPaperbackContentRating,
  hasCoverImage,
} from "../shared/utils";
import {
  buildSearchFilters,
  readDropdownFilter,
  readMultiselectFilter,
  readHomeSectionSort,
  readInputFilter,
} from "./parsers";

export class SearchProvider {
  async getSearchFilters(): Promise<SearchFilter[]> {
    const metadata = await getKaganeMetadata();
    let tagOptions: Array<{ id: string; value: string }> = [];
    try {
      tagOptions = buildPopularTagOptions(await getKaganeTagEntries());
    } catch (error) {
      if (error instanceof CloudflareError) throw error;
    }
    return buildSearchFilters(metadata, getSourceDisplayMode(), tagOptions);
  }

  getAdvancedSearchForm(query: SearchQuery<SearchFilterValue[]>) {
    if (readHomeSectionSort(query.metadata)) {
      return new HomeSectionSearchForm(query.metadata ?? []);
    }
    return new SearchFilterForm(query.metadata, this.getSearchFilters());
  }

  async getSortingOptions(query?: SearchQuery<SearchFilterValue[]>): Promise<SortingOption[]> {
    if (readHomeSectionSort(query?.metadata)) return [];
    return SORTING_OPTIONS;
  }

  async getSearchResults(
    query: SearchQuery<SearchFilterValue[]>,
    metadata?: { page?: number },
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const kaganeMetadata = await getKaganeMetadata();
    const homeSectionSort = readHomeSectionSort(query.metadata);
    const bodyQuery = homeSectionSort ? { title: "", metadata: [] } : query;
    const searchBody = await buildSearchBody(bodyQuery, kaganeMetadata);
    const sort = homeSectionSort ?? sortingOption?.id ?? "relevance";

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
      metadata: data.last === false ? { page: page + 1 } : undefined,
    };
  }
}

export async function buildSearchBody(
  query: SearchQuery<SearchFilterValue[]>,
  metadata: KaganeMetadata,
): Promise<Record<string, unknown>> {
  const filters = query.metadata ?? [];
  const body: Record<string, unknown> = {
    content_rating: getContentRatingValues(getContentRatingSettings()),
    content_lang: getContentLanguages(),
  };
  const sourceTypes = getSourceTypes(getSourceDisplayMode());
  if (sourceTypes) body.source_type = sourceTypes;

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
    ...resolveExcludedGenreIds(getExcludedGenres(), metadata.genres),
  ];
  if (includedGenres.length > 0 || excludedGenres.length > 0) {
    body.genres = buildCompoundFilter(
      includedGenres,
      excludedGenres,
      readDropdownFilter(filters, "genres_match_all", "true") === "true",
    );
  }

  await addTagFilter(body, filters);

  return body;
}

async function addTagFilter(
  body: Record<string, unknown>,
  filters: SearchFilterValue[],
): Promise<void> {
  const selectedIncluded = readMultiselectFilter(filters, "tags");
  const selectedExcluded = readMultiselectFilter(filters, "tags", "excluded");
  const typed = parseTagInput(readInputFilter(filters, "tags_text"));
  const customHiddenNames = getCustomHiddenTags();
  const selectedCategories = new Set(getHiddenTagCategories());
  const categoryIds = HIDDEN_TAG_CATEGORIES.filter((category) =>
    selectedCategories.has(category.id),
  ).flatMap((category) => category.tagIds);

  if (
    selectedIncluded.length === 0 &&
    selectedExcluded.length === 0 &&
    typed.included.length === 0 &&
    typed.excluded.length === 0 &&
    customHiddenNames.length === 0 &&
    categoryIds.length === 0
  ) {
    return;
  }

  const entries = await getKaganeTagEntries();
  const tagIndex = buildTagNameIndex(entries);
  const validIds = new Set(entries.map((entry) => entry.id));
  const included = [
    ...resolveSelectedTagValues(selectedIncluded, tagIndex, entries),
    ...resolveTagNames(typed.included, tagIndex),
  ].filter((id) => validIds.has(id));
  const excluded = [
    ...resolveSelectedTagValues(selectedExcluded, tagIndex, entries),
    ...resolveTagNames(typed.excluded, tagIndex),
    ...resolveTagNames(customHiddenNames, tagIndex),
    ...categoryIds,
  ].filter((id) => validIds.has(id));

  if (included.length > 0 || excluded.length > 0) {
    body.tags = buildCompoundFilter(
      included,
      excluded,
      readDropdownFilter(filters, "tags_match_all", "true") === "true",
    );
  }
}

function getSourceTypes(displayMode: string): string[] | undefined {
  if (displayMode === "official") return ["Official"];
  if (displayMode === "scanlations") return ["Unofficial", "Mixed"];
  return undefined;
}

function buildCompoundFilter(
  included: string[],
  excluded: string[],
  matchAll: boolean,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    values: [...new Set(included)],
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
