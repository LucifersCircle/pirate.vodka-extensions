import type { DiscoverSection, DiscoverSectionItem, PagedResults, Request } from "@paperback/types";
import { DiscoverSectionType, URL } from "@paperback/types";
import { DOMAIN_API, PAGE_SIZE } from "../shared/models";
import type { Metadata, VortexQueryResponse } from "../shared/models";
import { fetchJSON } from "../../services/network";
import { parseDiscoverItems } from "./parsers";

export class DiscoverProvider {
  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "latest_hot",
        title: "Latest (Hot)",
        type: DiscoverSectionType.chapterUpdates,
      },
      {
        id: "latest_new",
        title: "Latest (New)",
        type: DiscoverSectionType.chapterUpdates,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: Metadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const tag = section.id === "latest_new" ? "new" : "hot";

    const url = new URL(DOMAIN_API)
      .addPathComponent("posts")
      .setQueryItem("page", page.toString())
      .setQueryItem("perPage", PAGE_SIZE.toString())
      .setQueryItem("searchTerm", "")
      .setQueryItem("isNovel", "false")
      .setQueryItem("tag", tag)
      .toString();

    const request: Request = { url, method: "GET" };
    const data = await fetchJSON<VortexQueryResponse>(request);
    const items = parseDiscoverItems(data);

    return {
      items,
      metadata: items.length >= PAGE_SIZE ? { page: page + 1 } : undefined,
    };
  }
}
