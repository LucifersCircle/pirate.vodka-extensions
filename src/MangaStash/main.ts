/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  BasicRateLimiter,
  type Chapter,
  type DiscoverSection,
  type DiscoverSectionItem,
  type ExtensionImpl,
  type Metadata,
  type PagedResults,
  type SearchQuery,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";
import Config from "./pbconfig";
import {
  BASE_URL,
  SECTIONS,
  SORTS,
  nativeRating,
  type Card,
  type Preferences,
  type Rating,
} from "./models";
import { MangaStashSearchForm, MangaStashSettingsForm, preferences, nativeAllowed } from "./forms";
import {
  chapterURL,
  continuation,
  pageNumber,
  queryScope,
  readFilters,
  searchURL,
  seriesURL,
  validId,
} from "./urls";
import {
  parseCatalog,
  parseDetails,
  parseHome,
  distinctHomeSections,
  parseReader,
  type Detail,
} from "./parsers";
import { fetchText, MangaStashInterceptor } from "./network";
import { issueImages, observe } from "./images";
type Cached = { html: string; at: number };
type Cursor = { context: string; next: string; seen: string[]; page: number };
export class MangaStashExtension implements ExtensionImpl<typeof Config> {
  private interceptor = new MangaStashInterceptor("MangaStash.site");
  private rateLimiter = new BasicRateLimiter("MangaStash.rate", {
    numberOfRequests: 2,
    bufferInterval: 1,
    ignoreImages: true,
  });
  private cache = new Map<string, Cached>();
  private pending = new Map<string, Promise<Cached>>();
  private revision = -1;
  async initialise() {
    preferences();
    this.interceptor.registerInterceptor();
    Application.setRedirectHandler(Application.Selector(this.interceptor, "handleRedirect"));
    this.rateLimiter.registerInterceptor();
  }
  private current(saved: Preferences) {
    if (JSON.stringify(saved) !== JSON.stringify(preferences()))
      throw new Error("MangaStash settings changed during this request; reload.");
  }
  private async text(url: string, saved: Preferences): Promise<Cached> {
    this.current(saved);
    if (this.revision !== saved.revision) {
      this.cache.clear();
      this.pending.clear();
      this.revision = saved.revision;
    }
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.at < 180000) return cached;
    const pending = this.pending.get(url);
    if (pending) return pending;
    const request = (async () => {
      const at = Date.now(),
        html = await fetchText(url);
      this.current(saved);
      const value = { html, at };
      this.cache.set(url, value);
      while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
      return value;
    })();
    this.pending.set(url, request);
    try {
      return await request;
    } finally {
      if (this.pending.get(url) === request) this.pending.delete(url);
    }
  }
  private visible(items: Card[], saved: Preferences, at: number): Card[] {
    let sourceVisible = 0;
    const result = items.flatMap((item) => {
      const rating = observe(item.mangaId, item.sourceRating, at);
      if (saved.onlySafe && (rating !== "safe" || item.sourceRating !== "safe")) return [];
      sourceVisible++;
      if (!nativeAllowed(rating) || !nativeAllowed(item.sourceRating)) return [];
      issueImages([item.imageUrl], item.mangaId, item.sourceRating, saved, at);
      return [{ ...item, contentRating: nativeRating(rating) }];
    });
    if (items.length && !sourceVisible)
      throw new Error(
        "Only explicitly Safe titles excludes this feed: MangaStash does not label every listing. Turn that optional source setting off to see unclassified listings with a Mature compatibility badge.",
      );
    if (sourceVisible > 0 && !result.length)
      throw new Error(
        "Paperback’s native content-rating filters exclude this feed. Unclassified and Suggestive listings use Mature compatibility, not a verified Safe label. Adjust the app’s rating filters to view them.",
      );
    this.current(saved);
    return result;
  }
  private allowed(id: string, rating: Rating, saved: Preferences, at: number) {
    const current = observe(id, rating, at);
    this.current(saved);
    if (saved.onlySafe && (rating !== "safe" || current !== "safe"))
      throw new Error(
        "This title is excluded by Only explicitly Safe titles; an explicit source Safe label is required.",
      );
    if (!nativeAllowed(rating) || !nativeAllowed(current))
      throw new Error("This title is excluded by Paperback’s native content-rating filters.");
    return current;
  }
  private async detail(id: string, saved: Preferences): Promise<{ detail: Detail; at: number }> {
    const response = await this.text(seriesURL(id), saved),
      detail = parseDetails(response.html, id),
      rating = this.allowed(id, detail.rating, saved, response.at);
    detail.source.mangaInfo.contentRating = nativeRating(rating);
    if (rating !== detail.rating)
      detail.source.mangaInfo.additionalInfo = {
        ...detail.source.mangaInfo.additionalInfo,
        effectiveContentRating: rating,
        classificationProvenance:
          "A retained source warning takes precedence over the current response label until fresh evidence expires.",
      };
    issueImages([detail.source.mangaInfo.thumbnailUrl], id, detail.rating, saved, response.at);
    return { detail, at: response.at };
  }
  async getDiscoverSections() {
    const saved = preferences(),
      response = await this.text(BASE_URL + "/", saved);
    const sections = distinctHomeSections(parseHome(response.html));
    this.current(saved);
    return sections;
  }
  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: Metadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    if (!SECTIONS.some((s) => s.id === section?.id)) throw new Error("Unknown MangaStash section.");
    if (metadata !== undefined)
      throw new Error("MangaStash homepage feeds are finite snapshots without pagination.");
    const saved = preferences(),
      response = await this.text(BASE_URL + "/", saved),
      home = parseHome(response.html);
    return {
      items: this.visible(home[section.id], saved, response.at).map((item) => ({
        mangaId: item.mangaId,
        title: item.title,
        imageUrl: item.imageUrl,
        contentRating: item.contentRating,
        type: "simpleCarouselItem" as const,
      })),
    };
  }
  async getSortingOptions(query?: SearchQuery<Metadata>) {
    readFilters(query?.metadata);
    return query?.title?.trim() ? [] : SORTS;
  }
  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata?: Metadata,
    sorting?: SortingOption,
  ): Promise<PagedResults<Card>> {
    if (
      sorting !== undefined &&
      (!sorting || typeof sorting !== "object" || typeof sorting.id !== "string")
    )
      throw new Error("Invalid MangaStash sort.");
    const initial = searchURL(query.title, query.metadata, sorting?.id),
      saved = preferences(),
      context = JSON.stringify([initial, saved]);
    queryScope(initial);
    let url = initial,
      seen: string[] = [];
    if (metadata !== undefined) {
      const c = metadata as unknown as Cursor;
      if (
        !c ||
        typeof c !== "object" ||
        Array.isArray(c) ||
        c.context !== context ||
        typeof c.next !== "string" ||
        !Number.isSafeInteger(c.page) ||
        c.page < 2 ||
        c.page > 10000 ||
        !Array.isArray(c.seen) ||
        !c.seen.length ||
        c.seen.length > 100000 ||
        c.seen.some((id) => !validId(id)) ||
        new Set(c.seen).size !== c.seen.length ||
        queryScope(c.next) !== queryScope(initial) ||
        pageNumber(c.next) !== c.page
      )
        throw new Error("Invalid or stale MangaStash pagination; refresh the search.");
      url = c.next;
      seen = [...c.seen];
    }
    const response = await this.text(url, saved),
      result = parseCatalog(response.html, url),
      ids = result.items.map((i) => i.mangaId);
    if (ids.some((id) => seen.includes(id)))
      throw new Error("MangaStash repeated catalog identities across pages; refresh.");
    seen.push(...ids);
    const items = this.visible(result.items, saved, response.at);
    const next = result.next
      ? { context, next: continuation(result.next, url), seen, page: pageNumber(url) + 1 }
      : undefined;
    return { items, metadata: next };
  }
  async getAdvancedSearchForm(query: SearchQuery<Metadata>) {
    readFilters(query.metadata);
    return new MangaStashSearchForm(query);
  }
  async getSettingsForm() {
    return new MangaStashSettingsForm();
  }
  async getMangaDetails(id: string): Promise<SourceManga> {
    return (await this.detail(id, preferences())).detail.source;
  }
  async getChapters(source: SourceManga): Promise<Chapter[]> {
    if (!source || typeof source !== "object" || !source.mangaInfo || !validId(source.mangaId))
      throw new Error("MangaStash requires the native SourceManga object.");
    const { detail } = await this.detail(source.mangaId, preferences());
    // Validate the complete inventory in parseDetails before exposing only public rows.
    return detail.chapters
      .filter((c) => c.additionalInfo?.locked !== "true")
      .map((c, sortingIndex) => ({ ...c, sortingIndex, sourceManga: source }));
  }
  async getChapterDetails(chapter: Chapter) {
    if (
      !chapter ||
      typeof chapter !== "object" ||
      !chapter.sourceManga?.mangaInfo ||
      !validId(chapter.sourceManga.mangaId) ||
      typeof chapter.chapterId !== "string" ||
      !Number.isFinite(chapter.chapNum)
    )
      throw new Error("MangaStash requires the native Chapter object.");
    const url = chapterURL(chapter.chapterId, chapter.sourceManga.mangaId);
    if (chapter.additionalInfo?.locked === "true")
      throw new Error("This MangaStash chapter requires website access.");
    const saved = preferences(),
      { detail, at } = await this.detail(chapter.sourceManga.mangaId, saved),
      entry = detail.chapters.find((c) => c.chapterId === chapter.chapterId);
    if (!entry || entry.chapNum !== chapter.chapNum)
      throw new Error("MangaStash chapter is absent from the current series inventory.");
    if (entry.additionalInfo?.locked === "true")
      throw new Error("This MangaStash chapter requires website access.");
    const response = await this.text(url, saved),
      result = parseReader(response.html, {
        ...chapter,
        sourceManga: { ...chapter.sourceManga, mangaInfo: detail.source.mangaInfo },
      });
    this.allowed(chapter.sourceManga.mangaId, detail.rating, saved, at);
    if (!("pages" in result)) throw new Error("Unsupported MangaStash reader.");
    issueImages(
      result.pages,
      chapter.sourceManga.mangaId,
      detail.rating,
      saved,
      Math.min(at, response.at),
      chapter.chapterId,
    );
    return result;
  }
}
export const MangaStash = new MangaStashExtension();
