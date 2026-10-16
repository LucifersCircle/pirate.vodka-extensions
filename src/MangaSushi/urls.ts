/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { BASE_URL } from "./models";

// The native sandbox has no WHATWG URL global. This deliberately parses only
// this source's fixed HTTPS origin, not arbitrary or relative URLs. Keep the
// query bytes/order intact; canonicalization is only for identity comparisons.
export const sourceURL = (value: string): { pathname: string; search: string; href: string } => {
  if (
    typeof value !== "string" ||
    !value.startsWith(`${BASE_URL}/`) ||
    value.includes("#") ||
    value.includes("\\") ||
    /[^\x21-\x7e]/.test(value)
  )
    throw new Error("Unsupported Mangasushi metadata or image URL.");
  const queryIndex = value.indexOf("?");
  const pathname = value.slice(BASE_URL.length, queryIndex < 0 ? undefined : queryIndex);
  // Reject paths that a browser URL parser would rewrite before transport.
  if (/["<>^`{}]/.test(pathname) || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(pathname))
    throw new Error("Unsupported Mangasushi metadata or image URL path.");
  const query = queryIndex < 0 ? undefined : value.slice(queryIndex + 1);
  return {
    pathname,
    search: query ? `?${query}` : "",
    href:
      `${BASE_URL}${pathname}` +
      (query === undefined
        ? ""
        : `?${query.replace(/["'<>]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`),
  };
};
