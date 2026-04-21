export const DOMAIN = "https://readcomiconline.li";

export type Metadata = {
  page?: number;
};

export type ListDiscoverSectionDefinition = {
  id: string;
  title: string;
  source: "list";
  path: string[];
};

export type DesktopTabDiscoverSectionDefinition = {
  id: string;
  title: string;
  source: "desktop-tab";
  tabId: "top-day" | "top-week" | "top-month";
};

export type DiscoverSectionDefinition =
  | ListDiscoverSectionDefinition
  | DesktopTabDiscoverSectionDefinition;

export const DISCOVER_SECTIONS: DiscoverSectionDefinition[] = [
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

export const DEFAULT_DISCOVER_SECTION_IDS = DISCOVER_SECTIONS.map((section) => section.id);
