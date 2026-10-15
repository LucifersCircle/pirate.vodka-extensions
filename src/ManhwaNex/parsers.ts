/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  ContentRating,
  type Chapter,
  type ChapterDetails,
  type SourceManga,
} from "@paperback/types";
import * as cheerio from "cheerio";
import {
  BASE_URL,
  GENRES,
  type CatalogPage,
  type HomeCategory,
  type SeriesMetadata,
} from "./models";

const BLOCKED_GENRES = new Set(["adult", "mature", "smut", "hentai", "erotica", "ecchi"]);
const ADULT_MARKERS =
  '.adult-content, .manga-adult, .adult-warning, [data-adult="1"], [data-adult="true"]';

export const clean = (value: string): string => value.replace(/\s+/g, " ").trim();
export const slug = (value: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) throw new Error("Invalid ManhwaNex identity.");
  return value;
};
// Taxonomy tags can have source-supplied percent-encoded Unicode slugs.
// This does not widen the series/chapter URL identity contract.
export const taxonomyId = (value: string): string => {
  if (!/^(?:[a-zA-Z0-9_-]|%[a-fA-F0-9]{2})+$/.test(value) || /%2f|%5c|%00|%25|%2e/i.test(value))
    throw new Error("Invalid ManhwaNex taxonomy identity.");
  try {
    if (/[/\\]/.test(decodeURIComponent(value)))
      throw new Error("Invalid ManhwaNex taxonomy identity.");
  } catch {
    throw new Error("Invalid ManhwaNex taxonomy encoding.");
  }
  return value;
};
export const seriesUrl = (mangaId: string, chapterId?: string): string =>
  `${BASE_URL}/manga/${slug(mangaId)}/${chapterId ? `${slug(chapterId)}/` : ""}`;
const mangaIdFromUrl = (value: string): string => {
  const match = value.match(/^https:\/\/manhwanex\.com\/manga\/([^/?#]+)\/?$/);
  if (!match) throw new Error("ManhwaNex returned an invalid series URL.");
  return slug(match[1]);
};
export const imageUrl = (value?: string): string => {
  const url = (value ?? "").trim();
  if (
    !/^https:\/\/(?:manhwanex\.com\/wp-content\/uploads|cdn\.manhwanex\.com\/manga_[a-zA-Z0-9_-]+)\/[^\s?#\\]+$/.test(
      url,
    ) ||
    /(?:^|\/)\.\.?\/|%2f|%5c|%00|%25/i.test(url)
  )
    throw new Error("ManhwaNex returned an invalid image URL.");
  return url;
};
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
export const isAllowed = (data: SeriesMetadata): boolean =>
  data.nativeSafe && data.classified && !data.adult;
const querySignature = (url: string): string => {
  const query = url.split("?")[1] ?? "";
  const pairs = query
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf("=");
      const decode = (part: string) => decodeURIComponent(part.replace(/\+/g, " "));
      const key = decode(i < 0 ? pair : pair.slice(0, i)).replace(/\[\d*\]$/, "[]");
      const value = decode(i < 0 ? "" : pair.slice(i + 1));
      return [key, value];
    })
    .filter(([key, value]) => value !== "" || key === "s");
  return JSON.stringify(pairs.sort((a, b) => `${a[0]}=${a[1]}`.localeCompare(`${b[0]}=${b[1]}`)));
};
const catalogRoute = (url: string): { route: string; page: number } => {
  const match = url.match(
    /^https:\/\/manhwanex\.com\/(manga-genre\/([a-zA-Z0-9_-]+)\/)?(?:page\/([1-9]\d*)\/)?(?:\?[^#\\\s]*)?$/,
  );
  const page = Number(match?.[3] ?? 1);
  if (!match || !Number.isSafeInteger(page) || (match[2] && !GENRES.includes(match[2])))
    throw new Error("ManhwaNex returned an invalid catalog route.");
  return { route: match[1] ?? "", page };
};
export const validateCatalogUrl = (url: string, root: string, previousPage = 0): string => {
  const current = catalogRoute(url),
    origin = catalogRoute(root);
  if (
    current.route !== origin.route ||
    current.page <= previousPage ||
    querySignature(url) !== querySignature(root)
  )
    throw new Error("ManhwaNex returned an invalid or non-advancing catalog page.");
  return url;
};
export const parseHomeCategories = (html: string): HomeCategory[] => {
  const $ = cheerio.load(html),
    categories: HomeCategory[] = [];
  for (const node of $("li.menu-item-object-wp-manga-genre > a").toArray()) {
    const anchor = $(node),
      url = anchor.attr("href") ?? "",
      title = clean(anchor.text());
    const match = url.match(/^https:\/\/manhwanex\.com\/manga-genre\/([a-zA-Z0-9_-]+)\/$/);
    if (!match || !GENRES.includes(match[1]) || !title)
      throw new Error("ManhwaNex returned an invalid home category.");
    if (!categories.some((category) => category.url === url))
      categories.push({ id: `genre:${match[1]}`, title, url });
  }
  if (!categories.length) throw new Error("ManhwaNex home categories are unavailable.");
  return categories;
};
export const catalogPageNumber = (url: string): number =>
  Number(url.match(/\/page\/(\d+)\//)?.[1] ?? 1);
export const parseCatalog = (
  html: string,
  kind: "search" | "popular" | "latest" | "category",
  nativeSafe = false,
  current = `${BASE_URL}/`,
): CatalogPage => {
  const $ = cheerio.load(html);
  if (kind === "category") {
    const route = catalogRoute(current).route;
    const genre = route.match(/^manga-genre\/([^/]+)\/$/)?.[1];
    if (
      !genre ||
      $("link[rel=canonical]").attr("href") !== current ||
      !$("body").hasClass("tax-wp-manga-genre") ||
      !$("body").hasClass(`term-${genre}`)
    )
      throw new Error("ManhwaNex returned a different category archive.");
  }
  const selector =
    kind === "search"
      ? ".c-tabs-item__content"
      : kind === "popular"
        ? ".widget-manga-popular-slider .slider__item"
        : ".page-item-detail.manga";
  const items = $(selector)
    .toArray()
    .map((element) => {
      const row = $(element),
        anchor = row.find(".post-title a").first();
      const mangaId = mangaIdFromUrl(anchor.attr("href") ?? ""),
        title = clean(anchor.text());
      if (!title) throw new Error("ManhwaNex returned an untitled series.");
      const field = (name: string): string =>
        clean(row.find(`.mg_${name} .summary-content`).text());
      const metadata = emptyMetadata();
      metadata.genres = row
        .find(".mg_genres .summary-content a")
        .toArray()
        .map((node) => {
          const id = $(node)
            .attr("href")
            ?.match(/^https:\/\/manhwanex\.com\/manga-genre\/([^/?#]+)\/?$/)?.[1];
          if (!id) throw new Error("ManhwaNex returned an invalid genre.");
          const title = clean($(node).text());
          if (!title) throw new Error("ManhwaNex returned an unlabelled genre.");
          return { id: slug(id), title };
        });
      metadata.alternative = field("alternative");
      metadata.author = field("author");
      metadata.artist = field("artists");
      metadata.status = field("status");
      metadata.release = field("release");
      metadata.classified =
        metadata.genres.length > 0 && metadata.genres.every((genre) => GENRES.includes(genre.id));
      metadata.adult =
        metadata.genres.some((genre) => BLOCKED_GENRES.has(genre.id.toLowerCase())) ||
        row.is(ADULT_MARKERS) ||
        row.find(ADULT_MARKERS).length > 0;
      metadata.nativeSafe = nativeSafe;
      const image = row.find("img").first();
      return {
        mangaId,
        title,
        imageUrl: imageUrl(image.attr("data-src") || image.attr("src")),
        metadata,
      };
    });
  if (new Set(items.map((item) => item.mangaId)).size !== items.length)
    throw new Error("ManhwaNex returned duplicate catalog identities.");
  if (
    !items.length &&
    !$(".no-posts, .no-results.not-found, .search-no-results").length &&
    !/No matches found|No results found/i.test($("body").text())
  )
    throw new Error("ManhwaNex catalog layout changed.");
  const page = catalogPageNumber(current);
  const shown = clean($(".wp-pagenavi .current").text());
  if (kind !== "popular" && shown && Number(shown) !== page)
    throw new Error("ManhwaNex returned a different catalog page.");
  const next =
    kind !== "popular" ? $(".wp-pagenavi .nextpostslink[rel=next]").attr("href") : undefined;
  if (next) {
    // A saved cursor may resume later, but a native next link must not skip pages.
    validateCatalogUrl(next, current, page);
    if (catalogPageNumber(next) !== page + 1)
      throw new Error("ManhwaNex returned a non-consecutive catalog page.");
  }
  return { items, next };
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
    throw new Error("ManhwaNex genre filters are unavailable.");
  return genres;
};
export const parseDetails = (html: string, mangaId: string): SourceManga => {
  const $ = cheerio.load(html),
    title = clean($(".post-title h1").first().text());
  if (!title || $("link[rel=canonical]").attr("href") !== seriesUrl(mangaId))
    throw new Error("ManhwaNex returned a different or incomplete series.");
  const field = (name: RegExp): string =>
    clean(
      $(".profile-manga .post-content_item")
        .filter((_index, node) => name.test(clean($(node).find(".summary-heading").text())))
        .find(".summary-content")
        .text(),
    );
  const tags = (selector: string) =>
    $(selector)
      .toArray()
      .map((node) => {
        const anchor = $(node),
          match = anchor
            .attr("href")
            ?.match(/^https:\/\/manhwanex\.com\/(?:manga-genre|manga-tag)\/([^/?#]+)\/?$/);
        if (!match) throw new Error("ManhwaNex returned an invalid tag.");
        const title = clean(anchor.text());
        if (!title) throw new Error("ManhwaNex returned an unlabelled tag.");
        return { id: taxonomyId(match[1]), title };
      });
  const genreTags = tags(".profile-manga .genres-content a");
  const otherTags = tags(".profile-manga .tags-content a");
  const image = $(".summary_image img").first();
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
  const alternative = field(/^Alternative$/i),
    release = field(/^Release$/i),
    type = field(/^Type$/i);
  const ratingText = clean($(".post-total-rating .score").first().text()),
    rating = /^\d+(?:\.\d+)?$/.test(ratingText) ? Number(ratingText) : NaN;
  return {
    mangaId,
    mangaInfo: {
      primaryTitle: title,
      secondaryTitles: alternative ? [alternative] : [],
      thumbnailUrl: imageUrl(image.attr("data-src") || image.attr("src")),
      synopsis,
      contentRating: $(
        ".profile-manga .adult-content, .profile-manga .manga-adult, .profile-manga .adult-warning",
      ).length
        ? ContentRating.ADULT
        : ContentRating.MATURE,
      status: field(/^Status$/i),
      author: field(/^Authors?$/i) || undefined,
      artist: field(/^Artists?$/i) || undefined,
      tagGroups: [
        { id: "genres", title: "Genres", tags: genreTags },
        ...(otherTags.length ? [{ id: "tags", title: "Tags", tags: otherTags }] : []),
      ],
      additionalInfo: {
        ...(release ? { Released: release } : {}),
        ...(type ? { Type: type } : {}),
      },
      ...(Number.isFinite(rating) && rating > 0 && rating <= 5 ? { rating: rating / 5 } : {}),
      shareUrl: seriesUrl(mangaId),
    },
  };
};
export const enrichDetails = (source: SourceManga, metadata?: SeriesMetadata): SourceManga => ({
  ...source,
  mangaInfo: {
    ...source.mangaInfo,
    author: source.mangaInfo.author || metadata?.author || undefined,
    artist: source.mangaInfo.artist || metadata?.artist || undefined,
    contentRating:
      metadata?.adult || source.mangaInfo.contentRating === ContentRating.ADULT
        ? ContentRating.ADULT
        : ContentRating.MATURE,
  },
});
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
    throw new Error(`ManhwaNex returned an unknown chapter date: ${value}`);
  return new Date(timestamp);
};
export const chapterTitle = (label: string, chapNum: number): string => {
  const prefix = label.match(/^(?:(?:chapter|ch\.?)\s*)?(\d+(?:\.\d+)?)(.*)$/i);
  if (!prefix || Number(prefix[1]) !== chapNum) return label;
  const remainder = prefix[2];
  if ((remainder && !/^[\s:–—-]/.test(remainder)) || /^\s*(?:[-–—/]|to\b)\s*\d/i.test(remainder))
    return label;
  return remainder.replace(/^\s*[-:–—]?\s*/, "").trim();
};
export const parseChapters = (html: string, sourceManga: SourceManga, now: Date): Chapter[] => {
  const $ = cheerio.load(html),
    nodes = $("li.wp-manga-chapter").toArray();
  if (!nodes.length) throw new Error("ManhwaNex did not return its asynchronous chapter list.");
  const chapters = nodes.map((node, index): Chapter => {
    const row = $(node),
      anchor = row.children("a").first(),
      href = anchor.attr("href") ?? "";
    if (!href.startsWith(seriesUrl(sourceManga.mangaId)))
      throw new Error("ManhwaNex returned a chapter from another series.");
    const chapterId = slug(href.slice(seriesUrl(sourceManga.mangaId).length).replace(/\/$/, ""));
    const label = clean(anchor.text()),
      number = label.match(/\b(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i),
      volume = label.match(/\b(?:volume|vol\.?)\s*(\d+(?:\.\d+)?)/i);
    if (!label) throw new Error("ManhwaNex returned an untitled chapter.");
    const chapNum = number ? Number(number[1]) : 0;
    const wrapper = row.closest(".wp-manga-volume");
    const reportedVolume = wrapper
      .find(".volume-name")
      .first()
      .text()
      .match(/^(?:volume|vol\.?)?\s*(\d+(?:\.\d+)?)(?:\b|$)/i);
    return {
      chapterId,
      sourceManga,
      title: chapterTitle(label, chapNum),
      chapNum,
      volume: volume ? Number(volume[1]) : reportedVolume ? Number(reportedVolume[1]) : 0,
      langCode: "en",
      sortingIndex: nodes.length - index,
      publishDate: parseDate(
        row.find(".chapter-release-date a[title]").attr("title") ||
          row.find(".chapter-release-date").text(),
        now,
      ),
      additionalInfo: {
        locked: String(
          row.is(".premium, .locked, .chapter-locked") ||
            row.find(".fa-lock, .ion-md-lock").length > 0,
        ),
      },
    };
  });
  if (new Set(chapters.map((chapter) => chapter.chapterId)).size !== chapters.length)
    throw new Error("ManhwaNex returned duplicate chapter identities.");
  return chapters;
};
export const chapterPages = (html: string): number[] => {
  const $ = cheerio.load(html);
  const pages = $(".listing-chapters_wrap .pagination .page a[data-page]")
    .toArray()
    .map((node) => Number($(node).attr("data-page")));
  if (pages.some((page) => !Number.isSafeInteger(page) || page < 1 || page > 100))
    throw new Error("ManhwaNex chapter pagination changed.");
  return [...new Set(pages)];
};
export const parseReader = (
  html: string,
  chapter: Chapter,
): Extract<ChapterDetails, { pages: string[] }> => {
  const $ = cheerio.load(html);
  if (
    $("link[rel=canonical]").attr("href") !==
      seriesUrl(chapter.sourceManga.mangaId, chapter.chapterId) ||
    $("#wp-manga-current-chap").attr("value") !== chapter.chapterId ||
    !$(`a[href="${seriesUrl(chapter.sourceManga.mangaId)}"]`).length
  )
    throw new Error("ManhwaNex returned a different reader chapter.");
  const nodes = $(".reading-content img.wp-manga-chapter-img").toArray();
  if (!nodes.length)
    throw new Error(
      "ManhwaNex returned no public reader pages. This chapter may require website access.",
    );
  const pages = nodes.map((node, index) => {
    const img = $(node),
      id = img.attr("id");
    if (id && id !== `image-${index}`)
      throw new Error("ManhwaNex reader page order is incomplete.");
    const page = imageUrl(img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src"));
    if (!page.startsWith("https://cdn.manhwanex.com/"))
      throw new Error("ManhwaNex returned an unverified reader image host.");
    return page;
  });
  if (new Set(pages).size !== pages.length)
    throw new Error("ManhwaNex returned duplicate reader pages.");
  return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
};
