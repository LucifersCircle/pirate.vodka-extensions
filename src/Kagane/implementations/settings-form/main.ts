/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type { Form, SettingsFormProviding } from "@paperback/types";

import {
  CHAPTER_TITLE_MODE_KEY,
  CHAPTER_TITLE_MODE_OPTIONS,
  CONTENT_LANGUAGES_KEY,
  CONTENT_RATING_KEY,
  DATA_SAVER_KEY,
  EXCLUDED_GENRES_KEY,
  LANGUAGE_OPTIONS,
  SHOW_EDITION_KEY,
  SHOW_SOURCE_KEY,
  SOURCE_DISPLAY_MODE_KEY,
  type GenreDto,
  type KaganeContentRating,
} from "../shared/models";
import { getKaganeGenres, normalizeContentRatings } from "../shared/utils";
import {
  CUSTOM_HIDDEN_TAGS_KEY,
  HIDDEN_TAG_CATEGORIES,
  HIDDEN_TAG_CATEGORIES_KEY,
} from "../shared/tag-options";
import { KaganeSettingsForm } from "./forms";

function readStringArray(key: string, fallback: string[], validIds?: Set<string>): string[] {
  const value = Application.getState(key);
  let raw: unknown = fallback;

  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      raw = JSON.parse(value);
    } catch {
      raw = fallback;
    }
  }

  if (!Array.isArray(raw)) return fallback;

  const sanitized = raw.filter((entry): entry is string => {
    return typeof entry === "string" && (!validIds || validIds.has(entry));
  });

  return sanitized.length > 0 || fallback.length === 0 ? sanitized : fallback;
}

export function getContentRatingSettings(): KaganeContentRating[] {
  const stored = Application.getState(CONTENT_RATING_KEY);
  const normalized = normalizeContentRatings(stored);
  if (typeof stored === "string") {
    Application.setState(normalized, CONTENT_RATING_KEY);
  }
  return normalized;
}

export function setContentRatingSettings(value: string[]): void {
  Application.setState(normalizeContentRatings(value), CONTENT_RATING_KEY);
}

export function getSourceDisplayMode(): string {
  const value = Application.getState(SOURCE_DISPLAY_MODE_KEY);
  return value === "official" || value === "scanlations" ? value : "all";
}

export function setSourceDisplayMode(value: string): void {
  Application.setState(
    value === "official" || value === "scanlations" ? value : "all",
    SOURCE_DISPLAY_MODE_KEY,
  );
}

export function getShowEdition(): boolean {
  return (Application.getState(SHOW_EDITION_KEY) as boolean | undefined) ?? false;
}

export function setShowEdition(value: boolean): void {
  Application.setState(value, SHOW_EDITION_KEY);
}

export function getShowSource(): boolean {
  return (Application.getState(SHOW_SOURCE_KEY) as boolean | undefined) ?? false;
}

export function setShowSource(value: boolean): void {
  Application.setState(value, SHOW_SOURCE_KEY);
}

export function getDataSaver(): boolean {
  return (Application.getState(DATA_SAVER_KEY) as boolean | undefined) ?? false;
}

export function setDataSaver(value: boolean): void {
  Application.setState(value, DATA_SAVER_KEY);
}

export function getChapterTitleMode(): string {
  const value = Application.getState(CHAPTER_TITLE_MODE_KEY);
  return typeof value === "string" &&
    CHAPTER_TITLE_MODE_OPTIONS.some((option) => option.id === value)
    ? value
    : "optional";
}

export function setChapterTitleMode(value: string): void {
  Application.setState(
    CHAPTER_TITLE_MODE_OPTIONS.some((option) => option.id === value) ? value : "optional",
    CHAPTER_TITLE_MODE_KEY,
  );
}

export function getExcludedGenres(): string[] {
  return readStringArray(EXCLUDED_GENRES_KEY, []);
}

export function setExcludedGenres(value: string[]): void {
  Application.setState(
    [...new Set(value.map((entry) => entry.trim()).filter(Boolean))],
    EXCLUDED_GENRES_KEY,
  );
}

export function getHiddenTagCategories(): string[] {
  return readStringArray(
    HIDDEN_TAG_CATEGORIES_KEY,
    [],
    new Set(HIDDEN_TAG_CATEGORIES.map((category) => category.id)),
  );
}

export function setHiddenTagCategories(value: string[]): void {
  const validIds = new Set(HIDDEN_TAG_CATEGORIES.map((category) => category.id));
  Application.setState(
    [...new Set(value.filter((entry) => validIds.has(entry)))],
    HIDDEN_TAG_CATEGORIES_KEY,
  );
}

export function getCustomHiddenTags(): string[] {
  return readStringArray(CUSTOM_HIDDEN_TAGS_KEY, []);
}

export function setCustomHiddenTags(value: string): void {
  Application.setState(
    [
      ...new Set(
        value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    ],
    CUSTOM_HIDDEN_TAGS_KEY,
  );
}

export function resolveExcludedGenreIds(
  values: string[],
  genres: Record<string, string>,
): string[] {
  const entries = Object.entries(genres);
  return [
    ...new Set(
      values.flatMap((value) => {
        if (genres[value]) return [value];
        const normalized = value.toLowerCase();
        return entries.filter(([, name]) => name.toLowerCase() === normalized).map(([id]) => id);
      }),
    ),
  ];
}

export function getContentLanguages(): string[] {
  return readStringArray(
    CONTENT_LANGUAGES_KEY,
    ["en"],
    new Set(LANGUAGE_OPTIONS.map((option) => option.id)),
  );
}

export function setContentLanguages(value: string[]): void {
  const validIds = new Set(LANGUAGE_OPTIONS.map((option) => option.id));
  const sanitized = value.filter((entry) => validIds.has(entry));
  Application.setState(sanitized.length > 0 ? sanitized : ["en"], CONTENT_LANGUAGES_KEY);
}

export class SettingsFormProvider implements SettingsFormProviding {
  async getSettingsForm(): Promise<Form> {
    const genres = await getKaganeGenres();
    migrateExcludedGenres(genres);
    return new KaganeSettingsForm(genres);
  }
}

function migrateExcludedGenres(genres: GenreDto[]): void {
  const stored = getExcludedGenres();
  const genreMap = Object.fromEntries(genres.map((genre) => [genre.id, genre.genre_name]));
  const resolved = resolveExcludedGenreIds(stored, genreMap);
  if (
    stored.length !== resolved.length ||
    stored.some((value, index) => value !== resolved[index])
  ) {
    setExcludedGenres(resolved);
  }
}
