import { ContentRating, type SourceManga } from "@paperback/types";
import { buildMangaId, parseMangaId } from "./utils";

const SETTINGS_KEY = "VortexScans.contentSettings";
const WARNINGS_KEY = "VortexScans.contentWarnings";
const READER_KEY = "VortexScans.readerTitles";
export const EXCLUDED_SOURCE_LABELS = [
  "mature",
  "ecchi",
  "suggestive",
  "adult",
  "smut",
  "hentai",
  "erotica",
  "pornographic",
  "pornography",
];
const adultLabel = /^(adult|smut|hentai|erotica|pornographic|pornography)$/i;
export interface ContentSettings {
  excludeNSFW: boolean;
  revision: number;
}
export function contentSettings(): ContentSettings {
  const saved = Application.getState(SETTINGS_KEY) as Partial<ContentSettings> | undefined;
  return {
    excludeNSFW: saved?.excludeNSFW !== false,
    revision: Number.isSafeInteger(saved?.revision) ? saved!.revision! : 0,
  };
}
export function setExcludeNSFW(value: boolean): void {
  if (typeof value !== "boolean") throw new Error("Invalid VortexScans content setting.");
  Application.setState(
    { excludeNSFW: value, revision: contentSettings().revision + 1 },
    SETTINGS_KEY,
  );
  Application.invalidateDiscoverSections();
}
export async function withContentSettings<T>(operation: () => Promise<T>): Promise<T> {
  const before = contentSettings();
  const result = await operation();
  const after = contentSettings();
  if (before.revision !== after.revision || before.excludeNSFW !== after.excludeNSFW)
    throw new Error("VortexScans settings changed. Reload this page.");
  // A concurrent native callback may have learned a positive source warning while
  // this callback awaited. Never release that now-blocked card/detail/reader.
  const ids: string[] = [];
  const covers: [string, string][] = [];
  const collect = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if ("mangaId" in value && typeof value.mangaId === "string") {
      ids.push(value.mangaId);
      if ("imageUrl" in value && typeof value.imageUrl === "string" && value.imageUrl)
        covers.push([value.imageUrl, key(value.mangaId)]);
      if (
        "mangaInfo" in value &&
        value.mangaInfo &&
        typeof value.mangaInfo === "object" &&
        "thumbnailUrl" in value.mangaInfo &&
        typeof value.mangaInfo.thumbnailUrl === "string" &&
        value.mangaInfo.thumbnailUrl
      )
        covers.push([value.mangaInfo.thumbnailUrl, key(value.mangaId)]);
    }
    if ("sourceManga" in value) collect(value.sourceManga);
  };
  if (Array.isArray(result)) result.forEach(collect);
  else {
    collect(result);
    if (result && typeof result === "object" && "items" in result && Array.isArray(result.items))
      result.items.forEach(collect);
  }
  if (ids.some((id) => !contentAllowed(id)))
    throw new Error("VortexScans content warnings changed. Reload this page.");
  bindCovers(covers);
  return result;
}
function key(mangaId: string): string {
  try {
    const parsed = parseMangaId(mangaId);
    return parsed.slug ? buildMangaId(parsed.id, parsed.slug) : mangaId;
  } catch {
    // Historical IDs use code-unit escapes, not always valid UTF-8. This is only
    // a warning lookup key; preserve those emitted IDs without changing routing.
    return mangaId;
  }
}
function warnings(): Map<string, string[]> {
  const raw = Application.getState(WARNINGS_KEY);
  return new Map(
    Array.isArray(raw)
      ? raw.filter(
          (entry): entry is [string, string[]] =>
            Array.isArray(entry) &&
            typeof entry[0] === "string" &&
            Array.isArray(entry[1]) &&
            entry[1].every(
              (name: unknown) => typeof name === "string" && EXCLUDED_SOURCE_LABELS.includes(name),
            ),
        )
      : [],
  );
}
// Preserve positive warnings across sparse copies. They are actual names, not fake genre IDs.
export function observeContent(mangaId: string, names: string[]): void {
  const positive = names
    .filter((name) => typeof name === "string")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => EXCLUDED_SOURCE_LABELS.includes(name));
  if (!positive.length) return;
  const stored = warnings(),
    id = key(mangaId);
  const old = stored.get(id) ?? [];
  const merged = [...new Set([...old, ...positive])];
  if (old.length === merged.length) return;
  stored.delete(id);
  stored.set(id, merged);
  Application.setState([...stored], WARNINGS_KEY);
  if (contentSettings().excludeNSFW) Application.invalidateDiscoverSections();
}
export function sourceNames(post: {
  genres?: { name?: string }[];
  homeRatingNames?: string[];
}): string[] {
  return [
    ...(post.homeRatingNames ?? []),
    ...(post.genres ?? []).flatMap((genre) =>
      typeof genre?.name === "string" ? [genre.name] : [],
    ),
  ];
}
export function contentRating(mangaId: string, names: string[] = []): ContentRating {
  observeContent(mangaId, names);
  return (warnings().get(key(mangaId)) ?? []).some((name) => adultLabel.test(name))
    ? ContentRating.ADULT
    : ContentRating.MATURE;
}
export function contentAllowed(mangaId: string, names: string[] = []): boolean {
  observeContent(mangaId, names);
  return !contentSettings().excludeNSFW || !warnings().has(key(mangaId));
}
export function assertMangaAllowed(manga: SourceManga): void {
  const names =
    manga.mangaInfo?.tagGroups?.flatMap((group) => group.tags.map((tag) => tag.title)) ?? [];
  if (manga.mangaInfo?.contentRating === ContentRating.ADULT) names.push("adult");
  if (!contentAllowed(manga.mangaId, names))
    throw new Error("This title is hidden by VortexScans' Exclude NSFW content setting.");
}
// This is a working set, not reading history. Exact source-issued image URLs
// authorize requests only while retained; old images require a fresh source load.
interface ReaderGroup {
  owner: string;
  pages: string[];
}
interface ImageCache {
  version: 3;
  chapters: ReaderGroup[];
  covers: [string, string][];
}
const MAX_CACHE_BYTES = 96 * 1024;
const MAX_CHAPTERS = 4;
// Three search pages (48 each), also covering adjacent 36-item Discover pages.
const MAX_COVERS = 144;
function serializedBytes(value: unknown): number {
  let bytes = 0;
  for (const char of JSON.stringify(value)) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
function imageCache(): ImageCache {
  const raw = Application.getState(READER_KEY);
  if (raw === undefined || raw === null || Array.isArray(raw)) {
    const empty: ImageCache = { version: 3, chapters: [], covers: [] };
    // Replace legacy history instead of copying or indefinitely retaining it.
    // Unknown image requests below fail closed, so discarded bindings cannot
    // silently bypass content checks. Settings and positive warnings stay intact.
    if (Array.isArray(raw)) Application.setState(empty, READER_KEY);
    return empty;
  }
  const saved = raw as ImageCache;
  if (
    saved.version !== 3 ||
    !Array.isArray(saved.chapters) ||
    saved.chapters.length > MAX_CHAPTERS ||
    !saved.chapters.every(
      (group) =>
        group &&
        typeof group.owner === "string" &&
        Array.isArray(group.pages) &&
        group.pages.length > 0 &&
        group.pages.length <= 2000 &&
        group.pages.every((page) => typeof page === "string"),
    ) ||
    !Array.isArray(saved.covers) ||
    saved.covers.length > MAX_COVERS ||
    !saved.covers.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string",
    ) ||
    serializedBytes(saved) > MAX_CACHE_BYTES
  )
    throw new Error("Invalid saved VortexScans image cache.");
  return saved;
}
function imageOwner(url: string, cache: ImageCache): string | undefined {
  const owners = new Set([
    ...cache.chapters.filter((group) => group.pages.includes(url)).map((group) => group.owner),
    ...cache.covers.filter(([image]) => image === url).map(([, owner]) => owner),
  ]);
  if (owners.size > 1) throw new Error("VortexScans returned a conflicting reader image identity.");
  return owners.values().next().value;
}
function assertImageOwner(url: string, owner: string, cache: ImageCache): void {
  const previous = imageOwner(url, cache);
  if (previous !== undefined && previous !== owner)
    throw new Error("VortexScans returned a conflicting reader image identity.");
}
export function bindReaderPages(mangaId: string, pages: string[]): void {
  const owner = key(mangaId),
    cache = imageCache();
  if (!pages.length || pages.length > 2000 || pages.some((page) => typeof page !== "string"))
    throw new Error("Invalid VortexScans reader page manifest.");
  for (const page of pages) assertImageOwner(page, owner, cache);
  const current = { owner, pages: [...new Set(pages)] };
  const next: ImageCache = {
    version: 3,
    chapters: [...cache.chapters.filter((group) => group.pages[0] !== pages[0]), current].slice(
      -MAX_CHAPTERS,
    ),
    covers: [...cache.covers],
  };
  // Keep complete recent chapters. Never silently drop pages from this chapter.
  while (serializedBytes(next) > MAX_CACHE_BYTES && next.covers.length) next.covers.shift();
  while (serializedBytes(next) > MAX_CACHE_BYTES && next.chapters.length > 1) next.chapters.shift();
  if (serializedBytes(next) > MAX_CACHE_BYTES)
    throw new Error("This VortexScans chapter exceeds the safe reader cache size.");
  // One synchronous replacement: a failed native write does not release details.
  Application.setState(next, READER_KEY);
}
function bindCovers(covers: [string, string][]): void {
  if (!covers.length) return;
  const cache = imageCache();
  const incoming = new Map<string, string>();
  for (const [url, owner] of covers) {
    assertImageOwner(url, owner, cache);
    const previous = incoming.get(url);
    if (previous !== undefined && previous !== owner)
      throw new Error("VortexScans returned a conflicting reader image identity.");
    incoming.set(url, owner);
  }
  if (incoming.size > MAX_COVERS)
    throw new Error("This VortexScans result exceeds the safe image cache size.");
  const merged = new Map(cache.covers);
  for (const [url, owner] of covers) {
    merged.delete(url);
    merged.set(url, owner);
  }
  const next: ImageCache = { ...cache, covers: [...merged].slice(-MAX_COVERS) };
  // Browsing must not evict an active/prefetched reader chapter.
  while (serializedBytes(next) > MAX_CACHE_BYTES && next.covers.length > incoming.size)
    next.covers.shift();
  if (serializedBytes(next) > MAX_CACHE_BYTES)
    throw new Error("This VortexScans result exceeds the safe image cache size.");
  Application.setState(next, READER_KEY);
}
export function assertReaderAllowed(url: string): void {
  const binding = imageOwner(url, imageCache());
  if (binding === undefined) {
    if (/^https?:\/\/[^?#]+\.(?:webp|jpe?g|png|gif|avif)(?:[?#]|$)/i.test(url))
      throw new Error("VortexScans image authorization expired. Reload the title or chapter.");
    return;
  }
  if (!contentAllowed(binding))
    throw new Error("This reader is hidden by VortexScans' Exclude NSFW content setting.");
}
