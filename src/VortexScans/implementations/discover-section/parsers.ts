import type { DiscoverSectionItem } from "@paperback/types";
import type { VortexQueryResponse } from "../shared/models";

export function parseDiscoverItems(data: VortexQueryResponse): DiscoverSectionItem[] {
  const posts = data.posts ?? [];

  return posts
    .filter((post) => post.postTitle && post.postTitle.trim().length > 0)
    .map((post) => {
      const mangaId = post.id.toString();
      const latestChapter = post.chapters?.[0];

      return {
        type: "chapterUpdatesCarouselItem" as const,
        mangaId,
        chapterId: latestChapter?.slug ?? "",
        title: Application.decodeHTMLEntities(post.postTitle),
        imageUrl: post.featuredImage ?? "",
        subtitle: latestChapter
          ? `Ch. ${latestChapter.number}`
          : `${post._count?.chapters ?? 0} Chapters`,
      };
    });
}
