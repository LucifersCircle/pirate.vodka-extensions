import type { SourceManga } from "@paperback/types";
import { URL } from "@paperback/types";
import { DOMAIN } from "../shared/models";
import { assertMangaAllowed, contentSettings, withContentSettings } from "../shared/content";
import { parseMangaId } from "../shared/utils";
import { fetchText } from "../../services/network";
import { parseMangaDetails, parseMangaPage } from "./parsers";

const checked = new Map<string, { revision: number; expires: number }>();
export async function ensureMangaAllowed(manga: SourceManga): Promise<void> {
  assertMangaAllowed(manga);
  const settings = contentSettings(),
    cached = checked.get(manga.mangaId);
  if (
    settings.excludeNSFW &&
    (!cached || cached.revision !== settings.revision || cached.expires <= Date.now())
  )
    await new MangaProvider().getMangaDetails(manga.mangaId);
  assertMangaAllowed(manga);
}
export class MangaProvider {
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    return withContentSettings(async () => {
      const manga = await this.fetchMangaDetails(mangaId);
      assertMangaAllowed(manga);
      checked.delete(mangaId);
      checked.set(mangaId, { revision: contentSettings().revision, expires: Date.now() + 180_000 });
      if (checked.size > 128) checked.delete(checked.keys().next().value!);
      return manga;
    });
  }
  private async fetchMangaDetails(mangaId: string): Promise<SourceManga> {
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
