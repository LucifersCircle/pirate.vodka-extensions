/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
import { type TestLogger } from "@paperback/types";
import { expect } from "chai";
import { Marumaru } from "../Marumaru/main";
import sourceInfo from "../Marumaru/pbconfig";
import { TestSuite, registerNativeContracts, rejects } from "./suite";
type Episode = { id: number; number: number; ready?: boolean };
export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Marumaru native contracts", logger);
  const probe = registerNativeContracts(suite, Marumaru, sourceInfo, {
    discoverySectionId: "catalog",
    query: { title: "라멘 아카네코" },
    mangaId: "17155",
    chooseChapter(chapters) {
      const chapter = chapters.find((row) => row.chapterId === "21331");
      expect(chapter).not.to.equal(undefined);
      return chapter!;
    },
    assertInventory({ probe, source, chapters }) {
      const raw = probe.json<{ item: { id: number; episode_count: number }; episodes: Episode[] }>(
        ({ request }) =>
          request.url ===
          `https://api.storagewebtoon.store/api/v1/reader/A2/works/${source.mangaId}`,
      );
      expect(String(raw.item.id)).to.equal(source.mangaId);
      expect(raw.episodes).to.have.length(raw.item.episode_count);
      const visible = raw.episodes
        .filter((episode) => episode.ready !== false)
        .sort((a, b) => b.number - a.number);
      expect(
        chapters.map((chapter) => [chapter.chapterId, chapter.chapNum, chapter.sortingIndex]),
      ).to.deep.equal(
        visible.map((episode) => [String(episode.id), episode.number, episode.number]),
      );
    },
    assertReader({ probe, chapter, reader }) {
      const raw = probe.json<{ item: { id: number; work_id: number; body: { url: string }[] } }>(
        ({ request }) =>
          request.url ===
          `https://api.storagewebtoon.store/api/v1/reader/A2/episodes/${chapter.chapterId}`,
      );
      expect(String(raw.item.id)).to.equal(chapter.chapterId);
      expect(String(raw.item.work_id)).to.equal(chapter.sourceManga.mangaId);
      if (!("pages" in reader)) throw new Error("Expected image reader");
      expect(reader.pages).to.deep.equal(raw.item.body.map((page) => page.url));
    },
    async guard({ extension, chapters }) {
      expect(chapters).not.to.equal(undefined);
      await rejects(
        () =>
          extension.getChapterDetails({ ...chapters![0], chapNum: chapters![0].chapNum + 0.123 }),
        /identity does not match/,
      );
    },
  });
  try {
    await suite.run();
  } finally {
    logger.log("requestCounts", probe.counts());
    probe.unregisterInterceptor();
  }
}
