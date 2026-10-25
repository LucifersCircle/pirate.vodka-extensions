import * as cheerio from "cheerio";
import { fetchText } from "../../services/network";
import { DOMAIN, type VortexPost } from "../shared/models";
import { observeContent, sourceNames } from "../shared/content";
import { buildMangaId } from "../shared/utils";
import { serializedProperty } from "./page-data";

export const HOME_PAGE_SIZE = 36;
export interface HomePost extends VortexPost {
  homeRatingNames?: string[];
}
interface HomeSnapshot {
  featured: HomePost[];
  latest: HomePost[];
  popular: HomePost[];
  today: HomePost[];
}
let cached: { html: string; expires: number } | undefined;
let pending: Promise<string> | undefined;
let decoded: { html: string; value: HomeSnapshot } | undefined;

// One bounded public response, shared across concurrent home sections. No detail
// requests, persistent state, user settings or changes to established reader paths.
export async function homeHTML(): Promise<string> {
  if (cached && cached.expires > Date.now()) return cached.html;
  if (pending) return pending;
  const request = (async () => {
    const html = await fetchText({ url: DOMAIN, method: "GET" });
    if (html.length > 8_000_000) throw new Error("VortexScans homepage is too large.");
    cached = { html, expires: Date.now() + 180_000 };
    return html;
  })();
  pending = request;
  try {
    return await request;
  } finally {
    if (pending === request) pending = undefined;
  }
}

export function parseHome(html: string): HomeSnapshot {
  if (decoded?.html === html) return decoded.value;
  const $ = cheerio.load(html);
  const scripts = $("script")
    .toArray()
    .map((element) => $(element).text())
    .filter(
      (script) =>
        (script.startsWith('(self.$R=self.$R||{})["tsr"]=[];') ||
          script.startsWith("$_TSR.router=")) &&
        script.includes("$_TSR.router="),
    );
  if (scripts.length !== 1) throw new Error("VortexScans returned ambiguous homepage data.");
  const field = <T>(key: string): T => serializedProperty<T>(scripts[0], key);
  const validPosts = (value: HomePost[]): HomePost[] => {
    // Keep genuine warning names even if an unrelated card field fails later.
    if (Array.isArray(value))
      for (const post of value) {
        if (
          post &&
          Number.isSafeInteger(post.id) &&
          post.id > 0 &&
          typeof post.slug === "string" &&
          post.slug
        )
          observeContent(buildMangaId(post.id, post.slug), sourceNames(post));
      }
    if (
      !Array.isArray(value) ||
      value.length > 1000 ||
      value.some(
        (post) =>
          !post ||
          !Number.isSafeInteger(post.id) ||
          post.id <= 0 ||
          !post.slug ||
          !post.postTitle?.trim() ||
          !post.featuredImage?.startsWith("https://"),
      )
    )
      throw new Error("VortexScans returned incomplete homepage cards.");
    return value;
  };
  const featured = validPosts(field("combinedSliderPosts"));
  const latest = validPosts(field("latestMangaPosts"));
  const monthly = validPosts(field("monthlyPosts"));
  const today = validPosts(field<{ data: { posts: HomePost[] } }>("todayPosts").data.posts);
  const ranking =
    field<{ slug: string; title: string; coverImage: string; tags?: { name?: string }[] }[]>(
      "transformedTopSeries",
    );
  if (
    field<number>("perPage") !== HOME_PAGE_SIZE ||
    field<boolean>("hasPinnedSeriesSection") !== false ||
    field<string[]>("latestReleaseFilters").join(",") !== "latest,new" ||
    !Array.isArray(ranking)
  )
    throw new Error("VortexScans homepage release configuration changed.");
  const monthlyBySlug = new Map(monthly.map((post) => [post.slug, post]));
  // Rank IDs are positions, not canonical post IDs. The site renders first9 monthly.
  const popular = ranking.slice(0, 9).map((rank): HomePost => {
    const post = monthlyBySlug.get(rank.slug);
    if (post)
      observeContent(
        buildMangaId(post.id, post.slug),
        (rank.tags ?? []).flatMap((tag) => (typeof tag.name === "string" ? [tag.name] : [])),
      );
    if (!post || post.postTitle !== rank.title || post.featuredImage !== rank.coverImage)
      throw new Error("VortexScans monthly homepage identity changed.");
    return {
      ...post,
      homeRatingNames: (rank.tags ?? []).flatMap((tag) =>
        typeof tag.name === "string" ? [tag.name] : [],
      ),
    };
  });
  // Positive names are display evidence only, never fabricated taxonomy IDs or
  // a classification/visibility policy. Keep warnings across same-response copies.
  const names = new Map<string, string[]>();
  for (const post of [...featured, ...latest, ...monthly, ...popular, ...today]) {
    const key = `${post.id}:${post.slug}`;
    names.set(key, [
      ...(names.get(key) ?? []),
      ...(post.genres ?? []).flatMap((genre) =>
        typeof genre?.name === "string" ? [genre.name] : [],
      ),
      ...(post.homeRatingNames ?? []),
    ]);
  }
  const withNames = (posts: HomePost[]): HomePost[] =>
    posts.map((post) => ({ ...post, homeRatingNames: names.get(`${post.id}:${post.slug}`) }));
  const value = {
    featured: withNames(featured),
    latest: withNames(latest),
    popular: withNames(popular),
    today: withNames(today),
  };
  decoded = { html, value };
  return value;
}
