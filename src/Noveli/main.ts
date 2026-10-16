/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  BasicRateLimiter,
  type Chapter,
  type ChapterDetails,
  type DiscoverSection,
  type DiscoverSectionItem,
  type ExtensionImpl,
  type Metadata,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
  type SourceManga,
} from "@paperback/types";
import Config from "./pbconfig";
import {
  envelope,
  BASE_URL,
  CACHE_MS,
  SECTIONS,
  SORTS,
  firstPage,
  nativeRating,
  record,
  text,
  validId,
} from "./models";
import {
  catalogURL,
  chapterListURL,
  detailURL,
  readCursor,
  readFilters,
  readerURL,
  sortId,
} from "./urls";
import { ContentPolicy, currentPolicy, nativeAllowed, nativePolicy } from "./policy";
import { fetchJSON, NoveliInterceptor } from "./network";
import {
  parseCard,
  parseCatalog,
  parseChapters,
  parseDetail,
  parseRankings,
  parseReader,
  parseTaxonomy,
  type Card,
  type Detail,
} from "./parsers";
import { NoveliSearchForm } from "./forms";
type Cached = { data: unknown; at: number };
export class NoveliExtension implements ExtensionImpl<typeof Config> {
  private policy = new ContentPolicy();
  private interceptor = new NoveliInterceptor("Noveli.site", this.policy);
  private rateLimiter = new BasicRateLimiter("Noveli.rate", {
    numberOfRequests: 2,
    bufferInterval: 1,
    ignoreImages: true,
  });
  private cache = new Map<string, Cached>();
  private pending = new Map<string, Promise<Cached>>();
  async initialise() {
    nativePolicy();
    this.interceptor.registerInterceptor();
    Application.setRedirectHandler(Application.Selector(this.interceptor, "handleRedirect"));
    this.rateLimiter.registerInterceptor();
  }
  private async response(url: string, saved: string, cache = true): Promise<Cached> {
    currentPolicy(saved);
    const key = saved + ":" + url,
      cached = this.cache.get(key);
    if (cache && cached && Date.now() >= cached.at && Date.now() - cached.at < CACHE_MS)
      return cached;
    const inFlight = cache ? this.pending.get(key) : undefined;
    if (inFlight) {
      const value = await inFlight;
      currentPolicy(saved);
      return value;
    }
    const request = (async () => {
      const data = await fetchJSON(url);
      currentPolicy(saved);
      const value = { data, at: Date.now() };
      if (cache) {
        this.cache.delete(key);
        this.cache.set(key, value);
        while (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
      }
      return value;
    })();
    if (cache) this.pending.set(key, request);
    try {
      return await request;
    } finally {
      if (this.pending.get(key) === request) this.pending.delete(key);
    }
  }
  private visible(cards: Card[], saved: string, at: number): SearchResultItem[] {
    currentPolicy(saved);
    for (const card of cards) this.policy.observe(card.mangaId, card.sourceRating, at);
    const result: SearchResultItem[] = [];
    for (const card of cards) {
      const rating = this.policy.observe(card.mangaId, card.sourceRating, at);
      if (!nativeAllowed(rating)) continue;
      this.policy.issue(card.imageUrl, card.mangaId, card.sourceRating, at);
      result.push({
        mangaId: card.mangaId,
        title: card.title,
        imageUrl: card.imageUrl,
        contentRating: nativeRating(rating),
        ...(card.subtitle ? { subtitle: card.subtitle } : {}),
      });
    }
    currentPolicy(saved);
    return result;
  }
  private async detail(id: string, saved: string): Promise<{ detail: Detail; at: number }> {
    const response = await this.response(detailURL(id), saved),
      detail = parseDetail(response.data, id);
    currentPolicy(saved);
    detail.source.mangaInfo.contentRating = this.policy.badge(id, detail.rating, response.at);
    this.policy.issue(detail.source.mangaInfo.thumbnailUrl, id, detail.rating, response.at);
    return { detail, at: response.at };
  }
  private async inventory(detail: Detail, saved: string): Promise<Chapter[]> {
    const response = await this.response(chapterListURL(detail.slug), saved);
    currentPolicy(saved);
    return parseChapters(response.data, detail.source, detail.inventory);
  }
  private async validateGenres(genres: string[], saved: string): Promise<void> {
    if (!genres.length) return;
    const response = await this.response(BASE_URL + "/api/novels/tags", saved),
      taxonomy = parseTaxonomy(response.data);
    if (genres.some((genre) => !taxonomy.includes(genre)))
      throw new Error("Unknown Noveli genre or tag; refresh the search form.");
    currentPolicy(saved);
  }
  async getDiscoverSections(): Promise<DiscoverSection[]> {
    nativePolicy();
    return SECTIONS.map((section) => ({ ...section }));
  }
  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: Metadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    if (!section || !SECTIONS.some((entry) => entry.id === section.id))
      throw new Error("Unknown Noveli discovery section.");
    if (section.id === "catalog") {
      const result = await this.search({ title: "" }, metadata, undefined, "discover:catalog");
      return {
        items: result.items.map((item) => ({
          mangaId: item.mangaId,
          title: item.title,
          imageUrl: item.imageUrl,
          contentRating: item.contentRating,
          subtitle: item.subtitle,
          type: "simpleCarouselItem" as const,
        })),
        metadata: result.metadata,
      };
    }
    if (!firstPage(metadata))
      throw new Error("Noveli’s ranking sections are finite lists without pagination.");
    const saved = nativePolicy(),
      response = await this.response(BASE_URL + "/api/novels/rankings", saved),
      rankings = parseRankings(response.data);
    for (const cards of Object.values(rankings))
      for (const card of cards) this.policy.observe(card.mangaId, card.sourceRating, response.at);
    return {
      items: this.visible(rankings[section.id], saved, response.at).map((item) => ({
        mangaId: item.mangaId,
        title: item.title,
        imageUrl: item.imageUrl,
        contentRating: item.contentRating,
        subtitle: item.subtitle,
        type: "simpleCarouselItem" as const,
      })),
    };
  }
  async getSortingOptions(query?: SearchQuery<Metadata>): Promise<SortingOption[]> {
    if (query !== undefined) {
      record(query);
      text(query.title, true);
      readFilters(query.metadata);
    }
    nativePolicy();
    return SORTS.map((option) => ({ ...option }));
  }
  private async search(
    query: SearchQuery<Metadata>,
    metadata?: Metadata,
    sorting?: SortingOption,
    scope = "search",
  ): Promise<PagedResults<SearchResultItem>> {
    record(query);
    const title = text(query.title, true).trim(),
      filters = readFilters(query.metadata),
      sort = sortId(sorting),
      saved = nativePolicy();
    const context = JSON.stringify([scope, title, filters, sort, saved]),
      cursor = readCursor(metadata, context);
    // Structural filters, sort and concrete cursor are rejected before any request,
    // including the dynamic taxonomy lookup.
    await this.validateGenres(filters.genres, saved);
    const seen = [...cursor.seen],
      prior = new Set(seen);
    // A native filter must not make an intermediate physical page look terminal.
    // Bounded advance avoids hiding later eligible rows or issuing unbounded traffic.
    for (let advance = 0; advance < 3; advance++) {
      const page = cursor.page + advance;
      if (page > 10000) throw new Error("Noveli pagination limit reached; narrow your search.");
      const response = await this.response(catalogURL(title, filters, sort, page), saved),
        result = parseCatalog(response.data, page);
      if (result.items.some((item) => prior.has(item.mangaId)))
        throw new Error("Noveli repeated novel identities across pages; refresh.");
      for (const item of result.items) {
        prior.add(item.mangaId);
        seen.push(item.mangaId);
      }
      const items = this.visible(result.items, saved, response.at);
      if (items.length || !result.more)
        return {
          items,
          metadata: result.more ? { context, page: page + 1, seen } : undefined,
        };
    }
    throw new Error(
      "Paperback’s content filters excluded three Noveli pages. Narrow your search or review the app’s content filters.",
    );
  }
  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata?: Metadata,
    sorting?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    return this.search(query, metadata, sorting);
  }
  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<NoveliSearchForm> {
    record(query);
    text(query.title, true);
    const filters = readFilters(query.metadata),
      saved = nativePolicy();
    const response = await this.response(BASE_URL + "/api/novels/tags", saved),
      taxonomy = parseTaxonomy(response.data);
    if (filters.genres.some((genre) => !taxonomy.includes(genre)))
      throw new Error("Unknown Noveli genre or tag; reset search filters.");
    currentPolicy(saved);
    return new NoveliSearchForm(query, taxonomy);
  }
  async getMangaDetails(id: string): Promise<SourceManga> {
    return (await this.detail(id, nativePolicy())).detail.source;
  }
  async getChapters(source: SourceManga): Promise<Chapter[]> {
    if (!source || !source.mangaInfo || !validId(source.mangaId))
      throw new Error("Noveli requires a native SourceManga with a numeric ID.");
    const saved = nativePolicy(),
      { detail, at } = await this.detail(source.mangaId, saved),
      chapters = await this.inventory(detail, saved);
    currentPolicy(saved);
    this.policy.allowed(source.mangaId, detail.rating, at);
    return chapters.map((chapter) => ({ ...chapter, sourceManga: source }));
  }
  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    if (
      !chapter ||
      !chapter.sourceManga?.mangaInfo ||
      !validId(chapter.sourceManga.mangaId) ||
      !validId(chapter.chapterId) ||
      typeof chapter.chapNum !== "number" ||
      !Number.isFinite(chapter.chapNum) ||
      chapter.chapNum < 0
    )
      throw new Error("Noveli requires a native Chapter with canonical numeric identities.");
    const saved = nativePolicy(),
      id = chapter.sourceManga.mangaId,
      { detail, at } = await this.detail(id, saved),
      chapters = await this.inventory(detail, saved);
    const entry = chapters.find((candidate) => candidate.chapterId === chapter.chapterId);
    if (!entry || entry.chapNum !== chapter.chapNum)
      throw new Error("This exact Noveli chapter is absent from the current novel inventory.");
    this.policy.allowed(id, detail.rating, at);
    currentPolicy(saved);
    // Do not cache prose. Each transition rechecks the actual public reader response;
    // the bounded metadata/inventory cache avoids repeatedly downloading every row.
    const response = await this.response(readerURL(id, entry.chapterId), saved, false),
      result = parseReader(response.data, entry, detail.slug);
    currentPolicy(saved);
    this.policy.allowed(id, detail.rating, at);
    const readerNovel = parseCard(envelope(response.data).novel);
    this.policy.allowed(id, readerNovel.sourceRating, response.at);
    return result;
  }
}
export const Noveli = new NoveliExtension();
