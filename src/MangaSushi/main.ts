/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  BasicRateLimiter,
  CookieStorageInterceptor,
  type Chapter,
  type Cookie,
  type DiscoverSection,
  type DiscoverSectionItem,
  type ExtensionImpl,
  type Metadata,
  type PagedResults,
  type Request,
  type SearchQuery,
  type SortingOption,
  type SourceManga,
  type UpdateManager,
} from "@paperback/types";
import { MangaSushiSearchForm, MangaSushiSettingsForm, preferences } from "./forms";
import {
  BASE_URL,
  EDITORIAL_IDS,
  SECTIONS,
  SORTS,
  type CatalogItem,
  type CatalogPage,
  type Cursor,
  type Pagination,
  type Preferences,
  type SeriesMetadata,
} from "./models";
import { fetchNext, fetchText, MangaSushiInterceptor, searchUrl } from "./network";
import {
  enrichDetails,
  isAllowed,
  parseCatalog,
  parseChapters,
  parseDetailBase,
  parseGenreOptions,
  parseReader,
  seriesUrl,
} from "./parsers";
import Config from "./pbconfig";

class MangaSushiExtension implements ExtensionImpl<typeof Config> {
  private cookies = new CookieStorageInterceptor({ storage: "stateManager" });
  private interceptor = new MangaSushiInterceptor("MangaSushi.site");
  private rateLimiter = new BasicRateLimiter("MangaSushi.rate", {
    numberOfRequests: 3,
    bufferInterval: 1,
    ignoreImages: true,
  });
  private cache = new Map<string, { data: SeriesMetadata; expires: number }>();
  private cacheContext = "";
  private homeCache?: { data: string; expires: number };
  private pendingHome?: Promise<string>;
  private discoveryCache = new Map<string, { data: CatalogPage; expires: number }>();
  private pendingDiscovery = new Map<string, Promise<CatalogPage>>();
  async initialise() {
    this.cookies.registerInterceptor();
    this.interceptor.registerInterceptor();
    this.rateLimiter.registerInterceptor();
  }
  private saved(): Preferences {
    const saved = preferences(),
      context = JSON.stringify(saved);
    if (context !== this.cacheContext) {
      this.cache.clear();
      this.homeCache = undefined;
      this.pendingHome = undefined;
      this.discoveryCache.clear();
      this.pendingDiscovery.clear();
      this.cacheContext = context;
    }
    return saved;
  }
  private ensureCurrent(saved: Preferences) {
    if (JSON.stringify(saved) !== JSON.stringify(preferences()))
      throw new Error("Mangasushi settings changed. Reload this page.");
  }
  private remember(item: CatalogItem) {
    this.cache.set(item.mangaId, { data: item.metadata, expires: Date.now() + 5 * 60 * 1000 });
  }
  private async home(saved: Preferences): Promise<string> {
    if (this.homeCache && this.homeCache.expires > Date.now()) return this.homeCache.data;
    if (this.pendingHome) return this.pendingHome;
    const request = (async () => {
      const data = await fetchText(`${BASE_URL}/`);
      this.ensureCurrent(saved);
      this.homeCache = { data, expires: Date.now() + 5 * 60 * 1000 };
      return data;
    })();
    this.pendingHome = request;
    try {
      return await request;
    } finally {
      if (this.pendingHome === request) this.pendingHome = undefined;
    }
  }
  private async discoveryMetadata(
    cursor: Pagination,
    saved: Preferences,
    size?: number,
  ): Promise<void> {
    const original = cursor.vars;
    // Use the site's own latest-update query and native search template: the
    // search rows include actual genres for the whole discovery page at once.
    if (
      original.meta_key !== "_latest_update" ||
      original.orderby !== "meta_value_num" ||
      original.order !== "desc"
    )
      throw new Error("Mangasushi discovery metadata query changed.");
    const count = size ?? Number(original.posts_per_page);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100)
      throw new Error("Mangasushi discovery page size changed.");
    const metadataCursor: Pagination = {
      page: cursor.page,
      template: "madara-core/content/content-search",
      vars: {
        ...original,
        s: "",
        template: "search",
        posts_per_page: String(count),
        manga_archives_item_layout: "default",
        // This is the site's adult=0 clause. Explicit tags (including Ecchi)
        // and missing genres are still excluded after the native filter.
        meta_query: {
          relation: "AND",
          0: original.meta_query ?? { relation: "AND" },
          1: { key: "manga_adult_content", value: "" },
        },
      },
    };
    const key = JSON.stringify([saved, metadataCursor]);
    const cached = this.discoveryCache.get(key);
    if (cached && cached.expires > Date.now()) {
      for (const item of cached.data.items) this.remember(item);
      return;
    }
    const pending = this.pendingDiscovery.get(key);
    if (pending) {
      await pending;
      return;
    }
    const request = (async () => {
      const result = parseCatalog(
        await fetchNext(metadataCursor),
        "search",
        saved.excludeNSFW,
        metadataCursor,
      );
      this.ensureCurrent(saved);
      this.discoveryCache.set(key, { data: result, expires: Date.now() + 5 * 60 * 1000 });
      for (const item of result.items) this.remember(item);
      return result;
    })();
    this.pendingDiscovery.set(key, request);
    try {
      await request;
    } finally {
      if (this.pendingDiscovery.get(key) === request) this.pendingDiscovery.delete(key);
    }
  }
  private async classify(
    mangaId: string,
    title: string,
    saved: Preferences,
  ): Promise<SeriesMetadata | undefined> {
    const cached = this.cache.get(mangaId);
    if (cached && cached.expires > Date.now()) return cached.data;
    // WordPress treats long queries as exact sentences. A short retry avoids
    // punctuation/long-title mismatches; only the exact canonical ID is accepted.
    const shortTitle = title
      .replace(/[“”‘’"',.:;!?~‐‑‒–—]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(" ");
    for (const term of new Set([title, shortTitle])) {
      let result = parseCatalog(
        await fetchText(searchUrl({ title: term }, saved.excludeNSFW)),
        "search",
        saved.excludeNSFW,
      );
      let previousIds = "";
      for (let page = 0; page < 10; page++) {
        this.ensureCurrent(saved);
        const ids = result.items.map((item) => item.mangaId).join("|");
        if (ids && ids === previousIds)
          throw new Error("Mangasushi repeated a classification page.");
        for (const item of result.items) this.remember(item);
        const exact = result.items.find((item) => item.mangaId === mangaId);
        if (exact) return exact.metadata;
        if (!result.next) break;
        if (page === 9) throw new Error("Mangasushi classification search exceeded ten pages.");
        previousIds = ids;
        result = parseCatalog(
          await fetchNext(result.next),
          "search",
          saved.excludeNSFW,
          result.next,
        );
      }
    }
    return undefined;
  }
  private async visible(
    items: CatalogItem[],
    kind: "search" | "popular" | "latest",
    saved: Preferences,
    discovery?: Pagination,
    size?: number,
  ): Promise<CatalogItem[]> {
    if (
      kind !== "search" &&
      saved.excludeNSFW &&
      discovery &&
      items.some((item) => {
        const cached = this.cache.get(item.mangaId);
        return !cached || cached.expires <= Date.now();
      })
    )
      await this.discoveryMetadata(discovery, saved, size);
    const output: CatalogItem[] = [];
    for (const item of items) {
      if (EDITORIAL_IDS.includes(item.mangaId)) continue;
      const metadata =
        kind === "search"
          ? item.metadata
          : saved.excludeNSFW
            ? await this.classify(item.mangaId, item.title, saved)
            : item.metadata;
      if (kind === "search") this.remember(item);
      if (!saved.excludeNSFW || (metadata && isAllowed(metadata)))
        output.push(metadata ? { ...item, metadata } : item);
    }
    this.ensureCurrent(saved);
    return output;
  }
  private async catalog(
    url: string,
    kind: "search" | "latest",
    saved: Preferences,
    metadata?: Metadata,
  ): Promise<PagedResults<CatalogItem>> {
    const context = JSON.stringify([url, saved]);
    const previous = metadata as Cursor | undefined;
    let cursor: Pagination | undefined = previous?.context === context ? previous : undefined;
    let previousIds = previous?.context === context ? previous.ids : "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = parseCatalog(
        cursor
          ? await fetchNext(cursor)
          : kind === "latest"
            ? await this.home(saved)
            : await fetchText(url),
        kind,
        saved.excludeNSFW && kind === "search",
        cursor,
      );
      this.ensureCurrent(saved);
      const ids = result.items.map((item) => item.mangaId).join("|");
      if (ids && ids === previousIds) throw new Error("Mangasushi repeated a catalog page.");
      const discovery = kind === "latest" && (cursor ?? result.next);
      const items = await this.visible(
        result.items,
        kind,
        saved,
        discovery ? { ...discovery, page: cursor?.page ?? 0 } : undefined,
        kind === "latest" && saved.excludeNSFW && discovery && !cursor
          ? result.items.length + parseCatalog(await this.home(saved), "popular").items.length
          : undefined,
      );
      const next = result.next ? { ...result.next, context, ids } : undefined;
      if (items.length || !next) return { items, metadata: next };
      cursor = next;
      previousIds = ids;
    }
    throw new Error(
      "No visible titles in ten source pages. NSFW exclusion also hides unclassified titles; adjust source settings if desired.",
    );
  }
  async getDiscoverSections() {
    return SECTIONS;
  }
  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: Metadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const saved = this.saved();
    if (section.id === "popular") {
      const html = await this.home(saved);
      const result = parseCatalog(html, "popular");
      const latest = saved.excludeNSFW ? parseCatalog(html, "latest") : undefined;
      const items = await this.visible(
        result.items,
        "popular",
        saved,
        latest?.next ? { ...latest.next, page: 0 } : undefined,
        latest ? latest.items.length + result.items.length : undefined,
      );
      return { items: items.map((item) => ({ ...item, type: "simpleCarouselItem" as const })) };
    }
    if (section.id !== "latest") throw new Error("Unknown Mangasushi section.");
    const result = await this.catalog(`${BASE_URL}/`, "latest", saved, metadata);
    return {
      ...result,
      items: result.items.map((item) => ({ ...item, type: "simpleCarouselItem" as const })),
    };
  }
  async getSortingOptions() {
    return SORTS;
  }
  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata?: Metadata,
    sortingOption?: SortingOption,
  ) {
    const saved = this.saved();
    return this.catalog(
      searchUrl(query, saved.excludeNSFW, sortingOption),
      "search",
      saved,
      metadata,
    );
  }
  async getAdvancedSearchForm(query: SearchQuery<Metadata>) {
    return new MangaSushiSearchForm(
      query,
      parseGenreOptions(await fetchText(searchUrl({ title: "" }, true))),
    );
  }
  async getSettingsForm() {
    return new MangaSushiSettingsForm();
  }
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    if (EDITORIAL_IDS.includes(mangaId))
      throw new Error("This is a Mangasushi site announcement, not a manga series.");
    const saved = this.saved();
    const source = parseDetailBase(await fetchText(seriesUrl(mangaId)), mangaId);
    const metadata = await this.classify(mangaId, source.mangaInfo.primaryTitle, saved);
    this.ensureCurrent(saved);
    if (saved.excludeNSFW && (!metadata || !isAllowed(metadata)))
      throw new Error(
        "This title is hidden by NSFW exclusion or lacks reliable website classification. Change source settings to access it.",
      );
    return enrichDetails(source, metadata);
  }
  async getChapters(sourceManga: SourceManga) {
    const saved = this.saved();
    // Do not trust old library metadata: re-check the current content setting.
    await this.getMangaDetails(sourceManga.mangaId);
    const chapters = parseChapters(
      await fetchText(`${seriesUrl(sourceManga.mangaId)}ajax/chapters/`, ""),
      // Paperback requires the exact SourceManga instance supplied by the app.
      sourceManga,
      new Date(),
    );
    this.ensureCurrent(saved);
    return chapters;
  }
  async getChapterDetails(chapter: Chapter) {
    const saved = this.saved();
    if (chapter.additionalInfo?.locked === "true")
      throw new Error("This chapter requires access on the Mangasushi website.");
    await this.getMangaDetails(chapter.sourceManga.mangaId);
    const result = parseReader(
      await fetchText(seriesUrl(chapter.sourceManga.mangaId, chapter.chapterId)),
      chapter,
    );
    this.ensureCurrent(saved);
    return result;
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
        (domain === "mangasushi.org" || domain.endsWith(".mangasushi.org"))
      )
        this.cookies.setCookie(cookie);
    }
  }
}
export const MangaSushi = new MangaSushiExtension();
