/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  BasicRateLimiter,
  ContentRating,
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
import {
  MangaSushiSearchForm,
  MangaSushiGenreForm,
  MangaSushiSettingsForm,
  preferences,
  readFilters,
  readGenreRoute,
} from "./forms";
import {
  BASE_URL,
  BLOCKED_GENRES,
  GENRE_ROUTE_KEY,
  type HomeGenre,
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
  emptyMetadata,
  parseGenreArchive,
  parseHomeGenres,
  validateGenreQuery,
  validateGenreFilter,
  isAllowed,
  parseCatalog,
  parseChapters,
  parseDetailBase,
  parseGenreOptions,
  parseReader,
  seriesUrl,
} from "./parsers";
import Config from "./pbconfig";
import {
  issueImages,
  beginImageEvidence,
  observeImageEvidence,
  imageEvidenceAllowed,
  type ImageEvidence,
} from "./images";
import { englishTitle, searchTitle } from "./titles";

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
  private evidence = new WeakMap<SeriesMetadata, ImageEvidence>();
  private observed = new WeakSet<SeriesMetadata>();
  private homeEvidence?: ImageEvidence;
  private markPage(page: CatalogPage, evidence: ImageEvidence): CatalogPage {
    for (const item of page.items) this.evidence.set(item.metadata, evidence);
    return page;
  }
  private inheritEvidence(data: SeriesMetadata, original: SeriesMetadata): SeriesMetadata {
    const evidence = this.evidence.get(original);
    if (evidence) this.evidence.set(data, evidence);
    if (this.observed.has(original)) this.observed.add(data);
    return data;
  }
  private homeCache?: { data: string; expires: number };
  private pendingHome?: Promise<string>;
  private discoveryCache = new Map<string, { data: CatalogPage; expires: number }>();
  private pendingDiscovery = new Map<string, Promise<CatalogPage>>();
  private genrePages = new Map<string, { data: CatalogPage; expires: number }>();
  private pendingGenres = new Map<string, Promise<CatalogPage>>();
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
      this.genrePages.clear();
      this.pendingGenres.clear();
      this.cacheContext = context;
    }
    return saved;
  }
  private ensureCurrent(saved: Preferences) {
    if (JSON.stringify(saved) !== JSON.stringify(preferences()))
      throw new Error("Mangasushi settings changed. Reload this page.");
  }
  private remember(item: CatalogItem) {
    const evidence = this.evidence.get(item.metadata);
    if (!evidence) throw new Error("Mangasushi metadata has no source evidence.");
    const previous = this.cache.get(item.mangaId);
    const previousEvidence = previous ? this.evidence.get(previous.data) : undefined;
    if (
      previousEvidence?.generation === evidence.generation &&
      (previousEvidence.sequence > evidence.sequence ||
        (previousEvidence.sequence === evidence.sequence &&
          previous?.data.adult &&
          !item.metadata.adult))
    )
      return;
    // Preserve the released non-sliding warning window before publishing the
    // effective classification. A later response must not silently erase it.
    const warning =
      previous?.data.adult &&
      previous.expires > Date.now() &&
      previousEvidence?.generation === evidence.generation;
    const data = warning
      ? this.inheritEvidence({ ...item.metadata, adult: true }, item.metadata)
      : item.metadata;
    if (!this.observed.has(item.metadata)) {
      const accepted = observeImageEvidence(item.mangaId, isAllowed(data), evidence);
      // A delayed warning rejected by the shared ordering must not seed a new
      // local warning window and later turn into fresh contrary evidence.
      if (!accepted && data.adult) return;
      this.observed.add(item.metadata);
      this.observed.add(data);
    }
    this.cache.set(item.mangaId, {
      data,
      expires: warning ? previous.expires : evidence.at + 5 * 60 * 1000,
    });
  }
  private observeWarnings(items: CatalogItem[], expected?: CatalogItem[]) {
    for (const item of items) {
      if (!item.metadata.adult) continue;
      const cached = this.cache.get(item.mangaId);
      const previous = cached && cached.expires > Date.now() ? cached.data : undefined;
      // A failed bounded batch must not populate unrelated cold metadata.
      if (expected && !previous && !expected.some((entry) => entry.mangaId === item.mangaId))
        continue;
      this.remember({
        ...item,
        metadata: this.inheritEvidence(
          { ...(previous ?? item.metadata), adult: true },
          item.metadata,
        ),
      });
    }
  }
  private ensureAllowed(saved: Preferences, mangaId: string) {
    const cached = this.cache.get(mangaId);
    if (
      saved.excludeNSFW &&
      (!cached ||
        cached.expires <= Date.now() ||
        !isAllowed(cached.data) ||
        !imageEvidenceAllowed(mangaId, this.evidence.get(cached.data)))
    )
      throw new Error(
        "This title is hidden by NSFW exclusion or lacks reliable website classification.",
      );
  }
  private async home(saved: Preferences): Promise<string> {
    if (this.homeCache && this.homeCache.expires > Date.now()) return this.homeCache.data;
    if (this.pendingHome) return this.pendingHome;
    const request = (async () => {
      const evidence = beginImageEvidence();
      const data = await fetchText(`${BASE_URL}/`);
      this.homeEvidence = evidence;
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
    expected?: CatalogItem[],
    genre?: HomeGenre,
  ): Promise<void> {
    const original = cursor.vars;
    if (genre) validateGenreQuery(original, genre);
    // Use the site's own latest-update query and native search template: the
    // search rows include actual genres for the whole discovery page at once.
    if (
      original.meta_key !== "_latest_update" ||
      original.orderby !== "meta_value_num" ||
      (original.order !== "desc" && original.order !== "DESC")
    )
      throw new Error("Mangasushi discovery metadata query changed.");
    const count = genre && expected ? expected.length : (size ?? Number(original.posts_per_page));
    if (!Number.isSafeInteger(count) || count < 1 || count > 100 || (genre && count > 12))
      throw new Error("Mangasushi discovery page size changed.");
    const metadataCursor: Pagination = {
      page: genre ? 0 : cursor.page,
      template: "madara-core/content/content-search",
      vars: {
        ...original,
        s: "",
        template: "search",
        posts_per_page: String(count),
        // Adult filtering can shift offset-based archive pages. The verified
        // native ID batch stays on this exact raw page while retaining taxonomy.
        ...(genre && expected
          ? {
              post_name__in: expected.map((item) => item.mangaId),
              orderby: "post_name__in",
              paged: 1,
            }
          : {}),
        manga_archives_item_layout: "default",
        // This is the site's adult=0 clause. Explicit tags (including Ecchi)
        // and missing genres are still excluded after the native filter.
        meta_query: saved.excludeNSFW
          ? {
              relation: "AND",
              0: original.meta_query ?? { relation: "AND" },
              1: { key: "manga_adult_content", value: "" },
            }
          : (original.meta_query ?? { relation: "AND" }),
      },
    };
    const key = JSON.stringify([saved, metadataCursor, expected?.map((item) => item.mangaId)]);
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
      const evidence = beginImageEvidence();
      const result = this.markPage(
        parseCatalog(await fetchNext(metadataCursor), "search", saved.excludeNSFW, metadataCursor),
        evidence,
      );
      this.ensureCurrent(saved);
      this.observeWarnings(result.items, expected);
      if (expected) {
        const ids = expected.map((item) => item.mangaId);
        if (
          result.items.some((item) => !ids.includes(item.mangaId)) ||
          result.items.some(
            (item, index, all) =>
              index && ids.indexOf(item.mangaId) <= ids.indexOf(all[index - 1].mangaId),
          ) ||
          (genre &&
            result.items.some(
              (item) => !item.metadata.genres.some((entry) => entry.id === genre.id),
            ))
        )
          throw new Error("Mangasushi ignored the bounded genre metadata query.");
        // A source adult filter may omit a card. Its metadata remains unknown,
        // never a reason for a per-title fallback or a broadened batch.
        for (const item of expected)
          if (!result.items.some((entry) => entry.mangaId === item.mangaId)) {
            const cached = this.cache.get(item.mangaId);
            const previous = cached && cached.expires > Date.now() ? cached.data : emptyMetadata();
            this.remember({
              ...item,
              metadata: this.inheritEvidence(
                {
                  ...previous,
                  nativeSafe: false,
                  adult: previous.adult || item.metadata.adult,
                },
                this.markPage({ items: [item] }, evidence).items[0].metadata,
              ),
            });
          }
      }
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
    let lastEvidence: ImageEvidence | undefined;
    for (const term of new Set([title, shortTitle])) {
      let evidence = beginImageEvidence();
      lastEvidence = evidence;
      let result = this.markPage(
        parseCatalog(
          await fetchText(searchUrl({ title: term }, saved.excludeNSFW)),
          "search",
          saved.excludeNSFW,
        ),
        evidence,
      );
      let previousIds = "";
      for (let page = 0; page < 10; page++) {
        this.ensureCurrent(saved);
        const ids = result.items.map((item) => item.mangaId).join("|");
        if (ids && ids === previousIds)
          throw new Error("Mangasushi repeated a classification page.");
        for (const item of result.items) this.remember(item);
        const exact = result.items.find((item) => item.mangaId === mangaId);
        if (exact) return this.cache.get(mangaId)?.data ?? exact.metadata;
        if (!result.next) break;
        if (page === 9) throw new Error("Mangasushi classification search exceeded ten pages.");
        previousIds = ids;
        evidence = beginImageEvidence();
        lastEvidence = evidence;
        result = this.markPage(
          parseCatalog(await fetchNext(result.next), "search", saved.excludeNSFW, result.next),
          evidence,
        );
      }
    }
    if (lastEvidence) observeImageEvidence(mangaId, false, lastEvidence);
    return undefined;
  }
  private async visible(
    items: CatalogItem[],
    kind: "search" | "popular" | "latest",
    saved: Preferences,
    discovery?: Pagination,
    size?: number,
  ): Promise<CatalogItem[]> {
    const missing = items.some((item) => {
      const cached = this.cache.get(item.mangaId);
      return !cached || cached.expires <= Date.now();
    });
    this.observeWarnings(items);
    if (kind !== "search" && discovery && missing)
      await this.discoveryMetadata(discovery, saved, size);
    const output: CatalogItem[] = [];
    for (const item of items) {
      if (EDITORIAL_IDS.includes(item.mangaId)) continue;
      const cached = this.cache.get(item.mangaId);
      const classified =
        kind === "search"
          ? item.metadata
          : saved.excludeNSFW
            ? await this.classify(item.mangaId, item.title, saved)
            : cached && cached.expires > Date.now()
              ? cached.data
              : item.metadata;
      if (kind === "search") this.remember(item);
      const current = this.cache.get(item.mangaId);
      const metadata = classified
        ? this.inheritEvidence(
            {
              ...classified,
              adult:
                classified.adult ||
                item.metadata.adult ||
                (current && current.expires > Date.now() && current.data.adult) === true,
            },
            classified,
          )
        : undefined;
      if (
        !saved.excludeNSFW ||
        (metadata &&
          isAllowed(metadata) &&
          imageEvidenceAllowed(item.mangaId, this.evidence.get(metadata)))
      )
        output.push(metadata ? { ...item, metadata } : item);
    }
    this.ensureCurrent(saved);
    this.issueCovers(output, saved);
    return output;
  }
  private issueCovers(items: CatalogItem[], saved: Preferences) {
    issueImages(
      items.map((item) => ({
        url: item.imageUrl,
        id: item.mangaId,
        allowed: isAllowed(item.metadata),
        evidence: this.evidence.get(item.metadata),
      })),
      saved,
    );
  }
  private async catalog(
    url: string,
    kind: "search" | "latest",
    saved: Preferences,
    metadata?: Metadata,
    filters = readFilters(),
  ): Promise<PagedResults<CatalogItem>> {
    const context = JSON.stringify([url, saved]);
    const previous = metadata as Cursor | undefined;
    let cursor: Pagination | undefined = previous?.context === context ? previous : undefined;
    let previousIds = previous?.context === context ? previous.ids : "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const evidence = cursor || kind === "search" ? beginImageEvidence() : undefined;
      const html = cursor
        ? await fetchNext(cursor)
        : kind === "latest"
          ? await this.home(saved)
          : await fetchText(url);
      const result = this.markPage(
        parseCatalog(html, kind, saved.excludeNSFW && kind === "search", cursor),
        evidence ?? this.homeEvidence!,
      );
      this.ensureCurrent(saved);
      if (kind === "search") {
        // Even an invalid provider filter can reveal a real contrary warning.
        // Retain that positive evidence before surfacing the integrity error.
        this.observeWarnings(result.items);
        validateGenreFilter(html, result, filters, !!cursor);
      }
      const ids = result.items.map((item) => item.mangaId).join("|");
      if (ids && ids === previousIds) throw new Error("Mangasushi repeated a catalog page.");
      const discovery = kind === "latest" && (cursor ?? result.next);
      const items = await this.visible(
        result.items,
        kind,
        saved,
        discovery ? { ...discovery, page: cursor?.page ?? 0 } : undefined,
        kind === "latest" && discovery && !cursor
          ? result.items.length + parseCatalog(await this.home(saved), "popular").items.length
          : undefined,
      );
      const next = result.next ? { ...result.next, context, ids } : undefined;
      if (items.length || !next)
        return {
          items: items.map((item) => ({
            ...item,
            title: englishTitle(item.mangaId, item.title, [item.metadata.alternative]),
          })),
          metadata: next,
        };
      cursor = next;
      previousIds = ids;
    }
    throw new Error(
      "No visible titles in ten source pages. NSFW exclusion also hides unclassified titles; adjust source settings if desired.",
    );
  }
  private async genrePage(
    genre: HomeGenre,
    saved: Preferences,
    cursor?: Pagination,
  ): Promise<CatalogPage> {
    if (cursor) {
      validateGenreQuery(cursor.vars, genre);
      if (
        !Number.isSafeInteger(cursor.page) ||
        cursor.page < 1 ||
        cursor.page > 1000 ||
        cursor.template !== "madara-core/content/content-archive"
      )
        throw new Error("Invalid Mangasushi genre archive continuation.");
    }
    const key = JSON.stringify([saved, genre.id, cursor]);
    const cached = this.genrePages.get(key);
    if (cached && cached.expires > Date.now()) return cached.data;
    const pending = this.pendingGenres.get(key);
    if (pending) return pending;
    const request = (async () => {
      const evidence = beginImageEvidence();
      const result = this.markPage(
        parseGenreArchive(
          cursor ? await fetchNext(cursor) : await fetchText(genre.url, undefined, true),
          genre,
          cursor,
        ),
        evidence,
      );
      this.ensureCurrent(saved);
      for (const [key, value] of this.genrePages)
        if (value.expires <= Date.now()) this.genrePages.delete(key);
      while (this.genrePages.size >= 32)
        this.genrePages.delete(this.genrePages.keys().next().value!);
      this.genrePages.set(key, { data: result, expires: Date.now() + 5 * 60 * 1000 });
      return result;
    })();
    this.pendingGenres.set(key, request);
    try {
      return await request;
    } finally {
      if (this.pendingGenres.get(key) === request) this.pendingGenres.delete(key);
    }
  }
  private async genreResults(
    genre: HomeGenre,
    saved: Preferences,
    metadata?: Metadata,
  ): Promise<PagedResults<CatalogItem>> {
    const context = JSON.stringify([genre.url, saved]);
    const previous = metadata as Cursor | undefined;
    let cursor: Pagination | undefined =
      previous?.context === context
        ? { page: previous.page, template: previous.template, vars: previous.vars }
        : undefined;
    const history = previous?.context === context ? previous.seen : undefined;
    if (
      previous?.context === context &&
      (!Array.isArray(history) ||
        history.length > 12000 ||
        history.some(
          (id) =>
            typeof id !== "string" ||
            !/^[a-zA-Z0-9][a-zA-Z0-9%_-]*$/.test(id) ||
            /%2f|%5c|%00/i.test(id),
        ) ||
        new Set(history).size !== history.length)
    )
      throw new Error("Invalid Mangasushi genre archive history.");
    const seen = new Set(history ?? []);
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await this.genrePage(genre, saved, cursor);
      const missing = result.items.some((item) => {
        const cached = this.cache.get(item.mangaId);
        return !cached || cached.expires <= Date.now();
      });
      // Persist contrary raw evidence before awaiting any unrelated batch.
      this.observeWarnings(result.items);
      if (missing && result.items.length) {
        const native =
          cursor ??
          result.next ??
          (result.query
            ? { page: 0, template: "madara-core/content/content-archive", vars: result.query }
            : undefined);
        if (!native) throw new Error("Mangasushi genre archive metadata query is unavailable.");
        await this.discoveryMetadata(
          { ...native, page: cursor?.page ?? 0 },
          saved,
          Number(native.vars.posts_per_page),
          result.items,
          genre,
        );
      }
      this.ensureCurrent(saved);
      const items: CatalogItem[] = [];
      for (const item of result.items) {
        const cached = this.cache.get(item.mangaId);
        const data = cached && cached.expires > Date.now() ? cached.data : emptyMetadata();
        const metadata = this.inheritEvidence(
          { ...data, adult: data.adult || item.metadata.adult },
          data,
        );
        if (metadata.classified && !metadata.genres.some((entry) => entry.id === genre.id))
          throw new Error("Mangasushi returned metadata for a different genre archive.");
        if (
          !seen.has(item.mangaId) &&
          !EDITORIAL_IDS.includes(item.mangaId) &&
          (!saved.excludeNSFW ||
            (isAllowed(metadata) &&
              imageEvidenceAllowed(item.mangaId, this.evidence.get(metadata))))
        )
          items.push({
            ...item,
            metadata,
            title: englishTitle(item.mangaId, item.title, [metadata.alternative]),
            contentRating: metadata.adult ? ContentRating.ADULT : ContentRating.MATURE,
          });
        seen.add(item.mangaId);
      }
      const next = result.next
        ? {
            ...result.next,
            context,
            ids: result.items.map((item) => item.mangaId).join("|"),
            seen: [...seen],
          }
        : undefined;
      if (items.length || !next) {
        this.issueCovers(items, saved);
        return { items, metadata: next };
      }
      cursor = { page: next.page, template: next.template, vars: next.vars };
    }
    throw new Error(
      "Mangasushi genre archive made no visible progress in ten source pages. Reload or adjust source settings.",
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
    if (section.id === "genres") {
      const genres = parseHomeGenres(await this.home(saved));
      this.ensureCurrent(saved);
      return {
        items: genres
          .filter((genre) => !saved.excludeNSFW || !BLOCKED_GENRES.includes(genre.id))
          .map((genre) => ({
            type: "genresCarouselItem" as const,
            name: genre.title,
            searchQuery: {
              title: `Genre: ${genre.title}`,
              metadata: { [GENRE_ROUTE_KEY]: genre.id },
            },
          })),
      };
    }
    if (section.id === "popular") {
      const html = await this.home(saved);
      const result = this.markPage(parseCatalog(html, "popular"), this.homeEvidence!);
      const latest = parseCatalog(html, "latest");
      const items = await this.visible(
        result.items,
        "popular",
        saved,
        latest?.next ? { ...latest.next, page: 0 } : undefined,
        latest ? latest.items.length + result.items.length : undefined,
      );
      return {
        items: items.map((item) => ({
          ...item,
          title: englishTitle(item.mangaId, item.title, [item.metadata.alternative]),
          type: "simpleCarouselItem" as const,
        })),
      };
    }
    if (section.id !== "latest") throw new Error("Unknown Mangasushi section.");
    const result = await this.catalog(`${BASE_URL}/`, "latest", saved, metadata);
    return {
      ...result,
      items: result.items.map((item) => ({ ...item, type: "simpleCarouselItem" as const })),
    };
  }
  async getSortingOptions(query?: SearchQuery<Metadata>) {
    return readGenreRoute(query?.metadata) ? [] : SORTS;
  }
  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata?: Metadata,
    sortingOption?: SortingOption,
  ) {
    const saved = this.saved();
    const genreId = readGenreRoute(query.metadata);
    if (genreId) {
      const genre = parseHomeGenres(await this.home(saved)).find((genre) => genre.id === genreId);
      if (!genre || (saved.excludeNSFW && BLOCKED_GENRES.includes(genre.id)))
        throw new Error("This Mangasushi genre archive is unavailable under current settings.");
      return this.genreResults(genre, saved, metadata);
    }
    return this.catalog(
      searchUrl({ ...query, title: searchTitle(query.title) }, saved.excludeNSFW, sortingOption),
      "search",
      saved,
      metadata,
      readFilters(query.metadata),
    );
  }
  async getAdvancedSearchForm(query: SearchQuery<Metadata>) {
    const id = readGenreRoute(query.metadata);
    if (id) return new MangaSushiGenreForm(id);
    readFilters(query.metadata);
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
    if (saved.excludeNSFW && (!metadata || !isAllowed(metadata))) {
      throw new Error(
        "This title is hidden by NSFW exclusion or lacks reliable website classification. Change source settings to access it.",
      );
    }
    this.ensureAllowed(saved, mangaId);
    const result = enrichDetails(source, metadata);
    issueImages(
      [
        {
          url: result.mangaInfo.thumbnailUrl,
          id: mangaId,
          allowed: !!metadata && isAllowed(metadata),
          evidence: metadata ? this.evidence.get(metadata) : undefined,
        },
      ],
      saved,
    );
    const original = result.mangaInfo.primaryTitle;
    const alternatives = result.mangaInfo.secondaryTitles ?? [];
    const title = englishTitle(mangaId, original, metadata ? [metadata.alternative] : alternatives);
    return {
      ...result,
      mangaInfo: {
        ...result.mangaInfo,
        primaryTitle: title,
        secondaryTitles: [
          ...new Set([
            ...(title !== original ? [original] : []),
            ...(source.mangaInfo.secondaryTitles ?? []),
            ...alternatives,
          ]),
        ],
      },
    };
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
    this.ensureAllowed(saved, sourceManga.mangaId);
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
    this.ensureAllowed(saved, chapter.sourceManga.mangaId);
    const metadata = this.cache.get(chapter.sourceManga.mangaId)?.data;
    if (!("pages" in result)) throw new Error("Mangasushi returned unsupported reader content.");
    issueImages(
      result.pages.map((url) => ({
        url,
        id: chapter.sourceManga.mangaId,
        chapterId: chapter.chapterId,
        allowed: !!metadata && isAllowed(metadata),
        evidence: metadata ? this.evidence.get(metadata) : undefined,
      })),
      saved,
    );
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
