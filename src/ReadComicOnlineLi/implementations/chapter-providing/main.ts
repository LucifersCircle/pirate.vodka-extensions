import type { Chapter, ChapterDetails, SourceManga } from "@paperback/types";
import { URL } from "@paperback/types";
import { DOMAIN } from "../shared/models";
import { createChapterPageUrls, fetchCheerio } from "../../services/network";
import { parseChapterDetails, parseChapterList } from "./parsers";

export class ChapterProvider {
  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const url = new URL(DOMAIN)
      .addPathComponent("Comic")
      .addPathComponent(sourceManga.mangaId)
      .toString();

    const $ = await fetchCheerio({ url, method: "GET" });
    return parseChapterList($, sourceManga);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = `${DOMAIN}/Comic/${chapter.chapterId}&readType=1`;

    const $ = await fetchCheerio({ url, method: "GET" });
    const pages = createChapterPageUrls(
      chapter.sourceManga.mangaId,
      chapter.chapterId,
      parseChapterDetails($),
    );

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages,
    };
  }
}
