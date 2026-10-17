/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { ContentRating } from "@paperback/types";
import { id } from "./MarumaruAPI";
const TTL = 3600000;
const STATE_KEY = "Marumaru.imagePolicy.v1";
const MAX_TITLES = 512;
const MAX_IMAGES = 8192;
const MAX_STATE_LENGTH = 8 * 1024 * 1024;
type Evidence = { adult: boolean; at: number };
type Image = { work: string; episode?: string; at: number };
const titles = new Map<string, Evidence>();
const images = new Map<string, Image>();
const episodeOwners = new Map<string, { work: string; count: number }>();
let loaded: unknown = Symbol("unloaded");
let batchDepth = 0;
let dirty = false;
const fresh = (at: number, now = Date.now()) =>
  Number.isSafeInteger(at) && at >= 0 && at <= now && at + TTL > now;

function clearEvidence(): void {
  titles.clear();
  images.clear();
  episodeOwners.clear();
}

function removeImage(url: string): void {
  const image = images.get(url);
  images.delete(url);
  if (image?.episode !== undefined) {
    const owner = episodeOwners.get(image.episode);
    if (owner && --owner.count === 0) episodeOwners.delete(image.episode);
  }
}

function addImage(url: string, image: Image): void {
  images.set(url, image);
  if (image.episode !== undefined) {
    const owner = episodeOwners.get(image.episode);
    episodeOwners.set(image.episode, { work: image.work, count: (owner?.count ?? 0) + 1 });
  }
}

function restore(): void {
  if (batchDepth) return;
  const raw = Application.getState(STATE_KEY);
  if (raw === loaded) return;
  clearEvidence();
  loaded = raw;
  dirty = false;
  if (raw == null) return;
  try {
    if (typeof raw !== "string" || raw.length > MAX_STATE_LENGTH)
      throw new Error("Invalid Marumaru image state.");
    const state: unknown = JSON.parse(raw);
    if (
      !state ||
      typeof state !== "object" ||
      Array.isArray(state) ||
      JSON.stringify(state) !== raw
    )
      throw new Error("Invalid Marumaru image state.");
    const value = state as Record<string, unknown>;
    if (
      Object.keys(value).length !== 3 ||
      value.version !== 1 ||
      !Array.isArray(value.titles) ||
      !Array.isArray(value.images) ||
      value.titles.length > MAX_TITLES ||
      value.images.length > MAX_IMAGES
    )
      throw new Error("Invalid Marumaru image state.");
    const restoredTitles = new Map<string, Evidence>();
    const restoredImages = new Map<string, Image>();
    const restoredOwners = new Map<string, string>();
    const now = Date.now();
    const timestamp = (at: unknown): at is number =>
      typeof at === "number" && Number.isSafeInteger(at) && at >= 0 && at <= now;
    for (const entry of value.titles) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 3 ||
        typeof entry[0] !== "string" ||
        typeof entry[1] !== "boolean" ||
        !timestamp(entry[2])
      )
        throw new Error("Invalid Marumaru title evidence.");
      const work = id(entry[0]);
      if (restoredTitles.has(work)) throw new Error("Duplicate Marumaru title evidence.");
      restoredTitles.set(work, { adult: entry[1], at: entry[2] });
    }
    for (const entry of value.images) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 4 ||
        typeof entry[0] !== "string" ||
        typeof entry[1] !== "string" ||
        (entry[2] !== null && typeof entry[2] !== "string") ||
        !timestamp(entry[3])
      )
        throw new Error("Invalid Marumaru image evidence.");
      const [url, work, savedEpisode, at] = entry as [string, string, string | null, number];
      const episode = savedEpisode ?? undefined;
      if (episode !== undefined) id(episode);
      validateImage(url, work, episode);
      if (restoredImages.has(url) || !restoredTitles.has(work))
        throw new Error("Invalid Marumaru image ownership.");
      if (episode !== undefined) {
        const owner = restoredOwners.get(episode);
        if (owner !== undefined && owner !== work)
          throw new Error("Conflicting Marumaru episode ownership.");
        restoredOwners.set(episode, work);
      }
      restoredImages.set(url, { work, episode, at });
    }
    // Validate every entry before retaining any grant. Expiry only removes grants;
    // malformed, duplicate or conflicting evidence invalidates the whole snapshot.
    for (const [work, evidence] of restoredTitles)
      if (fresh(evidence.at, now)) titles.set(work, evidence);
    for (const [url, image] of restoredImages)
      if (fresh(image.at, now) && titles.has(image.work)) addImage(url, image);
  } catch {
    clearEvidence();
  }
}

function persist(): void {
  if (batchDepth || !dirty) return;
  const now = Date.now();
  for (const [work, evidence] of titles) if (!fresh(evidence.at, now)) titles.delete(work);
  for (const [url, image] of images)
    if (!fresh(image.at, now) || !titles.has(image.work)) removeImage(url);
  const value = JSON.stringify({
    version: 1,
    titles: [...titles].map(([work, evidence]) => [work, evidence.adult, evidence.at]),
    images: [...images].map(([url, image]) => [url, image.work, image.episode ?? null, image.at]),
  });
  if (value.length > MAX_STATE_LENGTH) {
    clearEvidence();
    throw new Error("Marumaru image evidence exceeds its storage limit; reload fewer titles.");
  }
  try {
    // Explicit JSON avoids native object/array bridging and survives a new JS context.
    Application.setState(value, STATE_KEY);
    loaded = value;
    dirty = false;
  } catch (error) {
    clearEvidence();
    loaded = Symbol("unloaded");
    dirty = false;
    throw error;
  }
}

// Catalog and reader callers can wrap a synchronous loop to write one snapshot.
// Existing single-grant callers still persist before returning.
export function batchPolicy<T>(operation: () => T): T {
  restore();
  batchDepth++;
  try {
    const result = operation();
    if (
      result !== null &&
      (typeof result === "object" || typeof result === "function") &&
      typeof (result as { then?: unknown }).then === "function"
    )
      throw new Error("Marumaru policy batches must be synchronous.");
    return result;
  } finally {
    batchDepth--;
    persist();
  }
}

export function nativePolicy(): string {
  if (
    typeof Application.filterAdultTitles !== "boolean" ||
    typeof Application.filterMatureTitles !== "boolean"
  )
    throw new Error("Marumaru requires Paperback's native content filters.");
  return JSON.stringify([Application.filterMatureTitles, Application.filterAdultTitles]);
}
export function currentPolicy(saved: string): void {
  if (nativePolicy() !== saved)
    throw new Error("Paperback content filters changed; reload Marumaru.");
}
export function allowed(adult: boolean): boolean {
  nativePolicy();
  return adult ? !Application.filterAdultTitles : !Application.filterMatureTitles;
}
export function observe(work: string, adult: boolean, at: number): boolean {
  restore();
  id(work);
  if (typeof adult !== "boolean") throw new Error("Invalid Marumaru title rating.");
  if (!fresh(at)) throw new Error("Marumaru source evidence expired; reload.");
  const prior = titles.get(work);
  const evidence = prior?.adult && fresh(prior.at) && !adult ? prior : { adult, at };
  titles.delete(work);
  titles.set(work, evidence);
  while (titles.size > MAX_TITLES) titles.delete(titles.keys().next().value!);
  dirty = true;
  persist();
  return evidence.adult;
}
export function requireAllowed(work: string, adult: boolean, at: number): boolean {
  const effective = observe(work, adult, at);
  if (!allowed(effective))
    throw new Error("Marumaru title is excluded by Paperback's native content filters.");
  return effective;
}
export function badge(adult: boolean): ContentRating {
  return adult ? ContentRating.ADULT : ContentRating.MATURE;
}
export function validateImage(url: string, work: string, episode?: string): void {
  id(work);
  if (episode) id(episode);
  const pattern = episode
    ? `^https://peer\\.storagewebtoon\\.store/api/media/episode/${episode}/[1-9]\\d*\\.webp$`
    : `^https://peer\\.storagewebtoon\\.store/(?:manhwa|webtoon)/${work}/[A-Za-z0-9._-]+$`;
  if (/\/(?:\.|\.\.)$/.test(url) || !new RegExp(pattern).test(url))
    throw new Error("Invalid Marumaru image ownership.");
}
export function issue(
  url: string,
  work: string,
  adult: boolean,
  at: number,
  episode?: string,
): void {
  batchPolicy(() => {
    validateImage(url, work, episode);
    if (episode !== undefined) id(episode);
    requireAllowed(work, adult, at);
    const old = images.get(url);
    if (old && (old.work !== work || old.episode !== episode))
      throw new Error("Conflicting Marumaru image ownership.");
    if (
      episode !== undefined &&
      episodeOwners.has(episode) &&
      episodeOwners.get(episode)!.work !== work
    )
      throw new Error("Conflicting Marumaru episode ownership.");
    removeImage(url);
    addImage(url, { work, episode, at });
    while (images.size > MAX_IMAGES) removeImage(images.keys().next().value!);
    dirty = true;
  });
}
export function authorizeImage(url: string): void {
  nativePolicy();
  restore();
  const image = images.get(url),
    title = image && titles.get(image.work);
  if (!image || !fresh(image.at) || !title || !fresh(title.at) || !allowed(title.adult))
    throw new Error(
      "Marumaru image was not issued, expired or is excluded. Reload the title or chapter.",
    );
  validateImage(url, image.work, image.episode);
}
