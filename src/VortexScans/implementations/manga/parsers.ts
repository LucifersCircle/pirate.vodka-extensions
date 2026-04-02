import type { SourceManga } from "@paperback/types";
import { ContentRating } from "@paperback/types";
import { DOMAIN } from "../shared/models";
import type { VortexPost } from "../shared/models";

export function parseMangaDetails(post: VortexPost): SourceManga {
  const mangaId = post.id.toString();

  const synopsis = Application.decodeHTMLEntities(post.postContent.replace(/<[^>]+>/g, ""));
  const secondaryTitles = post.alternativeTitles
    ? post.alternativeTitles
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : [];

  return {
    mangaId,
    mangaInfo: {
      primaryTitle: Application.decodeHTMLEntities(post.postTitle),
      secondaryTitles,
      thumbnailUrl: post.featuredImage || "",
      synopsis,
      status: post.seriesStatus ?? "UNKNOWN",
      contentRating: ContentRating.EVERYONE,

      tagGroups:
        post.genres && post.genres.length > 0
          ? [
              {
                id: "genres",
                title: "Genres",
                tags: post.genres.map((g) => ({
                  id: g.id.toString(),
                  title: g.name,
                })),
              },
            ]
          : [],

      additionalInfo: {
        slug: post.slug,
      },

      shareUrl: `${DOMAIN}/series/${post.slug}`,
    },
  };
}
