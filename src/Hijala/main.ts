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
  fetch: (url: string) => Promise<string>,
  metadata?: Metadata,
): Promise<PagedResults<T>> => {
  const context = JSON.stringify([url(1), saved]);
  let cursor = metadata;
  let page = pageNumber(cursor, context);
  for (let attempt = 0; attempt < 10; attempt++, page++) {
    const result = continuation(parse(await fetch(url(page))), page, context, cursor);
    const items = result.items.filter((item) => matchesPreferences(item, saved));
    if (items.length || !result.metadata) return { items, metadata: result.metadata };
    cursor = result.metadata;
  }
  throw new Error("No visible titles in ten catalog pages. Adjust your source filters.");
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
    const excludedGenres = saved.excludeNSFW
      ? parseGenreOptions(await this.text(`${BASE_URL}/series`))
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
      if (metadata) return { items: [] };
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
    return new HijalaSearchForm(query, parseGenreOptions(await this.text(`${BASE_URL}/series`)));
  }

  async getSettingsForm() {
    return new HijalaSettingsForm(parseGenreOptions(await this.text(`${BASE_URL}/series`)));
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
