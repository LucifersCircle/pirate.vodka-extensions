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

export class MangaSushiInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    if (/^https:\/\/(?:[a-z0-9-]+\.)*mangasushi\.org(?:[/:]|$)/i.test(request.url)) {
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
    ) {
      throw new CloudflareError({
        url: `${BASE_URL}/`,
        method: "GET",
        headers: { "user-agent": await Application.getDefaultUserAgent() },
      });
    }
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
    throw new Error(`Mangasushi request failed (${response.status}).`);
  const text = Application.arrayBufferToUTF8String(data);
  if (/cf-chl-|<title>Just a moment|<title>Access denied/i.test(text))
    throw new Error("Mangasushi requires website verification. Open the source website.");
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
  const filters = readFilters(query.metadata);
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
