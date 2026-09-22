/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Cloudflare lifecycle adapted from Kagane, Copyright © 2026 Inkdex. */
import { BasicRateLimiter, CookieStorageInterceptor, DiscoverSectionType } from "@paperback/types";
import type {
  Cookie,
  DiscoverSection,
  DiscoverSectionItem,
  Extension,
  Metadata,
  PagedResults,
  Request,
  SearchQuery,
  SearchResultItem,
  SortingOption,
  SourceManga,
} from "@paperback/types";
import { BASE_URL, SORTS } from "./models";
import { catalog, getGenres, getPost } from "./catalog";
import { ChapterProvider } from "./chapters";
import { HijalaSearchForm } from "./forms";
import { HijalaInterceptor, fetchText } from "./network";
import {
  allowedPost,
  contentRating,
  flightProperty,
  locked,
  mangaDetails,
  parsePost,
  plainText,
  searchItem,
  toPaperbackId,
} from "./parsers";
import { HijalaSettingsForm, getPreferences } from "./settings";

export class HijalaExtension extends ChapterProvider implements Extension {
  readonly cookieStorageInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  readonly siteInterceptor = new HijalaInterceptor("hijala-network");
  readonly rateLimiter = new BasicRateLimiter("hijala-rate-limit", {
    numberOfRequests: 3,
    bufferInterval: 1,
    ignoreImages: true,
  });

  async initialise(): Promise<void> {
    this.cookieStorageInterceptor.registerInterceptor();
    this.siteInterceptor.registerInterceptor();
    this.rateLimiter.registerInterceptor();
  }

  async cloudflareBypassCompleted(
    _request: Request,
    cookies: Cookie[],
    _localStorage: Record<string, string>,
  ): Promise<void> {
    const clearance = cookies.find(
      (cookie) =>
        cookie.name === "cf_clearance" &&
        /^(\.)?((api|storage)\.)?en-hijala\.com$/i.test(cookie.domain),
    );
    if (clearance) this.cookieStorageInterceptor.setCookie(clearance);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    return mangaDetails(await getPost(mangaId));
  }
  async getSortingOptions(): Promise<SortingOption[]> {
    return SORTS.map((sort) => ({ ...sort }));
  }
  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<HijalaSearchForm> {
    return new HijalaSearchForm(query.metadata, await getGenres());
  }
  async getSettingsForm(): Promise<HijalaSettingsForm> {
    return new HijalaSettingsForm(await getGenres());
  }

  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata?: Metadata,
    sortingOption?: SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const results = await catalog(query, metadata, sortingOption);
    return { ...results, items: results.items.map(searchItem) };
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      { id: "featured", title: "Featured", type: DiscoverSectionType.featured },
      { id: "hot", title: "Latest Releases · Hot", type: DiscoverSectionType.chapterUpdates },
      { id: "new", title: "Latest Releases · New", type: DiscoverSectionType.simpleCarousel },
      { id: "popular", title: "Most Popular", type: DiscoverSectionType.simpleCarousel },
      { id: "genres", title: "Genres", type: DiscoverSectionType.genres },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: Metadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    if (section.id === "genres")
      return {
        items: (await getGenres()).map((genre) => ({
          type: "genresCarouselItem",
          name: genre.name,
          searchQuery: { title: "", metadata: { genres: { [String(genre.id)]: "included" } } },
        })),
      };
    if (section.id === "featured") {
      const value = flightProperty(await fetchText(`${BASE_URL}/`), "sliderPosts");
      if (!Array.isArray(value)) throw new Error("Hijala returned an invalid featured list.");
      const settings = getPreferences();
      return {
        items: value
          .map(parsePost)
          .filter((post) => allowedPost(post, settings))
          .map((post) => ({
            ...searchItem(post),
            type: "featuredCarouselItem",
            summary: plainText(post.postContent),
            supertitle: post.seriesType,
          })),
      };
    }
    if (!["hot", "new", "popular"].includes(section.id))
      throw new Error(`Unknown Hijala section: ${section.id}`);
    const feed = section.id === "hot" || section.id === "new" ? section.id : undefined;
    const result = await catalog(
      { title: "" },
      metadata,
      section.id === "popular" ? SORTS[1] : undefined,
      feed,
    );
    const settings = getPreferences();
    return {
      metadata: result.metadata,
      items: result.items.map((post): DiscoverSectionItem => {
        if (section.id === "hot") {
          const chapter = post.chapters?.find((chapter) => settings.showLocked || !locked(chapter));
          if (chapter)
            return {
              ...searchItem(post),
              type: "chapterUpdatesCarouselItem",
              chapterId: toPaperbackId(chapter.slug),
              subtitle: `${locked(chapter) ? "[Locked] " : ""}Chapter ${chapter.number}`,
              publishDate: chapter.createdAt ? new Date(chapter.createdAt) : undefined,
              contentRating: contentRating(post),
            };
        }
        return { ...searchItem(post), type: "simpleCarouselItem" };
      }),
    };
  }
}

export const HijalaTest = new HijalaExtension();
