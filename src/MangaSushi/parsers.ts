/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  ContentRating,
  type Chapter,
  type ChapterDetails,
  type SourceManga,
  type JSONObject,
} from "@paperback/types";
import * as cheerio from "cheerio";
import {
  BASE_URL,
  BLOCKED_GENRES,
  type CatalogItem,
  type CatalogPage,
  type Pagination,
  type SeriesMetadata,
} from "./models";

const clean = (value: string): string => value.replace(/\s+/g, " ").trim();
export const slug = (value: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9%-]*$/.test(value) || /%2f|%5c|%00/i.test(value))
    throw new Error("Invalid Mangasushi identity.");
  return value;
};
export const seriesUrl = (mangaId: string, chapterId?: string): string =>
  `${BASE_URL}/manga/${slug(mangaId)}/${chapterId ? `${slug(chapterId)}/` : ""}`;
const mangaIdFromUrl = (value: string): string => {
  const match = value.match(/^https:\/\/mangasushi\.org\/manga\/([^/?#]+)\/?$/);
  if (!match) throw new Error("Mangasushi returned an invalid series URL.");
  return slug(match[1]);
};
const imageUrl = (value?: string): string => {
  const url = (value ?? "").trim();
  if (!/^https:\/\/[^\s/?#]+\/[^\s]+$/.test(url) || /\/dflazy\.|^data:/i.test(url))
    throw new Error("Mangasushi returned an invalid image URL.");
  return url;
};
export const isAllowed = (data: SeriesMetadata): boolean =>
  data.nativeSafe && data.classified && !data.adult;
export const emptyMetadata = (): SeriesMetadata => ({
  genres: [],
  alternative: "",
  author: "",
  artist: "",
  release: "",
  status: "",
  adult: false,
  classified: false,
  nativeSafe: false,
});
export const parseCatalog = (
  html: string,
  kind: "search" | "popular" | "latest",
  nativeSafe = false,
  previous?: Pagination,
): CatalogPage => {
  const $ = cheerio.load(html);
  const selector =
    kind === "search"
      ? ".c-tabs-item__content"
      : kind === "popular"
        ? ".slider__item"
        : ".page-item-detail.manga";
  const items: CatalogItem[] = $(selector)
    .toArray()
    .map((element) => {
      const row = $(element);
      const anchor = row.find(".post-title a").first();
      const mangaId = mangaIdFromUrl(anchor.attr("href") ?? "");
      const title = clean(anchor.text());
      if (!title) throw new Error("Mangasushi returned an untitled series.");
      const img = row.find("img").first();
      const metadata = emptyMetadata();
      const field = (name: string): string =>
        clean(row.find(`.mg_${name} .summary-content`).text());
      metadata.genres = row
        .find('.mg_genres a[href*="/manga-genre/"]')
        .toArray()
        .map((node) => {
          const match = $(node)
            .attr("href")
            ?.match(/\/manga-genre\/([^/?#]+)\/?$/);
          if (!match) throw new Error("Mangasushi returned an invalid genre.");
          return { id: slug(match[1]), title: clean($(node).text()) };
        });
      metadata.alternative = field("alternative");
      metadata.author = field("author");
      metadata.artist = field("artists");
      metadata.status = field("status");
      metadata.release = field("release");
      metadata.classified = metadata.genres.length > 0;
      metadata.nativeSafe = nativeSafe;
      metadata.adult =
        metadata.genres.some((genre) => BLOCKED_GENRES.includes(genre.id)) ||
        row.find(".adult-content, .manga-adult, [data-adult='1']").length > 0;
      return {
        mangaId,
        title,
        imageUrl: imageUrl(img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src")),
        subtitle: clean(row.find(".chapter a, .latest-chap .chapter").first().text()),
        contentRating: metadata.adult ? ContentRating.ADULT : ContentRating.MATURE,
        metadata,
      };
    });
  if (new Set(items.map((item) => item.mangaId)).size !== items.length)
    throw new Error("Mangasushi repeated series identities.");
  if (kind === "popular") {
    if (!items.length) throw new Error("Mangasushi Popular Series layout changed.");
    return { items };
  }
  if (previous) {
    if (!items.length && html.trim() && !$(".no-posts").length)
      throw new Error("Mangasushi returned an unrecognized continuation page.");
    return {
      items,
      next:
        items.length && !$(".no-posts").length
          ? { ...previous, page: previous.page + 1 }
          : undefined,
    };
  }
  const navigation = $("#navigation-ajax");
  if (!items.length && !$(".no-posts, .no-results.not-found").length)
    throw new Error("Mangasushi catalog layout changed.");
  if (!navigation.length) return { items };
  const template = navigation.attr("data-template");
  if (
    template !==
    (kind === "search"
      ? "madara-core/content/content-search"
      : "madara-core/content/content-archive")
  )
    throw new Error("Mangasushi pagination template changed.");
  const assignments = $("script")
    .toArray()
    .map((script) =>
      $(script)
        .text()
        .match(/^\s*var __madara_query_vars = (\{.*\});?\s*$/s),
    )
    .filter((match) => match !== null);
  if (assignments.length !== 1)
    throw new Error("Mangasushi pagination data is missing or ambiguous.");
  const vars = JSON.parse(assignments[0]![1]) as JSONObject;
  if (
    !vars ||
    vars.post_type !== "wp-manga" ||
    !Number.isInteger(Number(vars.paged)) ||
    Number(vars.paged) < 1
  )
    throw new Error("Mangasushi pagination data changed.");
  return { items, next: { page: Number(vars.paged), template, vars } };
};
export const parseGenreOptions = (html: string): { id: string; title: string }[] => {
  const $ = cheerio.load(html);
  const genres = $('input[name="genre[]"]')
    .toArray()
    .map((node) => ({
      id: slug($(node).attr("value") ?? ""),
      title: clean($(node).next("label").text()),
    }));
  if (!genres.length || genres.some((genre) => !genre.title))
    throw new Error("Mangasushi genre filters are unavailable.");
  return genres;
};
export const parseDetailBase = (html: string, mangaId: string): SourceManga => {
  const $ = cheerio.load(html);
  const title = clean($(".post-title h1").first().text());
  const image = $(".summary_image img").first();
  if (!title || $(".summary_image a").attr("href") !== seriesUrl(mangaId))
    throw new Error("Mangasushi returned a different or incomplete series.");
  const field = (name: string): string =>
    clean(
      $(".profile-manga .post-content_item")
        .filter(
          (_index, node) => clean($(node).find(".summary-heading").text()).toLowerCase() === name,
        )
        .find(".summary-content")
        .text(),
    );
  const synopsis = cheerio
    .load(
      ($(".description-summary .summary__content").html() ?? "").replace(
        /<br\s*\/?\s*>|<\/p>/gi,
        "\n",
      ),
      null,
      false,
    )
    .text()
    .trim();
  return {
    mangaId,
    mangaInfo: {
      primaryTitle: title,
      secondaryTitles: field("alternative") ? [field("alternative")] : [],
      thumbnailUrl: imageUrl(image.attr("data-src") || image.attr("src")),
      synopsis,
      contentRating: ContentRating.MATURE,
      status: field("status"),
      shareUrl: seriesUrl(mangaId),
    },
  };
};
export const enrichDetails = (source: SourceManga, metadata?: SeriesMetadata): SourceManga => {
  if (!metadata) return source;
  return {
    ...source,
    mangaInfo: {
      ...source.mangaInfo,
      secondaryTitles: metadata.alternative
        ? [metadata.alternative]
        : source.mangaInfo.secondaryTitles,
      author: metadata.author || undefined,
      artist: metadata.artist || undefined,
      status: metadata.status || source.mangaInfo.status,
      contentRating: metadata.adult ? ContentRating.ADULT : ContentRating.MATURE,
      tagGroups: [{ id: "genres", title: "Genres", tags: metadata.genres }],
      additionalInfo: {
        ...(metadata.release ? { Released: metadata.release } : {}),
        ...(!metadata.classified
          ? { Classification: "The website does not supply genre metadata for this title." }
          : {}),
      },
    },
  };
};
export const parseDate = (text: string, now: Date): Date | undefined => {
  const value = clean(text);
  if (!value) return undefined;
  const relative = value.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s? ago$/i);
  if (relative) {
    const factors: Record<string, number> = {
      second: 1000,
      minute: 60000,
      hour: 3600000,
      day: 86400000,
      week: 604800000,
      month: 2592000000,
      year: 31536000000,
    };
    return new Date(now.getTime() - Number(relative[1]) * factors[relative[2].toLowerCase()]);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp))
    throw new Error(`Mangasushi returned an unknown chapter date: ${value}`);
  return new Date(timestamp);
};
export const parseChapters = (html: string, sourceManga: SourceManga, now: Date): Chapter[] => {
  const $ = cheerio.load(html);
  const nodes = $("li.wp-manga-chapter").toArray();
  if (!nodes.length) throw new Error("Mangasushi did not return its asynchronous chapter list.");
  const chapters = nodes.map((node, index): Chapter => {
    const row = $(node),
      anchor = row.children("a").first();
    const href = anchor.attr("href") ?? "";
    if (!href.startsWith(seriesUrl(sourceManga.mangaId)))
      throw new Error("Mangasushi returned a chapter from another series.");
    const chapterId = slug(href.slice(seriesUrl(sourceManga.mangaId).length).replace(/\/$/, ""));
    const title = clean(anchor.text());
    const number = title.match(/(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i);
    if (!title) throw new Error("Mangasushi returned an untitled chapter.");
    const locked =
      row.is(".premium, .locked, .chapter-locked") || row.find(".fa-lock, .ion-md-lock").length > 0;
    return {
      chapterId,
      sourceManga,
      title,
      chapNum: number ? Number(number[1]) : 0,
      langCode: "en",
      publishDate: parseDate(row.find(".chapter-release-date").text(), now),
      sortingIndex: nodes.length - index,
      additionalInfo: { locked: String(locked) },
    };
  });
  if (new Set(chapters.map((chapter) => chapter.chapterId)).size !== chapters.length)
    throw new Error("Mangasushi returned duplicate chapter identities.");
  return chapters;
};
export const parseReader = (html: string, chapter: Chapter): ChapterDetails => {
  const $ = cheerio.load(html);
  if (
    $("#wp-manga-current-chap").attr("value") !== chapter.chapterId ||
    !$(`a[href="${seriesUrl(chapter.sourceManga.mangaId)}"]`).length
  )
    throw new Error("Mangasushi returned a different reader chapter.");
  const nodes = $(".reading-content img.wp-manga-chapter-img").toArray();
  if (!nodes.length)
    throw new Error(
      "Mangasushi returned no public reader pages. This chapter may require website access.",
    );
  const pages = nodes.map((node, index) => {
    const img = $(node),
      id = img.attr("id");
    if (id && id !== `image-${index}`)
      throw new Error("Mangasushi reader page order is incomplete.");
    return imageUrl(img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src"));
  });
  if (new Set(pages).size !== pages.length)
    throw new Error("Mangasushi returned duplicate reader pages.");
  return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
};
