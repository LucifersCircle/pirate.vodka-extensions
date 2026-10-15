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
} from "@paperback/types";
import { API_URL, BASE_URL, PAGE_SIZE, SORTS } from "./models";
import { readFilters } from "./forms";

export class HijalaInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    if (/^https?:\/\/(?:[a-z0-9-]+\.)*en-hijala\.com(?:[/:]|$)/i.test(request.url)) {
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

export const fetchText = async (url: string): Promise<string> => {
  const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`Hijala request failed (${response.status}): ${url}`);
  return Application.arrayBufferToUTF8String(data);
};

export const catalogUrl = (
  query: SearchQuery<Metadata>,
  page: number,
  sorting?: SortingOption,
): string => {
  const filters = readFilters(query.metadata);
  const sort = SORTS.find((item) => item.id === sorting?.id) ?? SORTS[0];
  const params: Record<string, string> = {
    page: String(page),
    perPage: String(PAGE_SIZE),
    orderBy: sort.field,
    orderDirection: filters.direction === "default" ? sort.direction : filters.direction,
  };
  if (query.title.trim()) params.searchTerm = query.title.trim();
  for (const [key, values] of [
    ["genreIds", Object.keys(filters.genres).filter((id) => filters.genres[id] === "included")],
    [
      "excludedGenreIds",
      Object.keys(filters.genres).filter((id) => filters.genres[id] === "excluded"),
    ],
    ["seriesStatus", filters.statuses],
    ["seriesType", filters.types],
  ] as const)
    if (values.length) params[key] = values.join(",");
  for (const key of ["minChapters", "maxChapters", "createdAfter", "createdBefore"] as const)
    if (filters[key]) params[key] = filters[key];
  return `${API_URL}/api/query?${Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&")}`;
};

export const feedUrl = (section: string, page: number, latestTag = "latestUpdate"): string =>
  `${API_URL}/api/posts?page=${page}&perPage=${PAGE_SIZE}&searchTerm=&isNovel=false&tag=${section === "latest" || section === "updates" ? latestTag : section}`;
