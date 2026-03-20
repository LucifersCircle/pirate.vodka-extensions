import type { SourceManga } from "@paperback/types";
import { URL } from "@paperback/types";
import { DOMAIN } from "../shared/models";
import { fetchCheerio } from "../../services/network";
import { parseMangaDetails } from "./parsers";

export class MangaProvider {
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = new URL(DOMAIN).addPathComponent("Comic").addPathComponent(mangaId).toString();

    const $ = await fetchCheerio({ url, method: "GET" });
    return parseMangaDetails($, mangaId);
  }
}
