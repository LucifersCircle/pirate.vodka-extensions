/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import { ContentRating } from "@paperback/types";

import { CONTENT_RATING_VALUES, type KaganeContentRating } from "./models";

const API_RATINGS: Record<KaganeContentRating, { legacy: string; age: string }> = {
  safe: { legacy: "Safe", age: "Safe" },
  suggestive: { legacy: "Suggestive", age: "FifteenPlus" },
  erotica: { legacy: "Erotica", age: "EighteenPlus" },
  pornographic: { legacy: "Pornographic", age: "EighteenPlus" },
};

export function buildContentRatingFilter(ratings: KaganeContentRating[]): Record<string, unknown> {
  const selected = CONTENT_RATING_VALUES.filter((rating) => ratings.includes(rating));
  const filter: Record<string, unknown> = {
    // Keep the legacy filter for servers which still return content_rating.
    content_rating: selected.map((rating) => API_RATINGS[rating].legacy),
    age_rating: [...new Set(selected.map((rating) => API_RATINGS[rating].age))],
  };

  if (!selected.includes("pornographic")) {
    filter.is_pornographic = false;
  } else if (selected.length === 1) {
    filter.is_pornographic = true;
  }

  // Mixed selections cannot always be expressed with one age array and boolean.
  // Always enforce the exact selection on the returned books as well.
  return filter;
}

export function getKaganeContentRating(book: unknown): KaganeContentRating | undefined {
  if (typeof book !== "object" || book === null || Array.isArray(book)) return undefined;
  const fields = book as Record<string, unknown>;
  const legacy = parseLegacyRating(fields.content_rating);
  if (fields.age_rating === undefined && fields.is_pornographic === undefined) return legacy;

  // A missing flag is not evidence that a book is non-pornographic. Do not fall
  // back to a legacy label when the modern fields are present but malformed.
  if (typeof fields.is_pornographic !== "boolean") return undefined;
  let rating: KaganeContentRating;
  switch (fields.age_rating) {
    case "Safe":
      if (fields.is_pornographic) return undefined;
      rating = "safe";
      break;
    case "FifteenPlus":
      if (fields.is_pornographic) return undefined;
      rating = "suggestive";
      break;
    case "EighteenPlus":
      rating = fields.is_pornographic ? "pornographic" : "erotica";
      break;
    default:
      return undefined;
  }

  if (fields.content_rating != null && legacy !== rating) return undefined;
  return rating;
}

function parseLegacyRating(value: unknown): KaganeContentRating | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return CONTENT_RATING_VALUES.find((rating) => rating === normalized);
}

export function isContentRatingAllowed(book: unknown, ratings: KaganeContentRating[]): boolean {
  const rating = getKaganeContentRating(book);
  return rating !== undefined && ratings.includes(rating);
}

export function getPaperbackBookContentRating(book: unknown): ContentRating {
  switch (getKaganeContentRating(book)) {
    case "safe":
      return ContentRating.EVERYONE;
    case "suggestive":
    case "erotica":
      return ContentRating.MATURE;
    default:
      // Unknown or conflicting metadata must never downgrade explicit content.
      return ContentRating.ADULT;
  }
}
