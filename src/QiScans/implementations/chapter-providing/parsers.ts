import type { Chapter, ChapterDetails, SourceManga } from "@paperback/types";
import type { QIScansSeriesChapter } from "../shared/models";

export function parseChapterList(
  chapters: QIScansSeriesChapter[],
  sourceManga: SourceManga,
): Chapter[] {
  if (chapters.length === 0) {
    return [];
  }

  const sorted = [...chapters].sort((a, b) => {
    if (a.number !== b.number) return a.number - b.number;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const available = sorted.filter(
    (chapter) => chapter.publishStatus === "PUBLIC" && !chapter.requiresPurchase,
  );

  return available.map((chapter, index) => ({
    chapterId: chapter.slug,
    sourceManga,
    title: chapter.title?.trim() || "",
    chapNum: chapter.number,
    volume: 0,
    volumetitle: "",
    langCode: "en",
    sortingIndex: index,
    publishDate: new Date(chapter.createdAt),
  }));
}

export function parseChapterDetails(html: string, chapter: Chapter): ChapterDetails {
  // match image URLs in the uploads/series path
  const pageRegex =
    /https?:\/\/[^"'\\]*?\/(uploads?|rezo)\/series\/[^"'\\]+?\.(?:webp|jpe?g|png)/gi;

  const rawMatches = html.match(pageRegex) ?? [];

  if (rawMatches.length === 0) {
    throw new Error("No chapter page data could be parsed from QiScans for this chapter.");
  }

  // normalize URLs (collapse double slashes)
  const normalised = rawMatches.map((u) => u.replace(/([^:])\/\/+/g, "$1/"));

  // dedupe
  const unique = Array.from(new Set(normalised));

  // group by directory
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

  // pick the directory with most images
  let bestList: string[] | null = null;
  for (const list of groups.values()) {
    if (!bestList || list.length > bestList.length) {
      bestList = list;
    }
  }

  if (!bestList || bestList.length === 0) {
    throw new Error("No chapter page data could be parsed from QiScans for this chapter.");
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
