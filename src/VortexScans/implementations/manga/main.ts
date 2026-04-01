import type { Request, SourceManga } from "@paperback/types";
import { URL } from "@paperback/types";
import { DOMAIN_API, PAGE_SIZE } from "../shared/models";
import type { VortexPost, VortexQueryResponse } from "../shared/models";
import { fetchJSON } from "../../services/network";
import { parseMangaDetails } from "./parsers";

export class MangaProvider {
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const cacheKey = `post_${mangaId}`;
    const cached = Application.getState(cacheKey) as string | undefined;
    let cachedPost: VortexPost | undefined;

    if (cached) {
      cachedPost = JSON.parse(cached) as VortexPost;
    }

    for (let page = 1; page <= 10; page++) {
      const url = new URL(DOMAIN_API)
        .addPathComponent("posts")
        .setQueryItem("page", page.toString())
        .setQueryItem("perPage", PAGE_SIZE.toString())
        .setQueryItem("searchTerm", "")
        .setQueryItem("isNovel", "false")
        .setQueryItem("tag", "hot")
        .toString();

      const request: Request = { url, method: "GET" };
      const data = await fetchJSON<VortexQueryResponse>(request);
      const posts = data.posts ?? [];

      for (const p of posts) {
        Application.setState(JSON.stringify(p), `post_${p.id}`);
      }

      const post = posts.find((p) => p.id.toString() === mangaId);
      if (post) {
        return parseMangaDetails(post);
      }

      if (posts.length < PAGE_SIZE) break;
    }

    if (cachedPost) {
      return parseMangaDetails(cachedPost);
    }

    throw new Error(`Could not find manga with id: ${mangaId}`);
  }
}
