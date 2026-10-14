/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import { URL } from "@paperback/types";

import { fetchJSON } from "../../services/network";
import {
  API_URL,
  type ChapterBook,
  type ChapterIndexDto,
  type ChapterPageDto,
} from "../shared/models";

export async function fetchChapterBooks(seriesId: string): Promise<ChapterBook[]> {
  const base = new URL(API_URL)
    .addPathComponent("api")
    .addPathComponent("v2")
    .addPathComponent("series")
    .addPathComponent(seriesId)
    .addPathComponent("books")
    .toString();
  const index = await fetchJSON<ChapterIndexDto>({ url: `${base}/index`, method: "GET" });
  const expected = readChapterIndex(index);
  const books: ChapterBook[] = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let before: string | undefined;

  // Every continuing page must add an indexed ID, so traversal is bounded by
  // the index size even if the provider keeps emitting new cursors.
  for (let pageNumber = 0; pageNumber <= expected.size; pageNumber++) {
    const url = new URL(base).setQueryItem("limit", "200");
    if (before) url.setQueryItem("before", before);

    const page = await fetchJSON<ChapterPageDto>({ url: url.toString(), method: "GET" });
    if (!page || !Array.isArray(page.items)) {
      throw new Error("Kagane chapter response is missing items.");
    }
    for (const book of page.items) {
      if (!book || typeof book.book_id !== "string" || !book.book_id.trim()) {
        throw new Error("Kagane chapter response contains an invalid book ID.");
      }
      if (seen.has(book.book_id)) {
        throw new Error("Kagane chapter response repeated a book ID.");
      }
      if (!expected.has(book.book_id)) {
        throw new Error("Kagane chapter response does not match its index. Please retry.");
      }
      seen.add(book.book_id);
      books.push(book);
    }

    const next = page.next_cursor;
    if (next === null) {
      if (books.length !== expected.size) {
        throw new Error("Kagane chapter response is incomplete. Please retry.");
      }
      return books;
    }
    if (
      typeof next !== "string" ||
      !next.trim() ||
      cursors.has(next) ||
      page.items.length === 0 ||
      books.length === expected.size
    ) {
      throw new Error("Kagane chapter pagination did not advance.");
    }
    cursors.add(next);
    before = next;
  }
  throw new Error("Kagane chapter pagination exceeded its index size.");
}

function readChapterIndex(index: ChapterIndexDto): Set<string> {
  const idColumn = Array.isArray(index?.fields) ? index.fields.indexOf("book_id") : -1;
  if (
    idColumn < 0 ||
    !Array.isArray(index.books) ||
    !Number.isSafeInteger(index.count) ||
    index.count < 0 ||
    index.books.length !== index.count
  ) {
    throw new Error("Kagane chapter index is invalid.");
  }
  const ids = new Set<string>();
  for (const row of index.books) {
    const id = Array.isArray(row) ? row[idColumn] : undefined;
    if (typeof id !== "string" || !id.trim() || ids.has(id)) {
      throw new Error("Kagane chapter index contains an invalid or repeated book ID.");
    }
    ids.add(id);
  }
  return ids;
}
