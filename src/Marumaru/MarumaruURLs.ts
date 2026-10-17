/* SPDX-License-Identifier: GPL-3.0-or-later */
export const DOMAIN = "https://marumaru105.com";
/** Strict supported source URL subset, independent of a host WHATWG URL global. */
export function documentParts(value: string): { path: string; query: Record<string, string> } {
  const match = /^https:\/\/marumaru105\.com(\/[^?#\\]*)(?:\?([^#]*))?$/.exec(value);
  if (!match) throw new Error("Unsupported Marumaru document origin");
  const query: Record<string, string> = Object.create(null);
  for (const part of match[2]?.split("&") ?? []) {
    const pair = part.split("=");
    if (pair.length !== 2) throw new Error("Invalid Marumaru query");
    const key = decodeURIComponent(pair[0]!),
      value = decodeURIComponent(pair[1]!.replace(/\+/g, " "));
    if (Object.prototype.hasOwnProperty.call(query, key))
      throw new Error("Duplicate Marumaru query key");
    query[key] = value;
  }
  return { path: match[1]!, query };
}
export function continuationURL(href: string, current: string): string {
  const source = documentParts(current),
    target = href.startsWith("?")
      ? DOMAIN + source.path + href
      : href.startsWith("/")
        ? DOMAIN + href
        : href;
  const next = documentParts(target),
    page = Number(source.query.page ?? 1);
  if (next.path !== source.path || next.query.page !== String(page + 1))
    throw new Error("Unexpected Marumaru continuation");
  const left = { ...source.query };
  delete left.page;
  const right = { ...next.query };
  delete right.page;
  const keys = Object.keys(left).sort();
  if (
    JSON.stringify(keys) !== JSON.stringify(Object.keys(right).sort()) ||
    keys.some((key) => left[key] !== right[key])
  )
    throw new Error("Marumaru continuation scope changed");
  return target;
}

export function validateDocumentURL(value: string): void {
  const url = documentParts(value);
  if (url.path === "/search") {
    if (
      !url.query.q ||
      url.query.q.length > 300 ||
      url.query.kind !== "manhwa" ||
      Object.keys(url.query).some((k) => !["q", "kind", "page"].includes(k)) ||
      (url.query.page !== undefined && !/^[1-9]\d*$/.test(url.query.page))
    )
      throw new Error("Unsupported Marumaru search query");
    return;
  }
  if (!/^\/manhwa(?:\/[1-9]\d*(?:\/[1-9]\d*)?)?$/.test(url.path))
    throw new Error("Unsupported Marumaru document URL");
  const keys = Object.keys(url.query);
  if (
    keys.length &&
    (url.path !== "/manhwa" ||
      keys.length !== 1 ||
      keys[0] !== "page" ||
      !/^[1-9]\d*$/.test(url.query.page ?? ""))
  )
    throw new Error("Unsupported Marumaru query");
}
