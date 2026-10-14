/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  BasicRateLimiter,
  CookieStorageInterceptor,
  type Chapter,
  type Cookie,
  type DiscoverSection,
  type ExtensionImpl,
  type Metadata,
  type PagedResults,
  type Request,
  type SearchQuery,
  type SortingOption,
  type SourceManga,
  type UpdateManager,
} from "@paperback/types";
import {
  HijalaSearchForm,
  HijalaSettingsForm,
  preferences,
  matchesPreferences,
  queryWithPreferences,
} from "./forms";
import { BASE_URL, PAGE_SIZE, SECTIONS, SORTS, type Preferences } from "./models";
import { catalogUrl, feedUrl, fetchText, HijalaInterceptor } from "./network";
import {
  parseChapters,
  parseDetails,
  parseDiscover,
  parseFeatured,
  parseGenres,
  parseGenreOptions,
  parseReader,
  parseSearch,
  parseUpdates,
  seriesUrl,
} from "./parsers";
import Config from "./pbconfig";

const continuation = <T>(
  result: PagedResults<T>,
  page: number,
  context: string,
  previous?: Metadata,
): PagedResults<T> => {
  const { total, count, ids } = result.metadata as { total: number; count: number; ids: string };
  if (!count && (page - 1) * PAGE_SIZE < total)
    throw new Error("Hijala returned an empty page before the end of its catalog.");
  if (
    ids &&
    (previous as { context?: string })?.context === context &&
    (previous as { ids?: string }).ids === ids
  )
    throw new Error("Hijala repeated a catalog page.");
  return {
    items: result.items,
    metadata: page * PAGE_SIZE < total ? { page: page + 1, context, ids } : undefined,
  };
};

const pageNumber = (metadata: Metadata | undefined, context: string): number => {
  const data = metadata as { context?: string; page?: number } | undefined;
  return data?.context === context && Number.isSafeInteger(data.page) && Number(data.page) > 0
    ? Number(data.page)
    : 1;
};

const loadCatalog = async <T extends { metadata?: unknown }>(
  url: (page: number) => string,
  parse: (text: string) => PagedResults<T>,
  saved: Preferences,
  metadata?: Metadata,
): Promise<PagedResults<T>> => {
  const context = JSON.stringify([url(1), saved]);
  let cursor = metadata;
  let page = pageNumber(cursor, context);
  for (let attempt = 0; attempt < 10; attempt++, page++) {
    const result = continuation(parse(await fetchText(url(page))), page, context, cursor);
    const items = result.items.filter((item) => matchesPreferences(item, saved));
    if (items.length || !result.metadata) return { items, metadata: result.metadata };
    cursor = result.metadata;
  }
  throw new Error("No visible titles in ten catalog pages. Adjust your source filters.");
};

class HijalaExtension implements ExtensionImpl<typeof Config> {
  private cookies = new CookieStorageInterceptor({ storage: "stateManager" });
  private interceptor = new HijalaInterceptor("Hijala.site");
  private rateLimiter = new BasicRateLimiter("Hijala.rate", {
    numberOfRequests: 3,
    bufferInterval: 1,
    ignoreImages: true,
  });

  async initialise() {
    this.cookies.registerInterceptor();
    this.interceptor.registerInterceptor();
    this.rateLimiter.registerInterceptor();
  }

  async getDiscoverSections() {
    return SECTIONS.filter((section) => preferences().sections.includes(section.id));
  }

  async getDiscoverSectionItems(section: DiscoverSection, metadata?: Metadata) {
    const saved = preferences();
    if (section.id === "genres")
      return { items: parseGenres(await fetchText(`${BASE_URL}/series`)) };
    if (section.id === "featured")
      return {
        items: parseFeatured(await fetchText(`${BASE_URL}/`)).filter((item) =>
          matchesPreferences(item, saved),
        ),
      };
    if (section.id === "updates") {
      return loadCatalog(
        (page) => feedUrl("updates", page),
        (text) => parseUpdates(text, new Date()),
        saved,
        metadata,
      );
    }
    if (!["latest", "hot", "new", "popular"].includes(section.id))
      throw new Error("Unknown Hijala section.");
    return loadCatalog(
      (page) =>
        section.id === "popular"
          ? catalogUrl(queryWithPreferences({ title: "" }, saved)!, page, SORTS[1])
          : feedUrl(section.id, page),
      parseDiscover,
      saved,
      metadata,
    );
  }

  async getSortingOptions() {
    return SORTS.map(({ id, label }) => ({ id, label }));
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata?: Metadata,
    sortingOption?: SortingOption,
  ) {
    const saved = preferences();
    const effective = queryWithPreferences(query, saved);
    if (!effective) return { items: [] };
    return loadCatalog(
      (page) => catalogUrl(effective, page, sortingOption),
      parseSearch,
      saved,
      metadata,
    );
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>) {
    return new HijalaSearchForm(query, parseGenreOptions(await fetchText(`${BASE_URL}/series`)));
  }

  async getSettingsForm() {
    return new HijalaSettingsForm(parseGenreOptions(await fetchText(`${BASE_URL}/series`)));
  }

  async getMangaDetails(mangaId: string) {
    return parseDetails(await fetchText(seriesUrl(mangaId)), mangaId);
  }

  async getChapters(sourceManga: SourceManga) {
    const html = await fetchText(seriesUrl(sourceManga.mangaId));
    return parseChapters(html, sourceManga, new Date()).filter(
      (chapter) => !preferences().hidePaid || chapter.additionalInfo?.locked !== "true",
    );
  }

  async getChapterDetails(chapter: Chapter) {
    if (chapter.additionalInfo?.locked === "true")
      throw new Error("This chapter requires access on the Hijala website.");
    return parseReader(
      await fetchText(seriesUrl(chapter.sourceManga.mangaId, chapter.chapterId)),
      chapter,
    );
  }

  async processTitlesForUpdates(_updateManager: UpdateManager, _lastUpdateDate?: Date) {
    await fetchText(`${BASE_URL}/`);
  }

  async cloudflareBypassCompleted(
    _request: Request,
    cookies: Cookie[],
    _localStorage: Record<string, string>,
  ) {
    for (const cookie of cookies) {
      const domain = cookie.domain.replace(/^\./, "");
      if (
        cookie.name === "cf_clearance" &&
        (domain === "en-hijala.com" || domain.endsWith(".en-hijala.com"))
      )
        this.cookies.setCookie(cookie);
    }
  }
}

export const Hijala = new HijalaExtension();
