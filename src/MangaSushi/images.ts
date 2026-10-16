/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { preferences } from "./forms";
import { type Preferences } from "./models";
import { sourceURL } from "./urls";

const STORE = "MangaSushi.issuedImages";
const LIFETIME = 24 * 60 * 60 * 1000;
const LIMIT = 8192;
const EVIDENCE = "MangaSushi.imageEvidence";
const GENERATION = "MangaSushi.imageEvidenceGeneration";
let highestGeneration = 0;
const kind = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
const stateError = (key: string, decoded: unknown): Error => {
  const record = decoded as Record<string, unknown> | null | undefined;
  const field = (name: string): string =>
    record && typeof record === "object" ? kind(record[name]) : "missing";
  return new Error(
    `Invalid saved Mangasushi image state (${key.split(".")[1]}: stored=${kind(Application.getState(key))}; decoded=${kind(decoded)}; sequence=${field("sequence")}; discardedThrough=${field("discardedThrough")}; titles=${field("titles")}).`,
  );
};
const legacyCounter = (value: unknown, minimum = 0): boolean =>
  (Number.isSafeInteger(value) && (value as number) >= minimum) ||
  value === true ||
  (minimum === 0 && value === false);
// Explicit JSON keeps native object bridging from changing zero/one counters.
// Recognizable pre-JSON values are retired, never trusted as classification or
// image grants. Only a new source request may replace them; settings are untouched.
const readState = (key: string): unknown => {
  const raw = Application.getState(key);
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") {
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw) as unknown;
    } catch {
      throw stateError(key, undefined);
    }
    if (
      decoded === null ||
      (key === STORE && !Array.isArray(decoded)) ||
      (key === GENERATION && !generationNumber(decoded))
    )
      throw stateError(key, decoded);
    return decoded;
  }
  const old = raw as Record<string, unknown>;
  if (
    (key === STORE && Array.isArray(raw)) ||
    (key === GENERATION && legacyCounter(raw, 1)) ||
    (key === EVIDENCE &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      (old.generation === undefined || legacyCounter(old.generation, 1)) &&
      legacyCounter(old.sequence) &&
      (old.discardedThrough === undefined || legacyCounter(old.discardedThrough)) &&
      Array.isArray(old.titles))
  )
    return undefined;
  throw stateError(key, raw);
};
const writeState = (value: unknown, key: string): void =>
  Application.setState(JSON.stringify(value), key);
// The namespace also prevents an old in-flight numeric epoch from matching a
// migrated epoch, even when every legacy counter is absent or untrustworthy.
const generationNumber = (value: unknown): number => {
  if (typeof value !== "string" || !/^json-v1:[1-9]\d*$/.test(value)) return 0;
  const number = Number(value.slice(8));
  return Number.isSafeInteger(number) ? number : 0;
};
export type ImageEvidence = { generation: string; sequence: number; at: number };
type TitleEvidence = ImageEvidence & {
  allowed: boolean;
  blockedThrough: number;
  firstSequence: number;
};
const ledger = (): {
  generation: string;
  sequence: number;
  discardedThrough: number;
  missing: boolean;
  titles: Map<string, TitleEvidence>;
} => {
  const raw = readState(EVIDENCE) as
    | { generation?: unknown; sequence?: unknown; discardedThrough?: unknown; titles?: unknown }
    | undefined;
  if (
    raw !== undefined &&
    (typeof raw !== "object" ||
      raw === null ||
      Array.isArray(raw) ||
      !generationNumber(raw.generation) ||
      !Number.isSafeInteger(raw.sequence) ||
      (raw.sequence as number) < 0 ||
      !Array.isArray(raw.titles) ||
      !Number.isSafeInteger(raw.discardedThrough) ||
      (raw.discardedThrough as number) < 0 ||
      (raw.discardedThrough as number) > (raw.sequence as number))
  )
    throw stateError(EVIDENCE, raw);
  const savedGeneration = readState(GENERATION);
  for (const generation of [savedGeneration, raw?.generation])
    if (generation !== undefined && generation !== null && !generationNumber(generation))
      throw stateError(GENERATION, generation);
  // Surviving grants also retain a bounded high-water mark across partial resets.
  const grants = readState(STORE);
  for (const entry of Array.isArray(grants) ? grants.slice(-LIMIT) : []) {
    const generation = Array.isArray(entry) ? entry[1]?.generation : undefined;
    highestGeneration = Math.max(highestGeneration, generationNumber(generation));
  }
  highestGeneration = Math.max(
    highestGeneration,
    generationNumber(savedGeneration),
    generationNumber(raw?.generation),
  );
  const generation =
    generationNumber(savedGeneration) === highestGeneration &&
    generationNumber(raw?.generation) === highestGeneration
      ? (savedGeneration as string | undefined)
      : undefined;
  if (!generation)
    return { generation: "", sequence: 0, discardedThrough: 0, missing: true, titles: new Map() };
  const sequence = (raw?.sequence as number | undefined) ?? 0;
  let discardedThrough = (raw?.discardedThrough as number | undefined) ?? 0;
  if (Array.isArray(raw?.titles) && raw.titles.length > LIMIT) discardedThrough = sequence;
  const titles = new Map<string, TitleEvidence>();
  for (const entry of Array.isArray(raw?.titles) ? raw.titles.slice(-LIMIT) : []) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validId(entry[0])) {
      discardedThrough = sequence;
      continue;
    }
    const value = entry[1] as TitleEvidence | undefined;
    if (
      !value ||
      value.generation !== generation ||
      !Number.isSafeInteger(value.sequence) ||
      value.sequence < 1 ||
      value.sequence > sequence ||
      !Number.isSafeInteger(value.at) ||
      value.at < 0 ||
      value.at > Date.now() ||
      value.at + LIFETIME <= Date.now() ||
      typeof value.allowed !== "boolean" ||
      !Number.isSafeInteger(value.blockedThrough) ||
      value.blockedThrough < 0 ||
      value.blockedThrough > value.sequence ||
      (value.firstSequence !== undefined &&
        (!Number.isSafeInteger(value.firstSequence) ||
          value.firstSequence < 1 ||
          value.firstSequence > value.sequence))
    ) {
      discardedThrough = sequence;
      continue;
    }
    // Older prototype entries migrate conservatively: earlier grants need reissuance.
    titles.set(entry[0], { ...value, firstSequence: value.firstSequence ?? value.sequence });
  }
  return { generation, sequence, discardedThrough, missing: false, titles };
};
const saveLedger = (value: ReturnType<typeof ledger>): void => {
  while (value.titles.size > LIMIT) {
    value.discardedThrough = value.sequence;
    value.titles.delete(value.titles.keys().next().value!);
  }
  writeState(
    {
      generation: value.generation,
      sequence: value.sequence,
      discardedThrough: value.discardedThrough,
      titles: [...value.titles],
    },
    EVIDENCE,
  );
};
// Start-order is allocated before the provider request, never on a cache hit.
export const beginImageEvidence = (): ImageEvidence => {
  const value = ledger();
  if (value.missing) {
    if (!Number.isSafeInteger(highestGeneration + 1))
      throw new Error("Mangasushi evidence generation exhausted.");
    value.generation = `json-v1:${++highestGeneration}`;
    writeState(value.generation, GENERATION);
    writeState([], STORE);
  }
  if (!Number.isSafeInteger(value.sequence + 1))
    throw new Error("Mangasushi evidence sequence exhausted.");
  value.sequence += 1;
  saveLedger(value);
  return { generation: value.generation, sequence: value.sequence, at: Date.now() };
};
export const observeImageEvidence = (
  id: string,
  allowed: boolean,
  evidence: ImageEvidence,
): boolean => {
  const value = ledger(),
    previous = value.titles.get(id);
  if (value.missing || evidence.generation !== value.generation)
    throw new Error("Mangasushi classification evidence belongs to an expired generation.");
  if (!validId(id) || evidence.sequence > value.sequence || evidence.at + LIFETIME <= Date.now())
    throw new Error("Invalid Mangasushi classification evidence.");
  if (
    (previous && previous.sequence > evidence.sequence) ||
    (!previous && evidence.sequence <= value.discardedThrough)
  )
    return false;
  const blockedThrough = Math.max(previous?.blockedThrough ?? 0, allowed ? 0 : evidence.sequence);
  value.titles.delete(id);
  value.titles.set(id, {
    ...evidence,
    allowed: allowed && blockedThrough < evidence.sequence,
    blockedThrough,
    firstSequence: previous?.firstSequence ?? value.discardedThrough + 1,
  });
  saveLedger(value);
  return true;
};
export const imageEvidenceAllowed = (id: string, evidence?: ImageEvidence): boolean => {
  const title = ledger().titles.get(id);
  return (
    !!title &&
    !!evidence &&
    title.allowed &&
    evidence.generation === title.generation &&
    evidence.sequence >= title.firstSequence &&
    evidence.sequence > title.blockedThrough &&
    evidence.sequence <= title.sequence &&
    evidence.at + LIFETIME > Date.now()
  );
};
type Grant = {
  generation: string;
  id: string;
  chapters: string[];
  context: string;
  at: number;
  expires: number;
  allowed: boolean;
  evidence?: ImageEvidence;
};
export const checkImageURL = (value: string): void => {
  const url = sourceURL(value);
  if (
    !url.pathname.startsWith("/wp-content/uploads/") ||
    url.href !== value ||
    /[\\\s]|%(?:2f|5c|00|25)|(?:^|\/)\.\.?\//i.test(url.pathname) ||
    /\/dflazy\.|loading\.gif/i.test(url.pathname)
  )
    throw new Error("Unsupported Mangasushi image URL.");
};
const validId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 512 &&
  !/[/?#\\]/.test(value) &&
  value.split("").every((char) => char.charCodeAt(0) >= 32);
const issuedImages = (): Map<string, Grant> => {
  // State access is synchronous. Reload each operation rather than retaining
  // an instance snapshot. Separate JavaScript contexts have no atomic CAS API.
  const issued = new Map<string, Grant>(),
    stored = readState(STORE),
    now = Date.now();
  for (const entry of Array.isArray(stored) ? stored.slice(-LIMIT) : []) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") continue;
    const value = entry[1] as Partial<Grant> | undefined;
    if (
      !value ||
      !generationNumber(value.generation) ||
      !validId(value.id) ||
      !Array.isArray(value.chapters) ||
      value.chapters.length > 128 ||
      !value.chapters.every((id) => id === "" || validId(id)) ||
      !value.chapters.length ||
      typeof value.context !== "string" ||
      value.context.length > 128 ||
      typeof value.at !== "number" ||
      !Number.isSafeInteger(value.at) ||
      value.at < 0 ||
      value.at > now ||
      value.expires !== value.at + LIFETIME ||
      value.expires <= now ||
      typeof value.allowed !== "boolean" ||
      (value.evidence !== undefined &&
        (!generationNumber(value.evidence.generation) ||
          !Number.isSafeInteger(value.evidence.sequence) ||
          value.evidence.sequence < 1 ||
          !Number.isSafeInteger(value.evidence.at) ||
          value.evidence.at < 0 ||
          value.evidence.at > now))
    )
      continue;
    try {
      checkImageURL(entry[0]);
      issued.set(entry[0], { ...value, chapters: [...value.chapters] } as Grant);
    } catch {
      /* Invalid persisted grants never authorize requests. */
    }
  }
  return issued;
};
export const issueImages = (
  images: {
    url: string;
    id: string;
    chapterId?: string;
    allowed: boolean;
    evidence?: ImageEvidence;
  }[],
  saved: Preferences,
): void => {
  const context = JSON.stringify(saved);
  if (context !== JSON.stringify(preferences()))
    throw new Error("Mangasushi settings changed. Reload this page.");
  const current = ledger();
  if (current.missing)
    throw new Error("Mangasushi image evidence is missing. Reload fresh source metadata.");
  const issued = issuedImages();
  for (const image of images) {
    checkImageURL(image.url);
    if (image.evidence && image.evidence.generation !== current.generation)
      throw new Error("Mangasushi image classification belongs to an expired generation.");
    if (!validId(image.id) || (image.chapterId !== undefined && !validId(image.chapterId)))
      throw new Error("Invalid Mangasushi image identity.");
    const old = issued.get(image.url),
      chapterId = image.chapterId ?? "";
    if (old && old.id !== image.id)
      throw new Error(
        "Mangasushi image has conflicting source identity. Refresh the title or reader.",
      );
    if (saved.excludeNSFW && (!image.allowed || !imageEvidenceAllowed(image.id, image.evidence)))
      throw new Error(
        "Mangasushi source classification is stale, excluded, or unverifiable. Reload current source metadata.",
      );
    // Cached output never slides a grant. Only a new source issuance after
    // expiry can create another fixed one-day grant from current metadata.
    if (old?.context === context && old.generation === current.generation) {
      if (image.evidence && (!old.evidence || image.evidence.sequence > old.evidence.sequence)) {
        old.allowed = image.allowed;
        old.evidence = image.evidence;
      }
      if (!old.chapters.includes(chapterId))
        old.chapters = [...old.chapters.slice(-127), chapterId];
      continue;
    }
    const at = image.evidence?.at ?? Date.now();
    issued.set(image.url, {
      generation: current.generation,
      id: image.id,
      chapters: [chapterId],
      context,
      at,
      expires: at + LIFETIME,
      allowed: image.allowed,
      evidence: image.evidence,
    });
  }
  while (issued.size > LIMIT) issued.delete(issued.keys().next().value!);
  writeState([...issued], STORE);
};
export const authorizeImage = (url: string): void => {
  checkImageURL(url);
  const saved = preferences(),
    grant = issuedImages().get(url);
  if (!grant || grant.context !== JSON.stringify(saved) || grant.generation !== ledger().generation)
    throw new Error(
      "Mangasushi image authorization is missing, expired, or settings changed. Refresh the title or reader.",
    );
  if (saved.excludeNSFW && (!grant.allowed || !imageEvidenceAllowed(grant.id, grant.evidence)))
    throw new Error(
      "Mangasushi image is excluded or its source classification is stale or unverifiable.",
    );
};
