/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

export const DOMAIN = "https://marumaru105.com";

export type Card = { id: string; title: string; cover: string; genres: string[] };
export type Episode = {
  id: string;
  workId: string;
  sourceNumber: number;
  title: string;
  date: Date;
};
export type Detail = Card & {
  author?: string;
  summary?: string;
  chapters: Episode[];
  rating?: number;
  explicitlyAdult: boolean;
};
export type WorkResult = Omit<Detail, "chapters"> & {
  episodeCount: number;
  episodesUrl: string;
};
export type APIDetail = Detail & { episodesUrl: string };
type RecordValue = Record<string, unknown>;

function record(value: unknown, name: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid Marumaru ${name}`);
  return value as RecordValue;
}
export function id(value: string): string {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    /\s/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    throw new Error("Invalid Marumaru canonical ID");
  return value;
}
function sourceId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return id(String(value));
  if (typeof value === "string") return id(value);
  throw new Error("Invalid Marumaru source ID");
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing Marumaru ${name}`);
  return value;
}
function optionalText(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, name);
}
function integer(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    throw new Error(`Invalid Marumaru ${name}`);
  return value;
}
function sourceNumber(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > Number.MAX_SAFE_INTEGER
  )
    throw new Error("Invalid Marumaru chapter number");
  return value;
}
function adult(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Missing Marumaru source age classification");
  return value;
}
function cover(value: unknown, work: string): string {
  if (
    typeof value !== "string" ||
    /\s/.test(value) ||
    /\/(?:\.|\.\.)$/.test(value) ||
    !new RegExp(
      `^https://peer\\.storagewebtoon\\.store/(?:manhwa|webtoon)/${id(work)}/[A-Za-z0-9._-]+$`,
    ).test(value)
  )
    throw new Error("Marumaru cover identity does not match title");
  return value;
}
function genres(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") throw new Error("Invalid Marumaru genres");
  return value
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);
}
function card(value: unknown): Card & { explicitlyAdult: boolean } {
  const work = record(value, "work");
  const workId = sourceId(work.id);
  if (work.mediaType !== "MANHWA") throw new Error("Marumaru returned another content category");
  // Both supplied image fields must belong to this work. Never fabricate a URL.
  if (work.coverUrl !== undefined && work.coverUrl !== null && work.coverUrl !== "")
    cover(work.coverUrl, workId);
  if (work.thumbUrl !== undefined && work.thumbUrl !== null && work.thumbUrl !== "")
    cover(work.thumbUrl, workId);
  return {
    id: workId,
    title: text(work.title, "title"),
    cover: cover(work.thumbUrl || work.coverUrl, workId),
    genres: genres(work.genres),
    explicitlyAdult: adult(work.adult),
  };
}

/** The public work response advertises this exact API family, without credentials or queries. */
export function validateEpisodesURL(value: unknown, work: string): string {
  const expected = id(work);
  if (
    typeof value !== "string" ||
    value !== `https://api.storagewebtoon.store/api/v1/reader/A2/works/${expected}`
  )
    throw new Error("Invalid Marumaru advertised episode-list URL");
  return value;
}
export function readerURL(episodesUrl: string, work: string, episode: string): string {
  const list = validateEpisodesURL(episodesUrl, work);
  return list.replace(`/works/${id(work)}`, `/episodes/${id(episode)}`);
}

export function parseListing(
  value: unknown,
  expectedPage: number,
  search: boolean,
): { items: (Card & { explicitlyAdult: boolean })[]; nextPage?: number } {
  const result = record(value, "listing");
  const requested = integer(expectedPage, "requested page");
  const page = integer(result.page, "page");
  const size = integer(result.size, "page size", 1);
  const total = integer(result.total, "result count");
  if (page !== requested || size !== (search ? 24 : 49))
    throw new Error("Marumaru listing pagination does not match request");
  const offset = page * size;
  if (!Number.isSafeInteger(offset) || !Array.isArray(result.items))
    throw new Error("Incomplete Marumaru listing");
  const expectedLength = Math.min(size, Math.max(0, total - offset));
  if (result.items.length !== expectedLength)
    throw new Error("Marumaru listing differs from its advertised count");
  const seen = new Set<string>();
  const items = result.items.map((value) => {
    const item = card(value);
    if (seen.has(item.id)) throw new Error("Duplicate Marumaru listing ID");
    seen.add(item.id);
    return item;
  });
  return { items, ...(offset + items.length < total ? { nextPage: page + 1 } : {}) };
}

export function parseWork(value: unknown, expectedWork: string): WorkResult {
  const result = record(value, "work response");
  const work = record(result.work, "work");
  const metadata = card(work);
  if (metadata.id !== id(expectedWork)) throw new Error("Marumaru work ownership mismatch");
  const episodeCount = integer(work.episodeCount, "chapter count");
  if (episodeCount > 10000) throw new Error("Marumaru chapter count exceeds supported inventory");
  const author = optionalText(work.author, "author");
  const summary = optionalText(result.synopsis, "synopsis");
  let rating: number | undefined;
  if (
    work.rating !== undefined &&
    work.rating !== null &&
    work.ratingCount !== undefined &&
    work.ratingCount !== null
  ) {
    const count = integer(work.ratingCount, "rating count");
    if (
      typeof work.rating !== "number" ||
      !Number.isFinite(work.rating) ||
      work.rating < 0 ||
      work.rating > 5
    )
      throw new Error("Invalid Marumaru rating");
    if (count > 0) rating = work.rating / 5;
  }
  return {
    ...metadata,
    ...(author === undefined ? {} : { author }),
    ...(summary === undefined ? {} : { summary }),
    ...(rating === undefined ? {} : { rating }),
    episodeCount,
    episodesUrl: validateEpisodesURL(result.episodesUrl, metadata.id),
  };
}
function publicationDate(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    throw new Error("Missing or invalid Marumaru chapter publication date");
  const date = new Date(value);
  const normalized = value.includes(".")
    ? value.replace(/\.(\d{1,3})Z$/, (_, fraction: string) => `.${fraction.padEnd(3, "0")}Z`)
    : value.replace(/Z$/, ".000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== normalized)
    throw new Error("Invalid Marumaru chapter publication date");
  return date;
}
export function parseDetail(work: WorkResult, value: unknown): APIDetail {
  const result = record(value, "chapter-list response");
  if (result.ok !== true) throw new Error("Marumaru chapter list is not ready");
  const owner = record(result.item, "chapter-list owner");
  if (
    sourceId(owner.id) !== work.id ||
    text(owner.title, "chapter-list title") !== work.title ||
    adult(owner.adult) !== work.explicitlyAdult
  )
    throw new Error("Marumaru chapter-list ownership or classification mismatch");
  if (
    owner.media_type !== "MANHWA" ||
    integer(owner.episode_count, "list chapter count") !== work.episodeCount ||
    (owner.mediaType !== undefined && owner.mediaType !== "MANHWA") ||
    (owner.episodeCount !== undefined &&
      integer(owner.episodeCount, "list chapter count") !== work.episodeCount)
  )
    throw new Error("Marumaru chapter-list metadata conflicts with the work");
  cover(owner.cover_url, work.id);
  if (!Array.isArray(result.episodes) || result.episodes.length !== work.episodeCount)
    throw new Error("Marumaru chapter inventory differs from its advertised count");
  const seenIds = new Set<string>();
  const seenNumbers = new Set<number>();
  const chapters = result.episodes
    .map((value): Episode => {
      const item = record(value, "chapter");
      const episodeId = sourceId(item.id);
      const number = sourceNumber(item.number);
      if (seenIds.has(episodeId) || seenNumbers.has(number))
        throw new Error("Duplicate Marumaru chapter ID or number");
      for (const key of ["work_id", "workId"]) {
        if (item[key] !== undefined && sourceId(item[key]) !== work.id)
          throw new Error("Marumaru chapter ownership mismatch");
      }
      seenIds.add(episodeId);
      seenNumbers.add(number);
      return {
        id: episodeId,
        workId: work.id,
        sourceNumber: number,
        title: text(item.title, "chapter title"),
        date: publicationDate(item.published_at),
      };
    })
    .sort((a, b) => b.sourceNumber - a.sourceNumber);
  const summary = optionalText(result.synopsis, "chapter-list synopsis") ?? work.summary;
  return {
    id: work.id,
    title: work.title,
    cover: work.cover,
    genres: [...work.genres],
    ...(work.author === undefined ? {} : { author: work.author }),
    ...(summary === undefined ? {} : { summary }),
    ...(work.rating === undefined ? {} : { rating: work.rating }),
    explicitlyAdult: work.explicitlyAdult,
    chapters,
    episodesUrl: validateEpisodesURL(work.episodesUrl, work.id),
  };
}

export function parseReader(value: unknown, work: string, selected: Episode): string[] {
  const workId = id(work);
  const episodeId = id(selected.id);
  if (selected.workId !== workId) throw new Error("Marumaru selected chapter ownership mismatch");
  const result = record(value, "reader response");
  const item = record(result.item, "reader chapter");
  if (result.ok !== true || item.ready !== true) throw new Error("Marumaru reader is not ready");
  if (
    sourceId(item.id) !== episodeId ||
    sourceId(item.work_id) !== workId ||
    sourceNumber(item.number) !== selected.sourceNumber ||
    text(item.title, "reader title") !== selected.title
  )
    throw new Error("Marumaru reader chapter identity mismatch");
  if (item.workId !== undefined && sourceId(item.workId) !== workId)
    throw new Error("Marumaru reader chapter ownership mismatch");
  if (!Array.isArray(item.body) || !item.body.length || item.body.length > 1000)
    throw new Error("Marumaru reader image inventory missing");
  return item.body.map((value, index) => {
    const page = record(value, "reader page");
    if (page.kind !== "image" || typeof page.url !== "string")
      throw new Error("Marumaru reader contains unsupported body content");
    const expected = `https://peer.storagewebtoon.store/api/media/episode/${episodeId}/${index + 1}.webp`;
    if (page.url !== expected)
      throw new Error(
        "Marumaru reader pages are incomplete, unordered or belong to another chapter",
      );
    return page.url;
  });
}
