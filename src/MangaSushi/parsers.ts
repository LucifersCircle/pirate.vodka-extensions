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
  type SearchFilters,
  type HomeGenre,
} from "./models";

const clean = (value: string): string => value.replace(/\s+/g, " ").trim();
export const slug = (value: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9%_-]*$/.test(value) || /%2f|%5c|%00/i.test(value))
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
  const query = parseQueryVars(html) ?? previous?.vars;
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
            ?.match(/^https:\/\/mangasushi\.org\/manga-genre\/([^/?#]+)\/?$/);
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
        row.is(
          ".adult-content, .manga-adult, .adult-warning, [data-adult='1'], [data-adult='true']",
        ) ||
        row.find(
          ".adult-content, .manga-adult, .adult-warning, [data-adult='1'], [data-adult='true']",
        ).length > 0;
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
      query,
      next:
        items.length && !$(".no-posts").length
          ? { ...previous, page: previous.page + 1 }
          : undefined,
    };
  }
  const navigation = $("#navigation-ajax");
  if (!items.length && !$(".no-posts, .no-results.not-found").length)
    throw new Error("Mangasushi catalog layout changed.");
  if (!navigation.length) return { items, query };
  const template = navigation.attr("data-template");
  if (
    template !==
    (kind === "search"
      ? "madara-core/content/content-search"
      : "madara-core/content/content-archive")
  )
    throw new Error("Mangasushi pagination template changed.");
  const vars = query;
  if (
    !vars ||
    vars.post_type !== "wp-manga" ||
    !Number.isInteger(Number(vars.paged)) ||
    Number(vars.paged) < 1
  )
    throw new Error("Mangasushi pagination data changed.");
  return { items, query, next: { page: Number(vars.paged), template, vars } };
};
// Only parse the site's explicit JSON assignment; never evaluate provider scripts.
export const parseQueryVars = (
  html: string,
  name: "__madara_query_vars" | "manga_args" = "__madara_query_vars",
): JSONObject | undefined => {
  const $ = cheerio.load(html);
  const scripts = $("script")
    .toArray()
    .map((node) => $(node).text())
    .filter((text) => new RegExp(`\\b${name}\\b`).test(text));
  if (!scripts.length) return undefined;
  const match =
    scripts.length === 1
      ? scripts[0].match(new RegExp(`^\\s*var ${name} = (\\{.*\\});?\\s*$`, "s"))
      : undefined;
  if (!match) throw new Error("Mangasushi pagination data is missing or ambiguous.");
  let vars: unknown;
  try {
    vars = JSON.parse(match[1]);
  } catch {
    throw new Error("Mangasushi pagination data is malformed.");
  }
  // JSON.parse keeps the last duplicate key. A provider query must instead
  // have one unambiguous meaning, including inside nested taxonomy clauses.
  const stack: { keys?: Set<string>; key: boolean }[] = [];
  for (const token of match[1].match(/"(?:\\.|[^"\\])*"|[{}[\],:]/g) ?? []) {
    const current = stack[stack.length - 1];
    if (token === "{") stack.push({ keys: new Set(), key: true });
    else if (token === "[") stack.push({ key: false });
    else if (token === "}" || token === "]") stack.pop();
    else if (token === "," && current?.keys) current.key = true;
    else if (token.startsWith('"') && current?.keys && current.key) {
      const key = JSON.parse(token) as string;
      if (current.keys.has(key))
        throw new Error("Mangasushi pagination data contains duplicate keys.");
      current.keys.add(key);
      current.key = false;
    }
  }
  if (!vars || typeof vars !== "object" || Array.isArray(vars))
    throw new Error("Mangasushi pagination data changed.");
  return vars as JSONObject;
};
export const parseHomeGenres = (html: string): HomeGenre[] => {
  const $ = cheerio.load(html),
    genres: HomeGenre[] = [];
  for (const node of $("li.menu-item-object-wp-manga-genre > a").toArray()) {
    const anchor = $(node),
      url = anchor.attr("href") ?? "",
      title = clean(anchor.text());
    const match = url.match(/^https:\/\/mangasushi\.org\/manga-genre\/([a-z][a-z0-9-]*)\/$/);
    if (!match || !title) throw new Error("Mangasushi returned an invalid home genre.");
    const previous = genres.find((genre) => genre.id === match[1]);
    if (previous && previous.title !== title)
      throw new Error("Mangasushi returned an ambiguous home genre.");
    if (!previous) genres.push({ id: match[1], title, url });
  }
  if (!genres.length || genres.length > 100)
    throw new Error("Mangasushi home genres are unavailable.");
  return genres;
};
export const validateGenreQuery = (vars: JSONObject | undefined, genre: HomeGenre): void => {
  if (
    !vars ||
    vars["wp-manga-genre"] !== genre.id ||
    vars.taxonomy !== "wp-manga-genre" ||
    vars.term !== genre.id ||
    vars.post_type !== "wp-manga" ||
    Number(vars.paged) !== 1 ||
    Number(vars.posts_per_page) !== 12 ||
    vars.meta_key !== "_latest_update" ||
    vars.orderby !== "meta_value_num" ||
    (vars.order !== "desc" && vars.order !== "DESC") ||
    vars.s !== "" ||
    vars.template !== "archive" ||
    Object.keys(vars).some(
      (key) =>
        [
          "offset",
          "tax_query",
          "post_name__in",
          "post__in",
          "post__not_in",
          "category__in",
          "category__not_in",
          "category__and",
          "tag__in",
          "tag__not_in",
          "tag__and",
          "tag_slug__in",
          "tag_slug__and",
          "post_parent__in",
          "post_parent__not_in",
          "author__in",
          "author__not_in",
        ].includes(key) &&
        (Array.isArray(vars[key])
          ? vars[key].length > 0
          : vars[key] !== undefined && vars[key] !== ""),
    )
  )
    throw new Error("Mangasushi returned a different genre archive query.");
};
export const parseGenreArchive = (
  html: string,
  genre: HomeGenre,
  previous?: Pagination,
): CatalogPage => {
  const $ = cheerio.load(html);
  if (
    !previous &&
    (!$("body").hasClass("tax-wp-manga-genre") ||
      !$("body").hasClass(`term-${genre.id}`) ||
      clean($("h1.item-title").text()) !== genre.title)
  )
    throw new Error("Mangasushi returned a different genre archive.");
  const parsed = parseCatalog(html, "latest", false, previous);
  const result = {
    ...parsed,
    query:
      parsed.query ??
      (parsed.items.length && !parsed.next ? parseQueryVars(html, "manga_args") : undefined),
  };
  if (result.query || result.items.length || result.next) validateGenreQuery(result.query, genre);
  if (
    !result.items.length &&
    !result.next &&
    !previous &&
    (!$(".no-results.not-found").length ||
      $("#navigation-ajax").length ||
      !clean($(".no-results.not-found").text()).includes(
        `There is no Manga in this ${genre.title} - Manga Genres`,
      ))
  )
    throw new Error("Mangasushi returned an unrecognized empty genre archive.");
  return result;
};
export const validateGenreFilter = (
  html: string,
  result: CatalogPage,
  filters: SearchFilters,
  continuation = false,
): void => {
  const requested = [...new Set(filters.genres)];
  if (!requested.length) return;
  const fail = (): never => {
    throw new Error(
      "Mangasushi ignored or changed the selected genre filter. Try the genre archive or change your search.",
    );
  };
  if (!result.items.length) {
    const $ = cheerio.load(html);
    if (
      result.next ||
      $("#navigation-ajax").length ||
      (!continuation &&
        ($(".no-results.not-found").length !== 1 ||
          clean($(".no-results.not-found").text()) !==
            "No matches found. Try a different search..." ||
          $(".no-results.not-found .not-found-content p").length !== 1)) ||
      (continuation && html.trim() && !$(".no-posts").length)
    )
      fail();
    if (!continuation && !result.query) parseQueryVars(html, "manga_args");
    return;
  }
  if (!continuation) {
    const $ = cheerio.load(html);
    const selected = $('input[name="genre[]"]:checked')
      .toArray()
      .map((node) => $(node).attr("value") ?? "");
    const available = $('input[name="genre[]"]')
      .toArray()
      .map((node) => $(node).attr("value") ?? "");
    const conditions = $('select[name="op"] option[selected]');
    if (
      new Set(available).size !== available.length ||
      requested.some((id) => !available.includes(id)) ||
      conditions.length !== 1 ||
      conditions.attr("value") !== filters.condition ||
      selected.length !== requested.length ||
      new Set(selected).size !== selected.length ||
      selected.some((id) => !requested.includes(id))
    )
      fail();
  }
  // Finite native searches omit the AJAX state, but still expose the same
  // explicit search query as manga_args. Do not mistake that for ignored taxa.
  const query = (
    result.query ?? (!result.next && !continuation ? parseQueryVars(html, "manga_args") : undefined)
  )?.tax_query;
  if (!query || typeof query !== "object" || Array.isArray(query)) return fail();
  const relation = filters.condition === "1" ? "AND" : "OR";
  const nativeEntries = Object.entries(query).filter(([key]) => key !== "relation");
  if (
    query.relation !== "OR" ||
    !nativeEntries.length ||
    nativeEntries.some(([key], index) => key !== String(index))
  )
    fail();
  const otherTaxa: Record<string, string> = {
    "wp-manga-author": filters.author,
    "wp-manga-artist": filters.artist,
    "wp-manga-release": filters.release,
  };
  const observed = new Set<string>();
  for (const [, value] of nativeEntries.slice(1)) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.taxonomy !== "string" ||
      !Object.prototype.hasOwnProperty.call(otherTaxa, value.taxonomy) ||
      !otherTaxa[value.taxonomy] ||
      observed.has(value.taxonomy) ||
      value.field !== "term_id" ||
      Object.keys(value).some((key) => !["taxonomy", "field", "terms"].includes(key)) ||
      !Array.isArray(value.terms) ||
      value.terms.length !== 1 ||
      typeof value.terms[0] !== "number" ||
      !Number.isSafeInteger(value.terms[0]) ||
      value.terms[0] < 1
    )
      return fail();
    observed.add(value.taxonomy);
  }
  // Madara emits one IN clause with all terms for OR. Its AND form is an
  // OR wrapper containing one array-wrapped AND group of singleton clauses.
  // Accept those observed contracts, not arbitrary nested taxonomy expressions.
  let clauses: JSONObject[];
  if (relation === "AND") {
    const wrapper = query["0"];
    if (!Array.isArray(wrapper) || wrapper.length !== 1) return fail();
    const group = wrapper[0];
    if (!group || typeof group !== "object" || Array.isArray(group) || group.relation !== "AND")
      return fail();
    const entries = Object.entries(group).filter(([key]) => key !== "relation");
    if (
      entries.length !== requested.length ||
      entries.some(([key], index) => key !== String(index))
    )
      fail();
    clauses = entries.map(([, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
      return value;
    });
  } else {
    const clause = query["0"];
    if (!clause || typeof clause !== "object" || Array.isArray(clause)) return fail();
    clauses = [clause];
  }
  const terms: string[] = [],
    fields: string[] = [];
  for (const entry of clauses) {
    if (
      entry.taxonomy !== "wp-manga-genre" ||
      (entry.field !== "term_id" && entry.field !== "slug") ||
      (entry.operator !== undefined && entry.operator !== "IN") ||
      Object.keys(entry).some((key) => !["taxonomy", "field", "terms", "operator"].includes(key)) ||
      !Array.isArray(entry.terms) ||
      entry.terms.length !== (relation === "AND" ? 1 : requested.length)
    )
      return fail();
    for (const term of entry.terms) {
      if (
        entry.field === "term_id"
          ? (typeof term !== "number" && (typeof term !== "string" || !/^[1-9]\d*$/.test(term))) ||
            !Number.isSafeInteger(Number(term)) ||
            Number(term) < 1
          : typeof term !== "string" || !requested.includes(term)
      )
        fail();
      terms.push(JSON.stringify([entry.field, entry.field === "term_id" ? Number(term) : term]));
    }
    fields.push(entry.field);
  }
  if (
    terms.length !== requested.length ||
    new Set(terms).size !== terms.length ||
    new Set(fields).size !== 1
  )
    fail();
  for (const item of result.items) {
    const ids = item.metadata.genres.map((genre) => genre.id);
    if (
      relation === "AND"
        ? !requested.every((id) => ids.includes(id))
        : !requested.some((id) => ids.includes(id))
    )
      fail();
  }
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
export const chapterTitle = (label: string, chapNum: number): string => {
  const prefix = label.match(/^(?:(?:chapter|ch\.?)\s*)?(\d+(?:\.\d+)?)(.*)$/i);
  if (!prefix || Number(prefix[1]) !== chapNum) return label;
  const remainder = prefix[2];
  // Only remove a complete matching number, never a range, part number or
  // a nonleading mention. Paperback already displays the parsed chapNum.
  if ((remainder && !/^[\s:–—-]/.test(remainder)) || /^\s*(?:[-–—/]|to\b)\s*\d/i.test(remainder))
    return label;
  return remainder.replace(/^\s*[-:–—]?\s*/, "").trim();
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
    const volume = title.match(/\b(?:volume|vol\.?)\s*(\d+(?:\.\d+)?)/i);
    if (!title) throw new Error("Mangasushi returned an untitled chapter.");
    const chapNum = number ? Number(number[1]) : 0;
    const locked =
      row.is(".premium, .locked, .chapter-locked") || row.find(".fa-lock, .ion-md-lock").length > 0;
    return {
      chapterId,
      sourceManga,
      title: chapterTitle(title, chapNum),
      chapNum,
      volume: volume ? Number(volume[1]) : 0,
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
