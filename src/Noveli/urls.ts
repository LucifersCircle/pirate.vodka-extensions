/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { BASE_URL, PAGE_SIZE, SORTS, firstPage, record, validId, type Filters } from "./models";
export const readFilters = (metadata: unknown): Filters => {
  const value = metadata === undefined || metadata === null ? {} : record(metadata);
  if (Reflect.ownKeys(value).some((key) => key !== "genres" && key !== "status"))
    throw new Error("Unsupported Noveli search filter.");
  const genres = value.genres === undefined ? [] : value.genres;
  const status = value.status === undefined ? "" : value.status;
  if (
    !Array.isArray(genres) ||
    genres.some((g) => typeof g !== "string" || !g.trim() || g.includes(",")) ||
    new Set(genres).size !== genres.length ||
    !["", "Ongoing", "Completed"].includes(status as string)
  )
    throw new Error("Invalid Noveli search filters.");
  return { genres: [...genres], status: status as Filters["status"] };
};
export const sortId = (sorting: unknown): string => {
  if (sorting === undefined) return "popular";
  const value = record(sorting);
  if (typeof value.id !== "string" || !SORTS.some((s) => s.id === value.id))
    throw new Error("Unsupported Noveli sorting option.");
  return value.id;
};
// HTTPS Request serialization percent-encodes query apostrophes. Issue that exact
// canonical spelling so the strict requested/final response identity stays intact.
const encodeQuery = (value: string): string => encodeURIComponent(value).replace(/'/g, "%27");
export const catalogURL = (title: string, filters: Filters, sort: string, page: number): string => {
  let url = `${BASE_URL}/api/novels?sort=${sort}&page=${page}&limit=${PAGE_SIZE}`;
  if (title) url += "&search=" + encodeQuery(title);
  if (filters.genres.length) url += "&genres=" + encodeQuery(filters.genres.join(","));
  if (filters.status) url += "&status=" + encodeQuery(filters.status);
  return url;
};
export const detailURL = (id: string): string => {
  if (!validId(id)) throw new Error("Noveli requires a canonical numeric novel ID.");
  return `${BASE_URL}/api/novels/${id}`;
};
export const chapterListURL = (slug: string): string => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("Invalid Noveli source slug.");
  return `${BASE_URL}/api/novels/${slug}/chapters`;
};
export const readerURL = (id: string, chapter: string): string => {
  detailURL(id);
  if (!validId(chapter)) throw new Error("Noveli requires a canonical numeric chapter ID.");
  return `${BASE_URL}/api/novels/${id}/chapters/${chapter}`;
};
export const coverURL = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("Missing Noveli cover URL.");
  const url = value.startsWith("/uploads/covers/") ? BASE_URL + value : value;
  if (
    !/^https:\/\/noveli\.to\/uploads\/covers\/[A-Za-z0-9_~.-]+\.(?:webp|png|jpe?g|avif)$/.test(
      url,
    ) ||
    url.includes("/..")
  )
    throw new Error("Unsupported Noveli cover URL.");
  return url;
};
export const isMetadataURL = (url: string): boolean => {
  const prefix = BASE_URL + "/api/novels";
  if (url === prefix + "/rankings" || url === prefix + "/tags") return true;
  if (url.startsWith(prefix + "/")) {
    const route = url.slice(prefix.length);
    return (
      /^\/[1-9]\d*$/.test(route) ||
      /^\/[a-z0-9][a-z0-9-]*\/chapters$/.test(route) ||
      /^\/[1-9]\d*\/chapters\/[1-9]\d*$/.test(route)
    );
  }
  if (!url.startsWith(prefix + "?")) return false;
  const pairs = url.slice(prefix.length + 1).split("&");
  const values: Record<string, string> = {};
  try {
    for (const pair of pairs) {
      const [key, value, extra] = pair.split("=");
      if (value === undefined || extra !== undefined || Object.hasOwn(values, key)) return false;
      if (!["sort", "page", "limit", "search", "genres", "status"].includes(key)) return false;
      const decoded = decodeURIComponent(value);
      if (encodeQuery(decoded) !== value) return false;
      values[key] = decoded;
    }
  } catch {
    return false;
  }
  return (
    SORTS.some((s) => s.id === values.sort) &&
    /^[1-9]\d*$/.test(values.page ?? "") &&
    Number.isSafeInteger(Number(values.page)) &&
    Number(values.page) <= 10000 &&
    values.limit === String(PAGE_SIZE) &&
    (values.status === undefined || ["Ongoing", "Completed"].includes(values.status)) &&
    (values.search === undefined || !!values.search.trim()) &&
    (values.genres === undefined || !!values.genres.trim())
  );
};
export type Cursor = { context: string; page: number; seen: string[] };
export const readCursor = (metadata: unknown, context: string): Cursor => {
  if (firstPage(metadata)) return { context, page: 1, seen: [] };
  const value = record(metadata);
  if (
    Reflect.ownKeys(value).some((key) => !["context", "page", "seen"].includes(key as string)) ||
    value.context !== context ||
    typeof value.page !== "number" ||
    !Number.isSafeInteger(value.page) ||
    value.page < 2 ||
    value.page > 10000 ||
    !Array.isArray(value.seen) ||
    value.seen.length !== (value.page - 1) * PAGE_SIZE ||
    value.seen.some((id) => !validId(id)) ||
    new Set(value.seen).size !== value.seen.length
  )
    throw new Error("Invalid or stale Noveli pagination; refresh the results.");
  return { context, page: value.page, seen: [...value.seen] };
};
