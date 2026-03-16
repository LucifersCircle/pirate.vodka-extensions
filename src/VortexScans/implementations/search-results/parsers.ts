import type { SearchResultItem } from "@paperback/types";
import { ContentRating } from "@paperback/types";
import type { VortexQueryResponse } from "../shared/models";

export function parseSearchResults(json: VortexQueryResponse): SearchResultItem[] {
  return (json.posts ?? [])
    .filter((post) => post.postTitle && post.postTitle.trim().length > 0 && !post.isNovel)
    .map((post) => {
      const mangaId = post.id.toString();

      return {
        mangaId,
        title: Application.decodeHTMLEntities(post.postTitle),
        imageUrl: post.featuredImage || "",
        subtitle: `${post._count?.chapters ?? 0} Chapters`,
        contentRating: ContentRating.EVERYONE,
      };
    });
}
