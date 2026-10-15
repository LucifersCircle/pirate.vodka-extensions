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
  ContentRating,
} from "@paperback/types";
import { ManhwaNexSearchForm, ManhwaNexSettingsForm, preferences, readFilters } from "./forms";
import {
  BASE_URL,
  SECTIONS,
  SORTS,
  GENRES,
  type CatalogItem,
  type CatalogPage,
  type Cursor,
  type Preferences,
  type SeriesMetadata,
} from "./models";
import { fetchText, formEncode, ManhwaNexInterceptor, searchUrl } from "./network";
import {
  emptyMetadata,
  catalogPageNumber,
  chapterPages,
  enrichDetails,
  isAllowed,
  parseCatalog,
  parseChapters,
  parseDetails,
  parseGenreOptions,
  parseReader,
  seriesUrl,
  slug,
  validateCatalogUrl,
} from "./parsers";
import Config from "./pbconfig";

class ManhwaNexExtension implements ExtensionImpl<typeof Config> {
  private cookies = new CookieStorageInterceptor({ storage: "stateManager" });
  private interceptor = new ManhwaNexInterceptor("ManhwaNex.site");
  private rateLimiter = new BasicRateLimiter("ManhwaNex.rate", {
    numberOfRequests: 3,
    bufferInterval: 1,
    ignoreImages: true,
  });
  private context = "";
  private cache = new Map<string, { data: SeriesMetadata; expires: number }>();
  private pages = new Map<string, { data: string; expires: number }>();
  private pending = new Map<string, Promise<string>>();
  private pendingMetadata = new Map<string, Promise<void>>();
  async initialise() {
    this.cookies.registerInterceptor();
    this.interceptor.registerInterceptor();
    this.rateLimiter.registerInterceptor();
  }
  private saved(): Preferences {
    const saved = preferences(),
      context = JSON.stringify(saved);
    if (context !== this.context) {
      this.cache.clear();
      this.pages.clear();
      this.pending.clear();
      this.pendingMetadata.clear();
      this.context = context;
    }
    return saved;
  }
  private ensureCurrent(saved: Preferences) {
    if (JSON.stringify(saved) !== JSON.stringify(preferences()))
      throw new Error("ManhwaNex settings changed. Reload this page.");
  }
  private prune<T>(cache: Map<string, { data: T; expires: number }>, limit: number) {
    for (const [key, value] of cache) if (value.expires <= Date.now()) cache.delete(key);
    while (cache.size >= limit) cache.delete(cache.keys().next().value!);
  }
  private async page(url: string, saved: Preferences): Promise<string> {
    const cached = this.pages.get(url);
    if (cached && cached.expires > Date.now()) return cached.data;
    const pending = this.pending.get(url);
    if (pending) return pending;
    const request = (async () => {
      const data = await fetchText(url);
      this.ensureCurrent(saved);
      this.prune(this.pages, 32);
      this.pages.set(url, { data, expires: Date.now() + 5 * 60 * 1000 });
      return data;
    })();
    this.pending.set(url, request);
    try {
      return await request;
    } finally {
      if (this.pending.get(url) === request) this.pending.delete(url);
    }
  }
  private remember(items: CatalogItem[]) {
    for (const item of items) {
      this.prune(this.cache, 256);
      this.cache.set(item.mangaId, { data: item.metadata, expires: Date.now() + 5 * 60 * 1000 });
    }
  }
  private cached(id: string): SeriesMetadata | undefined {
    const value = this.cache.get(id);
    return value && value.expires > Date.now() ? value.data : undefined;
  }
  private async metadata(ids: string[], saved: Preferences): Promise<void> {
    const missing = [...new Set(ids)].filter((id) => !this.cached(id));
    if (!missing.length) return;
    for (const id of missing) slug(id);
    if (missing.length > 100) throw new Error("ManhwaNex metadata batch exceeds its safe size.");
    const key = JSON.stringify([saved, [...missing].sort()]);
    const pending = this.pendingMetadata.get(key);
    if (pending) return pending;
    const request = (async () => {
      // A single native search-card batch supplies metadata for the actual cards.
      // It does not crawl the catalog or fetch individual card details.
      const html = await fetchText(
        `${BASE_URL}/wp-admin/admin-ajax.php`,
        formEncode({
          action: "madara_load_more",
          page: -1,
          template: "madara-core/content/content-search",
          vars: {
            post_type: "wp-manga",
            posts_per_page: missing.length,
            template: "search",
            paged: 0,
            order: "DESC",
            orderby: "post_name__in",
            s: "",
            post_name__in: missing,
            ...(saved.excludeNSFW
              ? { meta_query: { relation: "AND", 0: { key: "manga_adult_content", value: "" } } }
              : {}),
          },
        }),
      );
      this.ensureCurrent(saved);
      const result: CatalogPage = html.trim()
        ? parseCatalog(html, "search", saved.excludeNSFW)
        : { items: [] };
      if (result.items.some((item) => !missing.includes(item.mangaId)))
        throw new Error("ManhwaNex ignored the bounded metadata query.");
      this.remember(result.items);
      for (const id of missing)
        if (!this.cached(id)) {
          this.prune(this.cache, 256);
          this.cache.set(id, { data: emptyMetadata(), expires: Date.now() + 5 * 60 * 1000 });
        }
    })();
    this.pendingMetadata.set(key, request);
    try {
      await request;
    } finally {
      if (this.pendingMetadata.get(key) === request) this.pendingMetadata.delete(key);
    }
  }
  private async visible(items: CatalogItem[], saved: Preferences): Promise<CatalogItem[]> {
    if (saved.excludeNSFW)
      await this.metadata(
        items.map((item) => item.mangaId),
        saved,
      );
    this.ensureCurrent(saved);
    return items.flatMap((item) => {
      const metadata = this.cached(item.mangaId) ?? item.metadata;
      return !saved.excludeNSFW || isAllowed(metadata)
        ? [
            {
              ...item,
              metadata,
              contentRating: metadata.adult ? ContentRating.ADULT : ContentRating.MATURE,
            },
          ]
        : [];
    });
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
      const html = await this.page(`${BASE_URL}/`, saved);
      const popular = parseCatalog(html, "popular");
      const latest = parseCatalog(html, "latest");
      if (saved.excludeNSFW)
        await this.metadata(
          [...popular.items, ...latest.items].map((item) => item.mangaId),
          saved,
        );
      const items = await this.visible(popular.items, saved);
      return { items: items.map((item) => ({ ...item, type: "simpleCarouselItem" as const })) };
    }
    if (section.id !== "latest") throw new Error("Unknown ManhwaNex section.");
    const result = await this.catalog(`${BASE_URL}/`, "latest", saved, metadata);
    return {
      ...result,
      items: result.items.map((item) => ({ ...item, type: "simpleCarouselItem" as const })),
    };
  }
  private async catalog(
    root: string,
    kind: "latest" | "search",
    saved: Preferences,
    metadata?: Metadata,
  ): Promise<PagedResults<CatalogItem>> {
    const context = JSON.stringify([root, saved]),
      previous = metadata as Cursor | undefined;
    let url = previous?.context === context ? validateCatalogUrl(previous.url, root, 1) : root;
    let seen = previous?.context === context && Array.isArray(previous.seen) ? previous.seen : [];
    for (let attempt = 0; attempt < 20; attempt++) {
      const html = await this.page(url, saved);
      const result = parseCatalog(html, kind, saved.excludeNSFW && kind === "search", url);
      if (result.items.length && result.items.every((item) => seen.includes(item.mangaId)))
        throw new Error("ManhwaNex repeated a catalog page.");
      if (kind === "search") this.remember(result.items);
      else if (saved.excludeNSFW && catalogPageNumber(url) === 1) {
        const popular = parseCatalog(html, "popular");
        await this.metadata(
          [...popular.items, ...result.items].map((item) => item.mangaId),
          saved,
        );
      }
      const items = (await this.visible(result.items, saved)).filter(
        (item) => !seen.includes(item.mangaId),
      );
      seen = [...seen, ...result.items.map((item) => item.mangaId)];
      this.ensureCurrent(saved);
      if (items.length || !result.next)
        return { items, metadata: result.next ? { context, url: result.next, seen } : undefined };
      url = result.next;
    }
    throw new Error(
      "No visible titles in twenty source pages. Unknown website classifications are hidden by NSFW exclusion.",
    );
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
    if (saved.excludeNSFW && readFilters(query.metadata).adult === "1") return { items: [] };
    return this.catalog(
      searchUrl(query, saved.excludeNSFW, sortingOption),
      "search",
      saved,
      metadata,
    );
  }
  async getAdvancedSearchForm(query: SearchQuery<Metadata>) {
    const saved = this.saved();
    return new ManhwaNexSearchForm(
      query,
      parseGenreOptions(await this.page(searchUrl({ title: "" }, true), saved)),
    );
  }
  async getSettingsForm() {
    return new ManhwaNexSettingsForm();
  }
  async getMangaDetails(mangaId: string) {
    const saved = this.saved();
    const source = parseDetails(await this.page(seriesUrl(mangaId), saved), mangaId);
    await this.metadata([mangaId], saved);
    this.ensureCurrent(saved);
    const metadata = this.cached(mangaId);
    const detailGenres =
      source.mangaInfo.tagGroups?.find((group) => group.id === "genres")?.tags ?? [];
    if (
      saved.excludeNSFW &&
      (!metadata ||
        !isAllowed(metadata) ||
        source.mangaInfo.contentRating === ContentRating.ADULT ||
        !detailGenres.length ||
        detailGenres.some((genre) => !GENRES.includes(genre.id)))
    )
      throw new Error(
        "This title is hidden by NSFW exclusion or lacks reliable website classification. Change source settings to access it.",
      );
    const result = enrichDetails(source, metadata);
    if (metadata?.adult) result.mangaInfo.contentRating = ContentRating.ADULT;
    return result;
  }
  async getChapters(sourceManga: Parameters<ExtensionImpl<typeof Config>["getChapters"]>[0]) {
    const saved = this.saved();
    await this.getMangaDetails(sourceManga.mangaId);
    const pages = [1],
      seen = new Set<number>(),
      chapters: Chapter[] = [];
    while (pages.length) {
      const page = pages.shift()!;
      if (seen.has(page)) continue;
      seen.add(page);
      if (seen.size > 100) throw new Error("ManhwaNex chapter pagination exceeded its safe limit.");
      const html = await fetchText(`${seriesUrl(sourceManga.mangaId)}ajax/chapters/?t=${page}`, "");
      chapters.push(...parseChapters(html, sourceManga, new Date()));
      for (const next of chapterPages(html))
        if (!seen.has(next) && !pages.includes(next)) pages.push(next);
      pages.sort((a, b) => a - b);
    }
    if ([...seen].some((page, index) => page !== index + 1))
      throw new Error("ManhwaNex returned incomplete chapter pagination.");
    if (new Set(chapters.map((chapter) => chapter.chapterId)).size !== chapters.length)
      throw new Error("ManhwaNex repeated a chapter page.");
    this.ensureCurrent(saved);
    return chapters.map((chapter, index) => ({
      ...chapter,
      sortingIndex: chapters.length - index,
    }));
  }
  async getChapterDetails(chapter: Chapter) {
    const saved = this.saved();
    if (chapter.additionalInfo?.locked === "true")
      throw new Error("This chapter requires access on the ManhwaNex website.");
    await this.getMangaDetails(chapter.sourceManga.mangaId);
    const result = parseReader(
      await fetchText(seriesUrl(chapter.sourceManga.mangaId, chapter.chapterId)),
      chapter,
    );
    this.ensureCurrent(saved);
    this.interceptor.issuePages(result.pages, chapter.sourceManga.mangaId);
    return result;
  }
  async cloudflareBypassCompleted(
    _request: Request,
    cookies: Cookie[],
    _localStorage: Record<string, string>,
  ) {
    for (const cookie of cookies)
      if (cookie.name === "cf_clearance" && cookie.domain.replace(/^\./, "") === "manhwanex.com")
        this.cookies.setCookie(cookie);
  }
}
export const ManhwaNex = new ManhwaNexExtension();
