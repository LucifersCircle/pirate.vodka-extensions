/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  type Chapter,
  type ChapterDetails,
  type SearchResultItem,
  type SourceManga,
} from "@paperback/types";
import {
  BASE_URL,
  PAGE_SIZE,
  assertPublic,
  envelope,
  nativeRating,
  numericId,
  record,
  text,
  words,
  type Rating,
} from "./models";
import { chapterListURL, coverURL } from "./urls";
import { classify } from "./policy";
export type Card = SearchResultItem & { sourceRating: Rating };
type Endpoint = { id: string; number: number };
type InventoryEvidence = { count?: number; first?: Endpoint; latest?: Endpoint };
export type Detail = {
  source: SourceManga;
  slug: string;
  rating: Rating;
  inventory: InventoryEvidence;
};
export const parseCard = (raw: unknown): Card => {
  const row = record(raw);
  assertPublic(row);
  const labels = [...words(row.genres, true), ...words(row.tags, true)];
  const rating = classify(labels);
  return {
    mangaId: numericId(row.id),
    title: text(row.title),
    imageUrl: coverURL(row.cover_image),
    contentRating: nativeRating(rating),
    sourceRating: rating,
    ...(typeof row.author === "string" && row.author.trim() ? { subtitle: row.author } : {}),
  };
};
export const parseCards = (raw: unknown): Card[] => {
  if (!Array.isArray(raw)) throw new Error("Invalid Noveli catalog.");
  const cards = Array.from(raw, parseCard);
  if (new Set(cards.map((card) => card.mangaId)).size !== cards.length)
    throw new Error("Noveli returned duplicate novel identities.");
  return cards;
};
export const parseCatalog = (raw: unknown, page: number): { items: Card[]; more: boolean } => {
  const response = envelope(raw),
    pagination = record(response.pagination),
    items = parseCards(response.data);
  const total = pagination.total;
  if (
    pagination.page !== page ||
    pagination.limit !== PAGE_SIZE ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    items.length > PAGE_SIZE ||
    items.length !== Math.min(PAGE_SIZE, Math.max(0, total - (page - 1) * PAGE_SIZE)) ||
    (page > 1 && total <= (page - 1) * PAGE_SIZE)
  )
    throw new Error("Invalid Noveli pagination response.");
  return { items, more: page * PAGE_SIZE < total };
};
export const parseRankings = (raw: unknown): Record<string, Card[]> => {
  const source = record(envelope(raw).rankings),
    result: Record<string, Card[]> = {};
  for (const key of [
    "translatedRanking",
    "trendingRanking",
    "recentlyUpdated",
    "topRated",
    "completedRanking",
  ])
    result[key] = parseCards(source[key]);
  return result;
};
export const parseTaxonomy = (raw: unknown): string[] => words(envelope(raw).tags);
const synopsis = (value: unknown): string => {
  const raw = text(value ?? "", true);
  // Metadata is plain text in Paperback. Drop executable markup rather than rendering it.
  return Application.decodeHTMLEntities(
    raw
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<[^>]*>/g, ""),
  ).trim();
};
const optionalText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const source = text(value, true);
  return source.trim() ? source : undefined;
};
const inventoryEvidence = (row: Record<string, unknown>, id: string): InventoryEvidence => {
  const count = row.chapter_count;
  if (
    count !== undefined &&
    (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
  )
    throw new Error("Invalid Noveli chapter count.");
  const endpoint = (value: unknown): Endpoint | undefined => {
    if (value === undefined || value === null) return undefined;
    const data = record(value);
    assertPublic(data);
    if (
      typeof data.chapter_number !== "number" ||
      !Number.isFinite(data.chapter_number) ||
      data.chapter_number < 0 ||
      (data.novel_id !== undefined && numericId(data.novel_id) !== id)
    )
      throw new Error("Invalid Noveli inventory endpoint.");
    return { id: numericId(data.id), number: data.chapter_number };
  };
  const first = endpoint(row.firstChapter),
    latest = endpoint(row.latestChapter);
  if (count === 0 && (first || latest))
    throw new Error("Inconsistent Noveli empty inventory metadata.");
  return { count: count as number | undefined, first, latest };
};
export const parseDetail = (raw: unknown, id: string): Detail => {
  const row = record(envelope(raw).data),
    card = parseCard(row);
  if (card.mangaId !== id) throw new Error("Noveli returned a different novel identity.");
  const slug = text(row.slug);
  chapterListURL(slug);
  let aliases: unknown = row.associated_names ?? [];
  if (typeof aliases === "string") {
    try {
      aliases = JSON.parse(aliases) as unknown;
    } catch {
      throw new Error("Invalid Noveli alternate titles.");
    }
  }
  const genres = words(row.genres, true),
    tags = words(row.tags, true).filter((label) => !genres.includes(label));
  const rating =
    typeof row.rating === "number" &&
    Number.isFinite(row.rating) &&
    row.rating >= 0 &&
    row.rating <= 5
      ? row.rating / 5
      : undefined;
  const author = optionalText(row.author),
    status = optionalText(row.status);
  const info: Record<string, string> = { "Reading language": "English" };
  for (const [key, label] of [
    ["type", "Type"],
    ["original_language", "Original language"],
  ]) {
    const value = optionalText(row[key]);
    if (value !== undefined) info[label] = value;
  }
  return {
    slug,
    rating: card.sourceRating,
    inventory: inventoryEvidence(row, id),
    source: {
      mangaId: id,
      mangaInfo: {
        primaryTitle: card.title,
        secondaryTitles: words(aliases).filter((alias) => alias !== card.title),
        thumbnailUrl: card.imageUrl,
        synopsis: synopsis(row.description),
        contentRating: nativeRating(card.sourceRating),
        contentType: "novel",
        ...(author !== undefined ? { author } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(rating !== undefined ? { rating } : {}),
        tagGroups: [
          {
            id: "genres",
            title: "Genres",
            tags: genres.map((label) => ({ id: label, title: label })),
          },
          { id: "tags", title: "Tags", tags: tags.map((label) => ({ id: label, title: label })) },
        ],
        additionalInfo: info,
        shareUrl: `${BASE_URL}/novel/${slug}`,
      },
    },
  };
};
export const parseChapters = (
  raw: unknown,
  source: SourceManga,
  expected?: InventoryEvidence,
): Chapter[] => {
  const rows = envelope(raw).chapters;
  if (!Array.isArray(rows)) throw new Error("Invalid Noveli chapter inventory.");
  if (expected?.count !== undefined && rows.length !== expected.count)
    throw new Error("Noveli returned an incomplete or inconsistent chapter inventory.");
  const ids = new Set<string>();
  const chapters = Array.from(rows, (rawRow, index) => {
    const row = record(rawRow);
    assertPublic(row);
    const chapterId = numericId(row.id);
    if (
      numericId(row.novel_id) !== source.mangaId ||
      ids.has(chapterId) ||
      typeof row.chapter_number !== "number" ||
      !Number.isFinite(row.chapter_number) ||
      row.chapter_number < 0
    )
      throw new Error("Invalid Noveli chapter ownership or identity.");
    ids.add(chapterId);
    const sourceTitle = text(row.title);
    const bareNumber = /^chapter\s+([0-9]+(?:\.[0-9]+)?)\s*$/i.exec(sourceTitle.trim());
    return {
      chapterId,
      sourceManga: source,
      ...(bareNumber && Number(bareNumber[1]) === row.chapter_number ? {} : { title: sourceTitle }),
      chapNum: row.chapter_number,
      langCode: "en",
      volume: 0,
      sortingIndex: index,
    };
  });
  for (const [endpoint, chapter] of [
    [expected?.first, chapters[0]],
    [expected?.latest, chapters.at(-1)],
  ] as const) {
    if (
      endpoint &&
      (!chapter || endpoint.id !== chapter.chapterId || endpoint.number !== chapter.chapNum)
    )
      throw new Error("Noveli chapter inventory endpoints do not match the novel details.");
  }
  return chapters;
};
export const escapeXHTML = (value: string): string => {
  // XML cannot represent control characters or unpaired surrogates. Refuse malformed
  // text instead of silently removing source characters, watermarks or credits.
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (
      (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
      code === 65534 ||
      code === 65535 ||
      (code >= 55296 && code <= 57343)
    )
      throw new Error("Noveli returned text that cannot be represented as XHTML.");
  }
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};
export const parseReader = (raw: unknown, chapter: Chapter, slug: string): ChapterDetails => {
  const response = envelope(raw),
    row = record(response.chapter),
    novel = record(response.novel);
  assertPublic(row);
  assertPublic(novel);
  if (
    numericId(row.id) !== chapter.chapterId ||
    numericId(row.novel_id) !== chapter.sourceManga.mangaId ||
    numericId(novel.id) !== chapter.sourceManga.mangaId ||
    novel.slug !== slug ||
    row.chapter_number !== chapter.chapNum
  )
    throw new Error("Noveli returned a different chapter or novel identity.");
  if (!Array.isArray(row.paragraphs) || !row.paragraphs.length)
    throw new Error("Noveli returned no verified paragraph text; no alternate reader is used.");
  const ids = new Set<string>();
  let visible = 0;
  const paragraphs = Array.from(row.paragraphs, (rawParagraph) => {
    const paragraph = record(rawParagraph),
      id = text(paragraph.id),
      body = text(paragraph.text, true);
    if (
      ids.has(id) ||
      (paragraph.isHoneypot !== undefined && typeof paragraph.isHoneypot !== "boolean")
    )
      throw new Error("Invalid Noveli paragraph identity or visibility.");
    ids.add(id);
    const hidden = paragraph.isHoneypot === true;
    if (!hidden && body.trim()) visible++;
    const attributes = hidden ? ' hidden="hidden" aria-hidden="true" style="display:none"' : "";
    return `<p id="${escapeXHTML(id)}"${attributes}>${escapeXHTML(body).replace(/\r\n|\r|\n/g, "<br />")}</p>`;
  });
  if (!visible) throw new Error("Noveli returned no visible prose.");
  return {
    id: chapter.chapterId,
    mangaId: chapter.sourceManga.mangaId,
    type: "html",
    html: `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><meta charset="utf-8" /><title>${escapeXHTML(text(row.title))}</title></head><body>${paragraphs.join("\n")}</body></html>`,
  };
};
