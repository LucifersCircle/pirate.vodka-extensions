import type { Request, SourceManga } from "@paperback/types";
import { URL } from "@paperback/types";
import { MANGATARO_DOMAIN } from "../../main";
import { fetchText } from "../../services/network";
import { parseMangaDetails } from "./parsers";

export class MangaProvider {
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const slug = mangaId.split(":")[0] ?? mangaId;

    const url = new URL(MANGATARO_DOMAIN)
      .addPathComponent("manga")
      .addPathComponent(slug)
      .toString();

    const request: Request = { url, method: "GET" };
    const html = await fetchText(request);

    return parseMangaDetails(html, mangaId);
  }
}
