import type { Chapter, SourceManga } from "@paperback/types";
import type { CheerioAPI } from "cheerio";
import { beauDecode } from "../shared/utils";

export function parseChapterList($: CheerioAPI, sourceManga: SourceManga): Chapter[] {
  const chapters: Chapter[] = [];
  const publisher = $('p:has(span:contains("Publisher:")) a', "div.col.info").text().trim();

  const items = $("ul.list li").toArray();
  const total = items.length;

  items.forEach((li, index) => {
    const a = $("div.col-1 a", li);
    if (!a.length) return;

    const href = a.attr("href") ?? "";
    const title = a.text().trim();
    const dateText = $("div.col-2 span", li).text().trim();

    const chapterId = href.replace(/^\/Comic\//, "");

    const numMatch = title.match(/#(\d+(?:\.\d+)?)/);
    const chapNum = numMatch ? parseFloat(numMatch[1]) : 0;

    const publishDate = dateText ? new Date(dateText) : new Date();

    chapters.push({
      chapterId,
      sourceManga,
      title,
      chapNum,
      volume: 0,
      langCode: "en",
      version: publisher || undefined,
      sortingIndex: total - index,
      publishDate,
    });
  });

  return chapters;
}

/**
 * Extracts chapter image URLs from the page HTML.
 *
 * The site obfuscates image URLs in inline JavaScript. Each image URL is assigned
 * to a `pth` variable, deobfuscated via `.replace()` calls, then pushed to `lstImages`.
 * An external script (rguard.min.js) further processes the array with `beau()`.
 *
 * Deobfuscation pipeline:
 *   1. Extract raw `pth = '...'` assignments from inline <script> blocks
 *   2. Apply page-specific `pth.replace(/longPattern/g, 'char')` substitutions
 *   3. Apply rguard.min.js `beau()` decoding (see beauDecode below)
 *
 * See https://readcomiconline.li/Scripts/rguard.min.js?v=1.5.8
 */
export function parseChapterDetails($: CheerioAPI): string[] {
  const html = $.html();

  // Step 1: Collect page-specific deobfuscation patterns from pth.replace() calls.
  // These replace long obfuscation tokens with single characters,
  // e.g. pth = pth.replace(/ZT__BmiyOG_/g, 'g')
  const replacements: { pattern: RegExp; replacement: string }[] = [];
  const replaceRegex = /pth\s*=\s*pth\.replace\(\/([^/]+)\/g,\s*'([^']*)'\)/g;
  let replMatch;
  while ((replMatch = replaceRegex.exec(html)) !== null) {
    const pattern = replMatch[1];
    const replacement = replMatch[2];
    if (pattern.length > replacement.length) {
      replacements.push({ pattern: new RegExp(pattern, "g"), replacement });
    }
  }

  // Step 2: Extract raw pth string values. The page uses `lstImages.push(pth)`
  // with a variable reference (not a string literal), so we capture from
  // the `pth = '...'` assignments instead of from .push() calls.
  const rawPaths: string[] = [];
  const seen = new Set<string>();
  const pthRegex = /(?:var\s+)?pth\s*=\s*'([^']+)'/g;
  let match;
  while ((match = pthRegex.exec(html)) !== null) {
    const val = match[1];
    if (seen.has(val)) continue;
    seen.add(val);
    rawPaths.push(val);
  }

  // Step 3: Apply page-specific replacements, then rguard.min.js beau() decoding
  return rawPaths
    .map((pth) => {
      for (const { pattern, replacement } of replacements) {
        pth = pth.replace(pattern, replacement);
      }
      return beauDecode(pth);
    })
    .filter(Boolean) as string[];
}
