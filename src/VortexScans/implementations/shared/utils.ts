import type { VortexGenre } from "./models";
import { DOMAIN_API } from "./models";
import { fetchJSON } from "../../services/network";

const GENRES_CACHE_KEY = "genres";
const GENRES_CACHE_DATE_KEY = "genres-cache-date";
const GENRES_CACHE_TTL_SECONDS = 604_800;

function encodeMangaSlug(slug: string): string {
  return slug.replace(
    /[^A-Za-z0-9_-]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildMangaId(id: number | string, slug: string): string {
  return `${id}:${encodeMangaSlug(slug)}`;
}

export function parseMangaId(mangaId: string): { id: string; slug?: string } {
  const delimiter = mangaId.includes(":")
    ? ":"
    : mangaId.includes("/")
      ? "/"
      : mangaId.includes("|")
        ? "|"
        : undefined;
  const [id, rawSlug] = delimiter ? mangaId.split(delimiter) : [mangaId, undefined];

  return {
    id,
    slug: rawSlug?.trim() ? decodeURIComponent(rawSlug) : undefined,
  };
}

export async function getVortexGenres(): Promise<VortexGenre[]> {
  const cachedAt = Number(Application.getState(GENRES_CACHE_DATE_KEY) ?? 0);
  const cachedGenres = Application.getState(GENRES_CACHE_KEY);

  if (cachedAt + GENRES_CACHE_TTL_SECONDS > Date.now() / 1000 && typeof cachedGenres === "string") {
    try {
      const genres = JSON.parse(cachedGenres) as VortexGenre[];
      if (Array.isArray(genres)) return genres;
    } catch {
      // Ignore malformed cache entries and refresh from the API.
    }
  }

  const genres = await fetchJSON<VortexGenre[]>({
    url: `${DOMAIN_API}/genres`,
    method: "GET",
  });

  Application.setState(JSON.stringify(genres), GENRES_CACHE_KEY);
  Application.setState(String(Date.now() / 1000), GENRES_CACHE_DATE_KEY);
  return genres;
}

export function applyMixins(derivedCtor: any, constructors: any[]) {
  constructors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name) || Object.create(null),
      );
    });
  });
}
