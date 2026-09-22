export const BASE_URL = "https://en-hijala.com";
export const API_URL = "https://api.en-hijala.com";
export const PAGE_SIZE = 20;

export const TYPES = ["MANHWA", "MANHUA", "MANGA", "SPANISH", "RUSSIAN"];
export const STATUSES = [
  "ONGOING",
  "COMPLETED",
  "CANCELLED",
  "DROPPED",
  "MASS_RELEASED",
  "COMING_SOON",
  "ONE_SHOT",
  "HIATUS",
];
export const SORTS = [
  { id: "lastChapterAddedAt:desc", label: "Latest Chapters" },
  { id: "totalViews:desc", label: "Most Popular" },
  { id: "createdAt:desc", label: "Newest Added" },
  { id: "createdAt:asc", label: "Oldest First" },
  { id: "chaptersCount:desc", label: "Most Chapters" },
  { id: "postTitle:asc", label: "A–Z" },
];
export type Genre = { id: number; name: string };
export type RawChapter = {
  id: number;
  slug: string;
  number: number;
  title?: string;
  createdAt?: string;
  isAccessible?: boolean;
  isLocked?: boolean;
  isLockedByCoins?: boolean;
  isShortLinkLocked?: boolean;
  isPermanentlyLocked?: boolean | number;
  price?: number;
};
export type Post = {
  id: number;
  slug: string;
  postTitle: string;
  featuredImage: string;
  postContent?: string;
  alternativeTitles?: string;
  author?: string;
  artist?: string;
  releaseDate?: string;
  seriesType?: string;
  seriesStatus?: string;
  isNovel?: boolean;
  genres: Genre[];
  chapters?: RawChapter[];
  _count?: { chapters?: number };
  averageRating?: number;
  createdAt?: string;
};
export type ReaderChapter = RawChapter & {
  mangaPostId: number;
  mangaPost?: { slug: string; isNovel?: boolean };
  images?: { url: string; order: number }[];
};
export type PostPage = { posts: Post[]; totalCount: number };
export type GenreSelection = Record<string, "included" | "excluded">;
export type Filters = {
  genres: GenreSelection;
  types: string[];
  statuses: string[];
  minChapters: string;
  maxChapters: string;
  createdAfter: string;
  createdBefore: string;
  direction: string;
};
export type Preferences = { types: string[]; excludedGenres: string[]; showLocked: boolean };

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringList(value: unknown, allowed?: string[]): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (v): v is string => typeof v === "string" && (!allowed || allowed.includes(v)),
          ),
        ),
      ]
    : [];
}

export function readFilters(value: unknown): Filters {
  const raw = record(value);
  const genres: GenreSelection = {};
  for (const [id, state] of Object.entries(record(raw.genres))) {
    if (/^\d+$/.test(id) && (state === "included" || state === "excluded")) genres[id] = state;
  }
  const text = (key: string) => (typeof raw[key] === "string" ? raw[key].trim() : "");
  return {
    genres,
    types: stringList(raw.types, TYPES),
    statuses: stringList(raw.statuses, STATUSES),
    minChapters: text("minChapters"),
    maxChapters: text("maxChapters"),
    createdAfter: text("createdAfter"),
    createdBefore: text("createdBefore"),
    direction: raw.direction === "asc" || raw.direction === "desc" ? raw.direction : "",
  };
}

export function validateFilters(filters: Filters): void {
  for (const key of ["minChapters", "maxChapters"] as const) {
    const value = filters[key];
    if (value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) {
      throw new Error("Chapter limits must be whole numbers of zero or greater.");
    }
  }
  if (
    filters.minChapters &&
    filters.maxChapters &&
    Number(filters.minChapters) > Number(filters.maxChapters)
  ) {
    throw new Error("Minimum chapters cannot exceed maximum chapters.");
  }
  for (const key of ["createdAfter", "createdBefore"] as const) {
    const value = filters[key];
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    ) {
      throw new Error("Dates must be valid calendar dates in YYYY-MM-DD format.");
    }
  }
  if (
    filters.createdAfter &&
    filters.createdBefore &&
    filters.createdAfter > filters.createdBefore
  ) {
    throw new Error("Created After cannot be later than Created Before.");
  }
}
