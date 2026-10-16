/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  CloudflareError,
  PaperbackInterceptor,
  type Request,
  type Response,
  type SearchQuery,
  type Metadata,
  type SortingOption,
  type JSONValue,
  type JSONObject,
} from "@paperback/types";
import { BASE_URL, SORTS, type Pagination } from "./models";
import { readFilters } from "./forms";
import { authorizeImage } from "./images";
import { sourceURL } from "./urls";

// The native Request contract has no request-purpose discriminator. Only exact
// metadata requests currently scheduled by this source receive this exemption.
// Identical metadata-shaped calls during that lifetime are indistinguishable;
// upload URLs never qualify, and every metadata response is checked as HTML.
const MAX_PENDING = 128;
let interceptorRegistered = false;
let pendingCount = 0;
const textRequests = new Map<string, { count: number }>();
const hasControl = (value: string, html = false): boolean => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 && (!html || ![9, 10, 12, 13].includes(code))) return true;
  }
  return false;
};
const uniqueFields = (value: string): Map<string, string> => {
  const fields = new Map<string, string>();
  for (const pair of value.replace(/^\?/, "").split("&")) {
    if (!pair) continue;
    const separator = pair.indexOf("=");
    const decode = (part: string): string => decodeURIComponent(part.replace(/\+/g, " "));
    const key = decode(separator < 0 ? pair : pair.slice(0, separator));
    const item = decode(separator < 0 ? "" : pair.slice(separator + 1));
    if (hasControl(key)) throw new Error("Invalid Mangasushi metadata parameter name.");
    if (fields.has(key)) throw new Error("Duplicate Mangasushi metadata parameter.");
    fields.set(key, item);
  }
  // PHP form decoding must not replace a protected scalar with an array.
  // Reject every scalar/descendant collision, regardless of field order.
  for (const key of fields.keys()) {
    for (let index = key.indexOf("["); index !== -1; index = key.indexOf("[", index + 1)) {
      if (fields.has(key.slice(0, index)))
        throw new Error("Conflicting Mangasushi metadata parameters.");
    }
  }
  return fields;
};
const metadataRoute = (request: Request): "document" | "fragment" => {
  const url = sourceURL(request.url);
  const identity = "[a-zA-Z0-9][a-zA-Z0-9%_-]*";
  if (/%2f|%5c|%00/i.test(url.pathname)) throw new Error("Invalid Mangasushi metadata path.");
  if (request.method === "GET" && request.body === undefined) {
    if (url.pathname === "/") {
      if (!url.search) return "document";
      const fields = uniqueFields(url.search);
      const keys = ["s", "post_type", "m_orderby", "op", "author", "artist", "release", "adult"];
      if (
        keys.every((key) => fields.has(key)) &&
        fields.get("post_type") === "wp-manga" &&
        [...fields.keys()].every(
          (key) => keys.includes(key) || /^(genre|status)\[(0|[1-9]\d*)\]$/.test(key),
        )
      )
        return "document";
    } else if (
      !url.search &&
      (/^\/manga-genre\/[a-z][a-z0-9-]*\/$/.test(url.pathname) ||
        new RegExp(`^/manga/${identity}/(?:${identity}/)?$`).test(url.pathname))
    )
      return "document";
  } else if (request.method === "POST" && typeof request.body === "string" && !url.search) {
    if (new RegExp(`^/manga/${identity}/ajax/chapters/$`).test(url.pathname) && request.body === "")
      return "fragment";
    if (url.pathname === "/wp-admin/admin-ajax.php") {
      const fields = uniqueFields(request.body);
      const template = fields.get("template");
      const kind = template === "madara-core/content/content-search" ? "search" : "archive";
      if (
        fields.get("action") === "madara_load_more" &&
        /^(0|[1-9]\d*)$/.test(fields.get("page") ?? "") &&
        Number.isSafeInteger(Number(fields.get("page"))) &&
        (template === "madara-core/content/content-search" ||
          template === "madara-core/content/content-archive") &&
        fields.get("vars[post_type]") === "wp-manga" &&
        fields.get("vars[post_status]") === "publish" &&
        (!fields.has("vars[template]") || fields.get("vars[template]") === kind) &&
        [...fields.keys()].every(
          (key) =>
            ["action", "page", "template"].includes(key) || /^vars(?:\[[^[\]]+\])+$/.test(key),
        )
      )
        return "fragment";
    }
  }
  throw new Error("Unsupported Mangasushi metadata request.");
};
const fingerprint = (request: Request): string => {
  metadataRoute(request);
  return JSON.stringify([
    sourceURL(request.url).href,
    request.method,
    request.body === undefined,
    request.body ?? "",
  ]);
};
const isPendingText = (request: Request): boolean => {
  try {
    return textRequests.has(fingerprint(request));
  } catch {
    return false;
  }
};
const validateTextResponse = (request: Request, response: Response, data: ArrayBuffer): string => {
  const kind = metadataRoute(request);
  if (sourceURL(response.url).href !== sourceURL(request.url).href)
    throw new Error("Mangasushi metadata redirected to a different route.");
  const types = [
    response.mimeType,
    ...Object.entries(response.headers)
      .filter(([key]) => key.toLowerCase() === "content-type")
      .map(([, value]) => value),
  ].filter((value): value is string => value !== undefined);
  if (
    types.some(
      (value) => !/^(text\/html|application\/xhtml\+xml)$/i.test(value.split(";")[0].trim()),
    )
  )
    throw new Error("Mangasushi metadata response is not HTML.");
  const text = Application.arrayBufferToUTF8String(data);
  const prefix = text.trimStart().replace(/^(?:<!--[^]*?-->\s*)+/, "");
  if (
    hasControl(text, true) ||
    (!(kind === "fragment" && !text.trim()) &&
      !/^(?:<!doctype\s+html(?:\s|>)|<(?:html|head|body|div|ul|li|section|article|script|style)(?:\s|>))/i.test(
        prefix,
      ))
  )
    throw new Error("Mangasushi metadata response has an unsupported body.");
  return text;
};

export class MangaSushiInterceptor extends PaperbackInterceptor {
  override registerInterceptor(): void {
    super.registerInterceptor();
    interceptorRegistered = true;
  }
  override unregisterInterceptor(): void {
    super.unregisterInterceptor();
    interceptorRegistered = false;
    textRequests.clear();
    pendingCount = 0;
  }
  override async interceptRequest(request: Request): Promise<Request> {
    const textRequest = isPendingText(request);
    if (!textRequest) {
      if (request.method !== "GET" || request.body !== undefined)
        throw new Error("Unsupported Mangasushi image request.");
      authorizeImage(request.url);
    }
    request.headers = {
      ...Object.fromEntries(
        Object.entries(request.headers ?? {}).filter(
          ([key]) => !["referer", "origin", "user-agent"].includes(key.toLowerCase()),
        ),
      ),
      referer: `${BASE_URL}/`,
      origin: BASE_URL,
      "user-agent": await Application.getDefaultUserAgent(),
    };
    if (textRequest) {
      if (!isPendingText(request))
        throw new Error("Mangasushi metadata request is no longer pending.");
    } else authorizeImage(request.url);
    return request;
  }
  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (
      Object.entries(response.headers).some(
        ([key, value]) =>
          key.toLowerCase() === "cf-mitigated" && value.toLowerCase() === "challenge",
      )
    ) {
      throw new CloudflareError({
        url: `${BASE_URL}/`,
        method: "GET",
        headers: { "user-agent": await Application.getDefaultUserAgent() },
      });
    }
    if (isPendingText(request)) validateTextResponse(request, response, data);
    else {
      if (request.method !== "GET" || request.body !== undefined)
        throw new Error("Unsupported Mangasushi image response.");
      authorizeImage(request.url);
      if (response.url !== request.url)
        throw new Error("Mangasushi image redirected to a different URL.");
      authorizeImage(response.url);
    }
    return data;
  }
}
export const fetchText = async (
  url: string,
  body?: string,
  _exactRoute = false,
): Promise<string> => {
  if (!interceptorRegistered)
    throw new Error("Mangasushi request authorization is not initialized.");
  const request: Request = {
    url,
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : { body, headers: { "content-type": "application/x-www-form-urlencoded" } }),
  };
  const expected: Request = { ...request };
  const key = fingerprint(expected);
  if (pendingCount >= MAX_PENDING)
    throw new Error("Too many pending Mangasushi requests. Retry shortly.");
  const entry = textRequests.get(key) ?? { count: 0 };
  entry.count++;
  pendingCount++;
  textRequests.set(key, entry);
  try {
    const [response, data] = await Application.scheduleRequest(request);
    if (textRequests.get(key) !== entry || fingerprint(request) !== key)
      throw new Error("Mangasushi metadata request is no longer pending.");
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Mangasushi request failed (${response.status}).`);
    // Recheck even if a runtime returns without invoking its response interceptor.
    const text = validateTextResponse(expected, response, data);
    if (/cf-chl-|<title>Just a moment|<title>Access denied/i.test(text))
      throw new Error("Mangasushi requires website verification. Open the source website.");
    return text;
  } finally {
    // An unregistered/replaced lifecycle must not decrement a newer registration.
    if (textRequests.get(key) === entry) {
      pendingCount--;
      if (--entry.count === 0) textRequests.delete(key);
    }
  }
};
export const formEncode = (value: JSONObject): string => {
  const pairs: string[] = [];
  const append = (key: string, item: JSONValue | undefined) => {
    if (item && typeof item === "object") {
      for (const [child, entry] of Object.entries(item)) append(`${key}[${child}]`, entry);
    } else pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item ?? ""))}`);
  };
  for (const [key, item] of Object.entries(value)) append(key, item);
  return pairs.join("&");
};
export const searchUrl = (
  query: SearchQuery<Metadata>,
  excludeNSFW: boolean,
  sorting?: SortingOption,
): string => {
  const filters = readFilters(query.metadata);
  if (
    sorting != null &&
    (typeof sorting !== "object" ||
      Array.isArray(sorting) ||
      typeof sorting.id !== "string" ||
      !SORTS.some((sort) => sort.id === sorting.id))
  )
    throw new Error("Mangasushi saved sort is invalid; choose another sorting option.");
  return `${BASE_URL}/?${formEncode({
    // WordPress full-title search misses curly quotes used by displayed titles.
    s: query.title
      .trim()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"'),
    post_type: "wp-manga",
    m_orderby: SORTS.find((sort) => sort.id === sorting?.id)?.id ?? "",
    genre: filters.genres,
    op: filters.condition,
    author: filters.author,
    artist: filters.artist,
    release: filters.release,
    adult: excludeNSFW ? "0" : filters.adult,
    status: filters.statuses,
  })}`;
};
export const fetchNext = (cursor: Pagination): Promise<string> =>
  fetchText(
    `${BASE_URL}/wp-admin/admin-ajax.php`,
    formEncode({
      action: "madara_load_more",
      page: cursor.page,
      template: cursor.template,
      vars: cursor.vars,
    }),
  );
