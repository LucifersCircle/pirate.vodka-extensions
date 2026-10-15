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
  type KaganeContentRating,
  type KaganeMetadata,
  type KaganeSearchBook,
  type SearchDto,
} from "../shared/models";
import {
  buildContentRatingFilter,
  getPaperbackBookContentRating,
  isContentRatingAllowed,
} from "../shared/rating";
import { HIDDEN_TAG_CATEGORIES } from "../shared/tag-options";
import {
  buildPopularTagOptions,
  buildTagNameIndex,
  getKaganeTagEntries,
  parseTagInput,
  resolveSelectedTagValues,
  resolveTagNames,
} from "../shared/tags";
import { buildImageUrl, getKaganeMetadata, hasCoverImage } from "../shared/utils";
import {
  buildSearchFilters,
  readDropdownFilter,
  readMultiselectFilter,
  readHomeSectionSort,
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
    const contentRatings = getContentRatingSettings();
    const kaganeMetadata = await getKaganeMetadata();
    const homeSectionSort = readHomeSectionSort(query.metadata);
    const bodyQuery = homeSectionSort ? { title: "", metadata: [] } : query;
    const searchBody = await buildSearchBody(bodyQuery, kaganeMetadata, contentRatings);
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

    const result = await fetchAllowedSearchPage(request, page, contentRatings);
    const sourceMap = new Map(
      kaganeMetadata.sources.map((source) => [source.source_id, source.title]),
    );
    const showSource = getShowSource();

    const items = result.books.map((book) => mapSearchResult(book, sourceMap, showSource));

    return {
      items,
      metadata: result.hasNextPage ? { page: result.page + 1 } : undefined,
    };
  }
}

export async function fetchAllowedSearchPage(
  request: Request,
  firstPage: number,
  contentRatings: KaganeContentRating[],
): Promise<{
  books: Array<KaganeSearchBook & { cover_image_id: string }>;
  page: number;
  hasNextPage: boolean;
}> {
  // Exact rating selections can leave an otherwise non-final server page empty.
  // Advance instead of letting clients treat that empty page as exhaustion.
  const seenPages = new Set<string>();
  const maxRequests = 20;
  for (let offset = 0; offset < maxRequests; offset += 1) {
    const page = firstPage + offset;
    const url = new URL(request.url).setQueryItem("page", String(page - 1)).toString();
    const data = await fetchJSON<SearchDto>({ ...request, url });
    if (!data || !Array.isArray(data.content)) {
      throw new Error("Kagane search returned an invalid result page.");
    }
    if (typeof data.last !== "boolean") {
      throw new Error("Kagane search returned missing or invalid pagination status.");
    }
    const content = data.content;
    const books = content
      .filter((book) => isContentRatingAllowed(book, contentRatings))
      .filter(hasCoverImage);
    const hasNextPage = data.last === false;
    if (books.length > 0 || data.last === true) return { books, page, hasNextPage };

    const fingerprint = JSON.stringify(content.map((book) => book?.series_id ?? book));
    if (seenPages.has(fingerprint)) {
      throw new Error("Kagane search pagination did not advance past a filtered-out page.");
    }
    seenPages.add(fingerprint);
  }

  throw new Error(
    "Kagane search reached the empty-page safety limit before the end. Try a more specific search.",
  );
}

export async function buildSearchBody(
  query: SearchQuery<SearchFilterValue[]>,
  metadata: KaganeMetadata,
  contentRatings: KaganeContentRating[] = getContentRatingSettings(),
): Promise<Record<string, unknown>> {
  const filters = query.metadata ?? [];
  const body: Record<string, unknown> = {
    ...buildContentRatingFilter(contentRatings),
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
  const tagSelections = filters.filter((filter) => filter.id === "tags");
  const textSelections = filters.filter((filter) => filter.id === "tags_text");
  const matching = filters.filter((filter) => filter.id === "tags_match_all");
  const selection = tagSelections[0]?.value;
  const text = textSelections[0]?.value;
  if (
    tagSelections.length > 1 ||
    textSelections.length > 1 ||
    matching.length > 1 ||
    (tagSelections.length > 0 &&
      (!selection ||
        typeof selection !== "object" ||
        Array.isArray(selection) ||
        Object.entries(selection).some(
          ([id, state]) => !id.trim() || (state !== "included" && state !== "excluded"),
        ))) ||
    (textSelections.length > 0 && typeof text !== "string") ||
    (matching.length > 0 && !["", "true", "false"].includes(matching[0].value as string))
  )
    throw new Error("Invalid Kagane tag filter. Refresh tag choices or remove this filter.");
  const selectedIncluded = readMultiselectFilter(filters, "tags");
  const selectedExcluded = readMultiselectFilter(filters, "tags", "excluded");
  const typed = parseTagInput(typeof text === "string" ? text : "");
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
  // Validate built-in exclusions too, without changing their existing alias semantics.
  resolveSelectedTagValues(categoryIds, tagIndex, entries);
  const included = [
    ...resolveSelectedTagValues(selectedIncluded, tagIndex, entries),
    ...resolveTagNames(typed.included, tagIndex),
  ];
  const excluded = [
    ...resolveSelectedTagValues(selectedExcluded, tagIndex, entries),
    ...resolveTagNames(typed.excluded, tagIndex),
    ...resolveTagNames(customHiddenNames, tagIndex),
    ...categoryIds,
  ];

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
    contentRating: getPaperbackBookContentRating(book),
  };
}
