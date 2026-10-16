/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type { SearchFilter, SearchFilterValue } from "@paperback/types/lib/compat/0.8";

import {
  FORMAT_OPTIONS,
  HOME_SECTION_METADATA_ID,
  PUBLICATION_STATUS_OPTIONS,
  type KaganeMetadata,
  type SourceDto,
} from "../shared/models";

type MultiselectValue = Record<string, "included" | "excluded">;

const HOME_SECTION_SORTS = new Set([
  "avg_views_today,desc",
  "avg_views_week,desc",
  "avg_views_month,desc",
  "avg_views,desc",
]);

export function readHomeSectionSort(filters?: SearchFilterValue[]): string | undefined {
  const value = filters?.find((filter) => filter.id === HOME_SECTION_METADATA_ID)?.value;
  return typeof value === "string" && HOME_SECTION_SORTS.has(value) ? value : undefined;
}

export function readDropdownFilter(
  filters: SearchFilterValue[],
  filterId: string,
  fallback: string,
): string {
  const entry = filters.find((filter) => filter.id === filterId);
  return typeof entry?.value === "string" && entry.value ? entry.value : fallback;
}

export function readMultiselectFilter(
  filters: SearchFilterValue[],
  filterId: string,
  state: "included" | "excluded" = "included",
): string[] {
  const entry = filters.find((filter) => filter.id === filterId);
  if (!entry || typeof entry.value === "string") return [];

  return Object.entries(entry.value as MultiselectValue)
    .filter(([, value]) => value === state)
    .map(([id]) => id);
}

export function readInputFilter(filters: SearchFilterValue[], filterId: string): string {
  const entry = filters.find((filter) => filter.id === filterId);
  return typeof entry?.value === "string" ? entry.value : "";
}

type NumericRange = { min?: number; max?: number };

/** Validate native text inputs before any metadata, tag or search request. */
export function readNumericRanges(filters?: SearchFilterValue[]): Record<string, NumericRange> {
  if (filters === undefined) return {};
  if (!Array.isArray(filters)) throw invalidNumericRange();
  const body: Record<string, NumericRange> = {};
  for (const [field, floor, ceiling] of [
    ["current_books", 0, 2147483647],
    ["start_year", 1, 9999],
  ] as const) {
    const range: NumericRange = {};
    for (const side of ["min", "max"] as const) {
      const entries = filters.filter((filter) => filter?.id === `${field}_${side}`);
      if (entries.length > 1) throw invalidNumericRange();
      if (!entries.length) continue;
      const value = entries[0].value;
      if (typeof value !== "string") throw invalidNumericRange();
      const text = value.trim();
      if (!text) continue;
      if (!/^[0-9]+$/.test(text)) throw invalidNumericRange();
      const number = Number(text);
      if (!Number.isSafeInteger(number) || number < floor || number > ceiling)
        throw invalidNumericRange();
      range[side] = number;
    }
    if (range.min !== undefined && range.max !== undefined && range.min > range.max)
      throw invalidNumericRange();
    if (Object.keys(range).length) body[field] = range;
  }
  return body;
}

function invalidNumericRange(): Error {
  return new Error(
    "Invalid Kagane numeric range. Use whole chapter counts 0–2147483647 or start years 1–9999, with minimum no greater than maximum.",
  );
}

export function buildSearchFilters(
  metadata: KaganeMetadata,
  displayMode: string,
  tagOptions: Array<{ id: string; value: string }> = [],
): SearchFilter[] {
  const sources = getVisibleSources(metadata.sources, displayMode);

  const filters: SearchFilter[] = [
    {
      type: "multiselect",
      id: "formats",
      title: "Format",
      options: FORMAT_OPTIONS.map((format) => ({ id: format, value: format })),
      value: {},
      allowExclusion: false,
      allowEmptySelection: true,
      maximum: undefined,
    },
    ...(tagOptions.length > 0
      ? [
          {
            type: "multiselect" as const,
            id: "tags",
            title: "Tags",
            options: tagOptions,
            value: {},
            allowExclusion: true,
            allowEmptySelection: true,
            maximum: undefined,
          },
        ]
      : []),
    {
      type: "input",
      id: "tags_text",
      title: "Tags (typed)",
      placeholder: "romance, -gore",
      value: "",
    },
    {
      type: "dropdown",
      id: "tags_match_all",
      title: "Tag Matching",
      options: [
        { id: "true", value: "Match All Selected Tags" },
        { id: "false", value: "Match Any Selected Tag" },
      ],
      value: "true",
    },
    ...(
      [
        [
          "current_books_min",
          "Minimum chapters",
          "Uploaded Kagane chapter entries, not highest chapter number (optional)",
        ],
        [
          "current_books_max",
          "Maximum chapters",
          "Uploaded Kagane chapter entries, not highest chapter number (optional)",
        ],
        ["start_year_min", "Earliest start year", "1–9999 (optional)"],
        ["start_year_max", "Latest start year", "1–9999 (optional)"],
      ] as const
    ).map(([id, title, placeholder]) => ({
      type: "input" as const,
      id,
      title,
      placeholder,
      value: "",
    })),
    {
      type: "multiselect",
      id: "statuses",
      title: "Upload Status",
      options: PUBLICATION_STATUS_OPTIONS,
      value: {},
      allowExclusion: false,
      allowEmptySelection: true,
      maximum: undefined,
    },
    {
      type: "dropdown",
      id: "genres_match_all",
      title: "Genre Matching",
      options: [
        { id: "true", value: "Match All Selected Genres" },
        { id: "false", value: "Match Any Selected Genre" },
      ],
      value: "true",
    },
    {
      type: "multiselect",
      id: "genres",
      title: "Genres",
      options: Object.entries(metadata.genres)
        .sort(([, left], [, right]) => left.localeCompare(right))
        .map(([id, value]) => ({ id, value })),
      value: {},
      allowExclusion: true,
      allowEmptySelection: true,
      maximum: undefined,
    },
    {
      type: "multiselect",
      id: "sources",
      title: "Sources",
      options: sources
        .sort((left, right) => left.title.localeCompare(right.title))
        .map((source) => ({ id: source.source_id, value: source.title })),
      value: {},
      allowExclusion: false,
      allowEmptySelection: true,
      maximum: undefined,
    },
  ];

  return filters;
}

export function getVisibleSources(sources: SourceDto[], displayMode: string): SourceDto[] {
  if (displayMode === "official") {
    return sources.filter((source) => source.source_type.toLowerCase() === "official");
  }
  if (displayMode === "scanlations") {
    return sources.filter((source) => {
      const sourceType = source.source_type.toLowerCase();
      return sourceType === "unofficial" || sourceType === "mixed";
    });
  }
  return sources;
}
