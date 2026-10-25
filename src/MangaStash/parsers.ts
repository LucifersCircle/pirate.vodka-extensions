/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import * as cheerio from "cheerio";
import { type Chapter, type ChapterDetails, type SourceManga } from "@paperback/types";
import {
  BASE_URL,
  CONTROLS,
  SECTIONS,
  SORTS,
  COMPATIBILITY,
  nativeRating,
  type Card,
  type Page,
  type Rating,
} from "./models";
import {
  chapterId,
  chapterURL,
  continuation,
  imageURL,
  pageNumber,
  queryPairs,
  seriesId,
  seriesURL,
  sourceURL,
} from "./urls";
type Root = cheerio.CheerioAPI;
const text = (v: string) => v.replace(/\s+/g, " ").trim();
export const ratingFromLabels = (labels: string[]): Rating => {
  const found = labels.map((v) => text(v).toLowerCase());
  if (
    found.some(
      (v) =>
        /mature|suggestive|adult|explicit|nsfw|18\s*\+/.test(v) &&
        !/^(mature|suggestive|adult|explicit|nsfw|18\+)$/.test(v),
    )
  )
    throw new Error("MangaStash returned an unrecognized content classification.");
  if (found.some((v) => /^(explicit|adult|18\+|hentai|smut|pornographic|nsfw)$/.test(v)))
    return "explicit";
  if (found.includes("mature")) return "mature";
  if (found.includes("suggestive") || found.includes("ecchi")) return "suggestive";
  return found.includes("safe") ? "safe" : "unknown";
};
const document = (html: string): Root => {
  if (!html || /cf-chl-|<title>Just a moment|<title>Access denied/i.test(html))
    throw new Error("MangaStash requires website verification or returned an access error.");
  return cheerio.load(html);
};
const canonical = ($: Root, url: string) => {
  const links = $('link[rel="canonical"]');
  if (links.length !== 1 || sourceURL(links.attr("href") ?? "").href !== url)
    throw new Error("MangaStash canonical identity mismatch.");
};
const labels = ($: Root, root: ReturnType<Root>) =>
  root
    .find(".badge, .content-rating, .content-warning, [data-content-rating]")
    .toArray()
    .map((e) => {
      const node = $(e),
        value = text(node.attr("data-content-rating") ?? node.text());
      if (node.is(".content-warning") && ["safe", "unknown"].includes(ratingFromLabels([value])))
        throw new Error(
          "MangaStash returned an unrecognized content warning; review it on the website.",
        );
      if (
        node.is(".content-rating, [data-content-rating]") &&
        !/^(safe|suggestive|mature|explicit|adult|18\+|hentai|smut|pornographic|nsfw|ecchi)$/i.test(
          value,
        )
      )
        throw new Error("MangaStash returned an unrecognized content classification.");
      return value;
    });
const cover = ($: Root, root: ReturnType<Root>, id: string, original?: string) => {
  if (original) return imageURL(original, id);
  const img = root.find("img").first();
  const set = img.attr("srcset") ?? img.attr("data-srcset");
  if (set) {
    const candidates = set.split(",").map((s) => {
      const m = s.trim().match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/);
      if (!m) throw new Error("Malformed MangaStash cover srcset.");
      return { url: m[1], size: Number(m[2]), unit: m[3] };
    });
    if (new Set(candidates.map((c) => c.unit)).size !== 1)
      throw new Error("Mixed MangaStash cover sizes.");
    return imageURL(candidates.sort((a, b) => b.size - a.size)[0].url, id);
  }
  return imageURL(img.attr("data-src") || img.attr("src") || "", id);
};
const card = ($: Root, e: ReturnType<Root>, update = false): Card => {
  const link = update ? e.find("a.update-title") : e;
  const id = seriesId(link.attr("href") ?? "");
  const title = text(update ? link.text() : e.find("h3").text());
  if (!title) throw new Error("MangaStash returned an untitled series.");
  const sourceRating = ratingFromLabels(labels($, e));
  return {
    mangaId: id,
    title,
    imageUrl: cover($, e, id),
    contentRating: nativeRating(sourceRating),
    sourceRating,
  };
};
const unique = (items: Card[]) => {
  if (new Set(items.map((i) => i.mangaId)).size !== items.length)
    throw new Error("MangaStash repeated catalog identities.");
  return items;
};
export const parseHome = (html: string): Record<string, Card[]> => {
  const $ = document(html);
  canonical($, BASE_URL + "/");
  const result: Record<string, Card[]> = {};
  for (const section of SECTIONS) {
    const roots = $("section.home-section").filter(
      (_, e) => text($(e).find("h2.section-title").first().text()) === section.title,
    );
    if (roots.length !== 1)
      throw new Error(`MangaStash ${section.title} feed is missing or ambiguous.`);
    result[section.id] = unique(
      roots
        .find(
          section.id === "latest"
            ? ".latest-updates > .update-row"
            : ".series-scroll > a.series-card",
        )
        .toArray()
        .map((e) => card($, $(e), section.id === "latest")),
    );
    if (!result[section.id].length)
      throw new Error(`MangaStash ${section.title} feed is unavailable.`);
  }
  return result;
};
export const distinctHomeSections = (home: Record<string, Card[]>) => {
  const seen = new Set<string>();
  return SECTIONS.filter((section) => {
    const sequence = home[section.id].map((item) => item.mangaId).join("|");
    if (seen.has(sequence)) return false;
    seen.add(sequence);
    return true;
  });
};
export const validateBrowseControls = (html: string, url: string): void => {
  const $ = document(html),
    selected: Record<string, string[]> = {};
  for (const [key, v] of queryPairs(url)) {
    const k = key.replace(/\[(?:\d*)\]$/, "");
    if (k !== "page") (selected[k] ??= []).push(v);
  }
  for (const control of CONTROLS) {
    const name = control.id + (control.id === "rating" ? "" : "[]");
    const inputs = $(
      `.browse-filters input[name="${name}"], .filter-sidebar input[name="${name}"]`,
    );
    // Restrict by exact input names; layout wrappers are not an identity contract.
    const all = inputs.length ? inputs : $(`form input[name="${name}"]`);
    const values = all.toArray().map((e) => $(e).attr("value") ?? "");
    if (
      JSON.stringify([...values].sort()) !== JSON.stringify(control.items.map((i) => i.id).sort())
    )
      throw new Error("MangaStash browse controls changed; update the source.");
    const checked = all
      .filter("[checked]")
      .toArray()
      .map((e) => $(e).attr("value") ?? "")
      .filter(Boolean)
      .sort();
    if (
      JSON.stringify(checked) !==
      JSON.stringify((selected[control.id] ?? []).filter(Boolean).sort())
    )
      throw new Error("MangaStash did not preserve selected browse filters.");
  }
  const options = $("select.sort-select option")
    .toArray()
    .map((e) => ({
      id: queryPairs(BASE_URL + "/browse/" + ($(e).attr("value") ?? "")).find(
        ([k]) => k === "sort",
      )?.[1],
      selected: $(e).is("[selected]"),
    }));
  if (
    JSON.stringify(options.map((o) => o.id)) !== JSON.stringify(SORTS.map((s) => s.id)) ||
    options.filter((o) => o.selected).length !== 1 ||
    options.find((o) => o.selected)?.id !== (selected.sort?.[0] ?? "latest")
  )
    throw new Error("MangaStash sort controls changed or ignored the selection.");
};
export const parseCatalog = (html: string, url: string): Page => {
  const $ = document(html),
    search = sourceURL(url).pathname === "/search";
  const root = $(search ? ".search-page" : ".browse-results");
  if (root.length !== 1) throw new Error("MangaStash catalog structure is unavailable.");
  if (search) {
    const q = queryPairs(url).find(([k]) => k === "q")?.[1];
    if ($(".search-form-large input[name=q]").attr("value") !== q)
      throw new Error("MangaStash search query mismatch.");
  } else validateBrowseControls(html, url);
  const items = unique(
    root
      .find(search ? ".search-results > a.search-result-row" : ".series-grid > a.series-card")
      .toArray()
      .map((e) => card($, $(e))),
  );
  const count = text(root.find(search ? ".search-summary" : ".result-count").text()).match(
    /^([\d,]+) (?:result|series)/,
  );
  if (!items.length && (!count || Number(count[1].replace(/,/g, "")) !== 0))
    throw new Error("MangaStash returned an unexplained empty catalog.");
  const active = root.find(".pagination .page-num.active");
  if (active.length && (active.length !== 1 || Number(active.text()) !== pageNumber(url)))
    throw new Error("MangaStash returned the wrong catalog page.");
  const links = root.find(".pagination .page-next");
  if (links.length > 1) throw new Error("Ambiguous MangaStash continuation.");
  const next = links.attr("href");
  return { items, ...(next ? { next: continuation(next, url) } : {}) };
};
const schema = ($: Root, type: string): Record<string, unknown> => {
  const values = $("script[type='application/ld+json']")
    .toArray()
    .map((e) => {
      try {
        return JSON.parse($(e).text()) as Record<string, unknown>;
      } catch {
        throw new Error("Malformed MangaStash identity metadata.");
      }
    })
    .filter((v) => v["@type"] === type);
  if (values.length !== 1) throw new Error("Missing MangaStash identity metadata.");
  return values[0];
};
export type Detail = {
  source: SourceManga;
  rating: Rating;
  chapters: Omit<Chapter, "sourceManga">[];
};
export const parseDetails = (html: string, id: string): Detail => {
  const $ = document(html);
  canonical($, seriesURL(id));
  const book = schema($, "Book"),
    root = $(".series-page");
  const title = text(root.find(".series-header h1").text());
  if (!title || book.url !== seriesURL(id) || book["@id"] !== book.url || book.name !== title)
    throw new Error("MangaStash series metadata identity mismatch.");
  const rating = ratingFromLabels([
    ...labels($, root.find(".series-header")),
    ...root
      .find(".content-warning")
      .toArray()
      .map((e) => {
        const value = text($(e).text());
        if (["safe", "unknown"].includes(ratingFromLabels([value])))
          throw new Error(
            "MangaStash returned an unrecognized content warning; review it on the website.",
          );
        return value;
      }),
  ]);
  const image = cover(
    $,
    root.find(".series-cover"),
    id,
    $('meta[property="og:image"]').attr("content"),
  );
  const chapterRows = $("#chapter-list > a.chapter-row"),
    chapters: Omit<Chapter, "sourceManga">[] = [];
  chapterRows.each((i, e) => {
    const row = $(e),
      cid = chapterId(row.attr("href") ?? "", id),
      num = row.attr("data-num");
    if (!num || !/^\d+(?:\.\d+)?$/.test(num) || !Number.isFinite(Number(num)))
      throw new Error("MangaStash chapter number is invalid.");
    const rawTitle = text(row.find(".chapter-num").text()),
      extra = text(row.find(".chapter-title").text());
    const locked =
      row.is(".locked, [data-locked=true], [aria-disabled=true]") ||
      /locked|premium|login|purchase|subscribe/i.test(row.find(".chapter-meta").text());
    const date = row.find("time[datetime]").attr("datetime");
    if (date && !Number.isFinite(Date.parse(date)))
      throw new Error("Invalid MangaStash chapter date.");
    chapters.push({
      chapterId: cid,
      chapNum: Number(num),
      langCode: "en",
      volume: 0,
      sortingIndex: i,
      ...(extra
        ? { title: extra }
        : rawTitle && !/^Ch\.\s*\d+(?:\.\d+)?$/i.test(rawTitle)
          ? { title: rawTitle }
          : {}),
      ...(date ? { publishDate: new Date(date) } : {}),
      additionalInfo: { locked: String(locked) },
    });
  });
  const declared = text($("#chapters .cl-toolbar h2").text()).match(/^Chapters \((\d+)\)$/);
  if (
    !declared ||
    Number(declared[1]) !== chapters.length ||
    (book.numberOfPages !== undefined && book.numberOfPages !== chapters.length) ||
    new Set(chapters.map((c) => c.chapterId)).size !== chapters.length
  )
    throw new Error("MangaStash chapter inventory is incomplete or repeated.");
  const tagGroups = root
    .find(".series-tags .tag-group")
    .toArray()
    .map((e) => ({
      id: text($(e).find(".tag-category").text()).toLowerCase().replace(/:$/, ""),
      title: text($(e).find(".tag-category").text()).replace(/:$/, ""),
      tags: $(e)
        .find("a.tag-chip")
        .toArray()
        .map((t) => ({ id: sourceURL($(t).attr("href") ?? "").query, title: text($(t).text()) })),
    }));
  const badges = root
    .find(".series-badges .badge")
    .toArray()
    .map((e) => text($(e).text()));
  const aggregate = book.aggregateRating as
    | { ratingValue?: unknown; bestRating?: unknown }
    | undefined;
  const stars =
    typeof aggregate?.ratingValue === "number" &&
    Number.isFinite(aggregate.ratingValue) &&
    aggregate.ratingValue >= 0 &&
    aggregate.ratingValue <= 5 &&
    aggregate.bestRating === 5
      ? aggregate.ratingValue
      : undefined;
  return {
    rating,
    chapters,
    source: {
      mangaId: id,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: [],
        thumbnailUrl: image,
        synopsis: text(root.find(".series-description").text()) + "\n\n" + COMPATIBILITY,
        contentRating: nativeRating(rating),
        status: badges.find((b) => /^(Ongoing|Completed|Hiatus|Cancelled)$/i.test(b)),
        author: text(root.find(".series-author").text()).replace(/^by\s+/i, ""),
        tagGroups,
        shareUrl: seriesURL(id),
        ...(stars !== undefined ? { rating: stars / 5 } : {}),
        additionalInfo: {
          sourceContentRating: rating === "unknown" ? "Unclassified" : rating,
          classificationProvenance:
            rating === "unknown"
              ? "Compatibility fallback, not a source label"
              : "Explicit source label",
          chapterDates: "Unavailable bulk dates are omitted.",
        },
      },
    },
  };
};
export const parseReader = (html: string, chapter: Chapter): ChapterDetails => {
  const id = chapter.sourceManga.mangaId,
    url = chapterURL(chapter.chapterId, id),
    $ = document(html);
  canonical($, url);
  if (
    $(".reader-locked, .chapter-locked, .access-denied, .reader-error, [data-locked=true]").length
  )
    throw new Error("MangaStash reader requires access or is unavailable.");
  const article = schema($, "Article"),
    owner = article.isPartOf as { url?: unknown; name?: unknown } | undefined;
  const title = chapter.sourceManga.mangaInfo.primaryTitle;
  const ownerLinks = $(".reader #rd-rail a.rd-rail__btn[href]").filter((_, node) => {
    try {
      return sourceURL($(node).attr("href") ?? "").href === seriesURL(id);
    } catch {
      return false;
    }
  });
  const heading = $(".reader h1.rd-sr-only");
  if (
    article.url !== url ||
    article["@id"] !== url ||
    owner?.url !== seriesURL(id) ||
    owner.name !== title ||
    ownerLinks.length !== 1 ||
    seriesId(ownerLinks.attr("href") ?? "") !== id ||
    heading.length !== 1 ||
    text(heading.text()) !== article.headline ||
    !String(article.headline).startsWith(title + " Ch. ")
  )
    throw new Error("MangaStash reader owner identity mismatch.");
  const selected = $("a.rd-sheet__row.is-current");
  if (selected.length !== 1 || chapterId(selected.attr("href") ?? "", id) !== chapter.chapterId)
    throw new Error("MangaStash reader selected chapter mismatch.");
  const scripts = $("script:not([src])")
    .toArray()
    .map((e) => $(e).text())
    .filter((s) => /\bconst readerConfig\s*=/.test(s));
  if (scripts.length !== 1) throw new Error("Missing MangaStash readerConfig identity.");
  const block = scripts[0].match(/^\s*const readerConfig\s*=\s*\{([\s\S]*)\};\s*$/)?.[1];
  if (!block) throw new Error("Unsupported MangaStash readerConfig.");
  // Accept the entire observed static object grammar. Ignoring an unknown line
  // could miss a quoted/computed/spread property that overrides an identity key.
  const normalized = block.replace(/\r\n/g, "\n");
  if (normalized.includes("\r") || normalized.includes("\u2028") || normalized.includes("\u2029"))
    throw new Error("Unsupported MangaStash readerConfig line separator.");
  const values = new Map<string, string>();
  const stringKeys = ["seriesSlug", "format"],
    numberKeys = [
      "chapterNum",
      "chapterId",
      "seriesId",
      "midrollInterval",
      "totalPages",
      "totalChapters",
      "resumePage",
    ];
  for (const raw of normalized.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const entry = line.match(/^([a-zA-Z]+):\s*(.+),$/);
    if (!entry || values.has(entry[1]))
      throw new Error("Unsupported or duplicate MangaStash readerConfig key.");
    const [, key, value] = entry;
    if (stringKeys.includes(key)) {
      const match = value.match(/^'([a-z0-9-]+)'$/);
      if (!match) throw new Error("Unsupported MangaStash readerConfig string.");
      values.set(key, match[1]);
    } else if (key === "chapterLabel") {
      // Presentation only: never substitute this label for canonical identity.
      if (
        !/^(?:'[^'\\]{0,128}'|"[^"\\]{0,128}")$/.test(value) ||
        value
          .split("")
          .some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
      )
        throw new Error("Unsupported MangaStash readerConfig chapter label.");
      values.set(key, value);
    } else if (["hasPrev", "hasNext"].includes(key)) {
      const flag = value.trim();
      if (flag !== "true" && flag !== "false")
        throw new Error("Unsupported MangaStash readerConfig navigation flag.");
      values.set(key, flag);
    } else if (numberKeys.includes(key)) {
      if (!/^\d+(?:\.\d+)?$/.test(value))
        throw new Error("Unsupported MangaStash readerConfig number.");
      values.set(key, value);
    } else if (["prevChapter", "nextChapter"].includes(key)) {
      // Adjacent page counts are optional; this chapter still requires totalPages below.
      if (value !== "null" && !/^\{"number":\d+(?:\.\d+)?(?:,"pages":\d+)?\}$/.test(value))
        throw new Error("Unsupported MangaStash readerConfig navigation literal.");
      values.set(key, value);
    } else throw new Error("Unknown MangaStash readerConfig key.");
  }
  const literal = (key: string, kind: "string" | "number") => {
    const value = values.get(key);
    if (value === undefined || !(kind === "string" ? stringKeys : numberKeys).includes(key))
      throw new Error("Missing MangaStash readerConfig literal.");
    return value;
  };
  const total = Number(literal("totalPages", "number")),
    num = Number(literal("chapterNum", "number"));
  if (values.has("totalChapters")) {
    const count = Number(values.get("totalChapters"));
    if (!Number.isSafeInteger(count) || count < 1)
      throw new Error("Invalid MangaStash readerConfig chapter count.");
  }
  if (values.has("resumePage")) {
    const page = Number(values.get("resumePage"));
    if (!Number.isSafeInteger(page) || page < 0 || page > total)
      throw new Error("Invalid MangaStash readerConfig resume page.");
  }
  for (const [flag, adjacent] of [
    ["hasPrev", "prevChapter"],
    ["hasNext", "nextChapter"],
  ]) {
    if (
      values.has(flag) &&
      (!values.has(adjacent) || (values.get(flag) === "true") !== (values.get(adjacent) !== "null"))
    )
      throw new Error("MangaStash readerConfig navigation flag mismatch.");
  }
  if (
    literal("seriesSlug", "string") !== id ||
    num !== chapter.chapNum ||
    !Number.isSafeInteger(total) ||
    total < 1 ||
    total > 1000 ||
    !["manga", "manhwa"].includes(literal("format", "string")) ||
    !Number.isSafeInteger(Number(literal("seriesId", "number"))) ||
    Number(literal("seriesId", "number")) < 1 ||
    !Number.isSafeInteger(Number(literal("chapterId", "number"))) ||
    Number(literal("chapterId", "number")) < 1 ||
    text(heading.text()) !== `${title} Ch. ${num}`
  )
    throw new Error("MangaStash readerConfig identity mismatch.");
  const rows = $("#reader-pages > .reader-page");
  if ($("#reader-pages").length !== 1 || rows.length !== total)
    throw new Error("MangaStash reader page count mismatch.");
  const pages = rows.toArray().map((e, i) => {
    const row = $(e),
      imgs = row.find(".reader-page-inner > img");
    if (row.attr("data-page") !== String(i + 1) || imgs.length !== 1)
      throw new Error("MangaStash reader page ordering is invalid.");
    const page = imageURL(imgs.attr("data-src") || imgs.attr("src") || "", id, chapter.chapterId);
    const pageChapter = sourceURL(page).pathname.match(/\/chapter-(\d+(?:\.\d+)?)\//)?.[1];
    if (pageChapter === undefined || Number(pageChapter) !== num)
      throw new Error("MangaStash reader image chapter mismatch.");
    return page;
  });
  if (new Set(pages).size !== pages.length)
    throw new Error("MangaStash reader has duplicate page URLs.");
  return { id: chapter.chapterId, mangaId: id, pages };
};
