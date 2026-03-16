import type { Request, SourceManga } from "@paperback/types";
import { URL } from "@paperback/types";
import { VORTEX_API_BASE } from "../../main";
import type { VortexPost, VortexQueryResponse } from "../shared/models";
import { fetchJSON } from "../../services/network";
import { parseMangaDetails } from "./parsers";

const PAGE_SIZE = 48;

export class MangaProvider {
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const cached = Application.getState(`post_${mangaId}`) as string | undefined;
    if (cached) {
      const post = JSON.parse(cached) as VortexPost;
      return parseMangaDetails(post);
    }

    for (let page = 1; page <= 10; page++) {
      const url = new URL(VORTEX_API_BASE)
        .addPathComponent("posts")
        .setQueryItem("page", page.toString())
        .setQueryItem("perPage", PAGE_SIZE.toString())
        .setQueryItem("searchTerm", "")
        .setQueryItem("isNovel", "false")
        .setQueryItem("tag", "hot")
        .toString();

      const request: Request = { url, method: "GET" };
      const json = await fetchJSON<VortexQueryResponse>(request);
      const posts = json.posts ?? [];

      for (const p of posts) {
        Application.setState(JSON.stringify(p), `post_${p.id}`);
      }

      const post = posts.find((p) => p.id.toString() === mangaId);
      if (post) {
        return parseMangaDetails(post);
      }

      if (posts.length < PAGE_SIZE) break;
    }

    throw new Error(`[VortexScans] Could not find manga with id: ${mangaId}`);
  }
}
