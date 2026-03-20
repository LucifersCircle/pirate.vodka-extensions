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

  const sorted = [...chapters].sort((a, b) => {
    if (a.number !== b.number) return a.number - b.number;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

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
  // extract from data-image-index imgs in the reader section (ordered)
  const indexedRegex = /data-image-index="(\d+)"[^>]*src="(https?:\/\/[^"]+)"/gi;

  const indexed: { index: number; url: string }[] = [];
  let match;
  while ((match = indexedRegex.exec(html)) !== null) {
    indexed.push({ index: parseInt(match[1]!), url: match[2]! });
  }

  if (indexed.length > 0) {
    indexed.sort((a, b) => a.index - b.index);
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: indexed.map((p) => p.url),
    };
  }

  // fallback: grab all storage URLs and dedupe
  const fallbackRegex = /https?:\/\/storage\.vexmanga\.com\/[^"'\\]+?\.(?:webp|jpe?g|png)/gi;
  const urls = Array.from(new Set(html.match(fallbackRegex) ?? []));

  if (urls.length === 0) {
    throw new Error("No chapter page data could be parsed from VortexScans for this chapter.");
  }

  // sort by page number in filename (page-NNNN)
  urls.sort((a, b) => {
    const numA = parseInt(a.match(/page-(\d+)/)?.[1] ?? "0");
    const numB = parseInt(b.match(/page-(\d+)/)?.[1] ?? "0");
    return numA - numB;
  });

  return {
    id: chapter.chapterId,
    mangaId: chapter.sourceManga.mangaId,
    pages: urls,
  };
}
