/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { ContentRating } from "@paperback/types";
import { id } from "./MarumaruParser";
const TTL = 3600000;
type Evidence = { adult: boolean; at: number };
type Image = { work: string; episode?: string; at: number };
const titles = new Map<string, Evidence>();
const images = new Map<string, Image>();
const fresh = (at: number) =>
  Number.isSafeInteger(at) && at >= 0 && at <= Date.now() && at + TTL > Date.now();
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
  id(work);
  if (!fresh(at)) throw new Error("Marumaru source evidence expired; reload.");
  const prior = titles.get(work);
  const evidence = prior?.adult && fresh(prior.at) && !adult ? prior : { adult, at };
  titles.delete(work);
  titles.set(work, evidence);
  while (titles.size > 512) titles.delete(titles.keys().next().value!);
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
  validateImage(url, work, episode);
  requireAllowed(work, adult, at);
  const old = images.get(url);
  if (old && (old.work !== work || old.episode !== episode))
    throw new Error("Conflicting Marumaru image ownership.");
  images.delete(url);
  images.set(url, { work, episode, at });
  while (images.size > 8192) images.delete(images.keys().next().value!);
}
export function authorizeImage(url: string): void {
  nativePolicy();
  const image = images.get(url),
    title = image && titles.get(image.work);
  if (!image || !fresh(image.at) || !title || !fresh(title.at) || !allowed(title.adult))
    throw new Error(
      "Marumaru image was not issued, expired or is excluded. Reload the title or chapter.",
    );
  validateImage(url, image.work, image.episode);
}
