import { ContentRating } from "@paperback/types";
import type { Chapter, ChapterDetails, SourceManga } from "@paperback/types";
import * as cheerio from "cheerio";
import { BASE_URL, record } from "./models";
import type { Genre, Post, PostPage, Preferences, RawChapter, ReaderChapter } from "./models";

// Decode only JSON string chunks. Never execute the site's JavaScript.
export function flightProperty(html: string, key: string): unknown {
  let flight = "";
  for (const match of html.matchAll(/self\.__next_f\.push\((\[1,.*?\])\)<\/script>/gs)) {
    const chunk: unknown = JSON.parse(match[1]);
    if (Array.isArray(chunk) && typeof chunk[1] === "string") flight += chunk[1];
  }
  const pattern = new RegExp(`"${key}"\\s*:\\s*([\\[{])`, "g");
  for (const match of flight.matchAll(pattern)) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = start; i < flight.length; i++) {
      const char = flight[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") depth++;
      else if ((char === "}" || char === "]") && --depth === 0) {
        return JSON.parse(flight.slice(start, i + 1));
      }
    }
  }
  throw new Error(`Hijala page is missing ${key} data. Open the website to check access.`);
}

export function parseGenres(value: unknown): Genre[] {
  if (!Array.isArray(value)) throw new Error("Hijala returned an invalid genre catalog.");
  return value.map((value) => {
    const genre = record(value);
    if (!Number.isSafeInteger(genre.id) || typeof genre.name !== "string")
      throw new Error("Invalid Hijala genre.");
    return { id: genre.id as number, name: genre.name };
  });
}

export function parsePost(value: unknown): Post {
  const post = record(value);
  if (
    !Number.isSafeInteger(post.id) ||
    typeof post.slug !== "string" ||
    !post.slug ||
    typeof post.postTitle !== "string" ||
    !post.postTitle.trim() ||
    (post.featuredImage !== undefined && typeof post.featuredImage !== "string")
  ) {
    throw new Error("Hijala returned incomplete series metadata.");
  }
  return {
    ...post,
    featuredImage: post.featuredImage || `${BASE_URL}/apple-touch-icon.png`,
    genres: parseGenres(post.genres ?? []),
  } as Post;
}

export function parsePostPage(value: unknown): PostPage {
  const data = record(value);
  if (
    !Array.isArray(data.posts) ||
    !Number.isSafeInteger(data.totalCount) ||
    Number(data.totalCount) < 0
  ) {
    throw new Error("Hijala returned an invalid catalog response.");
  }
  return { posts: data.posts.map(parsePost), totalCount: data.totalCount as number };
}

export function plainText(html = ""): string {
  const $ = cheerio.load(html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n"));
  $("script,style").remove();
  return $.text().trim();
}

export function contentRating(post: Post): ContentRating {
  if (
    post.genres.some((genre) =>
      /^(hentai|pornographic|pornography|erotica|adult|smut)$/i.test(genre.name),
    )
  )
    return ContentRating.ADULT;
  // Hijala has no per-series age field. Unrated titles use a conservative Mature fallback.
  return ContentRating.MATURE;
}

export function allowedPost(post: Post, preferences: Preferences): boolean {
  return (
    !post.isNovel &&
    post.seriesType !== "NOVEL" &&
    (!post.seriesType || preferences.types.includes(post.seriesType)) &&
    !post.genres.some((genre) => preferences.excludedGenres.includes(String(genre.id)))
  );
}

function validateSlug(slug: string): void {
  if (!slug || /[/?#]/.test(slug) || slug === "." || slug === "..")
    throw new Error("Invalid Hijala identifier.");
}

function encodeComponent(value: string): string {
  // encodeURIComponent leaves !, ', * and ~ unescaped; Paperback rejects them in IDs.
  return encodeURIComponent(value).replace(
    /[!'*~]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function toPaperbackId(slug: string): string {
  validateSlug(slug);
  // Preserve existing safe IDs (including colons/parentheses). Escape literal % too,
  // so a raw "name%21" cannot collide with "name!". Input is always a raw site slug.
  return slug.replace(/[^A-Za-z0-9._@()[\]+=&:-]/gu, encodeComponent);
}

export function fromPaperbackId(id: string): string {
  const slug = decodeURIComponent(id);
  validateSlug(slug);
  return slug;
}

export function slugPath(slug: string): string {
  validateSlug(slug);
  return encodeComponent(slug);
}

export function seriesURL(slug: string): string {
  return `${BASE_URL}/series/${slugPath(slug)}`;
}

export function searchItem(post: Post) {
  return {
    mangaId: toPaperbackId(post.slug),
    title: post.postTitle.trim(),
    imageUrl: imageURL(post.featuredImage),
    subtitle: post.seriesType,
    contentRating: contentRating(post),
  };
}

export function mangaDetails(post: Post): SourceManga {
  if (post.isNovel || post.seriesType === "NOVEL")
    throw new Error("Novel reading has not been verified for Hijala.");
  return {
    mangaId: toPaperbackId(post.slug),
    mangaInfo: {
      primaryTitle: post.postTitle.trim(),
      secondaryTitles: [
        ...new Set(
          (post.alternativeTitles ?? "")
            .split(/\s*[•\n]\s*|\s+\/\s+/)
            .map((title) => title.trim())
            .filter((title) => title && title !== post.postTitle),
        ),
      ],
      thumbnailUrl: imageURL(post.featuredImage),
      synopsis: plainText(post.postContent),
      author: post.author || undefined,
      artist: post.artist || undefined,
      status: post.seriesStatus?.replaceAll("_", " "),
      contentRating: contentRating(post),
      contentType: "comic",
      shareUrl: seriesURL(post.slug),
      rating: typeof post.averageRating === "number" ? post.averageRating / 10 : undefined,
      tagGroups: [
        {
          id: "genres",
          title: "Genres",
          tags: post.genres.map((genre) => ({ id: String(genre.id), title: genre.name })),
        },
        {
          id: "type",
          title: "Type",
          tags: post.seriesType ? [{ id: post.seriesType, title: post.seriesType }] : [],
        },
      ],
      additionalInfo: {
        ...(post.releaseDate ? { Released: post.releaseDate } : {}),
        "Content rating":
          "Hijala does not provide age ratings; unrated titles are treated as Mature.",
      },
    },
  };
}

export function locked(chapter: RawChapter): boolean {
  return (
    chapter.isAccessible === false ||
    chapter.isLocked === true ||
    (chapter.isAccessible !== true &&
      (chapter.isLockedByCoins === true ||
        chapter.isShortLinkLocked === true ||
        !!chapter.isPermanentlyLocked ||
        (chapter.price ?? 0) > 0))
  );
}

export function parseChapters(
  post: Post,
  sourceManga: SourceManga,
  showLocked: boolean,
): Chapter[] {
  if (
    !Array.isArray(post.chapters) ||
    (post._count?.chapters !== undefined && post.chapters.length !== post._count.chapters)
  ) {
    throw new Error(
      "Hijala's chapter list is incomplete. The website's chapter loading may have changed.",
    );
  }
  const seen = new Set<string>();
  const canonicalManga = { ...sourceManga, mangaId: toPaperbackId(post.slug) };
  const chapters = post.chapters.map((chapter) => {
    if (!chapter.slug || !Number.isFinite(chapter.number) || seen.has(chapter.slug))
      throw new Error("Invalid or duplicate Hijala chapter identifier.");
    seen.add(chapter.slug);
    const isLocked = locked(chapter);
    const date = chapter.createdAt ? new Date(chapter.createdAt) : undefined;
    return {
      chapterId: toPaperbackId(chapter.slug),
      sourceManga: canonicalManga,
      chapNum: chapter.number,
      langCode: post.seriesType === "SPANISH" ? "es" : post.seriesType === "RUSSIAN" ? "ru" : "en",
      title: `${isLocked ? "[Locked] " : ""}${chapter.title?.trim() || `Chapter ${chapter.number}`}`,
      version: "Hijala",
      sortingIndex: chapter.number,
      publishDate: date && Number.isFinite(date.getTime()) ? date : undefined,
      additionalInfo: { Access: isLocked ? "Locked on website" : "Free" },
    };
  });
  return chapters
    .filter((chapter) => showLocked || chapter.additionalInfo.Access === "Free")
    .sort(
      (left, right) =>
        right.chapNum - left.chapNum || left.chapterId.localeCompare(right.chapterId),
    );
}

export function imageURL(value: string): string {
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${BASE_URL}${value}`;
  if (!/^https:\/\//i.test(value)) throw new Error("Hijala returned an invalid image URL.");
  return value;
}

export function chapterDetails(value: unknown, chapter: Chapter): ChapterDetails {
  const data = record(value) as ReaderChapter;
  if (locked(data))
    throw new Error("This chapter is locked on Hijala. Read or unlock it on the website.");
  if (
    data.slug !== fromPaperbackId(chapter.chapterId) ||
    data.mangaPost?.slug !== fromPaperbackId(chapter.sourceManga.mangaId)
  )
    throw new Error("Hijala returned a different chapter.");
  if (data.mangaPost?.isNovel) throw new Error("Novel reading has not been verified for Hijala.");
  if (!Array.isArray(data.images) || data.images.length === 0)
    throw new Error("Hijala returned no readable chapter images.");
  const orders = new Set<number>();
  for (const page of data.images) {
    if (!Number.isFinite(page.order) || orders.has(page.order) || typeof page.url !== "string")
      throw new Error("Hijala returned invalid page ordering.");
    orders.add(page.order);
  }
  return {
    id: toPaperbackId(data.slug),
    mangaId: toPaperbackId(data.mangaPost.slug),
    pages: [...data.images].sort((a, b) => a.order - b.order).map((page) => imageURL(page.url)),
  };
}
