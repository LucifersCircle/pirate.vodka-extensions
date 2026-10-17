/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
import {
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
  parseListing,
  parseWork,
  parseDetail,
  parseReader,
  readerURL,
  type APIDetail,
} from "./MarumaruAPI";
import { fetchJSON, MarumaruInterceptor, MarumaruRateLimiter } from "./network";
import {
  allowed,
  badge,
  batchPolicy,
  currentPolicy,
  issue,
  nativePolicy,
  observe,
  requireAllowed,
} from "./policy";
import { chapters, sourceManga } from "./mapping";
type Cached = { detail: APIDetail; at: number; sourceAdult: boolean };
type Cursor = { scope: string; page: number; at: number };
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
  private readonly rateLimiter = new MarumaruRateLimiter("Marumaru.rate", {
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
      const metadata = parseWork(await fetchJSON(`${DOMAIN}/api/works/${work}`), work),
        at = Date.now();
      currentPolicy(saved);
      requireAllowed(work, metadata.explicitlyAdult, at);
      const detail = parseDetail(metadata, await fetchJSON(metadata.episodesUrl));
      currentPolicy(saved);
      cached = { detail, at, sourceAdult: detail.explicitlyAdult };
      this.cache.set(work, cached);
      while (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value!);
    }
    currentPolicy(saved);
    const adult = batchPolicy(() => {
      const adult = requireAllowed(work, cached!.sourceAdult, cached!.at);
      issue(cached!.detail.cover, work, cached!.sourceAdult, cached!.at);
      return adult;
    });
    return { ...cached, detail: { ...cached.detail, explicitlyAdult: adult } };
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
    let page = 0;
    if (!empty(metadata)) {
      if (
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata) ||
        typeof metadata.cursor !== "string" ||
        Object.keys(metadata).some((k) => k !== "cursor")
      )
        throw new Error("Invalid Marumaru continuation.");
      const cursor = this.cursors.get(metadata.cursor);
      if (!cursor || cursor.scope !== scope || cursor.at + 600000 <= Date.now())
        throw new Error("Marumaru continuation expired or changed; restart search.");
      page = cursor.page;
    }
    const url = title
      ? `${DOMAIN}/api/search?q=${encodeURIComponent(title)}&page=${page}&media=MANHWA&sort=LATEST`
      : `${DOMAIN}/api/works?mediaType=MANHWA&page=${page}&size=49`;
    const listing = parseListing(await fetchJSON(url), page, !!title),
      at = Date.now();
    currentPolicy(saved);
    const items: SearchResultItem[] = batchPolicy(() =>
      listing.items.flatMap((card) => {
        const adult = observe(card.id, card.explicitlyAdult, at);
        if (!allowed(adult)) return [];
        issue(card.cover, card.id, card.explicitlyAdult, at);
        return [
          {
            mangaId: card.id,
            title: card.title,
            imageUrl: card.cover,
            contentRating: badge(adult),
          },
        ];
      }),
    );
    currentPolicy(saved);
    if (listing.items.length && !items.length)
      throw new Error(
        "Paperback's content filters exclude this Marumaru page. Unclassified titles use Mature compatibility, not a source age rating.",
      );
    let next: Metadata | undefined;
    if (listing.nextPage !== undefined) {
      const key = `${Date.now()}:${++this.sequence}`;
      this.cursors.set(key, { scope, page: listing.nextPage, at });
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
    const { detail, at, sourceAdult } = await this.detail(work, saved);
    const selected = detail.chapters.find((entry) => entry.id === episode);
    if (!selected || selected.sourceNumber !== chapter.chapNum)
      throw new Error("Marumaru chapter identity does not match its current title inventory.");
    const pages = parseReader(
      await fetchJSON(readerURL(detail.episodesUrl, work, episode)),
      work,
      selected,
    );
    currentPolicy(saved);
    batchPolicy(() => {
      requireAllowed(work, sourceAdult, at);
      for (const page of pages) issue(page, work, sourceAdult, at, episode);
    });
    return { id: episode, mangaId: work, pages };
  }
}
export const Marumaru = new MarumaruExtension();
