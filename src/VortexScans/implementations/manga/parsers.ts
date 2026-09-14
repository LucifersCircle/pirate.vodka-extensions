import type { SourceManga } from "@paperback/types";
import { ContentRating } from "@paperback/types";
import * as cheerio from "cheerio";
import { DOMAIN } from "../shared/models";
import type { VortexPost } from "../shared/models";
import { buildMangaId } from "../shared/utils";

interface VortexSeriesPageProps {
  post?: VortexPost;
}

type VortexMangaDetailsPost = Pick<VortexPost, "id" | "slug" | "postTitle" | "featuredImage"> &
  Partial<Pick<VortexPost, "postContent" | "alternativeTitles" | "seriesStatus" | "genres">>;

interface VortexMangaPageFallback {
  id: string;
  slug?: string;
}

export function parseMangaPage(
  html: string,
  fallback?: VortexMangaPageFallback,
): VortexMangaDetailsPost | undefined {
  const $ = cheerio.load(html);
  const propsValue = $("astro-island")
    .filter((_, element) => {
      return ($(element).attr("opts") ?? "").includes("SeriesChaptersPanelIsland");
    })
    .first()
    .attr("props");

  if (propsValue) {
    try {
      const props = deserializeAstroValue(JSON.parse(propsValue)) as VortexSeriesPageProps;
      const post = props.post;

      if (post && typeof post.id === "number" && post.slug && post.postTitle) return post;
    } catch {
      // Fall through to the current server-rendered page parser.
    }
  }

  return parseServerRenderedMangaPage($, fallback);
}

export function parseMangaDetails(
  post: VortexMangaDetailsPost,
  mangaId = buildMangaId(post.id, post.slug),
): SourceManga {
  const synopsis = Application.decodeHTMLEntities(
    (post.postContent ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|pre|div)>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
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

function parseServerRenderedMangaPage(
  $: cheerio.CheerioAPI,
  fallback?: VortexMangaPageFallback,
): VortexMangaDetailsPost | undefined {
  const id = Number(fallback?.id);
  const slug = fallback?.slug?.trim();
  const title = $('[itemprop="name"]').filter("h1").first().text().trim();
  const imageUrl = $('[itemprop="image"][src]').first().attr("src")?.trim();

  if (!Number.isInteger(id) || id <= 0 || !slug || !title || !imageUrl) return undefined;

  const description = $('[itemprop="description"]').first();
  const descriptionParts = description
    .children()
    .map((_, element) => $.html(element).trim())
    .get()
    .filter(Boolean);
  const postContent =
    descriptionParts.length > 0
      ? descriptionParts.join("\n\n")
      : (description.html()?.trim() ?? "");
  const alternativeTitles = $('[itemprop="name"]')
    .filter("h1")
    .first()
    .parent()
    .find('[aria-hidden="true"]')
    .first()
    .text()
    .trim();

  return {
    id,
    slug,
    postTitle: title,
    postContent,
    alternativeTitles,
    featuredImage: imageUrl,
    seriesStatus: readDefinitionValue($, "Status") || "UNKNOWN",
    genres: $('[itemprop="genre"]')
      .map((_, element) => {
        const link = $(element);
        const genreId = parseGenreId(link.attr("href") ?? "");
        const name = link.text().trim();
        return genreId && name ? { id: genreId, name, color: "" } : undefined;
      })
      .get()
      .filter((genre): genre is NonNullable<typeof genre> => genre !== undefined),
  };
}

function readDefinitionValue($: cheerio.CheerioAPI, label: string): string {
  return $("dt")
    .filter((_, element) => $(element).text().trim() === label)
    .first()
    .siblings("dd")
    .first()
    .text()
    .trim();
}

function parseGenreId(href: string): number | undefined {
  const match = href.match(/[?&]genres=(?:%2B|\+)?(\d+)/i);
  if (!match?.[1]) return undefined;

  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function deserializeAstroValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === "number") {
      return deserializeAstroValue(value[1]);
    }
    return value.map(deserializeAstroValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deserializeAstroValue(entry)]),
    );
  }

  return value;
}
