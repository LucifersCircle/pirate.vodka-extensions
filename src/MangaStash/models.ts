/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  ContentRating,
  DiscoverSectionType,
  type DiscoverSection,
  type SearchResultItem,
} from "@paperback/types";
export const BASE_URL = "https://mangastash.org";
export const SECTIONS: DiscoverSection[] = [
  { id: "popular", title: "Popular This Month", type: DiscoverSectionType.simpleCarousel },
  { id: "new", title: "New Additions", type: DiscoverSectionType.simpleCarousel },
  { id: "latest", title: "Latest Updates", type: DiscoverSectionType.simpleCarousel },
];
export const SORTS = [
  { id: "latest", label: "Latest Update" },
  { id: "popular-month", label: "Popular This Month" },
  { id: "popular-year", label: "Popular This Year" },
  { id: "title", label: "Title A-Z" },
];
export const CONTROLS = [
  {
    id: "status",
    title: "Status",
    items: [
      {
        id: "ongoing",
        title: "Ongoing",
      },
      {
        id: "completed",
        title: "Completed",
      },
      {
        id: "hiatus",
        title: "Hiatus",
      },
      {
        id: "cancelled",
        title: "Cancelled",
      },
    ],
  },
  {
    id: "genre",
    title: "Genres",
    items: [
      {
        id: "action",
        title: "Action",
      },
      {
        id: "adventure",
        title: "Adventure",
      },
      {
        id: "comedy",
        title: "Comedy",
      },
      {
        id: "drama",
        title: "Drama",
      },
      {
        id: "fantasy",
        title: "Fantasy",
      },
      {
        id: "horror",
        title: "Horror",
      },
      {
        id: "isekai",
        title: "Isekai",
      },
      {
        id: "mystery",
        title: "Mystery",
      },
      {
        id: "romance",
        title: "Romance",
      },
      {
        id: "school-life",
        title: "School Life",
      },
      {
        id: "sci-fi",
        title: "Sci-Fi",
      },
      {
        id: "slice-of-life",
        title: "Slice of Life",
      },
      {
        id: "sports",
        title: "Sports",
      },
      {
        id: "thriller",
        title: "Thriller",
      },
    ],
  },
  {
    id: "theme",
    title: "Themes",
    items: [
      {
        id: "coming-of-age",
        title: "Coming of Age",
      },
      {
        id: "cooking",
        title: "Cooking",
      },
      {
        id: "first-love",
        title: "First Love",
      },
      {
        id: "military",
        title: "Military",
      },
      {
        id: "politics",
        title: "Politics",
      },
      {
        id: "revenge",
        title: "Revenge",
      },
      {
        id: "superpowers",
        title: "Superpowers",
      },
      {
        id: "survival",
        title: "Survival",
      },
    ],
  },
  {
    id: "mood",
    title: "Moods",
    items: [
      {
        id: "bittersweet",
        title: "Bittersweet",
      },
      {
        id: "chill",
        title: "Chill",
      },
      {
        id: "cozy",
        title: "Cozy",
      },
      {
        id: "dark",
        title: "Dark",
      },
      {
        id: "dramatic",
        title: "Dramatic",
      },
      {
        id: "eerie",
        title: "Eerie",
      },
      {
        id: "emotional",
        title: "Emotional",
      },
      {
        id: "grim",
        title: "Grim",
      },
      {
        id: "heartwarming",
        title: "Heartwarming",
      },
      {
        id: "hopeful",
        title: "Hopeful",
      },
      {
        id: "humorous",
        title: "Humorous",
      },
      {
        id: "intense",
        title: "Intense",
      },
      {
        id: "melancholy",
        title: "Melancholy",
      },
      {
        id: "mysterious",
        title: "Mysterious",
      },
      {
        id: "nostalgic",
        title: "Nostalgic",
      },
      {
        id: "playful",
        title: "Playful",
      },
      {
        id: "relaxing",
        title: "Relaxing",
      },
      {
        id: "serene",
        title: "Serene",
      },
      {
        id: "suspenseful",
        title: "Suspenseful",
      },
      {
        id: "tense",
        title: "Tense",
      },
      {
        id: "triumphant",
        title: "Triumphant",
      },
      {
        id: "uplifting",
        title: "Uplifting",
      },
      {
        id: "whimsical",
        title: "Whimsical",
      },
      {
        id: "wholesome",
        title: "Wholesome",
      },
    ],
  },
  {
    id: "format",
    title: "Formats",
    items: [
      {
        id: "4-koma",
        title: "4-Koma",
      },
      {
        id: "manga",
        title: "Manga",
      },
      {
        id: "manhua",
        title: "Manhua",
      },
      {
        id: "manhwa",
        title: "Manhwa",
      },
      {
        id: "one-shot",
        title: "One-shot",
      },
      {
        id: "webtoon",
        title: "Webtoon",
      },
    ],
  },
  {
    id: "demographic",
    title: "Demographic",
    items: [
      {
        id: "josei",
        title: "Josei",
      },
      {
        id: "seinen",
        title: "Seinen",
      },
      {
        id: "shoujo",
        title: "Shoujo",
      },
      {
        id: "shounen",
        title: "Shounen",
      },
    ],
  },
  {
    id: "language",
    title: "Language",
    items: [
      {
        id: "EN",
        title: "English",
      },
    ],
  },
  {
    id: "rating",
    title: "Rating",
    items: [
      {
        id: "",
        title: "Any",
      },
      {
        id: "safe",
        title: "Safe",
      },
      {
        id: "suggestive",
        title: "Suggestive",
      },
      {
        id: "mature",
        title: "Mature",
      },
    ],
  },
];
export type Rating = "unknown" | "safe" | "suggestive" | "mature" | "explicit";
export const RATINGS: Rating[] = ["unknown", "safe", "suggestive", "mature", "explicit"];
export const nativeRating = (rating: Rating): ContentRating =>
  rating === "safe"
    ? ContentRating.EVERYONE
    : rating === "explicit"
      ? ContentRating.ADULT
      : ContentRating.MATURE;
export type Preferences = { onlySafe: boolean; revision: number };
export type Filters = Record<string, string[] | string>;
export type Card = SearchResultItem & { sourceRating: Rating };
export type Page = { items: Card[]; next?: string };
export const COMPATIBILITY =
  "MangaStash does not label every listing. Unclassified and Suggestive titles use Paperback’s Mature compatibility badge, not a source age classification. Source labels do not guarantee all-ages suitability. Covers use the largest URL actually advertised in that response. Bulk chapter dates are unavailable and are omitted.";
