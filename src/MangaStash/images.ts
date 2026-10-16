/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { RATINGS, type Preferences, type Rating } from "./models";
import { preferences, PREFERENCES, nativeAllowed } from "./forms";
import { chapterURL, imageURL, validId } from "./urls";
export const IMAGE_STORE = "MangaStash.images",
  OBSERVATIONS = "MangaStash.classifications";
export const IMAGE_LIFETIME = 24 * 60 * 60 * 1000;
const LIMIT = 4096;
type Observation = { id: string; rating: Rating; at: number };
type Grant = {
  url: string;
  id: string;
  chapter?: string;
  rating: Rating;
  at: number;
  revision: number;
};
const fresh = (at: unknown): at is number =>
  typeof at === "number" &&
  Number.isSafeInteger(at) &&
  at >= 0 &&
  at <= Date.now() &&
  at + IMAGE_LIFETIME > Date.now();
const observations = (): Observation[] => {
  const raw = Application.getState(OBSERVATIONS);
  if (raw === undefined || raw === null || (Array.isArray(raw) && !raw.length)) {
    const issued = Application.getState(IMAGE_STORE);
    if (Array.isArray(issued) && issued.length) {
      const saved = preferences();
      const revision = saved.revision + 1;
      if (!Number.isSafeInteger(revision)) throw new Error("MangaStash policy revision exhausted.");
      Application.setState({ ...saved, revision }, PREFERENCES);
      Application.setState([], IMAGE_STORE);
      Application.setState([], OBSERVATIONS);
      throw new Error(
        "MangaStash classification evidence was lost; reload for a fresh source response.",
      );
    }
    return [];
  }
  if (
    !Array.isArray(raw) ||
    raw.length > LIMIT ||
    raw.some(
      (v) => !v || !validId(v.id) || !RATINGS.includes(v.rating) || !Number.isSafeInteger(v.at),
    )
  )
    throw new Error("Invalid MangaStash saved classification evidence.");
  if (new Set(raw.map((v) => v.id)).size !== raw.length)
    throw new Error("Duplicate MangaStash classification evidence.");
  return raw.filter((v) => fresh(v.at));
};
const rank = (rating: Rating) => RATINGS.indexOf(rating);
// Contrary source warnings outrank older/cached Safe results for the fixed evidence lifetime.
// Cached parses retain their original response time, so they cannot extend authorization.
export const observe = (id: string, rating: Rating, at: number): Rating => {
  if (!validId(id) || !RATINGS.includes(rating) || !fresh(at))
    throw new Error("Stale MangaStash classification evidence.");
  const all = observations(),
    prior = all.find((v) => v.id === id);
  const warning = prior && rank(prior.rating) >= 2 && rank(prior.rating) > rank(rating);
  const value = warning ? prior : prior && prior.at > at ? prior : { id, rating, at };
  const remaining = all.filter((v) => v.id !== id);
  remaining.push(value);
  Application.setState(remaining.slice(-LIMIT), OBSERVATIONS);
  return value.rating;
};
const grants = (): Grant[] => {
  const raw = Application.getState(IMAGE_STORE);
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > LIMIT)
    throw new Error("Invalid MangaStash image authorization.");
  const valid = raw.filter((g): g is Grant => {
    if (g && g.chapter !== undefined) {
      try {
        if (typeof g.chapter !== "string") throw new Error();
        chapterURL(g.chapter, g.id);
      } catch {
        throw new Error("Invalid MangaStash saved reader image role.");
      }
    }
    if (
      !g ||
      typeof g.url !== "string" ||
      !validId(g.id) ||
      !RATINGS.includes(g.rating) ||
      !fresh(g.at) ||
      !Number.isSafeInteger(g.revision) ||
      g.revision < 1 ||
      (g.chapter !== undefined && typeof g.chapter !== "string")
    )
      return false;
    try {
      return imageURL(g.url, g.id, g.chapter) === g.url;
    } catch {
      return false;
    }
  });
  const roles = new Map<string, Grant[]>();
  for (const grant of valid) {
    const sameURL = roles.get(grant.url) ?? [];
    if (
      sameURL.some(
        (other) =>
          other.id !== grant.id ||
          other.chapter === grant.chapter ||
          (other.chapter !== undefined && grant.chapter !== undefined),
      )
    )
      throw new Error("Conflicting or duplicate MangaStash saved image roles.");
    sameURL.push(grant);
    roles.set(grant.url, sameURL);
  }
  return valid;
};
export const issueImages = (
  urls: string[],
  id: string,
  rating: Rating,
  saved: Preferences,
  at: number,
  chapter?: string,
): void => {
  if (JSON.stringify(preferences()) !== JSON.stringify(saved))
    throw new Error("MangaStash settings changed; reload.");
  const effective = observe(id, rating, at);
  if (saved.onlySafe && (rating !== "safe" || effective !== "safe"))
    throw new Error(
      "This title is excluded by Only explicitly Safe titles. MangaStash does not label every listing.",
    );
  if (!nativeAllowed(rating) || !nativeAllowed(effective))
    throw new Error("This image is excluded by Paperback’s native content-rating filters.");
  const all = grants();
  for (const url of urls) {
    imageURL(url, id, chapter);
    if (
      all.some(
        (g) =>
          g.url === url &&
          (g.id !== id ||
            (g.chapter !== undefined && chapter !== undefined && g.chapter !== chapter)),
      )
    )
      throw new Error("Conflicting MangaStash image ownership.");
    // One advertised image can independently be a cover and a verified reader page.
    // Reissuing either role must not erase the other role's identity or fixed time.
    const old = all.findIndex((g) => g.url === url && g.id === id && g.chapter === chapter);
    const issued = old >= 0 ? all[old] : { url, id, chapter, rating, at, revision: saved.revision };
    if (old >= 0) all.splice(old, 1);
    all.push(issued);
  }
  Application.setState(all.slice(-LIMIT), IMAGE_STORE);
};
export const authorizeImage = (url: string): Grant => {
  const saved = preferences(),
    matching = grants().filter((g) => g.url === url),
    current = matching.length ? observations() : [],
    grant = matching.find((g) => {
      const evidence = current.find((o) => o.id === g.id);
      return (
        g.revision === saved.revision &&
        evidence !== undefined &&
        nativeAllowed(g.rating) &&
        nativeAllowed(evidence.rating) &&
        (!saved.onlySafe || (g.rating === "safe" && evidence.rating === "safe"))
      );
    });
  if (!grant)
    throw new Error(
      "MangaStash image authorization is missing, expired or revoked. Reload the title or chapter.",
    );
  imageURL(url, grant.id, grant.chapter);
  return grant;
};
