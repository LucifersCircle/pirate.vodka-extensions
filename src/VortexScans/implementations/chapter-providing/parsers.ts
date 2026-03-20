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
  // hidden SEO section has all pages in order, extract from there first
  const seoSection = html.match(
    /<section[^>]*aria-label="[^"]*comic pages"[^>]*>([\s\S]*?)<\/section>/i,
  );

  if (seoSection) {
    const imgRegex = /src="(https?:\/\/storage\.vexmanga\.com\/[^"]+)"/gi;
    const pages: string[] = [];
    let match;
    while ((match = imgRegex.exec(seoSection[1]!)) !== null) {
      pages.push(match[1]!);
    }
    if (pages.length > 0) {
      return {
        id: chapter.chapterId,
        mangaId: chapter.sourceManga.mangaId,
        pages,
      };
    }
  }

  // fallback: data-image-index imgs from the reader
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

  throw new Error("No chapter page data could be parsed from VortexScans for this chapter.");
}
