/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import { CloudflareError } from "@paperback/types";

import { fetchJSON } from "../../services/network";
import { API_URL, TAGS_CACHE_KEY, TAXONOMY_CACHE_TTL_MS, type TagDto } from "./models";
import { POPULAR_TAG_NAMES } from "./tag-options";

interface PersistedTagCache {
  cachedAt: number;
  entries: TagDto[];
}

let tagMemo: PersistedTagCache | undefined;
let tagRequest: Promise<TagDto[]> | undefined;

export async function getKaganeTagEntries(): Promise<TagDto[]> {
  if (tagMemo && Date.now() - tagMemo.cachedAt < TAXONOMY_CACHE_TTL_MS) {
    return tagMemo.entries;
  }
  if (tagRequest) return tagRequest;

  tagRequest = loadTagEntries(tagMemo).then((cache) => {
    tagMemo = cache;
    return cache.entries;
  });

  try {
    return await tagRequest;
  } finally {
    tagRequest = undefined;
  }
}

async function loadTagEntries(memoryCache?: PersistedTagCache): Promise<PersistedTagCache> {
  const persistedCache = readTagCache();
  const cached =
    persistedCache && (!memoryCache || persistedCache.cachedAt > memoryCache.cachedAt)
      ? persistedCache
      : memoryCache;
  if (cached && Date.now() - cached.cachedAt < TAXONOMY_CACHE_TTL_MS) {
    return cached;
  }

  try {
    const entries = (
      await fetchJSON<TagDto[]>({
        url: `${API_URL}/api/v2/tags/list`,
        method: "GET",
      })
    ).filter(isTagDto);
    const cache = { cachedAt: Date.now(), entries };
    persistTagCache(cache);
    return cache;
  } catch (error) {
    if (error instanceof CloudflareError) throw error;
    if (cached) return cached;
    throw error;
  }
}

export function buildTagNameIndex(entries: TagDto[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const entry of entries) {
    const name = normalizeTagName(entry.tag_name);
    const ids = index.get(name) ?? [];
    if (!ids.includes(entry.id)) ids.push(entry.id);
    index.set(name, ids);
  }
  return index;
}

export function buildPopularTagOptions(entries: TagDto[]): Array<{ id: string; value: string }> {
  const index = buildTagNameIndex(entries);
  return POPULAR_TAG_NAMES.filter((name) => index.has(normalizeTagName(name)))
    .map((name) => ({ id: index.get(normalizeTagName(name))?.[0] ?? "", value: name }))
    .filter((option) => Boolean(option.id))
    .sort((left, right) => left.value.localeCompare(right.value));
}

export function resolveSelectedTagValues(
  values: string[],
  index: Map<string, string[]>,
  entries: TagDto[],
): string[] {
  const namesById = new Map(entries.map((entry) => [entry.id, normalizeTagName(entry.tag_name)]));
  return unique(
    values.flatMap((value) => {
      const name = namesById.get(value);
      return name ? (index.get(name) ?? []) : [value];
    }),
  );
}

export function resolveTagNames(names: string[], index: Map<string, string[]>): string[] {
  return unique(names.flatMap((name) => index.get(normalizeTagName(name)) ?? []));
}

export function parseTagInput(input: string): { included: string[]; excluded: string[] } {
  const included: string[] = [];
  const excluded: string[] = [];

  for (const rawEntry of input.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;

    const shouldExclude = entry.startsWith("-");
    const name = shouldExclude ? entry.slice(1).trim() : entry;
    if (name) (shouldExclude ? excluded : included).push(name);
  }

  return { included: unique(included), excluded: unique(excluded) };
}

function readTagCache(): PersistedTagCache | undefined {
  const raw = Application.getState(TAGS_CACHE_KEY);
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
    if (!parsed.entries.every(isTagDto)) return undefined;
    return { cachedAt: parsed.cachedAt, entries: parsed.entries };
  } catch {
    return undefined;
  }
}

function persistTagCache(cache: PersistedTagCache): void {
  try {
    Application.setState(JSON.stringify(cache), TAGS_CACHE_KEY);
  } catch {
    // The in-memory copy remains usable when the host declines a large state write.
  }
}

function isTagDto(value: unknown): value is TagDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.tag_name === "string" &&
    value.tag_name.trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTagName(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
