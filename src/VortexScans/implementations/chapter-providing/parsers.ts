import type { Chapter, ChapterDetails, SourceManga } from "@paperback/types";
import type { VortexChaptersResponse } from "../shared/models";

const CHAPTER_IMAGE_REGEX =
  /https?:\/\/[^"'\\\s]+\/(?:public\/)?upload\/series\/[^"'\\\s]+?\.(?:webp|jpe?g|png)(?:\?[^"'\\\s]*)?/gi;

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

function normalizeUrl(url: string): string {
  return url.replace(/([^:])\/\/+/g, "$1/");
}

function dedupePreservingOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const pages: string[] = [];

  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    pages.push(url);
  }

  return pages;
}

function extractChapterImageUrls(html: string): string[] {
  return dedupePreservingOrder(
    Array.from(html.matchAll(CHAPTER_IMAGE_REGEX), ([url]) => normalizeUrl(url)),
  );
}

function sortByPageNumber(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    const numA = parseInt(a.match(/page-(\d+)/i)?.[1] ?? "0");
    const numB = parseInt(b.match(/page-(\d+)/i)?.[1] ?? "0");
    return numA - numB;
  });
}

function getSeoSectionPages(html: string): string[] {
  const seoSection = html.match(
    /<section[^>]*aria-label="[^"]*comic pages"[^>]*>([\s\S]*?)<\/section>/i,
  );

  if (!seoSection?.[1]) {
    return [];
  }

  return extractChapterImageUrls(seoSection[1]);
}

function getDocumentPages(html: string): string[] {
  const urls = extractChapterImageUrls(html);
  if (urls.length === 0) {
    return [];
  }

  const groups = new Map<string, string[]>();
  for (const url of urls) {
    const directory = url.replace(/\/[^/?#]+(\?.*)?$/, "");
    const group = groups.get(directory);
    if (group) {
      group.push(url);
    } else {
      groups.set(directory, [url]);
    }
  }

  let bestGroup: string[] = [];
  for (const group of groups.values()) {
    if (group.length > bestGroup.length) {
      bestGroup = group;
    }
  }

  return sortByPageNumber(bestGroup);
}

function getIndexedPages(html: string): string[] {
  const indexedRegex = /data-image-index="(\d+)"[^>]*src="(https?:\/\/[^"]+)"/gi;
  const indexed: { index: number; url: string }[] = [];

  let match;
  while ((match = indexedRegex.exec(html)) !== null) {
    indexed.push({ index: parseInt(match[1]!), url: normalizeUrl(match[2]!) });
  }

  if (indexed.length === 0) {
    return [];
  }

  indexed.sort((a, b) => a.index - b.index);
  return dedupePreservingOrder(indexed.map((page) => page.url));
}

export function parseChapterDetails(html: string, chapter: Chapter): ChapterDetails {
  const candidates = [
    getSeoSectionPages(html),
    getDocumentPages(html),
    getIndexedPages(html),
  ].filter((pages) => pages.length > 0);

  const bestCandidate = candidates.reduce<string[] | undefined>((best, candidate) => {
    if (!best || candidate.length > best.length) {
      return candidate;
    }

    return best;
  }, undefined);

  if (bestCandidate) {
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: bestCandidate,
    };
  }

  throw new Error("No chapter page data could be parsed from VortexScans for this chapter.");
}
