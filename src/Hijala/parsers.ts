/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  ContentRating,
  type Chapter,
  type ChapterDetails,
  type DiscoverSectionItem,
  type PagedResults,
  type SourceManga,
  type TriStateSelectRowProps,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { serializedProperty } from "./page-data";
import { blockedGenre } from "./forms";
import {
  BASE_URL,
  LABELS,
  type Catalog,
  type CatalogItem,
  type Genre,
  type Post,
  type ReaderChapter,
  type SiteChapter,
} from "./models";

export const slugToId = (slug: string): string => {
  if (
    typeof slug !== "string" ||
    !slug ||
    slug === "." ||
    slug === ".." ||
    slug.includes("/") ||
    slug.includes("\\") ||
    Array.from(slug).some((char) => char.charCodeAt(0) < 32)
  )
    throw new Error("Hijala returned an invalid slug.");
  return encodeURIComponent(slug).replace(
    /[!'*~]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
};

export const idToSlug = (id: string): string => {
  if (typeof id !== "string" || !id) throw new Error("Hijala requires a valid source ID.");
  const slug = decodeURIComponent(id);
  slugToId(slug);
  return slug;
};

export const seriesUrl = (mangaId: string, chapterId?: string): string =>
  `${BASE_URL}/series/${slugToId(idToSlug(mangaId))}${chapterId ? `/${slugToId(idToSlug(chapterId))}` : ""}`;

const plainText = (value: string): string =>
  cheerio
    .load(value.replace(/<br\s*\/?\s*>|<\/p>/gi, "\n"), null, false)
    .text()
    .trim();

const routerScript = ($: cheerio.CheerioAPI): string | undefined => {
  const scripts = $("script")
    .toArray()
    .map((element) => $(element).text())
    .filter(
      (text) =>
        text.startsWith('(self.$R=self.$R||{})["tsr"]=[];') && text.includes("$_TSR.router="),
    );
  if (scripts.length > 1) throw new Error("Hijala returned ambiguous page data.");
  return scripts[0];
};

// Support both TanStack/Seroval literals and legacy Next JSON streams. Never execute scripts.
export const pageProperty = <T>(html: string, key: string): T => {
  const $ = cheerio.load(html);
  const serialized = routerScript($);
  if (serialized)
    return serializedProperty<T>(serialized, key === "sliderPosts" ? "combinedSliderPosts" : key);
  let stream = "";
  $("script").each((_index, element) => {
    const match = $(element)
      .text()
      .match(/^self\.__next_f\.push\((\[.*\])\)\s*;?$/s);
    if (match) {
      const chunk: unknown[] = JSON.parse(match[1]);
      if (chunk[0] === 1 && typeof chunk[1] === "string") stream += chunk[1];
    }
  });
  const pattern = new RegExp(`"${key}":(?=[{\\[])`, "g");
  const match = pattern.exec(stream);
  if (!match) throw new Error(`Hijala page is missing ${key}.`);
  const start = match.index + match[0].length;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < stream.length; index++) {
    const char = stream[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") depth++;
    else if ((char === "}" || char === "]") && --depth === 0)
      return JSON.parse(stream.slice(start, index + 1)) as T;
  }
  throw new Error(`Hijala returned incomplete ${key} data.`);
};

const contentRating = (genres?: Genre[]): ContentRating =>
  genres?.some((genre) => /^(adult|hentai|erotica|pornographic)$/i.test(genre.name.trim()))
    ? ContentRating.ADULT
    : ContentRating.MATURE;

const imageUrl = (value: string): string => {
  const url = value.startsWith("//")
    ? `https:${value}`
    : value.startsWith("/")
      ? `${BASE_URL}${value}`
      : value;
  if (!/^https?:\/\/[^\s/]+\//i.test(url)) throw new Error("Hijala returned an invalid image URL.");
  return url;
};

export const searchItem = (post: Post): CatalogItem => {
  if (!post.postTitle?.trim() || !post.featuredImage)
    throw new Error("Hijala returned an incomplete series card.");
  const classified =
    Array.isArray(post.genres) &&
    post.genres.length > 0 &&
    post.genres.every(
      (genre) =>
        Number.isSafeInteger(genre.id) &&
        genre.id > 0 &&
        typeof genre.name === "string" &&
        !!genre.name.trim(),
    );
  const reportedGenres = Array.isArray(post.genres) ? post.genres : [];
  const genres = reportedGenres.filter(
    (genre) =>
      Number.isSafeInteger(genre.id) &&
      genre.id > 0 &&
      typeof genre.name === "string" &&
      !!genre.name.trim(),
  );
  return {
    mangaId: slugToId(post.slug),
    title: post.postTitle.trim(),
    imageUrl: imageUrl(post.featuredImage),
    subtitle: post.seriesType ? (LABELS[post.seriesType] ?? post.seriesType.trim()) : undefined,
    contentRating: contentRating(genres),
    metadata: {
      type: post.seriesType ?? "",
      genres: reportedGenres
        .filter((genre) => Number.isSafeInteger(genre.id) && genre.id > 0)
        .map((genre) => String(genre.id)),
      novel: post.isNovel === true,
      classified,
      blocked: genres.some((genre) => blockedGenre(genre.name)),
    },
  };
};

export const catalog = (text: string): Catalog => {
  const data = JSON.parse(text) as Catalog;
  if (!Array.isArray(data.posts) || !Number.isSafeInteger(data.totalCount) || data.totalCount < 0)
    throw new Error("Hijala returned an invalid catalog response.");
  if (new Set(data.posts.map((post) => post.slug)).size !== data.posts.length)
    throw new Error("Hijala returned duplicate series in a catalog page.");
  return data;
};

export const parseSearch = (text: string): PagedResults<CatalogItem> => {
  const data = catalog(text);
  return {
    items: data.posts.map(searchItem),
    metadata: {
      total: data.totalCount,
      count: data.posts.length,
      ids: data.posts.map((post) => slugToId(post.slug)).join("|"),
    },
  };
};

export const parseDiscover = (text: string): PagedResults<DiscoverSectionItem> => {
  const page = parseSearch(text);
  return {
    items: page.items.map((item) => ({ ...item, type: "simpleCarouselItem" })),
    metadata: page.metadata,
  };
};

export const parseFeatured = (html: string): DiscoverSectionItem[] => {
  const posts = pageProperty<Post[]>(html, "sliderPosts");
  if (!Array.isArray(posts)) throw new Error("Hijala returned invalid featured series.");
  return posts.map((post) => ({
    ...searchItem(post),
    type: "featuredCarouselItem",
    summary: plainText(post.postContent ?? ""),
    supertitle: post.seriesType ? (LABELS[post.seriesType] ?? post.seriesType.trim()) : undefined,
  }));
};

export const parseGenreOptions = (html: string): TriStateSelectRowProps["items"] => {
  const genres = pageProperty<Genre[]>(html, "genres");
  if (
    !Array.isArray(genres) ||
    genres.some((genre) => !Number.isSafeInteger(genre.id) || !genre.name?.trim())
  )
    throw new Error("Hijala returned invalid genres.");
  return genres.map((genre) => ({ id: String(genre.id), title: genre.name.trim() }));
};

export const parseGenres = (html: string): DiscoverSectionItem[] =>
  parseGenreOptions(html).map((genre) => ({
    type: "genresCarouselItem",
    name: genre.title,
    searchQuery: { title: "", metadata: { genres: { [genre.id]: "included" } } },
  }));

export const parseDate = (value: string | undefined, capturedAt: Date): Date | undefined => {
  if (!value?.trim()) return undefined;
  const relative = value
    .trim()
    .match(
      /^(?:about\s+)?(\d+)\s*(mins?|minutes?|hrs?|hours?|days?|mo|months?|y|years?)(?:\s+ago)?$/i,
    );
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const date = new Date(capturedAt);
    if (unit.startsWith("mo") || unit.startsWith("y")) {
      const day = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - amount * (unit.startsWith("y") ? 12 : 1));
      const end = new Date(date);
      end.setUTCMonth(end.getUTCMonth() + 1, 0);
      date.setUTCDate(Math.min(day, end.getUTCDate()));
    } else
      date.setTime(
        date.getTime() -
          amount * (unit.startsWith("d") ? 86400000 : unit.startsWith("h") ? 3600000 : 60000),
      );
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return undefined;
  const date = new Date(value);
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    Number.isFinite(day.getTime()) &&
    day.toISOString().startsWith(value.slice(0, 10))
    ? date
    : undefined;
};

export const chapterTitle = (value: string | null | undefined, number: number): string => {
  const title = value?.trim() ?? "";
  if (/^\d+(?:\.\d+)?$/.test(title) && Number(title) === number) return "";
  const prefix = title.match(
    /^(?:(?:chapter|episode|ch\.?)\s*|#\s*)(\d+(?:\.\d+)?)(?=$|\s|[-:–—])/i,
  );
  return prefix && Number(prefix[1]) === number
    ? title.slice(prefix[0].length).replace(/^\s*[-:–—]?\s*/, "")
    : title;
};

const isLocked = (chapter: SiteChapter): boolean =>
  chapter.isLocked === true ||
  chapter.isAccessible === false ||
  (chapter.isAccessible !== true &&
    (chapter.isLockedByCoins === true ||
      chapter.isShortLinkLocked === true ||
      !!chapter.isPermanentlyLocked ||
      (chapter.price ?? 0) > 0));

export const parseUpdates = (text: string, capturedAt: Date): PagedResults<DiscoverSectionItem> => {
  const data = catalog(text);
  return {
    items: data.posts.flatMap((post) => {
      const item = searchItem(post);
      if (!Array.isArray(post.chapters))
        throw new Error("Hijala returned invalid chapter updates.");
      return post.chapters.map((chapter): DiscoverSectionItem => {
        if (!Number.isFinite(chapter.number))
          throw new Error("Hijala returned an invalid chapter number.");
        const title = chapterTitle(chapter.title, chapter.number);
        const paid = isLocked(chapter);
        return {
          ...item,
          type: "chapterUpdatesCarouselItem",
          chapterId: slugToId(chapter.slug),
          subtitle: `${paid ? "[Paid] " : ""}Chapter ${chapter.number}${title ? `: ${title}` : ""}`,
          publishDate: parseDate(chapter.createdAt, capturedAt),
          metadata: { ...item.metadata, paid },
        };
      });
    }),
    metadata: {
      total: data.totalCount,
      count: data.posts.length,
      ids: data.posts.map((post) => slugToId(post.slug)).join("|"),
    },
  };
};

export const parseDetails = (html: string, mangaId: string): SourceManga => {
  const post = pageProperty<Post>(html, "post");
  const item = searchItem(post);
  if (post.slug !== idToSlug(mangaId)) throw new Error("Hijala returned a different series.");
  const author = post.author?.trim();
  const artist = post.artist?.trim();
  return {
    mangaId: item.mangaId,
    mangaInfo: {
      primaryTitle: item.title,
      secondaryTitles: [
        ...new Set(
          (post.alternativeTitles ?? "")
            .split(/\s*[•\n]\s*|\s+\/\s+/)
            .map((title) => title.trim())
            .filter((title) => title && title !== item.title),
        ),
      ],
      thumbnailUrl: item.imageUrl,
      synopsis: plainText(post.postContent ?? ""),
      contentRating: item.contentRating ?? ContentRating.MATURE,
      contentType: post.isNovel ? "novel" : "comic",
      author: author || undefined,
      artist:
        artist && artist.replace(/\s+/g, " ") !== author?.replace(/\s+/g, " ") ? artist : undefined,
      status: post.seriesStatus
        ? (LABELS[post.seriesStatus] ?? post.seriesStatus.trim())
        : undefined,
      rating:
        typeof post.averageRating === "number" &&
        Number.isFinite(post.averageRating) &&
        post.averageRating >= 0 &&
        post.averageRating <= 10
          ? post.averageRating / 10
          : undefined,
      tagGroups: [
        {
          id: "genres",
          title: "Genres",
          tags: (post.genres ?? [])
            .filter(
              (genre) =>
                Number.isSafeInteger(genre.id) &&
                genre.id > 0 &&
                typeof genre.name === "string" &&
                !!genre.name.trim(),
            )
            .map((genre) => ({ id: String(genre.id), title: genre.name.trim() })),
        },
      ],
      additionalInfo: {
        ...(post.releaseDate ? { Released: post.releaseDate } : {}),
        ...(post.seriesType ? { Type: LABELS[post.seriesType] ?? post.seriesType.trim() } : {}),
      },
      shareUrl: seriesUrl(item.mangaId),
    },
  };
};

export const parseChapters = (
  html: string,
  sourceManga: SourceManga,
  capturedAt: Date,
): Chapter[] => {
  const post = pageProperty<Post>(html, "post");
  if (routerScript(cheerio.load(html))) {
    const chapters = pageProperty<SiteChapter[]>(html, "initialChapters");
    const total = pageProperty<number>(html, "totalChapterCount");
    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      total !== post._count?.chapters ||
      !Array.isArray(chapters) ||
      chapters.some((chapter) => typeof chapter.isLocked !== "boolean")
    )
      throw new Error("Hijala returned an incomplete chapter list or access status.");
    post.chapters = chapters;
  }
  if (
    post.slug !== idToSlug(sourceManga.mangaId) ||
    !Array.isArray(post.chapters) ||
    post.chapters.length !== post._count?.chapters
  )
    throw new Error("Hijala returned an incomplete chapter list.");
  const chapters = post.chapters.map((chapter): Chapter => {
    if (!Number.isFinite(chapter.number))
      throw new Error("Hijala returned an invalid chapter number.");
    const volume = chapter.volume == null || chapter.volume === "" ? 0 : Number(chapter.volume);
    if (!Number.isFinite(volume) || volume < 0)
      throw new Error("Hijala returned an invalid volume.");
    const locked = isLocked(chapter);
    return {
      chapterId: slugToId(chapter.slug),
      sourceManga,
      langCode: post.seriesType === "SPANISH" ? "es" : post.seriesType === "RUSSIAN" ? "ru" : "en",
      chapNum: chapter.number,
      volume,
      title: `${locked ? "[Paid] " : ""}${chapterTitle(chapter.title, chapter.number)}`.trim(),
      version: chapter.team?.name,
      publishDate: parseDate(chapter.createdAt, capturedAt),
      sortingIndex: chapter.number,
      additionalInfo: { locked: String(locked) },
    };
  });
  if (new Set(chapters.map((chapter) => chapter.chapterId)).size !== chapters.length)
    throw new Error("Hijala returned duplicate chapter identities.");
  return chapters.sort((a, b) => b.chapNum - a.chapNum);
};

export const parseReader = (html: string, chapter: Chapter): ChapterDetails => {
  const data = pageProperty<ReaderChapter>(html, "chapter");
  if (routerScript(cheerio.load(html))) {
    if (
      typeof data.seriesSlug !== "string" ||
      typeof data.isNovel !== "boolean" ||
      typeof data.isLocked !== "boolean" ||
      typeof data.isAccessible !== "boolean"
    )
      throw new Error("Hijala returned incomplete reader identity or access status.");
    if (data.requiresProtectedFetch !== false)
      throw new Error("This chapter requires access on the Hijala website.");
    data.mangaPost = { slug: data.seriesSlug, isNovel: data.isNovel };
    data.images = data.publicImages!;
  }
  if (
    data.slug !== idToSlug(chapter.chapterId) ||
    data.mangaPost?.slug !== idToSlug(chapter.sourceManga.mangaId)
  )
    throw new Error("Hijala returned a different chapter.");
  if (isLocked(data)) throw new Error("This chapter requires access on the Hijala website.");
  if (data.mangaPost.isNovel) throw new Error("Novel reading is not supported by this source.");
  if (!Array.isArray(data.images) || !data.images.length)
    throw new Error("Hijala returned no reader pages.");
  const images = [...data.images].sort((a, b) => a.order - b.order);
  if (
    images.some((item) => !Number.isSafeInteger(item.order) || item.order < 0 || !item.url) ||
    new Set(images.map((item) => item.order)).size !== images.length
  )
    throw new Error("Hijala returned invalid page ordering.");
  const pages = images.map((item) => imageUrl(item.url));
  if (new Set(pages).size !== pages.length)
    throw new Error("Hijala returned duplicate reader pages.");
  return { id: chapter.chapterId, mangaId: chapter.sourceManga.mangaId, pages };
};
