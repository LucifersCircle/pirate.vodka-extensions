import type { ChapterUpdatesCarouselItem, SimpleCarouselItem } from "@paperback/types";
import { ContentRating } from "@paperback/types";
import type {
  MangaTaroFollowedMangaItem,
  MangaTaroPopularChapter,
  MangaTaroPopularMangaItem,
  MangaTaroStatusMangaItem,
} from "../shared/models";

function slugFromPermalink(permalink: string): string {
  return permalink.split("/").filter(Boolean).pop() ?? permalink;
}

export function parsePopularChapters(
  chapters: MangaTaroPopularChapter[],
): ChapterUpdatesCarouselItem[] {
  return chapters
    .filter((ch) => ch.manga_type.toLowerCase() !== "novel")
    .map((ch) => ({
      type: "chapterUpdatesCarouselItem" as const,
      mangaId: `${ch.manga_slug}:${ch.manga_id}`,
      chapterId: ch.chapter_id.toString(),
      imageUrl: ch.cover,
      title: ch.manga_title,
      subtitle: ch.chapter_title || `Ch. ${ch.chapter_number}`,
      contentRating: ContentRating.EVERYONE,
    }));
}

export function parseStatusManga(items: MangaTaroStatusMangaItem[]): SimpleCarouselItem[] {
  return items
    .filter((item) => item.manga_type.toLowerCase() !== "novel")
    .map((item) => ({
      type: "simpleCarouselItem" as const,
      mangaId: `${item.slug}:${item.manga_id}`,
      imageUrl: item.cover,
      title: item.title,
      subtitle: item.manga_type,
      contentRating: ContentRating.EVERYONE,
    }));
}

export function parseFollowedManga(items: MangaTaroFollowedMangaItem[]): SimpleCarouselItem[] {
  return items
    .filter((item) => item.manga_type.toLowerCase() !== "novel")
    .map((item) => ({
      type: "simpleCarouselItem" as const,
      mangaId: `${item.slug}:${item.manga_id}`,
      imageUrl: item.cover,
      title: item.title,
      subtitle: item.manga_type,
      contentRating: ContentRating.EVERYONE,
    }));
}

export function parsePopularManga(items: MangaTaroPopularMangaItem[]): SimpleCarouselItem[] {
  return items
    .filter((item) => item.manga_type.toLowerCase() !== "novel")
    .map((item) => {
      const slug = slugFromPermalink(item.permalink);
      return {
        type: "simpleCarouselItem" as const,
        // no numeric id from this endpoint, slug only
        mangaId: slug,
        imageUrl: item.cover,
        title: item.title,
        subtitle: item.manga_type,
        contentRating: ContentRating.EVERYONE,
      };
    });
}
