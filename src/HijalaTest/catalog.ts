import { URL } from "@paperback/types";
import type { Metadata, PagedResults, SearchQuery, SortingOption } from "@paperback/types";
import {
  API_URL,
  BASE_URL,
  PAGE_SIZE,
  SORTS,
  readFilters,
  record,
  validateFilters,
} from "./models";
import type { Filters, Genre, Post, Preferences } from "./models";
import { fetchJSON, fetchText } from "./network";
import {
  allowedPost,
  flightProperty,
  fromPaperbackId,
  parseGenres,
  parsePost,
  parsePostPage,
  seriesURL,
} from "./parsers";
import { getPreferences } from "./settings";

export async function getGenres(): Promise<Genre[]> {
  return parseGenres(flightProperty(await fetchText(`${BASE_URL}/series`), "genres"));
}

export async function getPost(mangaId: string): Promise<Post> {
  return parsePost(flightProperty(await fetchText(seriesURL(fromPaperbackId(mangaId))), "post"));
}

export function matchesFilters(post: Post, filters: Filters, settings: Preferences): boolean {
  if (
    !allowedPost(post, settings) ||
    (filters.types.length && !filters.types.includes(post.seriesType ?? "")) ||
    (filters.statuses.length && !filters.statuses.includes(post.seriesStatus ?? ""))
  )
    return false;
  for (const [id, state] of Object.entries(filters.genres)) {
    const present = post.genres.some((genre) => String(genre.id) === id);
    if ((state === "included" && !present) || (state === "excluded" && present)) return false;
  }
  const count = post._count?.chapters;
  if (filters.minChapters && (count === undefined || count < Number(filters.minChapters)))
    return false;
  if (filters.maxChapters && (count === undefined || count > Number(filters.maxChapters)))
    return false;
  return true;
}

export function catalogURL(
  query: SearchQuery<Metadata>,
  page: number,
  sorting: SortingOption | undefined,
  settings: Preferences,
  feed?: "hot" | "new",
): string {
  const filters = readFilters(query.metadata);
  validateFilters(filters);
  const url = new URL(`${API_URL}/api/${feed ? "posts" : "query"}`)
    .setQueryItem("page", String(page))
    .setQueryItem("perPage", String(PAGE_SIZE))
    .setQueryItem("searchTerm", query.title.trim());
  if (feed) return url.setQueryItem("isNovel", "false").setQueryItem("tag", feed).toString();
  const selectedSort = SORTS.find((sort) => sort.id === sorting?.id) ?? SORTS[0];
  const [orderBy, direction] = selectedSort.id.split(":");
  url
    .setQueryItem("orderBy", orderBy)
    .setQueryItem("orderDirection", filters.direction || direction);
  const types = filters.types.length
    ? filters.types.filter((type) => settings.types.includes(type))
    : settings.types;
  if (types.length) url.setQueryItem("seriesType", types.join(","));
  if (filters.statuses.length) url.setQueryItem("seriesStatus", filters.statuses.join(","));
  const included = Object.keys(filters.genres).filter((id) => filters.genres[id] === "included");
  const excluded = [
    ...new Set([
      ...settings.excludedGenres,
      ...Object.keys(filters.genres).filter((id) => filters.genres[id] === "excluded"),
    ]),
  ];
  if (included.length) url.setQueryItem("genreIds", included.join(","));
  if (excluded.length) url.setQueryItem("excludedGenreIds", excluded.join(","));
  for (const key of ["minChapters", "maxChapters", "createdAfter", "createdBefore"] as const) {
    if (filters[key]) url.setQueryItem(key, filters[key]);
  }
  return url.toString();
}

export async function catalog(
  query: SearchQuery<Metadata>,
  metadata?: Metadata,
  sorting?: SortingOption,
  feed?: "hot" | "new",
): Promise<PagedResults<Post>> {
  const settings = getPreferences();
  const filters = readFilters(query.metadata);
  validateFilters(filters);
  const signature = JSON.stringify({
    title: query.title,
    filters,
    settings,
    sort: sorting?.id,
    feed,
  });
  const cursor = record(metadata);
  let page =
    cursor.signature === signature && Number.isSafeInteger(cursor.page) && Number(cursor.page) > 0
      ? Number(cursor.page)
      : 1;
  if (
    (filters.types.length && !filters.types.some((type) => settings.types.includes(type))) ||
    Object.keys(filters.genres).some(
      (id) => filters.genres[id] === "included" && settings.excludedGenres.includes(id),
    )
  ) {
    return { items: [] };
  }
  // Skip fully filtered raw pages without losing continuation or returning a false empty result.
  for (let attempt = 0; attempt < 10; attempt++, page++) {
    const data = parsePostPage(await fetchJSON(catalogURL(query, page, sorting, settings, feed)));
    if (!data.posts.length && (page - 1) * PAGE_SIZE < data.totalCount)
      throw new Error("Hijala returned an empty page before the catalog ended.");
    const seen = new Set<string>();
    const items = data.posts.filter((post) => {
      if (seen.has(post.slug) || !matchesFilters(post, filters, settings)) return false;
      seen.add(post.slug);
      return true;
    });
    const hasNext = page * PAGE_SIZE < data.totalCount;
    if (items.length || !hasNext)
      return { items, metadata: hasNext ? { page: page + 1, signature } : undefined };
  }
  throw new Error("No matching titles in ten catalog pages. Narrow your filters and try again.");
}
