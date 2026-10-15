/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

/** Provider-reported series translation, not title/original language or a search preference.
 * Keep undetermined metadata readable without inventing a content language.
 */
export function chapterLanguage(value: unknown): string {
  if (typeof value !== "string") return "und";
  let code = value.trim().replace(/_/g, "-").toLowerCase();
  if (!code || /^(?:unk|und|unknown)(?:-|$)/.test(code)) return "und";
  // These aliases are explicitly used by Kagane's own language display utility.
  if (code === "es-la") code = "es-419";
  if (code === "pt-la") code = "pt-br";
  code = code.replace(/^(ja|ko|zh)-ro$/, "$1-latn");
  // Legacy ISO aliases do not imply a region or a different written language.
  code = code.replace(/^(iw|in|ji)(?=-|$)/, (language) =>
    language === "iw" ? "he" : language === "in" ? "id" : "yi",
  );
  // Accept language/script/region/variant syntax, not arbitrary labels or URLs.
  if (
    !/^[a-z]{2,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?(?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*$/.test(
      code,
    )
  )
    return "und";
  return code
    .split("-")
    .map((part, index) => {
      if (index === 0) return part;
      if (/^[a-z]{4}$/.test(part)) return part.charAt(0).toUpperCase() + part.slice(1);
      if (/^[a-z]{2}$/.test(part)) return part.toUpperCase();
      return part;
    })
    .join("-");
}
