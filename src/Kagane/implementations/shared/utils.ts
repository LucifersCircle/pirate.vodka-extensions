/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import { CloudflareError, ContentRating, URL } from "@paperback/types";

import { fetchJSON } from "../../services/network";
import {
  API_URL,
  BASE_URL,
  CONTENT_RATING_VALUES,
  DATA_SAVER_KEY,
  GENRES_CACHE_KEY,
  INTEGRITY_EXP_KEY,
  INTEGRITY_TOKEN_KEY,
  SOURCES_CACHE_KEY,
  TAXONOMY_CACHE_TTL_MS,
  type ChallengeDto,
  type GenreDto,
  type IntegrityDto,
  type KaganeContentRating,
  type KaganeMetadata,
  type KaganeSearchBook,
  type SourcesDto,
} from "./models";

interface PersistedCache<T> {
  cachedAt: number;
  entries: T[];
}

let genreMemo: PersistedCache<GenreDto> | undefined;
let genreRequest: Promise<GenreDto[]> | undefined;
let sourceMemo: PersistedCache<SourcesDto["sources"][number]> | undefined;
let sourceRequest: Promise<SourcesDto["sources"]> | undefined;

export function applyMixins(derivedCtor: Constructor, constructors: Constructor[]) {
  for (const baseCtor of constructors) {
    for (const name of Object.getOwnPropertyNames(baseCtor.prototype)) {
      if (name !== "constructor") {
        Object.defineProperty(
          derivedCtor.prototype,
          name,
          Object.getOwnPropertyDescriptor(baseCtor.prototype, name) ?? Object.create(null),
        );
      }
    }
  }
}

type Constructor = new (...args: never[]) => unknown;

export function buildImageUrl(imageId?: unknown): string {
  const normalizedImageId = normalizeImageId(imageId);
  if (!normalizedImageId) return "";

  return new URL(API_URL)
    .addPathComponent("api")
    .addPathComponent("v2")
    .addPathComponent("image")
    .addPathComponent(encodeURIComponent(normalizedImageId))
    .toString();
}

export function hasCoverImage(
  book: KaganeSearchBook,
): book is KaganeSearchBook & { cover_image_id: string } {
  return normalizeImageId(book.cover_image_id) !== undefined;
}

function normalizeImageId(imageId: unknown): string | undefined {
  if (typeof imageId !== "string") return undefined;

  const normalizedImageId = imageId.trim();
  return normalizedImageId || undefined;
}

export async function getChallengeResponse(chapterId: string): Promise<ChallengeDto> {
  const integrityToken = await getIntegrityToken();

  try {
    return await requestChallengeResponse(chapterId, integrityToken);
  } catch {
    const refreshedToken = await getIntegrityToken(true);
    return requestChallengeResponse(chapterId, refreshedToken);
  }
}

async function requestChallengeResponse(
  chapterId: string,
  integrityToken: string,
): Promise<ChallengeDto> {
  const url = new URL(API_URL)
    .addPathComponent("api")
    .addPathComponent("v2")
    .addPathComponent("books")
    .addPathComponent(chapterId)
    .setQueryItem("is_datasaver", String(getDataSaver()))
    .toString();

  return fetchJSON<ChallengeDto>({
    url,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-integrity-token": integrityToken,
    },
    body: "{}",
  });
}

async function getIntegrityToken(forceRefresh = false): Promise<string> {
  const exp = Number(Application.getState(INTEGRITY_EXP_KEY) ?? 0);
  const token = Application.getState(INTEGRITY_TOKEN_KEY);

  if (!forceRefresh && typeof token === "string" && token && exp > Date.now()) {
    return token;
  }

  const integrity = await fetchJSON<IntegrityDto>({
    url: `${BASE_URL}/api/integrity`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "",
  });

  Application.setState(integrity.token, INTEGRITY_TOKEN_KEY);
  Application.setState(String(integrity.exp * 1000), INTEGRITY_EXP_KEY);

  return integrity.token;
}

function getDataSaver(): boolean {
  return (Application.getState(DATA_SAVER_KEY) as boolean | undefined) ?? false;
}

export async function getKaganeMetadata(): Promise<KaganeMetadata> {
  const [genres, sources] = await Promise.all([getKaganeGenres(), getKaganeSources()]);

  return {
    genres: Object.fromEntries(genres.map((genre) => [genre.id, genre.genre_name])),
    sources,
  };
}

export async function getKaganeGenres(): Promise<GenreDto[]> {
  if (genreMemo && isFresh(genreMemo)) return genreMemo.entries;
  if (genreRequest) return genreRequest;

  genreRequest = loadCachedEntries(GENRES_CACHE_KEY, genreMemo, isGenreDto, () =>
    fetchJSON<GenreDto[]>({
      url: `${API_URL}/api/v2/genres/list`,
      method: "GET",
    }),
  ).then((cache) => {
    genreMemo = cache;
    return cache.entries;
  });

  try {
    return await genreRequest;
  } finally {
    genreRequest = undefined;
  }
}

export async function getKaganeSources(): Promise<SourcesDto["sources"]> {
  if (sourceMemo && isFresh(sourceMemo)) return sourceMemo.entries;
  if (sourceRequest) return sourceRequest;

  sourceRequest = loadCachedEntries(SOURCES_CACHE_KEY, sourceMemo, isSourceDto, async () => {
    const response = await fetchJSON<SourcesDto>({
      url: `${API_URL}/api/v2/sources/list`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_types: null }),
    });
    return response.sources ?? [];
  }).then((cache) => {
    sourceMemo = cache;
    return cache.entries;
  });

  try {
    return await sourceRequest;
  } finally {
    sourceRequest = undefined;
  }
}

async function loadCachedEntries<T>(
  cacheKey: string,
  memoryCache: PersistedCache<T> | undefined,
  isEntry: (entry: unknown) => entry is T,
  fetchEntries: () => Promise<T[]>,
): Promise<PersistedCache<T>> {
  const persistedCache = readPersistedCache(cacheKey, isEntry);
  const cached =
    persistedCache && (!memoryCache || persistedCache.cachedAt > memoryCache.cachedAt)
      ? persistedCache
      : memoryCache;
  if (cached && isFresh(cached)) return cached;

  try {
    const entries = (await fetchEntries()).filter(isEntry);
    const cache = { cachedAt: Date.now(), entries };
    persistCache(cacheKey, cache);
    return cache;
  } catch (error) {
    if (error instanceof CloudflareError) throw error;
    if (cached) return cached;
    throw error;
  }
}

function readPersistedCache<T>(
  cacheKey: string,
  isEntry: (entry: unknown) => entry is T,
): PersistedCache<T> | undefined {
  const raw = Application.getState(cacheKey);
  if (typeof raw !== "string") return undefined;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      typeof parsed.cachedAt !== "number" ||
      !Array.isArray(parsed.entries)
    ) {
      return undefined;
    }
    if (!parsed.entries.every(isEntry)) return undefined;
    return { cachedAt: parsed.cachedAt, entries: parsed.entries };
  } catch {
    return undefined;
  }
}

function persistCache<T>(cacheKey: string, cache: PersistedCache<T>): void {
  try {
    Application.setState(JSON.stringify(cache), cacheKey);
  } catch {
    // A working memory cache is still preferable to failing the caller.
  }
}

function isFresh<T>(cache: PersistedCache<T>): boolean {
  return Date.now() - cache.cachedAt < TAXONOMY_CACHE_TTL_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGenreDto(value: unknown): value is GenreDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.genre_name === "string" &&
    value.genre_name.length > 0 &&
    (value.genre_type === undefined ||
      value.genre_type === null ||
      typeof value.genre_type === "string")
  );
}

function isSourceDto(value: unknown): value is SourcesDto["sources"][number] {
  return (
    isRecord(value) &&
    typeof value.source_id === "string" &&
    value.source_id.length > 0 &&
    typeof value.source_type === "string" &&
    typeof value.title === "string"
  );
}

export function titleCase(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function normalizeContentRatings(value: unknown): KaganeContentRating[] {
  if (Array.isArray(value)) {
    const selected = CONTENT_RATING_VALUES.filter((rating) => value.includes(rating));
    return selected.length > 0 ? selected : ["safe", "suggestive"];
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeContentRatings(parsed);
    } catch {
      // Legacy values are stored as a single rating rather than JSON.
    }

    const legacyIndex = CONTENT_RATING_VALUES.indexOf(value as KaganeContentRating);
    if (legacyIndex >= 0) return CONTENT_RATING_VALUES.slice(0, legacyIndex + 1);
  }

  return ["safe", "suggestive"];
}

export function getContentRatingValues(ratings: KaganeContentRating[]): string[] {
  return ratings.map(titleCase);
}

export function getPaperbackContentRating(contentRating?: string | null): ContentRating {
  switch (contentRating?.trim().toLowerCase()) {
    case "safe":
      return ContentRating.EVERYONE;
    case "suggestive":
    case "erotica":
      return ContentRating.MATURE;
    case "pornographic":
      return ContentRating.ADULT;
    default:
      return ContentRating.MATURE;
  }
}

export function parseKaganeDate(value?: string | null): Date | undefined {
  if (!value) return undefined;

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function mapPublicationStatus(status: string): string {
  switch (status.toUpperCase()) {
    case "ONGOING":
      return "Ongoing";
    case "COMPLETED":
      return "Completed";
    case "HIATUS":
      return "Hiatus";
    case "ABANDONED":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

export function parseChapterNumber(value?: string | null): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function joinUnique(values: string[]): string | undefined {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(", ") : undefined;
}

export function buildChapterTitle(
  title: string,
  chapterNo?: string | null,
  volumeNo?: string | null,
  mode = "optional",
  chapterNumberCandidates: string[] = [],
): string {
  const displayChapterNo = normalizeNumberLabel(chapterNo);
  const displayVolumeNo = normalizeNumberLabel(volumeNo);
  const volumeStrippedTitle = stripDuplicateVolumePrefix(title.trim(), displayVolumeNo);
  const strippedTitle = stripDuplicateChapterPrefix(volumeStrippedTitle, [
    displayChapterNo,
    ...chapterNumberCandidates,
  ]);
  if (mode === "optional" || mode === "always" || mode === "vol_chapter") {
    return strippedTitle;
  }

  return strippedTitle;
}

function normalizeNumberLabel(value?: string | null): string | undefined {
  const label = value?.trim();
  if (!label) {
    return undefined;
  }

  return label;
}

function stripDuplicateChapterPrefix(
  title: string,
  chapterNumbers: Array<string | undefined>,
): string {
  const candidates = [
    ...new Set(
      chapterNumbers.map(normalizeNumberLabel).filter((value): value is string => Boolean(value)),
    ),
  ];

  for (const chapterNo of candidates) {
    const escapedChapterNo = chapterNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicatePrefix = new RegExp(
      `^(?:chapter|episode|ch\\.?|#)\\s*${escapedChapterNo}(?:\\s*(?:[-:\\u2013\\u2014]|\\.(?!\\d))\\s*|\\s+|$)`,
      "i",
    );
    const stripped = title.replace(duplicatePrefix, "").trim();
    if (stripped !== title) return stripped;
  }

  return title.replace(genericChapterPrefixRegex(), "").trim();
}

function genericChapterPrefixRegex(): RegExp {
  return /^(?:chapter|episode|ch\.?|#)\s*\d+(?:\.\d+)?(?:\s*(?:[-:\u2013\u2014]|\.(?!\d))\s*|\s+|$)/i;
}

function stripDuplicateVolumePrefix(title: string, volumeNo?: string): string {
  const candidate = normalizeNumberLabel(volumeNo);
  if (!candidate) return title;

  const escapedVolumeNo = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const duplicatePrefix = new RegExp(
    `^(?:volume|vol\\.?)\\s*${escapedVolumeNo}(?:\\s*(?:[-:\\u2013\\u2014]|\\.(?!\\d))\\s*|\\s+|$)`,
    "i",
  );

  return title.replace(duplicatePrefix, "").trim();
}
