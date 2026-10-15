import type { DiscoverSectionItem } from "@paperback/types";
import { contentAllowed, contentRating, observeContent, sourceNames } from "../shared/content";
import * as cheerio from "cheerio";
import type { VortexQueryResponse } from "../shared/models";
import type { HomePost } from "./home";
import { buildMangaId } from "../shared/utils";

const SERIALIZED_POST_PATTERN = /\{id:(\d+),slug:"([^"]+)"/g;

export function parsePopularTodayItems(
  html: string,
  posts: HomePost[] = [],
): DiscoverSectionItem[] {
  posts.forEach((post) => observeContent(buildMangaId(post.id, post.slug), sourceNames(post)));
  const $ = cheerio.load(html);
  const heading = $("h1,h2,h3,h4,p")
    .filter((_, element) => $(element).text().trim() === "Popular Today")
    .first();
  const section = heading.closest("section");
  if (section.length === 0) return [];

  const postIds = parseSerializedPostIds(html);
  const seen = new Set<string>();
  const items: DiscoverSectionItem[] = [];

  section.find('a[href^="/series/"]').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href") ?? "";
    const slug = decodeSlug(href.slice("/series/".length).split(/[?#]/)[0] ?? "");
    const id = postIds.get(slug);
    const imageUrl = anchor.find("img[src]").first().attr("src") ?? "";
    const title = anchor.attr("title")?.trim() || anchor.find("h3").first().text().trim();

    if (!id || !slug || !title || !imageUrl || seen.has(slug)) return;
    seen.add(slug);

    const seriesType = anchor.find('img[src*="/theme/flags/"]').first().attr("alt")?.trim();
    const mangaId = buildMangaId(id, slug);
    if (!contentAllowed(mangaId)) return;
    items.push({
      type: "prominentCarouselItem",
      mangaId,
      title: Application.decodeHTMLEntities(title),
      imageUrl,
      subtitle: seriesType ? formatSeriesType(seriesType) : undefined,
      contentRating: contentRating(mangaId),
    });
  });

  return items;
}

export function parseSimpleDiscoverItems(data: VortexQueryResponse): DiscoverSectionItem[] {
  (data.posts ?? []).forEach((post) =>
    observeContent(buildMangaId(post.id, post.slug), sourceNames(post)),
  );
  return (data.posts ?? [])
    .filter(
      (post) =>
        post.postTitle?.trim() && !post.isNovel && contentAllowed(buildMangaId(post.id, post.slug)),
    )
    .map((post) => ({
      type: "simpleCarouselItem" as const,
      mangaId: buildMangaId(post.id, post.slug),
      title: Application.decodeHTMLEntities(post.postTitle),
      imageUrl: post.featuredImage ?? "",
      subtitle: `${post._count?.chapters ?? post.chapters?.length ?? 0} Chapters`,
      contentRating: contentRating(buildMangaId(post.id, post.slug)),
    }));
}

function parseSerializedPostIds(html: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const match of html.matchAll(SERIALIZED_POST_PATTERN)) {
    const id = match[1];
    const slug = match[2];
    if (id && slug && !ids.has(slug)) ids.set(slug, id);
  }
  return ids;
}

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatSeriesType(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function parseHomepageItems(posts: HomePost[], prominent = false): DiscoverSectionItem[] {
  posts.forEach((post) => observeContent(buildMangaId(post.id, post.slug), sourceNames(post)));
  return posts
    .filter(
      (post) =>
        !post.isNovel &&
        post.seriesType !== "NOVEL" &&
        contentAllowed(buildMangaId(post.id, post.slug)),
    )
    .map((post) => ({
      type: prominent ? ("prominentCarouselItem" as const) : ("simpleCarouselItem" as const),
      mangaId: buildMangaId(post.id, post.slug),
      title: Application.decodeHTMLEntities(post.postTitle),
      imageUrl: post.featuredImage,
      subtitle:
        post._count?.chapters !== undefined ? `${post._count.chapters} Chapters` : undefined,
      contentRating: contentRating(buildMangaId(post.id, post.slug)),
    }));
}
