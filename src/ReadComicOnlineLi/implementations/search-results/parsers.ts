import type { SearchFilter, SearchResultItem } from "@paperback/types";
import { ContentRating } from "@paperback/types";
import type { CheerioAPI } from "cheerio";
import { DOMAIN } from "../shared/models";

export function parseSearchResults($: CheerioAPI): SearchResultItem[] {
  const results: SearchResultItem[] = [];

  $("div.item-list div.section.group.list").each((_, el) => {
    const cover = $("div.col.cover", el);
    const info = $("div.col.info", el);

    const href = $("a", cover).attr("href") ?? "";
    const img = $("img", cover);
    const title = img.attr("title") ?? $("a", info).first().text().trim() ?? "";
    const imageUrl = img.attr("src") ?? "";
    const subtitle = info.find("p").eq(1).text().trim();

    const mangaId = href.replace(/^\/Comic\//, "").replace(/\/$/, "");

    if (!mangaId || !title) return;

    const fullImageUrl = imageUrl.startsWith("/") ? DOMAIN + imageUrl : imageUrl;

    results.push({
      mangaId,
      title: Application.decodeHTMLEntities(title),
      imageUrl: fullImageUrl,
      subtitle,
      contentRating: ContentRating.EVERYONE,
    });
  });

  return results;
}

export async function buildSearchFilters(): Promise<SearchFilter[]> {
  return [];
}
