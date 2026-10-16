/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

// Persist explicit JSON rather than relying on native object/array bridging.
// Existing valid object values remain readable; schema validation stays at each caller.
export function readStoredState(key: string): unknown {
  const raw = Application.getState(key);
  if (typeof raw !== "string") return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") throw new Error("Invalid structured state.");
    return parsed;
  } catch {
    throw new Error("MangaStash saved state is not valid JSON.");
  }
}

export function writeStoredState(value: unknown, key: string): void {
  Application.setState(JSON.stringify(value), key);
}

export function settingsShape(key: string): string {
  const raw = Application.getState(key);
  const kind = (value: unknown) =>
    value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  let decoded: unknown;
  try {
    decoded = readStoredState(key);
  } catch {
    return `stored=${kind(raw)}; decoded=invalid-json`;
  }
  const record = decoded as Record<string, unknown> | null | undefined;
  const field = (name: string) =>
    record && typeof record === "object" && Object.hasOwn(record, name)
      ? kind(record[name])
      : "missing";
  return `stored=${kind(raw)}; decoded=${kind(decoded)}; onlySafe=${field("onlySafe")}; revision=${field("revision")}`;
}
