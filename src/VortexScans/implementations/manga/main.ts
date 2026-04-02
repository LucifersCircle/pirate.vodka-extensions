import type { Request, SourceManga } from "@paperback/types";
import { URL } from "@paperback/types";
import { DOMAIN_API, PAGE_SIZE } from "../shared/models";
import type { VortexPost, VortexQueryResponse } from "../shared/models";
import { fetchJSON } from "../../services/network";
import { parseMangaDetails } from "./parsers";

function normalizeSearchTerm(term: string): string {
  return term
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ");
}

function slugToSearchTerm(slug: string): string {
  return slug.replace(/-/g, " ").trim();
}

function buildQueryUrl(searchTerm: string): string {
  return new URL(DOMAIN_API)
    .addPathComponent("query")
    .setQueryItem("perPage", PAGE_SIZE.toString())
    .setQueryItem("page", "1")
    .setQueryItem("orderBy", "lastChapterAddedAt")
    .setQueryItem("orderDirection", "desc")
    .setQueryItem("searchTerm", searchTerm)
    .toString();
}

function buildPostsUrl(page: number): string {
  return new URL(DOMAIN_API)
    .addPathComponent("posts")
    .setQueryItem("page", page.toString())
    .setQueryItem("perPage", PAGE_SIZE.toString())
    .setQueryItem("searchTerm", "")
    .setQueryItem("isNovel", "false")
    .setQueryItem("tag", "hot")
    .toString();
}

function cachePost(post: VortexPost): void {
  Application.setState(JSON.stringify(post), `post_${post.id}`);
}

async function fetchPostBySearchTerm(
  mangaId: string,
  searchTerm: string,
): Promise<VortexPost | undefined> {
  const normalized = normalizeSearchTerm(searchTerm);
  if (!normalized) {
    return undefined;
  }

  const request: Request = { url: buildQueryUrl(normalized), method: "GET" };
  const data = await fetchJSON<VortexQueryResponse>(request);
  const post = data.posts?.find((candidate) => candidate.id.toString() === mangaId);

  if (post) {
    cachePost(post);
    return post;
  }

  if (normalized.includes("'")) {
    const retryRequest: Request = {
      url: buildQueryUrl(normalized.replace(/'/g, "\u2019")),
      method: "GET",
    };
    const retryData = await fetchJSON<VortexQueryResponse>(retryRequest);
    const retryPost = retryData.posts?.find((candidate) => candidate.id.toString() === mangaId);
    if (retryPost) {
      cachePost(retryPost);
      return retryPost;
    }
  }

  return undefined;
}

async function refreshCachedPost(cachedPost: VortexPost): Promise<VortexPost | undefined> {
  const terms = Array.from(
    new Set(
      [cachedPost.postTitle, slugToSearchTerm(cachedPost.slug)]
        .map((term) => normalizeSearchTerm(term))
        .filter((term) => term.length > 0),
    ),
  );

  for (const term of terms) {
    const post = await fetchPostBySearchTerm(cachedPost.id.toString(), term);
    if (post) {
      return post;
    }
  }

  return undefined;
}

async function scanPostsForManga(mangaId: string): Promise<VortexPost | undefined> {
  for (let page = 1; page <= 10; page++) {
    const request: Request = { url: buildPostsUrl(page), method: "GET" };
    const data = await fetchJSON<VortexQueryResponse>(request);
    const posts = data.posts ?? [];

    for (const post of posts) {
      cachePost(post);
    }

    const matched = posts.find((post) => post.id.toString() === mangaId);
    if (matched) {
      return matched;
    }

    if (posts.length < PAGE_SIZE) {
      break;
    }
  }

  return undefined;
}

export class MangaProvider {
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const cacheKey = `post_${mangaId}`;
    const cached = Application.getState(cacheKey) as string | undefined;
    let cachedPost: VortexPost | undefined;

    if (cached) {
      cachedPost = JSON.parse(cached) as VortexPost;
    }

    if (cachedPost) {
      try {
        const refreshed = await refreshCachedPost(cachedPost);
        if (refreshed) {
          return parseMangaDetails(refreshed);
        }
      } catch {
        // fall back to stale cached details if refresh fails
      }

      return parseMangaDetails(cachedPost);
    }

    const scanned = await scanPostsForManga(mangaId);
    if (scanned) {
      return parseMangaDetails(scanned);
    }

    throw new Error(`Could not find manga with id: ${mangaId}`);
  }
}
