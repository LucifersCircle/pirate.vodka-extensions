import type { SourceManga } from "@paperback/types";
import { ContentRating } from "@paperback/types";
import type { VortexPost } from "../shared/models";

export function parseMangaDetails(post: VortexPost): SourceManga {
  const mangaId = post.id.toString();

  // Strip HTML tags from postContent for synopsis
  const synopsis = Application.decodeHTMLEntities(post.postContent.replace(/<[^>]+>/g, ""));

  // Parse alternative titles (newline or comma separated)
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

      shareUrl: `https://vortexscans.org/series/${post.slug}`,
    },
  };
}
