/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { RATINGS, type Preferences, type Rating } from "./models";
import { preferences, PREFERENCES, nativeAllowed } from "./forms";
import { imageURL, validId } from "./urls";
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
  return raw.filter((g): g is Grant => {
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
    const old = all.findIndex((g) => g.url === url);
    if (old >= 0) all.splice(old, 1);
    all.push({ url, id, chapter, rating, at, revision: saved.revision });
  }
  Application.setState(all.slice(-LIMIT), IMAGE_STORE);
};
export const authorizeImage = (url: string): Grant => {
  const saved = preferences(),
    grant = grants().find((g) => g.url === url),
    current = grant ? observations().find((o) => o.id === grant.id) : undefined;
  if (
    !grant ||
    grant.revision !== saved.revision ||
    !current ||
    !nativeAllowed(grant.rating) ||
    !nativeAllowed(current.rating) ||
    (saved.onlySafe && (grant.rating !== "safe" || current.rating !== "safe"))
  )
    throw new Error(
      "MangaStash image authorization is missing, expired or revoked. Reload the title or chapter.",
    );
  imageURL(url, grant.id, grant.chapter);
  return grant;
};
