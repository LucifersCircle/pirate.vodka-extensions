import type { Request, SourceManga } from "@paperback/types";
import { URL } from "@paperback/types";
import { QISCANS_API_BASE } from "../../main";
import type { QIScansSeriesDetailsResponse } from "../shared/models";
import { fetchJSON } from "../../services/network";
import { decodeMangaId } from "../shared/utils";
import { parseMangaDetails } from "./parsers";

export class MangaProvider {
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const slug = decodeMangaId(mangaId);
    const url = new URL(QISCANS_API_BASE)
      .addPathComponent("v1")
      .addPathComponent("series")
      .addPathComponent(slug)
      .toString();
    const request: Request = { url, method: "GET" };
    const data = await fetchJSON<QIScansSeriesDetailsResponse>(request);

    return parseMangaDetails(data);
  }
}
