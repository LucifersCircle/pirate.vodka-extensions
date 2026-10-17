/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  BasicRateLimiter,
  DiscoverSectionType,
  type Chapter,
  type ChapterDetails,
  type DiscoverSection,
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
  DOMAIN,
  id,
  parseCatalog,
  parseDetail,
  parseReader,
  parseSearch,
  type Detail,
} from "./MarumaruParser";
import { documentParts } from "./MarumaruURLs";
import { renderedHTML } from "./renderedTransport";
import { MarumaruInterceptor } from "./network";
import {
  allowed,
  badge,
  currentPolicy,
  issue,
  nativePolicy,
  observe,
  requireAllowed,
} from "./policy";
import { chapters, sourceManga } from "./mapping";

type Cached = { detail: Detail; at: number };
type Cursor = { scope: string; url: string; at: number };
const empty = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value) || Reflect.ownKeys(value).length)
    return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) return true;
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  return (
    Object.getPrototypeOf(prototype) === null &&
    typeof constructor === "function" &&
    constructor.prototype === prototype &&
    Function.prototype.toString.call(constructor) === Function.prototype.toString.call(Object)
  );
};
export class MarumaruExtension implements ExtensionImpl<typeof Config> {
  private readonly interceptor = new MarumaruInterceptor("Marumaru.site");
  private readonly rateLimiter = new BasicRateLimiter("Marumaru.rate", {
    numberOfRequests: 1,
    bufferInterval: 1,
    ignoreImages: true,
  });
  private readonly cache = new Map<string, Cached>();
  private readonly cursors = new Map<string, Cursor>();
  private sequence = 0;
  async initialise() {
    this.interceptor.registerInterceptor();
    Application.setRedirectHandler(Application.Selector(this.interceptor, "handleRedirect"));
    this.rateLimiter.registerInterceptor();
  }
  private async detail(work: string, saved: string): Promise<Cached> {
    id(work);
    currentPolicy(saved);
    let cached = this.cache.get(work);
    if (!cached || cached.at + 60000 <= Date.now()) {
      const html = await renderedHTML(`${DOMAIN}/manhwa/${work}`);
      cached = { detail: parseDetail(html, work), at: Date.now() };
      this.cache.set(work, cached);
      while (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value!);
    }
    currentPolicy(saved);
    const adult = requireAllowed(work, cached.detail.explicitlyAdult, cached.at);
    issue(cached.detail.cover, work, adult, cached.at);
    return { detail: { ...cached.detail, explicitlyAdult: adult }, at: cached.at };
  }
  async getDiscoverSections(): Promise<DiscoverSection[]> {
    nativePolicy();
    return [{ id: "catalog", title: "Manga", type: DiscoverSectionType.simpleCarousel }];
  }
  async getDiscoverSectionItems(section: DiscoverSection, metadata?: Metadata) {
    if (section?.id !== "catalog") throw new Error("Unknown Marumaru section.");
    const result = await this.getSearchResults({ title: "" }, metadata);
    return {
      items: result.items.map((item) => ({
        mangaId: item.mangaId,
        title: item.title,
        imageUrl: item.imageUrl,
        contentRating: item.contentRating,
        type: "simpleCarouselItem" as const,
      })),
      metadata: result.metadata,
    };
  }
  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata?: Metadata,
    sorting?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    if (
      !query ||
      typeof query !== "object" ||
      (query.title !== undefined && typeof query.title !== "string") ||
      !empty(query.metadata) ||
      sorting != null
    )
      throw new Error("Unsupported Marumaru search options.");
    const title = query.title?.trim() ?? "";
    if (title.length > 300) throw new Error("Marumaru search is too long.");
    const saved = nativePolicy(),
      scope = JSON.stringify([title, saved]);
    let url = title
      ? `${DOMAIN}/search?q=${encodeURIComponent(title)}&kind=manhwa`
      : `${DOMAIN}/manhwa`;
    if (!empty(metadata)) {
      if (
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata) ||
        typeof metadata.cursor !== "string" ||
        Object.keys(metadata).some((key) => key !== "cursor")
      )
        throw new Error("Invalid Marumaru continuation.");
      const cursor = this.cursors.get(metadata.cursor);
      if (!cursor || cursor.scope !== scope || cursor.at + 600000 <= Date.now())
        throw new Error("Marumaru continuation expired or changed; restart search.");
      url = cursor.url;
    }
    const html = await renderedHTML(url),
      at = Date.now();
    currentPolicy(saved);
    const listing = title ? parseSearch(html, url) : parseCatalog(html, url);
    const items: SearchResultItem[] = [];
    for (const card of listing.items) {
      const adult = observe(card.id, false, at);
      if (!allowed(adult)) continue;
      issue(card.cover, card.id, adult, at);
      items.push({
        mangaId: card.id,
        title: card.title,
        imageUrl: card.cover,
        contentRating: badge(adult),
      });
    }
    currentPolicy(saved);
    if (listing.items.length && !items.length)
      throw new Error(
        "Paperback's content filters exclude this Marumaru page. Unclassified titles use Mature compatibility, not a source age rating.",
      );
    let next: Metadata | undefined;
    if (listing.next) {
      const parsed = documentParts(listing.next);
      if (Number(parsed.query.page) > 10000)
        throw new Error("Marumaru continuation exceeds its page limit.");
      const key = `${Date.now()}:${++this.sequence}`;
      this.cursors.set(key, { scope, url: listing.next, at });
      while (this.cursors.size > 128) this.cursors.delete(this.cursors.keys().next().value!);
      next = { cursor: key };
    }
    return { items, metadata: next };
  }
  async getMangaDetails(work: string): Promise<SourceManga> {
    return sourceManga((await this.detail(work, nativePolicy())).detail);
  }
  async getChapters(source: SourceManga): Promise<Chapter[]> {
    if (!source?.mangaInfo) throw new Error("Native Marumaru SourceManga is required.");
    return chapters((await this.detail(source.mangaId, nativePolicy())).detail, source);
  }
  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    if (!chapter?.sourceManga?.mangaInfo) throw new Error("Native Marumaru Chapter is required.");
    const work = id(chapter.sourceManga.mangaId),
      episode = id(chapter.chapterId),
      saved = nativePolicy();
    const { detail, at } = await this.detail(work, saved);
    const selected = detail.chapters.find((entry) => entry.id === episode);
    if (!selected || selected.sourceNumber !== chapter.chapNum)
      throw new Error("Marumaru chapter identity does not match its current title inventory.");
    const pages = parseReader(await renderedHTML(`${DOMAIN}/manhwa/${work}/${episode}`), episode);
    currentPolicy(saved);
    requireAllowed(work, detail.explicitlyAdult, at);
    for (const page of pages) issue(page, work, detail.explicitlyAdult, at, episode);
    return { id: episode, mangaId: work, pages };
  }
}
export const Marumaru = new MarumaruExtension();
