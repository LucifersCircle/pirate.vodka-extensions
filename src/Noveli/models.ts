/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { ContentRating, DiscoverSectionType, type DiscoverSection } from "@paperback/types";
export const BASE_URL = "https://noveli.to";
export const PAGE_SIZE = 36;
export const CACHE_MS = 120000;
export const SECTIONS: DiscoverSection[] = [
  {
    id: "translatedRanking",
    title: "Translated by Novelito",
    type: DiscoverSectionType.simpleCarousel,
  },
  { id: "trendingRanking", title: "Trending Novels", type: DiscoverSectionType.simpleCarousel },
  {
    id: "recentlyUpdated",
    title: "Latest Chapter Updates",
    type: DiscoverSectionType.simpleCarousel,
  },
  { id: "topRated", title: "Top Rated by Readers", type: DiscoverSectionType.simpleCarousel },
  {
    id: "completedRanking",
    title: "Completed & Bingeable",
    type: DiscoverSectionType.simpleCarousel,
  },
  { id: "catalog", title: "Explore Web Novels", type: DiscoverSectionType.simpleCarousel },
];
export const SORTS = [
  { id: "popular", label: "Popular (All-Time)" },
  { id: "trending", label: "Trending (This Month)" },
  { id: "rating", label: "Top Rated" },
  { id: "newest", label: "Newest Added" },
  { id: "chapters", label: "Most Chapters" },
  { id: "az", label: "A-Z" },
];
export type Filters = { genres: string[]; status: "" | "Ongoing" | "Completed" };
export type Rating = "unclassified" | "mature" | "adult";
export const nativeRating = (rating: Rating): ContentRating =>
  rating === "adult" ? ContentRating.ADULT : ContentRating.MATURE;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Noveli response or parameters.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null) {
    const ctor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
    if (
      Object.getPrototypeOf(prototype) !== null ||
      typeof ctor !== "function" ||
      ctor.prototype !== prototype ||
      Function.prototype.toString.call(ctor) !== Function.prototype.toString.call(Object)
    )
      throw new Error("Invalid Noveli record.");
  }
  return value as Record<string, unknown>;
}
export const firstPage = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  try {
    return Reflect.ownKeys(record(value)).length === 0;
  } catch {
    return false;
  }
};
export const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
export const numericId = (value: unknown): string => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new Error("Invalid Noveli numeric identity.");
  return String(value);
};
export const text = (value: unknown, empty = false): string => {
  if (typeof value !== "string" || (!empty && !value.trim()))
    throw new Error("Invalid Noveli text field.");
  return value;
};
export const words = (value: unknown, optional = false): string[] => {
  if (optional && value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !v.trim()))
    throw new Error("Invalid Noveli taxonomy.");
  return [...new Set(value as string[])];
};
// Absent access flags are not fabricated. Any explicit denial is never treated as content.
export const assertPublic = (value: Record<string, unknown>): void => {
  const blocked = [
    "locked",
    "is_locked",
    "isLocked",
    "paid",
    "is_paid",
    "isPaid",
    "premium",
    "isPremium",
    "restricted",
    "is_restricted",
    "isRestricted",
    "requires_login",
    "requires_auth",
    "requiresAuth",
    "authentication_required",
    "requiresLogin",
    "login_required",
    "requiresPayment",
    "requires_payment",
    "payment_required",
    "is_premium",
    "requires_subscription",
    "subscription_required",
    "access_denied",
    "accessDenied",
  ];
  if (
    blocked.some(
      (key) =>
        key in value &&
        value[key] !== undefined &&
        value[key] !== null &&
        value[key] !== false &&
        value[key] !== 0,
    ) ||
    ["canRead", "can_read", "hasAccess", "has_access", "isAccessible"].some(
      (key) => key in value && value[key] !== true && value[key] !== 1,
    ) ||
    (typeof value.status === "string" &&
      /^(denied|locked|paid|restricted|login[_ -]?required|unauthorized|forbidden)$/i.test(
        value.status,
      ))
  )
    throw new Error("This Noveli content requires website access; it cannot be read here.");
};
export const envelope = (value: unknown): Record<string, unknown> => {
  const data = record(value);
  assertPublic(data);
  if (data.success !== true) throw new Error("Noveli did not return a successful response.");
  return data;
};
