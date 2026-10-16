import type { Chapter, ChapterDetails, SourceManga } from "@paperback/types";
import type { VortexChaptersResponse } from "../shared/models";
import * as cheerio from "cheerio";

const CHAPTER_IMAGE_REGEX =
  /https?:\/\/[^"'\\\s]+\/(?:public\/)?upload\/series\/[^"'\\\s]+?\.(?:webp|jpe?g|png)(?:\?[^"'\\\s]*)?/gi;

export function parseChapterList(
  data: VortexChaptersResponse,
  sourceManga: SourceManga,
): Chapter[] {
  const chapters = data.post?.chapters ?? [];

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
    title: chapterSubtitle(ch.title, ch.number),
    chapNum: ch.number,
    volume: 0,
    volumetitle: "",
    langCode: "en",
    sortingIndex: index,
    publishDate: new Date(ch.createdAt),
  }));
}

// The native chapter number is rendered separately. Only remove an exact,
// complete matching prefix; "Chapter 1 Remake" is genuine text for chapter 1.5.
function chapterSubtitle(value: string | undefined, number: number): string {
  const title = Application.decodeHTMLEntities(value ?? "").trim();
  const prefix = /^(?:(?:chapter|ch\.?)\s*)?(\d+(?:\.\d+)?)(?=$|[\s:])/i.exec(title);
  if (!prefix || Number(prefix[1]) !== number) return title;
  const rest = title.slice(prefix[0].length);
  // Remove one clear separator, never punctuation belonging to the subtitle.
  return rest.replace(/^\s*:\s*|^\s+[-–—]\s+/, "").trim();
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

  return bestGroup;
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

// Current readers mark actual page images explicitly, including older dated
// upload paths. Never expand the generic document scan to those paths: covers
// and preloads use them too. A malformed marked manifest must not fall back.
function getMarkedReaderPages(html: string): string[] | undefined {
  const $ = cheerio.load(html);
  const marked = $("[data-reader-page-image]").toArray();
  if (marked.length === 0) return undefined;
  const invalid = () => new Error("Invalid VortexScans reader page manifest.");
  if (marked.length > 2000) throw invalid();

  const indexed = marked.map((element) => {
    const image = $(element);
    const index = image.attr("data-reader-index");
    const src = image.attr("src");
    if (
      !("name" in element) ||
      element.name !== "img" ||
      image.attr("data-reader-page-image") !== "true" ||
      index === undefined ||
      !/^(0|[1-9]\d*)$/.test(index) ||
      !Number.isSafeInteger(Number(index)) ||
      !src ||
      image.closest('[hidden], [aria-hidden="true"], template, noscript').length > 0 ||
      image
        .parents()
        .addBack()
        .toArray()
        .some((node) =>
          /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test(
            $(node).attr("style") ?? "",
          ),
        )
    )
      throw invalid();
    if (
      Array.from(src).some(
        (char) =>
          char === "\\" || /\s/.test(char) || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      )
    )
      throw invalid();
    const url = normalizeUrl(src);
    const approved =
      /^https:\/\/storage\.vortexscans\.org(\/(?:public\/)?upload\/(?:\d{4}\/\d{2}\/\d{2}\/[A-Za-z0-9_-]+|series\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+)\.(?:webp|jpe?g|png|gif|avif))(?:\?[^#]*)?$/.exec(
        url,
      );
    if (!approved || approved[1]!.split("/").some((part) => part === "." || part === ".."))
      throw invalid();
    return { index: Number(index), url };
  });
  indexed.sort((left, right) => left.index - right.index);
  if (
    indexed.some((page, index) => page.index !== index) ||
    new Set(indexed.map((page) => page.url)).size !== indexed.length
  )
    throw invalid();
  return indexed.map((page) => page.url);
}

export function parseChapterDetails(html: string, chapter: Chapter): ChapterDetails {
  const markedPages = getMarkedReaderPages(html);
  if (markedPages)
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: markedPages,
    };

  const candidates = [
    getSeoSectionPages(html),
    getIndexedPages(html),
    getDocumentPages(html),
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
