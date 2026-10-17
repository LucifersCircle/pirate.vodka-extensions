/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { type Rating, nativeRating } from "./models";
import { coverURL } from "./urls";
const EVIDENCE_MS = 24 * 60 * 60 * 1000;
const LIMIT = 4096;
type Evidence = { rating: Rating; at: number };
type Cover = { id: string; at: number };
const rank = (rating: Rating): number => ["unclassified", "mature", "adult"].indexOf(rating);
export const nativePolicy = (): string => {
  if (
    typeof Application.filterMatureTitles !== "boolean" ||
    typeof Application.filterAdultTitles !== "boolean"
  )
    throw new Error("Noveli requires Paperback’s native content-rating policy.");
  return JSON.stringify([Application.filterMatureTitles, Application.filterAdultTitles]);
};
export const currentPolicy = (saved: string): void => {
  if (nativePolicy() !== saved)
    throw new Error("Paperback’s content filters changed; reload Noveli.");
};
export const nativeAllowed = (rating: Rating): boolean => {
  nativePolicy();
  return rating === "adult" ? !Application.filterAdultTitles : !Application.filterMatureTitles;
};
export const classify = (labels: string[]): Rating => {
  const values = labels.map((label) => label.trim().toLowerCase());
  if (values.some((label) => /^(adult|smut|r[- ]?18\+?)$/.test(label))) return "adult";
  return values.some((label) => label === "mature" || label === "ecchi")
    ? "mature"
    : "unclassified";
};
const fresh = (at: number): boolean =>
  Number.isSafeInteger(at) && at <= Date.now() && at + EVIDENCE_MS > Date.now();
// These are process-local source evidence, not user preferences or persisted grants.
// A restored thumbnail requires a fresh metadata response after the source restarts.
export class ContentPolicy {
  private titles = new Map<string, Evidence>();
  private covers = new Map<string, Cover[]>();
  observe(id: string, rating: Rating, at: number): Rating {
    if (!fresh(at)) throw new Error("Noveli source evidence expired; reload.");
    const old = this.titles.get(id);
    const next = old && fresh(old.at) && rank(old.rating) > rank(rating) ? old : { rating, at };
    this.titles.delete(id);
    this.titles.set(id, next);
    while (this.titles.size > LIMIT) this.titles.delete(this.titles.keys().next().value!);
    return next.rating;
  }
  allowed(id: string, rating: Rating, at: number): Rating {
    const effective = this.observe(id, rating, at);
    // Native Mature and Adult filters are independent. Sparse metadata must not
    // impose an extra Mature veto after a stronger Adult warning is established.
    if (!nativeAllowed(effective))
      throw new Error(
        "This Noveli title is excluded by Paperback’s native content-rating filters.",
      );
    return effective;
  }
  issue(url: string, id: string, rating: Rating, at: number): void {
    coverURL(url);
    this.allowed(id, rating, at);
    const entries = (this.covers.get(url) ?? []).filter(
      (entry) => entry.id !== id && fresh(entry.at),
    );
    entries.push({ id, at });
    this.covers.delete(url);
    this.covers.set(url, entries);
    while (this.covers.size > LIMIT) this.covers.delete(this.covers.keys().next().value!);
  }
  authorize(url: string): void {
    coverURL(url);
    nativePolicy();
    const entries = this.covers.get(url)?.filter((entry) => fresh(entry.at));
    if (
      !entries?.length ||
      entries.some((entry) => {
        const evidence = this.titles.get(entry.id);
        return !evidence || !fresh(evidence.at) || !nativeAllowed(evidence.rating);
      })
    )
      throw new Error("Noveli cover evidence is missing, expired or excluded; reload the title.");
  }
  badge(id: string, rating: Rating, at: number) {
    return nativeRating(this.allowed(id, rating, at));
  }
}
