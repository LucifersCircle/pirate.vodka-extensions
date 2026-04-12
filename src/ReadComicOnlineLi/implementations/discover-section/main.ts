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
import { parseDesktopTabItems, parseDiscoverItems } from "./parsers";

type ListDiscoverSectionDefinition = {
  id: string;
  title: string;
  source: "list";
  path: string[];
};

type DesktopTabDiscoverSectionDefinition = {
  id: string;
  title: string;
  source: "desktop-tab";
  tabId: "top-day" | "top-week" | "top-month";
};

type DiscoverSectionDefinition =
  | ListDiscoverSectionDefinition
  | DesktopTabDiscoverSectionDefinition;

const DISCOVER_SECTIONS: DiscoverSectionDefinition[] = [
  {
    id: "latest-update",
    title: "Latest Update",
    source: "list",
    path: ["ComicList", "LatestUpdate"],
  },
  {
    id: "new-comic",
    title: "New Comic",
    source: "list",
    path: ["ComicList", "Newest"],
  },
  {
    id: "top-day",
    title: "Top Day",
    source: "desktop-tab",
    tabId: "top-day",
  },
  {
    id: "top-week",
    title: "Top Week",
    source: "desktop-tab",
    tabId: "top-week",
  },
  {
    id: "top-month",
    title: "Top Month",
    source: "desktop-tab",
    tabId: "top-month",
  },
  {
    id: "most-popular",
    title: "Most Popular",
    source: "list",
    path: ["ComicList", "MostPopular"],
  },
  {
    id: "marvel-comics-alphabetical",
    title: "Marvel Comics: Alphabetical",
    source: "list",
    path: ["Publisher", "Marvel"],
  },
  {
    id: "marvel-comics-latest",
    title: "Marvel Comics: Latest",
    source: "list",
    path: ["Publisher", "Marvel", "LatestUpdate"],
  },
  {
    id: "marvel-comics-popular",
    title: "Marvel Comics: Popular",
    source: "list",
    path: ["Publisher", "Marvel", "MostPopular"],
  },
  {
    id: "marvel-comics-new",
    title: "Marvel Comics: New",
    source: "list",
    path: ["Publisher", "Marvel", "Newest"],
  },
  {
    id: "dc-comics-alphabetical",
    title: "DC Comics: Alphabetical",
    source: "list",
    path: ["Publisher", "DC-Comics"],
  },
  {
    id: "dc-comics-latest",
    title: "DC Comics: Latest",
    source: "list",
    path: ["Publisher", "DC-Comics", "LatestUpdate"],
  },
  {
    id: "dc-comics-popular",
    title: "DC Comics: Popular",
    source: "list",
    path: ["Publisher", "DC-Comics", "MostPopular"],
  },
  {
    id: "dc-comics-new",
    title: "DC Comics: New",
    source: "list",
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

    if (definition.source === "desktop-tab") {
      const $ = await fetchCheerio({
        url: DOMAIN,
        method: "GET",
        headers: {
          cookie: "dsk_ui=1",
        },
      });

      return {
        items: parseDesktopTabItems($, definition.tabId),
        metadata: undefined,
      };
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
