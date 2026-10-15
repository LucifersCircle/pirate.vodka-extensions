/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { DiscoverSectionType, type DiscoverSection, type SearchResultItem } from "@paperback/types";

export const BASE_URL = "https://en-hijala.com";
export const API_URL = "https://api.en-hijala.com";
export const PAGE_SIZE = 20;

export const SECTIONS: DiscoverSection[] = [
  { id: "featured", title: "Featured", type: DiscoverSectionType.featured },
  { id: "latest", title: "Latest Releases", type: DiscoverSectionType.simpleCarousel },
  { id: "new", title: "New", type: DiscoverSectionType.simpleCarousel },
  { id: "popular", title: "Most Popular", type: DiscoverSectionType.simpleCarousel },
  { id: "updates", title: "Latest Updates", type: DiscoverSectionType.chapterUpdates },
];

export const SORTS = [
  { id: "latest", label: "Latest Chapters", field: "lastChapterAddedAt", direction: "desc" },
  { id: "popular", label: "Most Popular", field: "totalViews", direction: "desc" },
  { id: "newest", label: "Newest Added", field: "createdAt", direction: "desc" },
  { id: "oldest", label: "Oldest First", field: "createdAt", direction: "asc" },
  { id: "chapters", label: "Most Chapters", field: "chaptersCount", direction: "desc" },
  { id: "title", label: "A–Z", field: "postTitle", direction: "asc" },
] as const;

export const STATUSES = [
  "ONGOING",
  "COMPLETED",
  "CANCELLED",
  "DROPPED",
  "MASS_RELEASED",
  "COMING_SOON",
  "ONE_SHOT",
  "HIATUS",
];
export const TYPES = ["MANHWA", "MANHUA", "MANGA", "SPANISH", "RUSSIAN"];
export const LABELS: Record<string, string> = {
  MANHWA: "Manhwa",
  MANHUA: "Manhua",
  MANGA: "Manga",
  SPANISH: "Spanish",
  RUSSIAN: "Russian",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DROPPED: "Dropped",
  MASS_RELEASED: "Mass released",
  COMING_SOON: "Coming soon",
  ONE_SHOT: "One-shot",
  HIATUS: "Hiatus",
};

export interface Genre {
  id: number;
  name: string;
}
export interface SiteChapter {
  slug: string;
  number: number;
  title?: string | null;
  volume?: number | string | null;
  createdAt?: string;
  isLocked?: boolean;
  isAccessible?: boolean;
  isShortLinkLocked?: boolean;
  isLockedByCoins?: boolean;
  isPermanentlyLocked?: boolean | number;
  price?: number;
  team?: { name: string } | null;
}
export interface Post {
  slug: string;
  postTitle: string;
  featuredImage: string;
  postContent?: string;
  alternativeTitles?: string;
  author?: string;
  artist?: string;
  releaseDate?: string;
  seriesStatus?: string;
  seriesType?: string;
  isNovel?: boolean;
  averageRating?: number;
  genres?: Genre[];
  chapters?: SiteChapter[];
  _count?: { chapters: number };
}
export interface Catalog {
  posts: Post[];
  totalCount: number;
}
export interface ReaderChapter extends SiteChapter {
  seriesSlug?: string;
  isNovel?: boolean;
  requiresProtectedFetch?: boolean;
  publicImages?: { url: string; order: number }[];
  mangaPost: { slug: string; isNovel?: boolean };
  images: { url: string; order: number }[];
}
export type SeriesMetadata = {
  type: string;
  genres: string[];
  novel: boolean;
  paid?: boolean;
  classified: boolean;
  blocked: boolean;
};
export type CatalogItem = SearchResultItem & { metadata: SeriesMetadata };
export interface SearchFilters {
  genres: Record<string, "included" | "excluded">;
  statuses: string[];
  types: string[];
  direction: string;
  minChapters: string;
  maxChapters: string;
  createdAfter: string;
  createdBefore: string;
}
export interface Preferences {
  excludeNSFW: boolean;
  hidePaid: boolean;
  sections: string[];
  types: string[];
  excludedGenres: string[];
}
