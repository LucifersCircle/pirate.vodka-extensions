import type { Chapter, ChapterDetails, Request, SourceManga } from "@paperback/types";
import { URL } from "@paperback/types";
import { VORTEX_API_BASE, VORTEX_DOMAIN } from "../../main";
import { MangaProvider } from "../manga/main";
import type { VortexChaptersResponse } from "../shared/models";
import { fetchJSON, fetchText } from "../../services/network";
import { parseChapterDetails, parseChapterList } from "./parsers";

export class ChapterProvider {
  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const postId = sourceManga.mangaId;

    const url = new URL(VORTEX_API_BASE)
      .addPathComponent("chapters")
      .setQueryItem("postId", postId)
      .setQueryItem("skip", "0")
      .setQueryItem("take", "500")
      .setQueryItem("order", "desc")
      .setQueryItem("search", "")
      .toString();

    const request: Request = { url, method: "GET" };
    const json = await fetchJSON<VortexChaptersResponse>(request);

    return parseChapterList(json, sourceManga);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const sourceManga = chapter.sourceManga;

    if (chapter.title?.toLowerCase().includes("(locked)")) {
      throw new Error("This chapter is locked (premium/coins required).");
    }

    let slug = sourceManga.mangaInfo?.additionalInfo?.slug;
    if (!slug) {
      const mangaProvider = new MangaProvider();
      const updated = await mangaProvider.getMangaDetails(sourceManga.mangaId);
      slug = updated.mangaInfo?.additionalInfo?.slug;
    }

    if (!slug) {
      throw new Error(`[VortexScans] Missing slug for manga ${sourceManga.mangaId}`);
    }

    const url = new URL(VORTEX_DOMAIN)
      .addPathComponent("series")
      .addPathComponent(slug)
      .addPathComponent(chapter.chapterId)
      .toString();

    const html = await fetchText({ url, method: "GET" });

    return parseChapterDetails(html, chapter);
  }
}
