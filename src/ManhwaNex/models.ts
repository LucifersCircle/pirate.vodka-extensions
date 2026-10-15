/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { DiscoverSectionType, type DiscoverSection, type SearchResultItem } from "@paperback/types";

export const BASE_URL = "https://manhwanex.com";
export const GENRES = [
  "action",
  "adventure",
  "cultivation-manhwa",
  "fantasy",
  "ghost-manhwa",
  "martial-arts",
  "romance",
  "system-manhwa",
];
export const SECTIONS: DiscoverSection[] = [
  { id: "popular", title: "Popular Series", type: DiscoverSectionType.simpleCarousel },
  { id: "latest", title: "Latest Updates", type: DiscoverSectionType.simpleCarousel },
];
export interface HomeCategory {
  id: string;
  title: string;
  url: string;
}
export const SORTS = [{ id: "", label: "Relevance" }];
export const STATUSES = [
  { id: "on-going", title: "OnGoing" },
  { id: "end", title: "Completed" },
  { id: "canceled", title: "Canceled" },
  { id: "on-hold", title: "On Hold" },
  { id: "upcoming", title: "Upcoming" },
];
export interface SearchFilters {
  genres: string[];
  condition: string;
  author: string;
  artist: string;
  release: string;
  adult: string;
  statuses: string[];
}
export interface Preferences {
  excludeNSFW: boolean;
  revision: number;
}
export type SeriesMetadata = {
  genres: { id: string; title: string }[];
  alternative: string;
  author: string;
  artist: string;
  release: string;
  status: string;
  adult: boolean;
  classified: boolean;
  nativeSafe: boolean;
};
export type CatalogItem = SearchResultItem & { metadata: SeriesMetadata };
export interface CatalogPage {
  items: CatalogItem[];
  next?: string;
}
export interface Cursor {
  context: string;
  url: string;
  seen: string[];
}
