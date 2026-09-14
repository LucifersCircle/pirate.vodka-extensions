import type { SourceManga } from "@paperback/types";
import { URL } from "@paperback/types";
import { DOMAIN } from "../shared/models";
import { parseMangaId } from "../shared/utils";
import { fetchText } from "../../services/network";
import { parseMangaDetails, parseMangaPage } from "./parsers";

export class MangaProvider {
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const parsed = parseMangaId(mangaId);
    const slug = parsed.slug;

    if (!slug) {
      throw new Error(`Missing slug in mangaId: ${mangaId}`);
    }

    try {
      const url = new URL(DOMAIN).addPathComponent("series").addPathComponent(slug).toString();
      const post = parseMangaPage(await fetchText({ url, method: "GET" }), parsed);
      if (post) {
        return parseMangaDetails(post, mangaId);
      }
    } catch {
      // fall through to the final not-found error
    }

    throw new Error(`Could not fetch manga details for id: ${parsed.id}`);
  }
}
