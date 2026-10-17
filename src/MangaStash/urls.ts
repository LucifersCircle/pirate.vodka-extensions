/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { BASE_URL, CONTROLS, SORTS, type Filters } from "./models";
export const validId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[a-z0-9][a-z0-9-]{0,255}$/.test(id) &&
  !["browse", "search", "account", "content", "assets", "trending", "collections"].includes(id);
export const sourceURL = (value: string): { href: string; pathname: string; query: string } => {
  if (
    typeof value !== "string" ||
    !value ||
    /[\\#\s<>"'`{}]/.test(value) ||
    /%(?![0-9a-f]{2})/i.test(value)
  )
    throw new Error("Invalid MangaStash URL.");
  const href = value.startsWith("/") && !value.startsWith("//") ? BASE_URL + value : value;
  const i = href.indexOf("?"),
    pathname = href.slice(BASE_URL.length, i < 0 ? undefined : i);
  if (
    !href.startsWith(BASE_URL + "/") ||
    /%2f|%5c|%00|%25|(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(pathname)
  )
    throw new Error("Invalid MangaStash URL origin or path.");
  return {
    href,
    pathname,
    query: i < 0 ? "" : href.slice(i + 1),
  };
};
export const seriesId = (url: string): string => {
  const p = sourceURL(url);
  const id = p.pathname.replace(/^\/|\/$/g, "");
  if (p.query || !validId(id)) throw new Error("Invalid MangaStash series identity.");
  return id;
};
export const seriesURL = (id: string) => {
  if (!validId(id)) throw new Error("Invalid MangaStash series identity.");
  return `${BASE_URL}/${id}/`;
};
export const chapterId = (url: string, id: string): string => {
  seriesURL(id);
  const p = sourceURL(url);
  const canonical = p.pathname.slice(1);
  if (
    p.query ||
    !canonical.startsWith(id + "/") ||
    !new RegExp(`^${id}/chapter-[a-zA-Z0-9][a-zA-Z0-9.-]{0,127}$`).test(canonical) ||
    canonical.includes("..")
  )
    throw new Error("Invalid MangaStash chapter identity.");
  return canonical;
};
export const chapterURL = (id: string, owner: string) => {
  const url = `${BASE_URL}/${id}`;
  if (chapterId(url, owner) !== id) throw new Error("Invalid MangaStash chapter identity.");
  return url;
};
export const imageURL = (url: string, id: string, chapter?: string): string => {
  seriesURL(id);
  const p = sourceURL(url);
  if (p.query || !/\.(?:jpe?g|png|webp|avif)$/i.test(p.pathname))
    throw new Error("Invalid MangaStash image URL.");
  // The canonical /kagurabachi/ Book metadata binds this exact filename to the work.
  // Accept only its observed full/thumbnail paths; never normalize IDs or invent URLs.
  const namedCover = [
    "/content/covers/kagura-bachi.jpg",
    "/content/covers/thumbnails/kagura-bachi.jpg",
  ].includes(p.pathname)
    ? id === "kagurabachi"
    : new RegExp(`^/content/covers/(?:thumbnails/)?${id}\\.(?:jpe?g|png|webp|avif)$`, "i").test(
        p.pathname,
      );
  if (chapter !== undefined) {
    chapterURL(chapter, id);
    if (
      !new RegExp(
        `^/content/${id}/chapter-[a-zA-Z0-9.-]+/[a-zA-Z0-9_-]+\\.(?:jpe?g|png|webp|avif)$`,
        "i",
      ).test(p.pathname)
    )
      throw new Error("Wrong MangaStash reader image owner.");
  } else if (
    !namedCover &&
    !new RegExp(`^/content/${id}/chapter-\\d+(?:\\.\\d+)?/[a-zA-Z0-9_-]+\\.[a-zA-Z]+$`).test(
      p.pathname,
    )
  )
    throw new Error("Wrong MangaStash cover owner.");
  return p.href;
};
export const queryPairs = (url: string): [string, string][] => {
  const q = sourceURL(url).query;
  return q
    ? q.split("&").map((pair) => {
        const pos = pair.indexOf("=");
        if (pos < 1) throw new Error("Malformed MangaStash query.");
        return [
          decodeURIComponent(pair.slice(0, pos).replace(/\+/g, " ")),
          decodeURIComponent(pair.slice(pos + 1).replace(/\+/g, " ")),
        ];
      })
    : [];
};
export const readFilters = (metadata?: unknown): Filters => {
  if (
    metadata !== undefined &&
    (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
  )
    throw new Error("Invalid MangaStash saved filters.");
  const data = (metadata ?? {}) as Record<string, unknown>;
  if (Object.keys(data).some((k) => !CONTROLS.some((c) => c.id === k)))
    throw new Error("Unknown MangaStash saved filter.");
  const result: Filters = {};
  for (const c of CONTROLS) {
    const v = data[c.id] === undefined ? (c.id === "rating" ? "" : []) : data[c.id];
    if (c.id === "rating") {
      if (typeof v !== "string" || !c.items.some((i) => i.id === v))
        throw new Error("Invalid MangaStash rating filter.");
      result[c.id] = v;
    } else {
      if (
        !Array.isArray(v) ||
        v.some((x) => typeof x !== "string" || !c.items.some((i) => i.id === x)) ||
        new Set(v).size !== v.length
      )
        throw new Error(`Invalid MangaStash ${c.id} filter.`);
      result[c.id] = [...v].sort((a, b) => String(a).localeCompare(String(b)));
    }
  }
  return result;
};
export const searchURL = (title: string, metadata?: unknown, sort?: string): string => {
  if (typeof title !== "string" || title.length > 512)
    throw new Error("Invalid MangaStash search.");
  for (let i = 0; i < title.length; i++)
    if (title.charCodeAt(i) < 32 || title.charCodeAt(i) === 127)
      throw new Error("Invalid MangaStash search.");
  const filters = readFilters(metadata),
    text = title.trim();
  if (sort !== undefined && !SORTS.some((s) => s.id === sort))
    throw new Error("Unknown MangaStash sort.");
  const selected = Object.values(filters).some((v) => v.length > 0);
  if (text && (selected || sort !== undefined))
    throw new Error(
      "MangaStash text search supports only q. Clear browse filters and sorting, or clear the search text.",
    );
  if (text)
    return `${BASE_URL}/search?q=${encodeURIComponent(text).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())}`;
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value))
      for (const v of value)
        pairs.push(`${encodeURIComponent(key + "[]")}=${encodeURIComponent(v)}`);
    else if (value) pairs.push(`${key}=${encodeURIComponent(value)}`);
  }
  if (sort) pairs.push(`sort=${sort}`);
  return `${BASE_URL}/browse/${pairs.length ? "?" + pairs.join("&") : ""}`;
};
export const queryScope = (url: string): string => {
  const p = sourceURL(url);
  if (!["/browse/", "/search"].includes(p.pathname))
    throw new Error("Unsupported MangaStash catalog route.");
  const fields: Record<string, string[]> = {};
  for (const [raw, v] of queryPairs(url)) {
    const key = raw.replace(/\[(?:\d*)\]$/, "");
    if (key === "page") {
      if (raw !== key || !/^[1-9]\d{0,4}$/.test(v) || fields.page)
        throw new Error("Invalid MangaStash pagination.");
      fields.page = [v];
      continue;
    }
    if (
      p.pathname === "/search"
        ? key !== "q" || raw !== key
        : !CONTROLS.some((c) => c.id === key) && key !== "sort"
    )
      throw new Error("Unknown MangaStash query scope.");
    if ((fields[key]?.length && ["rating", "sort", "q"].includes(key)) || fields[key]?.includes(v))
      throw new Error("Duplicate MangaStash query scope.");
    (fields[key] ??= []).push(v);
  }
  const filter: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(fields))
    if (!["page", "sort", "q"].includes(key)) filter[key] = key === "rating" ? v[0] : v;
  readFilters(filter);
  if (fields.sort && !SORTS.some((s) => s.id === fields.sort[0]))
    throw new Error("Unknown MangaStash sort.");
  if (p.pathname === "/search" && (!fields.q?.[0] || fields.q[0].length > 512))
    throw new Error("Invalid MangaStash search scope.");
  delete fields.page;
  return JSON.stringify([
    p.pathname,
    Object.entries(fields)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, [...v].sort((a, b) => String(a).localeCompare(String(b)))]),
  ]);
};
export const pageNumber = (url: string): number =>
  Number(queryPairs(url).find(([k]) => k === "page")?.[1] ?? 1);
export const continuation = (next: string, current: string): string => {
  const p = sourceURL(next);
  if (queryScope(p.href) !== queryScope(current) || pageNumber(p.href) !== pageNumber(current) + 1)
    throw new Error("MangaStash pagination changed scope or order.");
  return p.href;
};
