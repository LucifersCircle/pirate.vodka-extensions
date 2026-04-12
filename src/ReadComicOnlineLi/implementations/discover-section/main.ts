import {
  DiscoverSectionType,
  URL,
  type DiscoverSection,
  type DiscoverSectionItem,
  type PagedResults,
  type Request,
} from "@paperback/types";
import { fetchCheerio } from "../../services/network";
import { getHiddenDiscoverSections } from "../settings-form/forms/main";
import { DOMAIN, type Metadata } from "../shared/models";
import { parseDiscoverItems } from "./parsers";

type DiscoverSectionDefinition = {
  id: string;
  title: string;
  path: string[];
};

const DISCOVER_SECTIONS: DiscoverSectionDefinition[] = [
  {
    id: "latest-update",
    title: "Latest Update",
    path: ["ComicList", "LatestUpdate"],
  },
  {
    id: "new-comic",
    title: "New Comic",
    path: ["ComicList", "Newest"],
  },
  {
    id: "most-popular",
    title: "Most Popular",
    path: ["ComicList", "MostPopular"],
  },
  {
    id: "marvel-comics-alphabetical",
    title: "Marvel Comics: Alphabetical",
    path: ["Publisher", "Marvel"],
  },
  {
    id: "marvel-comics-latest",
    title: "Marvel Comics: Latest",
    path: ["Publisher", "Marvel", "LatestUpdate"],
  },
  {
    id: "marvel-comics-popular",
    title: "Marvel Comics: Popular",
    path: ["Publisher", "Marvel", "MostPopular"],
  },
  {
    id: "marvel-comics-new",
    title: "Marvel Comics: New",
    path: ["Publisher", "Marvel", "Newest"],
  },
  {
    id: "dc-comics-alphabetical",
    title: "DC Comics: Alphabetical",
    path: ["Publisher", "DC-Comics"],
  },
  {
    id: "dc-comics-latest",
    title: "DC Comics: Latest",
    path: ["Publisher", "DC-Comics", "LatestUpdate"],
  },
  {
    id: "dc-comics-popular",
    title: "DC Comics: Popular",
    path: ["Publisher", "DC-Comics", "MostPopular"],
  },
  {
    id: "dc-comics-new",
    title: "DC Comics: New",
    path: ["Publisher", "DC-Comics", "Newest"],
  },
];

export class DiscoverProvider {
  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const hiddenSections = getHiddenDiscoverSections();

    return DISCOVER_SECTIONS.filter((section) => !hiddenSections.includes(section.id)).map(
      (section) => ({
        id: section.id,
        title: section.title,
        type: DiscoverSectionType.simpleCarousel,
      }),
    );
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: Metadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const definition = DISCOVER_SECTIONS.find((entry) => entry.id === section.id);
    if (!definition) {
      throw new Error(`[ReadComicOnlineLi] Unknown discover section: ${section.id}`);
    }

    const page = metadata?.page ?? 1;
    const request: Request = {
      url: buildSectionUrl(definition.path, page),
      method: "GET",
    };
    const $ = await fetchCheerio(request);
    const items = parseDiscoverItems($);
    const hasMore = $("a.next_bt").length > 0;

    return {
      items,
      metadata: hasMore ? { page: page + 1 } : undefined,
    };
  }
}

function buildSectionUrl(path: string[], page: number): string {
  const url = new URL(DOMAIN);

  for (const segment of path) {
    url.addPathComponent(segment);
  }

  if (page > 1) {
    url.setQueryItem("page", String(page));
  }

  return url.toString();
}
