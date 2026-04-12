import type { DiscoverSectionItem } from "@paperback/types";
import type { CheerioAPI } from "cheerio";
import { DOMAIN } from "../shared/models";

export function parseDiscoverItems($: CheerioAPI): DiscoverSectionItem[] {
  const items: DiscoverSectionItem[] = [];

  $("div.item-list div.section.group.list").each((_, element) => {
    const cover = $("div.col.cover", element);
    const info = $("div.col.info", element);

    const href = $("a", cover).attr("href") ?? "";
    const img = $("img", cover);
    const title = $("a", info).first().text().trim();
    const subtitle = info.find("p").eq(1).text().trim();
    const imageUrl = img.attr("src") ?? "";
    const mangaId = href.replace(/^\/Comic\//, "").replace(/\/$/, "");

    if (!mangaId || !title) {
      return;
    }

    items.push({
      type: "simpleCarouselItem" as const,
      mangaId,
      title: Application.decodeHTMLEntities(title),
      imageUrl: imageUrl.startsWith("/") ? `${DOMAIN}${imageUrl}` : imageUrl,
      subtitle: Application.decodeHTMLEntities(subtitle),
    });
  });

  return items;
}
