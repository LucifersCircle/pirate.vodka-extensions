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
  type JSONObject,
  type JSONValue,
} from "@paperback/types";
import { BASE_URL, SORTS } from "./models";
import { preferences, readFilters } from "./forms";

export class ManhwaNexInterceptor extends PaperbackInterceptor {
  private readerPages?: Map<string, { seriesId: string; context: string }>;
  private issued() {
    if (!this.readerPages) {
      this.readerPages = new Map();
      const stored = Application.getState("ManhwaNex.readerPages");
      if (Array.isArray(stored))
        for (const entry of stored.slice(-4096)) {
          if (!Array.isArray(entry) || entry.length !== 2) continue;
          const [url, value] = entry;
          if (
            typeof url !== "string" ||
            !/^https:\/\/cdn\.manhwanex\.com\/manga_[a-zA-Z0-9_-]+\/[^\s?#\\]+$/.test(url) ||
            /%2f|%5c|%00|%25|(?:^|\/)\.\.?\//i.test(url)
          )
            continue;
          if (
            !value ||
            typeof value !== "object" ||
            typeof value.seriesId !== "string" ||
            !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value.seriesId) ||
            typeof value.context !== "string" ||
            value.context.length > 1024
          )
            continue;
          this.readerPages.set(url, { seriesId: value.seriesId, context: value.context });
        }
    }
    return this.readerPages;
  }
  issuePages(pages: string[], seriesId: string) {
    const context = JSON.stringify(preferences()),
      issued = this.issued();
    for (const page of pages) {
      if (issued.size >= 4096) issued.delete(issued.keys().next().value!);
      issued.set(page, { seriesId, context });
    }
    Application.setState([...issued], "ManhwaNex.readerPages");
  }
  revokePages(seriesId: string) {
    const issued = this.issued();
    let changed = false;
    for (const [url, value] of issued)
      if (value.seriesId === seriesId) {
        issued.delete(url);
        changed = true;
      }
    if (changed) Application.setState([...issued], "ManhwaNex.readerPages");
  }
  override async interceptRequest(request: Request): Promise<Request> {
    const issued = this.issued().get(request.url);
    if (
      request.url.startsWith("https://cdn.manhwanex.com/") &&
      (!issued || issued.context !== JSON.stringify(preferences()))
    )
      throw new Error(
        "ManhwaNex reader authorization is missing or settings changed. Reload the chapter before requesting its images.",
      );
    if (request.url.startsWith(`${BASE_URL}/`)) {
      request.headers = {
        ...request.headers,
        referer: `${BASE_URL}/`,
        origin: BASE_URL,
        "user-agent": await Application.getDefaultUserAgent(),
      };
    }
    return request;
  }
  override async interceptResponse(
    _request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (
      Object.entries(response.headers).some(
        ([key, value]) =>
          key.toLowerCase() === "cf-mitigated" && value.toLowerCase() === "challenge",
      )
    )
      throw new CloudflareError({
        url: `${BASE_URL}/`,
        method: "GET",
        headers: { "user-agent": await Application.getDefaultUserAgent() },
      });
    return data;
  }
}
export const fetchText = async (url: string, body?: string): Promise<string> => {
  const [response, data] = await Application.scheduleRequest({
    url,
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : { body, headers: { "content-type": "application/x-www-form-urlencoded" } }),
  });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`ManhwaNex request failed (${response.status}).`);
  if (url.includes("post_type=wp-manga") && response.url === `${BASE_URL}/`)
    throw new Error(
      "ManhwaNex redirected this search to its homepage. Try another author or shorter query.",
    );
  const text = Application.arrayBufferToUTF8String(data);
  if (/cf-chl-|<title>Just a moment|<title>Access denied/i.test(text))
    throw new Error("ManhwaNex requires website verification. Open the source website.");
  return text;
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
  if (sorting && !SORTS.some((sort) => sort.id === sorting.id))
    throw new Error("Unknown ManhwaNex sort.");
  const filters = readFilters(query.metadata);
  return `${BASE_URL}/?${formEncode({
    s: query.title.trim(),
    post_type: "wp-manga",
    genre: filters.genres,
    op: filters.condition,
    author: filters.author,
    artist: filters.artist,
    release: filters.release,
    adult: excludeNSFW ? "0" : filters.adult,
    status: filters.statuses,
  })}`;
};
