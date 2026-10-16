/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  AdvancedSearchForm,
  ContentRating,
  ButtonRow,
  Form,
  Section,
  SelectRow,
  ToggleRow,
  type Metadata,
  type SearchQuery,
} from "@paperback/types";
import {
  COMPATIBILITY,
  CONTROLS,
  type Filters,
  type Preferences,
  type Rating,
  nativeRating,
} from "./models";
import { readFilters } from "./urls";
import { readStoredState, settingsShape, writeStoredState } from "./state";
export const PREFERENCES = "MangaStash.preferences";
export const NATIVE_POLICY = "MangaStash.nativeRatingPolicy";
export class InvalidSettingsError extends Error {
  constructor(key = PREFERENCES) {
    super(
      `MangaStash settings are invalid (${key === PREFERENCES ? "preferences" : "image grants"}: ${settingsShape(key)}). Open source settings to reset.`,
    );
  }
}
let highestRevision = 0;
const rememberRevision = (value: unknown): number => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1)
    highestRevision = Math.max(highestRevision, value);
  return highestRevision;
};
const nextRevision = (): number => {
  // Recovery reads only numeric epoch evidence, never treats malformed policy as valid.
  let saved: unknown, issued: unknown;
  try {
    saved = readStoredState(PREFERENCES);
  } catch {
    /* Explicit reset can replace invalid JSON. */
  }
  try {
    issued = readStoredState("MangaStash.images");
  } catch {
    /* Grants are revoked below. */
  }
  if (saved && typeof saved === "object")
    rememberRevision((saved as Partial<Preferences>).revision);
  if (Array.isArray(issued)) for (const grant of issued) rememberRevision(grant?.revision);
  const revision = highestRevision + 1;
  if (!Number.isSafeInteger(revision)) throw new Error("MangaStash policy revision exhausted.");
  return revision;
};
const nativePolicy = (): string => {
  if (
    typeof Application.filterMatureTitles !== "boolean" ||
    typeof Application.filterAdultTitles !== "boolean"
  )
    throw new Error("MangaStash requires the native Paperback content policy.");
  return JSON.stringify([Application.filterMatureTitles, Application.filterAdultTitles]);
};
const savePreferences = (value: Preferences, native: string): Preferences => {
  writeStoredState(value, PREFERENCES);
  Application.setState(native, NATIVE_POLICY);
  writeStoredState([], "MangaStash.images");
  rememberRevision(value.revision);
  return value;
};
// The pinned host exposes independent filters for its Mature and Adult item ratings.
// Unknown is mapped to Mature compatibility, never silently treated as explicit Adult.
export const nativeAllowed = (rating: Rating): boolean => {
  const value = nativeRating(rating);
  return (
    value === ContentRating.EVERYONE ||
    (value === ContentRating.MATURE && !Application.filterMatureTitles) ||
    (value === ContentRating.ADULT && !Application.filterAdultTitles)
  );
};
export const preferences = (): Preferences => {
  const native = nativePolicy();
  const previousNative = Application.getState(NATIVE_POLICY);
  let saved: Preferences | undefined | null;
  try {
    saved = readStoredState(PREFERENCES) as Preferences | undefined | null;
  } catch {
    throw new InvalidSettingsError();
  }
  if (saved === undefined || saved === null)
    return savePreferences({ onlySafe: false, revision: nextRevision() }, native);
  if (
    typeof saved !== "object" ||
    Array.isArray(saved) ||
    typeof saved.onlySafe !== "boolean" ||
    !Number.isSafeInteger(saved.revision) ||
    saved.revision < 1 ||
    saved.revision < highestRevision
  )
    throw new InvalidSettingsError();
  rememberRevision(saved.revision);
  if (previousNative !== native) {
    let issued: unknown;
    try {
      issued = readStoredState("MangaStash.images");
    } catch {
      throw new InvalidSettingsError("MangaStash.images");
    }
    const changed = previousNative !== undefined || (Array.isArray(issued) && issued.length > 0);
    return savePreferences(
      { onlySafe: saved.onlySafe, revision: changed ? nextRevision() : saved.revision },
      native,
    );
  }
  return { onlySafe: saved.onlySafe, revision: saved.revision };
};
export class MangaStashSettingsForm extends Form {
  override getSections() {
    let saved: Preferences;
    try {
      saved = preferences();
    } catch (error) {
      if (!(error instanceof InvalidSettingsError)) throw error;
      return [
        Section(
          {
            id: "recovery",
            header: "MangaStash settings need recovery",
            footer: `${error.message} Reset restores the source default and revokes saved image access. Paperback’s Mature and Adult filters and retained source warnings are unchanged.`,
          },
          [
            ButtonRow("reset", {
              title: "Reset settings",
              onSelect: Application.Selector(this as MangaStashSettingsForm, "reset"),
            }),
          ],
        ),
      ];
    }
    return [
      Section(
        {
          id: "content",
          header: "MangaStash",
          footer:
            COMPATIBILITY +
            " Paperback’s own Mature and Adult filters also apply, including saved readers and image requests. Changes apply to future requests; downloaded images cannot be revoked.",
        },
        [
          ToggleRow("onlySafe", {
            title: "Only explicitly Safe titles",
            subtitle:
              "Off by default. Only titles explicitly labeled Safe by MangaStash are allowed when enabled; unlabeled listings are excluded.",
            value: saved.onlySafe,
            onValueChange: Application.Selector(this as MangaStashSettingsForm, "setOnlySafe"),
          }),
          ButtonRow("reset", {
            title: "Reset settings",
            onSelect: Application.Selector(this as MangaStashSettingsForm, "reset"),
          }),
        ],
      ),
    ];
  }
  async setOnlySafe(value: boolean) {
    if (typeof value !== "boolean") throw new Error("Invalid MangaStash content setting.");
    preferences();
    savePreferences({ onlySafe: value, revision: nextRevision() }, nativePolicy());
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
  async reset() {
    const native = nativePolicy();
    savePreferences({ onlySafe: false, revision: nextRevision() }, native);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
}
export class MangaStashSearchForm extends AdvancedSearchForm {
  private draft: Filters;
  constructor(query: SearchQuery<Metadata>) {
    super();
    this.draft = readFilters(query.metadata);
  }
  override getSections() {
    return [
      Section(
        {
          id: "browse",
          header: "MangaStash browse filters",
          footer:
            "These are website browse controls. Clear the search text before applying filters or sorting; text search supports q only.",
        },
        CONTROLS.map((c) =>
          SelectRow(c.id, {
            title: c.title,
            layout: "list",
            items: c.items,
            value:
              typeof this.draft[c.id] === "string"
                ? [this.draft[c.id] as string]
                : [...(this.draft[c.id] as string[])],
            minItemCount: c.id === "rating" ? 1 : 0,
            maxItemCount: c.id === "rating" ? 1 : c.items.length,
            onValueChange: Application.Selector(
              this as MangaStashSearchForm,
              ("set" + c.id) as "setstatus",
            ),
          }),
        ),
      ),
    ];
  }
  private set(key: string, value: string[]) {
    this.draft = readFilters({ ...this.draft, [key]: key === "rating" ? (value[0] ?? "") : value });
    this.reloadForm();
  }
  async setstatus(v: string[]) {
    this.set("status", v);
  }
  async setgenre(v: string[]) {
    this.set("genre", v);
  }
  async settheme(v: string[]) {
    this.set("theme", v);
  }
  async setmood(v: string[]) {
    this.set("mood", v);
  }
  async setformat(v: string[]) {
    this.set("format", v);
  }
  async setdemographic(v: string[]) {
    this.set("demographic", v);
  }
  async setlanguage(v: string[]) {
    this.set("language", v);
  }
  async setrating(v: string[]) {
    this.set("rating", v);
  }
  override getSearchQueryMetadata(): Metadata {
    return readFilters(this.draft);
  }
}
