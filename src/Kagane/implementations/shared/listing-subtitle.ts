/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type { KaganeSearchBook } from "./models";

export interface ListingSubtitleSettings {
  showType: boolean;
  showRating: boolean;
}

export function appendListingSubtitle(
  subtitle: string | undefined,
  book: KaganeSearchBook,
  settings: ListingSubtitleSettings,
): string | undefined {
  const parts: string[] = [];
  if (settings.showType && typeof book.format === "string" && book.format.trim()) {
    parts.push(book.format.trim());
  }
  if (
    settings.showRating &&
    typeof book.rating === "number" &&
    Number.isFinite(book.rating) &&
    book.rating > 0 &&
    book.rating <= 100
  ) {
    parts.push(`★ ${(book.rating / 10).toFixed(1)}`);
  }
  if (parts.length === 0) return subtitle;
  const extra = parts.join(" · ");
  return subtitle ? `${subtitle} - ${extra}` : extra;
}
