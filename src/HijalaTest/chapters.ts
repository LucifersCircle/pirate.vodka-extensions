/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Homepage update preflight follows Kagane, Copyright © 2026 Inkdex. */
import type { Chapter, ChapterDetails, SourceManga, UpdateManager } from "@paperback/types";
import { BASE_URL } from "./models";
import { getPost } from "./catalog";
import { fetchText } from "./network";
import {
  chapterDetails,
  flightProperty,
  fromPaperbackId,
  parseChapters,
  seriesURL,
  slugPath,
} from "./parsers";
import { getPreferences } from "./settings";

export class ChapterProvider {
  async processTitlesForUpdates(
    _updateManager: UpdateManager,
    _lastUpdateDate?: Date,
  ): Promise<void> {
    await Application.scheduleRequest({ url: `${BASE_URL}/`, method: "GET" });
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const post = await getPost(sourceManga.mangaId);
    return parseChapters(post, sourceManga, getPreferences().showLocked);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = `${seriesURL(fromPaperbackId(chapter.sourceManga.mangaId))}/${slugPath(fromPaperbackId(chapter.chapterId))}`;
    return chapterDetails(flightProperty(await fetchText(url), "chapter"), chapter);
  }
}
