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
import {
  HijalaSearchForm,
  HijalaSettingsForm,
  preferences,
  matchesPreferences,
  queryWithPreferences,
  blockedGenre,
  preferenceRevision,
  readFilters,
} from "./forms";
import {
  API_URL,
  BASE_URL,
  PAGE_SIZE,
  SECTIONS,
  SORTS,
  type Post,
  type Preferences,
} from "./models";
import { catalogUrl, feedUrl, fetchText, HijalaInterceptor } from "./network";
import {
  parseChapters,
  parseDetails,
  parseDiscover,
  parseFeatured,
  parseGenreOptions,
  parseReader,
  parseSearch,
  catalog,
  pageProperty,
  searchItem,
  slugToId,
  parseDate,
  chapterTitle,
  idToSlug,
  seriesUrl,
} from "./parsers";
import Config from "./pbconfig";

// The native metadata contract includes null; empty JSON records also mean no cursor.
// Nonempty or malformed values retain the existing continuation handling.
const firstPage = (metadata: unknown): boolean => {
  if (metadata == null) return true;
  if (typeof metadata !== "object" || Array.isArray(metadata) || Reflect.ownKeys(metadata).length)
    return false;
  const prototype = Object.getPrototypeOf(metadata);
  if (prototype === null) return true;
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  return (
    Object.getPrototypeOf(prototype) === null &&
    typeof constructor === "function" &&
    constructor.prototype === prototype &&
    Function.prototype.toString.call(constructor) === Function.prototype.toString.call(Object)
  );
};

const MAX_CATALOG_ITEMS = 10_000;
const MAX_CATALOG_PAGES = 1_000;
const catalogId = (value: unknown): value is string => {
  if (typeof value !== "string" || !value || value.length > 2_048) return false;
  try {
    return slugToId(idToSlug(value)) === value;
  } catch {
    return false;
  }
};
type CatalogCursor = { context: string; page: number; ids: string; seen: string[]; total: number };

const catalogCursor = (
  metadata: Metadata | undefined,
  context: string,
): CatalogCursor | undefined => {
  const cursor = metadata as Partial<CatalogCursor> | undefined;
  return cursor?.context === context &&
    Number.isSafeInteger(cursor.page) &&
    Number(cursor.page) > 1 &&
    Number(cursor.page) <= MAX_CATALOG_PAGES &&
    Number.isSafeInteger(cursor.total) &&
    Number(cursor.total) > 0 &&
    Number(cursor.total) <= MAX_CATALOG_ITEMS &&
    typeof cursor.ids === "string" &&
    cursor.ids.length <= PAGE_SIZE * 2_049 &&
    cursor.ids.split("|").length <= PAGE_SIZE &&
    cursor.ids.split("|").every(catalogId) &&
    Array.isArray(cursor.seen) &&
    cursor.seen.length > 0 &&
    cursor.seen.length < Number(cursor.total) &&
    cursor.seen.length <= MAX_CATALOG_ITEMS &&
    cursor.seen.every(catalogId) &&
    new Set(cursor.seen).size === cursor.seen.length &&
    cursor.ids.split("|").every((id) => cursor.seen!.includes(id))
    ? (cursor as CatalogCursor)
    : undefined;
};

const loadCatalog = async <T extends { metadata?: unknown }>(
  url: (page: number) => string,
  parse: (text: string) => PagedResults<T>,
  saved: Preferences,
  fetch: (url: string) => Promise<string>,
  metadata?: Metadata,
): Promise<PagedResults<T>> => {
  const context = JSON.stringify([url(1), saved, preferenceRevision()]);
  const cursor = catalogCursor(metadata, context);
  const seen = new Set<string>(cursor?.seen ?? []);
  let page = cursor?.page ?? 1;
  let expectedTotal = cursor?.total;
  for (let attempt = 0; attempt < 10; attempt++, page++) {
    if (page > MAX_CATALOG_PAGES)
      throw new Error("Hijala catalog traversal exceeded its bound; refresh to continue.");
    const result = parse(await fetch(url(page)));
    const { total, count, ids } = result.metadata as { total: number; count: number; ids: string };
    const entries = result.items.map((item) => ({
      item,
      id: (item as { mangaId?: unknown }).mangaId,
    }));
    // chaptersCount can return its complete catalog despite perPage. A complete first
    // response is terminal, so it never creates an oversized paginated cursor.
    const completeFirstResponse = page === 1 && count === total;
    if (
      total > MAX_CATALOG_ITEMS ||
      (count > PAGE_SIZE && !completeFirstResponse) ||
      count !== result.items.length ||
      !entries.every((entry) => catalogId(entry.id))
    )
      throw new Error("Hijala returned an invalid or oversized catalog; refresh to continue.");
    expectedTotal ??= total;
    if (expectedTotal !== total)
      throw new Error("Hijala catalog changed during pagination; refresh to continue.");
    if (!count && seen.size < total)
      throw new Error(
        "Hijala returned an empty page before the end of its catalog; refresh to continue.",
      );
    // A changing catalog can overlap physical pages, including an entirely repeated page.
    // Keep the cursor immutable and count every raw identity, even titles hidden by settings.
    const items = entries
      .filter(({ item, id }) => !seen.has(id as string) && matchesPreferences(item, saved))
      .map(({ item }) => item);
    for (const { id } of entries) seen.add(id as string);
    if (seen.size > total)
      throw new Error("Hijala returned an inconsistent catalog count; refresh to continue.");
    const next: CatalogCursor | undefined =
      seen.size < total ? { page: page + 1, context, ids, seen: [...seen], total } : undefined;
    if (next && page >= MAX_CATALOG_PAGES)
      throw new Error("Hijala catalog traversal exceeded its bound; refresh to continue.");
    if (items.length || !next) return { items, metadata: next };
  }
  throw new Error(
    "No new visible titles in ten catalog pages. Refresh or adjust your source filters.",
  );
};

export class HijalaExtension implements ExtensionImpl<typeof Config> {
  private cookies = new CookieStorageInterceptor({ storage: "stateManager" });
  private interceptor = new HijalaInterceptor("Hijala.site");
  private rateLimiter = new BasicRateLimiter("Hijala.rate", {
    numberOfRequests: 3,
    bufferInterval: 1,
    ignoreImages: true,
  });
  private revision = preferenceRevision();
  private cache = new Map<string, { at: number; text: string }>();
  private pending = new Map<string, Promise<string>>();

  private async withPreferences<T>(operation: (saved: Preferences) => Promise<T>): Promise<T> {
    const revision = preferenceRevision();
    const saved = preferences();
    const result = await operation(saved);
    if (
      revision !== preferenceRevision() ||
      JSON.stringify(saved) !== JSON.stringify(preferences())
    )
      throw new Error("Hijala settings changed during this request; refresh to continue.");
    return result;
  }

  private async text(url: string): Promise<string> {
    const revision = preferenceRevision();
    if (this.revision !== revision) {
      this.revision = revision;
      this.cache.clear();
      this.pending.clear();
    }
    for (const [key, value] of this.cache)
      if (Date.now() - value.at >= 180_000) this.cache.delete(key);
    const cached = this.cache.get(url);
    if (cached) return cached.text;
    const pending = this.pending.get(url);
    if (pending) return pending;
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
    const request = fetchText(url);
    this.pending.set(url, request);
    try {
      const text = await request;
      if (revision !== preferenceRevision())
        throw new Error("Hijala settings changed during this request; refresh to continue.");
      this.cache.set(url, { at: Date.now(), text });
      return text;
    } finally {
      if (this.pending.get(url) === request) this.pending.delete(url);
    }
  }

  private async home(): Promise<string> {
    const html = await this.text(`${BASE_URL}/`);
    const filters = pageProperty<string[]>(html, "latestReleaseFilters");
    if (!Array.isArray(filters) || filters.some((id) => !["latest", "new"].includes(id)))
      throw new Error("Hijala home release filters changed.");
    return html;
  }

  private async bulkMetadata(): Promise<Map<string, Post>> {
    const posts = new Map<string, Post>();
    let total: number | undefined;
    // The public endpoint caps perPage at 100. Traverse complete batches, never N+1 tiles.
    for (let page = 1; page <= 10; page++) {
      const data = catalog(
        await this.text(
          `${API_URL}/api/query?page=${page}&perPage=100&orderBy=lastChapterAddedAt&orderDirection=desc`,
        ),
      );
      total ??= data.totalCount;
      if (
        total !== data.totalCount ||
        data.posts.length !== Math.min(100, total - (page - 1) * 100)
      )
        throw new Error("Hijala returned incomplete bulk metadata.");
      for (const post of data.posts) {
        if (posts.has(post.slug)) throw new Error("Hijala repeated a bulk metadata page.");
        posts.set(post.slug, post);
      }
      if (posts.size === total) return posts;
    }
    throw new Error("Hijala bulk metadata exceeded its bounded catalog traversal.");
  }

  private async effectiveQuery(query: SearchQuery<Metadata>, saved: Preferences) {
    // Validate saved constraints before even the default-on safety taxonomy request.
    readFilters(query.metadata);
    const excludedGenres = saved.excludeNSFW
      ? parseGenreOptions(await this.text(`${BASE_URL}/series/`))
          .filter((genre) => blockedGenre(genre.title))
          .map((genre) => genre.id)
      : [];
    return queryWithPreferences(query, {
      ...saved,
      excludedGenres: [...new Set([...saved.excludedGenres, ...excludedGenres])],
    });
  }

  private assertAllowed(html: string, saved: Preferences): void {
    if (!matchesPreferences(searchItem(pageProperty<Post>(html, "post")), saved))
      throw new Error("This title is excluded by your Hijala content settings.");
  }

  async initialise() {
    this.cookies.registerInterceptor();
    this.interceptor.registerInterceptor();
    this.rateLimiter.registerInterceptor();
  }

  async getDiscoverSections() {
    return this.withPreferences(async (saved) => {
      const filters = pageProperty<string[]>(await this.home(), "latestReleaseFilters");
      return SECTIONS.filter(
        (section) =>
          saved.sections.includes(section.id) &&
          (!["latest", "new"].includes(section.id) || filters.includes(section.id)),
      );
    });
  }

  async getDiscoverSectionItems(section: DiscoverSection, metadata?: Metadata) {
    return this.withPreferences(async (saved): Promise<PagedResults<DiscoverSectionItem>> => {
      if (!SECTIONS.some((item) => item.id === section.id))
        throw new Error("Unknown Hijala section.");
      if (!saved.sections.includes(section.id)) return { items: [] };
      const html = await this.home();
      const enabled = pageProperty<string[]>(html, "latestReleaseFilters");
      if (["latest", "new"].includes(section.id) && !enabled.includes(section.id))
        return { items: [] };
      if (section.id === "new" || section.id === "latest") {
        const pinned = pageProperty<boolean>(html, "hasPinnedSeriesSection");
        if (typeof pinned !== "boolean")
          throw new Error("Hijala home pinned-series configuration changed.");
        return loadCatalog(
          (page) => feedUrl(section.id, page, pinned ? "latestUpdate" : "latestUpdatePinned"),
          parseDiscover,
          saved,
          (url) => this.text(url),
          metadata,
        );
      }
      // These are exact, bounded home snapshots. Catalog search is separate, not a fictitious page 2.
      if (!firstPage(metadata)) return { items: [] };
      if (section.id === "featured")
        return { items: parseFeatured(html).filter((item) => matchesPreferences(item, saved)) };
      const full = await this.bulkMetadata();
      if (section.id === "popular") {
        const posts = pageProperty<{ slug: string; title: string; coverImage: string }[]>(
          html,
          "transformedTopSeries",
        );
        if (!Array.isArray(posts) || new Set(posts.map((post) => post.slug)).size !== posts.length)
          throw new Error("Hijala returned invalid popular home series.");
        return {
          items: posts.slice(0, 9).flatMap((post) => {
            const metadata = full.get(post.slug);
            if (!metadata) return [];
            if (
              metadata.postTitle.trim() !== post.title.trim() ||
              metadata.featuredImage !== post.coverImage
            )
              throw new Error("Hijala popular metadata disagrees with the home page.");
            const item = { ...searchItem(metadata), type: "simpleCarouselItem" as const };
            return matchesPreferences(item, saved) ? [item] : [];
          }),
        };
      }
      const updates = pageProperty<
        {
          seriesSlug: string;
          seriesTitle: string;
          seriesImage: string;
          chapterSlug: string;
          chapterNumber: number;
          chapterTitle: string;
          updatedAt: string;
          isPaid: boolean;
        }[]
      >(html, "chapterUpdates");
      if (!Array.isArray(updates)) throw new Error("Hijala returned invalid home chapter updates.");
      const seen = new Set<string>();
      return {
        items: updates.flatMap((update): DiscoverSectionItem[] => {
          if (!Number.isFinite(update.chapterNumber) || typeof update.isPaid !== "boolean")
            throw new Error("Hijala returned incomplete home update access status.");
          const identity = `${slugToId(update.seriesSlug)}/${slugToId(update.chapterSlug)}`;
          if (seen.has(identity))
            throw new Error("Hijala returned duplicate home chapter updates.");
          seen.add(identity);
          const post = full.get(update.seriesSlug);
          if (!post) return [];
          if (
            post.postTitle.trim() !== update.seriesTitle.trim() ||
            post.featuredImage !== update.seriesImage
          )
            throw new Error("Hijala update metadata disagrees with the home page.");
          const item = searchItem(post);
          const result: DiscoverSectionItem = {
            ...item,
            type: "chapterUpdatesCarouselItem",
            chapterId: slugToId(update.chapterSlug),
            subtitle: `${update.isPaid ? "[Paid] " : ""}Chapter ${update.chapterNumber}${chapterTitle(update.chapterTitle, update.chapterNumber) ? `: ${chapterTitle(update.chapterTitle, update.chapterNumber)}` : ""}`,
            publishDate: parseDate(update.updatedAt, new Date()),
            metadata: { ...item.metadata, paid: update.isPaid },
          };
          return matchesPreferences(result, saved) ? [result] : [];
        }),
      };
    });
  }

  async getSortingOptions() {
    return SORTS.map(({ id, label }) => ({ id, label }));
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata?: Metadata,
    sortingOption?: SortingOption,
  ) {
    return this.withPreferences(async (saved) => {
      const effective = await this.effectiveQuery(query, saved);
      if (!effective) return { items: [] };
      return loadCatalog(
        (page) => catalogUrl(effective, page, sortingOption),
        parseSearch,
        saved,
        (url) => this.text(url),
        metadata,
      );
    });
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>) {
    readFilters(query.metadata);
    return new HijalaSearchForm(query, parseGenreOptions(await this.text(`${BASE_URL}/series/`)));
  }

  async getSettingsForm() {
    return new HijalaSettingsForm(parseGenreOptions(await this.text(`${BASE_URL}/series/`)));
  }

  async getMangaDetails(mangaId: string) {
    return this.withPreferences(async (saved) => {
      const html = await this.text(seriesUrl(mangaId));
      this.assertAllowed(html, saved);
      return parseDetails(html, mangaId);
    });
  }

  async getChapters(sourceManga: SourceManga) {
    if (
      !sourceManga ||
      typeof sourceManga !== "object" ||
      typeof sourceManga.mangaId !== "string" ||
      !sourceManga.mangaId ||
      !sourceManga.mangaInfo
    )
      throw new Error("Hijala requires the native SourceManga object.");
    return this.withPreferences(async (saved) => {
      const html = await this.text(seriesUrl(sourceManga.mangaId));
      this.assertAllowed(html, saved);
      return parseChapters(html, sourceManga, new Date()).filter(
        (chapter) => !saved.hidePaid || chapter.additionalInfo?.locked !== "true",
      );
    });
  }

  async getChapterDetails(chapter: Chapter) {
    if (
      !chapter ||
      typeof chapter !== "object" ||
      typeof chapter.chapterId !== "string" ||
      !chapter.chapterId ||
      !chapter.sourceManga ||
      typeof chapter.sourceManga !== "object" ||
      typeof chapter.sourceManga.mangaId !== "string" ||
      !chapter.sourceManga.mangaId
    )
      throw new Error("Hijala requires the native Chapter object.");
    if (chapter.additionalInfo?.locked === "true")
      throw new Error("This chapter requires access on the Hijala website.");
    return this.withPreferences(async (saved) => {
      this.assertAllowed(await this.text(seriesUrl(chapter.sourceManga.mangaId)), saved);
      return parseReader(
        await this.text(seriesUrl(chapter.sourceManga.mangaId, chapter.chapterId)),
        chapter,
      );
    });
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
