/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
import * as cheerio from "cheerio";
import { DOMAIN, documentParts, continuationURL } from "./MarumaruURLs";
export { DOMAIN } from "./MarumaruURLs";
export type Card = { id: string; title: string; cover: string; genres: string[] };
export type Episode = {
  id: string;
  workId: string;
  sourceNumber: number;
  title: string;
  date: Date;
};
export type Detail = Card & {
  author: string;
  summary: string;
  chapters: Episode[];
  rating?: number;
  explicitlyAdult: boolean;
};
export function id(value: string): string {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
    throw new Error("Invalid Marumaru canonical ID");
  return value;
}
function route(value: string): { workId: string; episodeId?: string } | undefined {
  const path = value.startsWith(DOMAIN + "/") ? value.slice(DOMAIN.length) : value;
  const match = /^\/manhwa\/([1-9]\d*)(?:\/([1-9]\d*))?\/?$/.exec(path);
  return match ? { workId: match[1]!, episodeId: match[2] } : undefined;
}
function cover(value: string | undefined, workId: string): string {
  if (!value || /\/(?:\.|\.\.)$/.test(value)) throw new Error("Marumaru cover missing or invalid");
  if (
    !new RegExp(
      "^https://peer\\.storagewebtoon\\.store/manhwa/" + id(workId) + "/[A-Za-z0-9._-]+$",
    ).test(value)
  )
    throw new Error("Marumaru cover identity does not match title");
  return value;
}
export function parseCatalog(html: string, currentURL: string): { items: Card[]; next?: string } {
  const current = documentParts(currentURL);
  if (current.path !== "/manhwa") throw new Error("Unsupported Marumaru catalog route");
  const $ = cheerio.load(html),
    seen = new Set<string>(),
    items: Card[] = [];
  $("a[data-work-card]").each((_, element) => {
    const node = $(element),
      target = route(node.attr("href") ?? "");
    if (!target || target.episodeId) return;
    const title = node.find(".subject").text().trim();
    if (!title) throw new Error("Marumaru catalog title missing");
    if (seen.has(target.workId)) return;
    seen.add(target.workId);
    items.push({
      id: target.workId,
      title,
      cover: cover(node.find("img[data-card-thumb]").attr("src"), target.workId),
      genres: node
        .find(".genre")
        .text()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  });
  if (!items.length)
    throw new Error(
      "Marumaru rendered catalog unavailable; an HTML shell is not a successful empty catalog",
    );
  const page = Number(current.query.page ?? "1");
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("Invalid Marumaru page");
  let next: string | undefined;
  $("a.pager-btn").each((_, element) => {
    const node = $(element);
    if (node.text().trim() !== "›") return;
    next = continuationURL(node.attr("href") ?? "", currentURL);
  });
  return { items, next };
}
export function parseDetail(html: string, workId: string): Detail {
  id(workId);
  const $ = cheerio.load(html),
    title = $(".hero-v2-title").text().trim();
  if (!title) throw new Error("Marumaru rendered detail unavailable; no title was returned");
  const chapters: Episode[] = [],
    seen = new Set<string>();
  $("a.ep-row-v2-link").each((_, element) => {
    const node = $(element),
      target = route(node.attr("href") ?? "");
    if (!target?.episodeId || target.workId !== workId)
      throw new Error("Marumaru chapter ownership mismatch");
    const sourceNumber = Number(node.find(".ep-row-v2-no").text().trim());
    const label = node.find(".ep-row-v2-title strong").text().trim();
    const rawDate = node.find(".ep-row-v2-date").text().trim();
    if (
      !Number.isFinite(sourceNumber) ||
      sourceNumber <= 0 ||
      sourceNumber > Number.MAX_SAFE_INTEGER ||
      !label ||
      !/^\d{4}\.\d{2}\.\d{2}$/.test(rawDate)
    )
      throw new Error("Incomplete Marumaru chapter metadata");
    const date = new Date(`${rawDate.replace(/\./g, "-")}T00:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== rawDate.replace(/\./g, "-")
    )
      throw new Error("Invalid Marumaru chapter date");
    if (seen.has(target.episodeId)) {
      const previous = chapters.find((c) => c.id === target.episodeId)!;
      if (
        previous.sourceNumber !== sourceNumber ||
        previous.title !== label ||
        previous.date.getTime() !== date.getTime()
      )
        throw new Error("Conflicting Marumaru chapter metadata");
      return;
    }
    seen.add(target.episodeId);
    chapters.push({ id: target.episodeId, workId, sourceNumber, title: label, date });
  });
  if (!chapters.length) throw new Error("Marumaru chapter list unavailable");
  const rawScore = $(".cs-rating-num strong").text().trim(),
    rawCount = $(".cs-rating-cnt strong").text().trim();
  const score = Number(rawScore),
    count = Number(rawCount);
  const max = $(".cs-rating-max").text().trim();
  const rating =
    rawScore !== "" &&
    /^[1-9]\d*$/.test(rawCount) &&
    Number.isSafeInteger(count) &&
    count > 0 &&
    max === "/5.0" &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 5
      ? score / 5
      : undefined;
  return {
    id: workId,
    title,
    cover: cover($(".hero-v2-thumb img").attr("src"), workId),
    genres: $(".hero-v2-tag")
      .map((_, e) => $(e).text().trim())
      .get()
      .filter(Boolean),
    author: $(".hero-v2-author").text().trim(),
    summary: $(".hero-v2-desc").text().trim(),
    chapters,
    rating,
    explicitlyAdult: $(".hero-v2-adult").text().trim() === "19",
  };
}
export function parseReader(html: string, episodeId: string): string[] {
  id(episodeId);
  const $ = cheerio.load(html),
    pages = new Map<number, string>();
  const cuts = $(".vw-cut.theme-viewer-image");
  if (!cuts.length) throw new Error("Marumaru rendered reader inventory missing");
  cuts.each((index, element) => {
    const cut = $(element);
    if (cut.attr("data-page") !== String(index) || cut.find("img[src]").length !== 1)
      throw new Error("Incomplete Marumaru reader cut inventory");
    const url = cut.find("img").attr("src") ?? "";
    const match =
      /^https:\/\/peer\.storagewebtoon\.store\/api\/media\/episode\/([1-9]\d*)\/([1-9]\d*)\.webp$/.exec(
        url,
      );
    if (!match || match[1] !== episodeId)
      throw new Error("Marumaru reader image identity mismatch");
    const page = Number(match[2]);
    if (!Number.isSafeInteger(page) || page !== index + 1 || pages.has(page))
      throw new Error("Invalid or duplicate reader page index");
    pages.set(page, url);
  });
  const result = [...pages.entries()].sort(([a], [b]) => a - b);
  if (!result.length || result.some(([page], index) => page !== index + 1))
    throw new Error("Marumaru complete reader data unavailable");
  return result.map(([, url]) => url);
}
export function parseSearch(html: string, currentURL: string): { items: Card[]; next?: string } {
  const current = documentParts(currentURL);
  if (current.path !== "/search" || current.query.kind !== "manhwa" || !current.query.q)
    throw new Error("Unsupported Marumaru search scope");
  const $ = cheerio.load(html),
    items: Card[] = [],
    seen = new Set<string>();
  const forms = $("form.search-page-form"),
    queryInput = forms.find('input[name="q"]');
  if (forms.length !== 1 || queryInput.length !== 1 || queryInput.attr("value") !== current.query.q)
    throw new Error("Marumaru rendered search query mismatch");
  $(".search-results-grid a.card").each((_, element) => {
    const node = $(element),
      target = route(node.attr("href") ?? "");
    if (!target || target.episodeId)
      throw new Error("Marumaru search returned another content category");
    const title = node.find(".subject").text().trim();
    if (!title) throw new Error("Marumaru search title missing");
    if (seen.has(target.workId)) return;
    seen.add(target.workId);
    items.push({
      id: target.workId,
      title,
      cover: cover(node.find("img.search-thumb-img").attr("src"), target.workId),
      genres: node
        .find(".genre")
        .text()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  });
  if (!items.length) throw new Error("Marumaru search is incomplete, not a confirmed empty result");
  let next: string | undefined;
  $("a.pager-btn").each((_, element) => {
    const node = $(element);
    if (node.text().trim() === "›") next = continuationURL(node.attr("href") ?? "", currentURL);
  });
  return { items, next };
}
