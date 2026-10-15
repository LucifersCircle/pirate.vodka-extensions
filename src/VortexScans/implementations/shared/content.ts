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
  const collect = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if ("mangaId" in value && typeof value.mangaId === "string") ids.push(value.mangaId);
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
// Persist exact issued URLs so newly observed warnings can revoke old readers.
// This is safety evidence, not an evictable response cache. State grows with use.
export function bindReaderPages(mangaId: string, pages: string[]): void {
  const raw = Application.getState(READER_KEY);
  const bindings = new Map<string, string>(
    Array.isArray(raw)
      ? raw.filter(
          (entry) =>
            Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string",
        )
      : [],
  );
  for (const page of pages) {
    if (bindings.has(page) && bindings.get(page) !== key(mangaId))
      throw new Error("VortexScans returned a conflicting reader image identity.");
    bindings.set(page, key(mangaId));
  }
  Application.setState([...bindings], READER_KEY);
}
export function assertReaderAllowed(url: string): void {
  if (!contentSettings().excludeNSFW) return;
  const raw = Application.getState(READER_KEY);
  const binding = Array.isArray(raw)
    ? raw.find((entry) => Array.isArray(entry) && entry[0] === url)
    : undefined;
  if (binding && !contentAllowed(binding[1]))
    throw new Error("This reader is hidden by VortexScans' Exclude NSFW content setting.");
}
