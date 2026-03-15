import type { Chapter, ChapterDetails, SourceManga } from "@paperback/types";
import type { VortexChaptersResponse } from "../shared/models";

export function parseChapterList(
  json: VortexChaptersResponse,
  sourceManga: SourceManga,
): Chapter[] {
  const chapters = json.post?.chapters ?? [];

  if (chapters.length === 0) {
    return [];
  }

  // Sort by number ascending, then by date
  const sorted = [...chapters].sort((a, b) => {
    if (a.number !== b.number) return a.number - b.number;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Filter out locked chapters
  const unlocked = sorted.filter((ch) => !ch.isLocked);

  return unlocked.map((ch, index) => ({
    chapterId: ch.slug,
    sourceManga,
    title: "",
    chapNum: ch.number,
    volume: 0,
    volumetitle: "",
    langCode: "en",
    sortingIndex: index,
    publishDate: new Date(ch.createdAt),
  }));
}

export function parseChapterDetails(html: string, chapter: Chapter): ChapterDetails {
  // Match image URLs from storage.vexmanga.com or wsrv.nl proxy
  const pageRegex =
    /https?:\/\/[^"'\\]*?(?:storage\.vexmanga\.com|wsrv\.nl)[^"'\\]+?\.(?:webp|jpe?g|png)/gi;

  const rawMatches = html.match(pageRegex) ?? [];

  if (rawMatches.length === 0) {
    throw new Error("No chapter page data could be parsed from VortexScans for this chapter.");
  }

  // Normalize URLs (collapse double slashes)
  const normalised = rawMatches.map((u) => u.replace(/([^:])\/\/+/g, "$1/"));

  // Dedupe
  const unique = Array.from(new Set(normalised));

  // Group by directory to find the main set of chapter pages
  const groups = new Map<string, string[]>();
  for (const url of unique) {
    const dir = url.replace(/\/[^/?#]+(\?.*)?$/, "");
    const list = groups.get(dir);
    if (list) {
      list.push(url);
    } else {
      groups.set(dir, [url]);
    }
  }

  // Pick the directory with the most images
  let bestList: string[] | null = null;
  for (const list of groups.values()) {
    if (!bestList || list.length > bestList.length) {
      bestList = list;
    }
  }

  if (!bestList || bestList.length === 0) {
    throw new Error("No chapter page data could be parsed from VortexScans for this chapter.");
  }

  const pages = bestList.sort((a, b) => {
    const numA = parseInt(a.match(/(\d+)(?=\.[^.]*$)/)?.[1] ?? "0");
    const numB = parseInt(b.match(/(\d+)(?=\.[^.]*$)/)?.[1] ?? "0");
    return numA - numB;
  });

  return {
    id: chapter.chapterId,
    mangaId: chapter.sourceManga.mangaId,
    pages,
  };
}
