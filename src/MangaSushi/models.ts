/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  DiscoverSectionType,
  type DiscoverSection,
  type SearchResultItem,
  type JSONObject,
} from "@paperback/types";

export const BASE_URL = "https://mangasushi.org";
// Verified site announcements, not manga. Keep their rows in pagination accounting.
export const EDITORIAL_IDS = ["mangasushi-donations", "we-need-more-translators"];
export const BLOCKED_GENRES = ["adult", "mature", "smut", "hentai", "erotica", "ecchi"];
export const GENRE_ROUTE_KEY = "mangasushiGenreArchive";
export interface HomeGenre {
  id: string;
  title: string;
  url: string;
}
export const SECTIONS: DiscoverSection[] = [
  { id: "popular", title: "Popular Series", type: DiscoverSectionType.simpleCarousel },
  { id: "latest", title: "What's New", type: DiscoverSectionType.simpleCarousel },
  { id: "genres", title: "Genres", type: DiscoverSectionType.genres },
];
export const SORTS = [
  { id: "", label: "Relevance" },
  { id: "latest", label: "Latest" },
  { id: "alphabet", label: "A–Z" },
  { id: "rating", label: "Rating" },
  { id: "trending", label: "Trending" },
  { id: "views", label: "Most Views" },
  { id: "new-manga", label: "New" },
];
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
export interface Pagination {
  page: number;
  template: string;
  vars: JSONObject;
}
export interface CatalogPage {
  items: CatalogItem[];
  next?: Pagination;
  query?: JSONObject;
}
export interface Cursor extends Pagination {
  context: string;
  ids: string;
  seen?: string[];
}
