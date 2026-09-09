/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type { SortingOption } from "@paperback/types";

export const BASE_URL = "https://kagane.to";
export const API_URL = BASE_URL;
export const PAGE_SIZE = 35;

export const INTEGRITY_TOKEN_KEY = "kagane-integrity-token";
export const INTEGRITY_EXP_KEY = "kagane-integrity-exp";

export const CONTENT_RATING_KEY = "kagane-content-rating";
export const SOURCE_DISPLAY_MODE_KEY = "kagane-source-display-mode";
export const SHOW_EDITION_KEY = "kagane-show-edition";
export const SHOW_SOURCE_KEY = "kagane-show-source";
export const DATA_SAVER_KEY = "kagane-data-saver";
export const CHAPTER_TITLE_MODE_KEY = "kagane-chapter-title-mode";
export const EXCLUDED_GENRES_KEY = "kagane-excluded-genres";
export const CONTENT_LANGUAGES_KEY = "kagane-content-languages";
export const GENRES_CACHE_KEY = "kagane-genres-cache-v1";
export const SOURCES_CACHE_KEY = "kagane-sources-cache-v1";
export const TAGS_CACHE_KEY = "kagane-tags-cache-v1";
export const TAXONOMY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const HOME_SECTION_METADATA_ID = "kagane-home-section";

export const CONTENT_RATING_VALUES = ["safe", "suggestive", "erotica", "pornographic"] as const;
export type KaganeContentRating = (typeof CONTENT_RATING_VALUES)[number];

export const CONTENT_RATING_OPTIONS: Array<{ id: KaganeContentRating; title: string }> = [
  { id: "safe", title: "Safe" },
  { id: "suggestive", title: "Suggestive" },
  { id: "erotica", title: "Erotica" },
  { id: "pornographic", title: "Pornographic" },
];

export const SOURCE_DISPLAY_MODE_OPTIONS = [
  { id: "all", title: "Show All" },
  { id: "official", title: "Official Sources Only" },
  { id: "scanlations", title: "Scanlations Only" },
];

export const CHAPTER_TITLE_MODE_OPTIONS = [
  { id: "optional", title: "Title Only" },
  { id: "always", title: "Ch.X + Title" },
  { id: "vol_chapter", title: "Vol.X Ch.Y + Title" },
];

export const LANGUAGE_OPTIONS = [
  { id: "en", title: "English" },
  { id: "ja", title: "Japanese" },
  { id: "ko", title: "Korean" },
  { id: "zh-Hans", title: "Chinese Simplified" },
  { id: "zh-Hant", title: "Chinese Traditional" },
  { id: "es", title: "Spanish" },
  { id: "es-419", title: "Spanish Latin America" },
  { id: "fr", title: "French" },
  { id: "de", title: "German" },
  { id: "pt", title: "Portuguese" },
  { id: "pt-BR", title: "Portuguese Brazil" },
  { id: "ru", title: "Russian" },
  { id: "it", title: "Italian" },
  { id: "id", title: "Indonesian" },
  { id: "vi", title: "Vietnamese" },
  { id: "th", title: "Thai" },
  { id: "pl", title: "Polish" },
  { id: "hi", title: "Hindi" },
  { id: "ar", title: "Arabic" },
];

export const FORMAT_OPTIONS = ["Manga", "Manhwa", "Manhua", "Comic", "Other"];

export const PUBLICATION_STATUS_OPTIONS = [
  { id: "Ongoing", value: "Ongoing" },
  { id: "Completed", value: "Completed" },
  { id: "Abandoned", value: "Cancelled" },
  { id: "Hiatus", value: "Hiatus" },
];

export const SORTING_OPTIONS: SortingOption[] = [
  { id: "relevance", label: "Relevance" },
  { id: "total_views,desc", label: "Popular (Total Views)" },
  { id: "avg_views,desc", label: "Popular (Average Views)" },
  { id: "avg_views_today,desc", label: "Popular (Today)" },
  { id: "avg_views_week,desc", label: "Popular (Week)" },
  { id: "avg_views_month,desc", label: "Popular (Month)" },
  { id: "updated_at,desc", label: "Latest" },
  { id: "series_name,desc", label: "By Name" },
  { id: "books_count,desc", label: "Books Count" },
  { id: "created_at,desc", label: "Created At" },
];

export const GENRE_OPTIONS = [
  "4-koma",
  "AI",
  "Action",
  "Adventure",
  "Award Winning",
  "Comedy",
  "Coming of Age",
  "Cooking",
  "Crime",
  "Demons",
  "Doujinshi",
  "Drama",
  "Ecchi",
  "Fan Colored",
  "Fantasy",
  "Full Color",
  "Gender Bender",
  "Gore",
  "Harem",
  "Hentai",
  "Historical",
  "Horror",
  "Isekai",
  "Josei",
  "LGBTQIA+",
  "Magic",
  "Magical Girls",
  "Martial Arts",
  "Mecha",
  "Medical",
  "Military",
  "Monsters",
  "Music",
  "Mystery",
  "Office Workers",
  "Official Colored",
  "Omegaverse",
  "Oneshot",
  "Philosophical",
  "Police",
  "Post-Apocalyptic",
  "Psychological",
  "Reincarnation",
  "Reverse Harem",
  "Romance",
  "School Life",
  "Sci-Fi",
  "Seinen",
  "Shoujo Ai",
  "Shoujo",
  "Shounen Ai",
  "Shounen",
  "Slice of Life",
  "Smut",
  "Sports",
  "Supernatural",
  "Survival",
  "Thriller",
  "Time Travel",
  "Tragedy",
  "Vampires",
  "Video Games",
  "Villainess",
  "Wuxia",
  "Yaoi",
  "Yuri",
];

export interface GenreDto {
  id: string;
  genre_name: string;
  genre_type?: string | null;
}

export interface TagDto {
  id: string;
  tag_name: string;
}

export interface SourcesDto {
  sources: SourceDto[];
}

export interface SourceDto {
  source_id: string;
  source_type: string;
  title: string;
}

export interface KaganeMetadata {
  genres: Record<string, string>;
  sources: SourceDto[];
}

export interface SearchDto {
  content?: KaganeSearchBook[];
  last?: boolean;
  total_elements?: number;
  total_pages?: number;
}

export interface KaganeSearchBook {
  series_id: string;
  title: string;
  source_id?: string | null;
  content_rating?: string | null;
  current_books?: number;
  start_year?: number | null;
  cover_image_id?: string | null;
  alternate_titles?: string[];
  latest_chapters?: LatestChapter[];
}

export interface LatestChapter {
  book_id: string;
  title?: string | null;
  chapter_no?: string | null;
  volume_no?: string | null;
  created_at?: string | null;
  available_at?: string | null;
}

export interface DetailsDto {
  title: string;
  description?: string | null;
  upload_status: string;
  format?: string | null;
  content_rating?: string | null;
  source_id?: string | null;
  series_staff?: SeriesStaff[];
  genres?: SeriesGenre[];
  tags?: SeriesTag[];
  series_alternate_titles?: AlternateTitle[];
  series_books?: ChapterBook[];
  edition_info?: string | null;
  tracker_id?: string | null;
  series_covers?: SeriesCover[];
  average_rating?: number | null;
  bayesian_rating?: number | null;
  total_ratings?: number | null;
  total_views?: number | null;
}

export interface SeriesStaff {
  name: string;
  role: string;
}

export interface SeriesGenre {
  genre_name: string;
}

export interface SeriesTag {
  tag_name: string;
}

export interface AlternateTitle {
  title: string;
  label?: string | null;
}

export interface SeriesCover {
  image_id: string;
}

export interface ChapterBook {
  book_id: string;
  series_id?: string | null;
  title: string;
  created_at?: string | null;
  page_count?: number;
  sort_no: number;
  chapter_no?: string | null;
  volume_no?: string | null;
  groups?: Array<{ title: string }>;
}

export interface ChallengeDto {
  access_token: string;
  cache_url: string;
  manifest?: ManifestDto | null;
}

export interface ManifestDto {
  pages?: PageDto[];
}

export interface PageDto {
  page_no: number;
  page_id: string;
  ext?: string | null;
}

export interface IntegrityDto {
  token: string;
  exp: number;
}
