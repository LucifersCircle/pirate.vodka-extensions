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
export const PREFERENCES = "MangaStash.preferences";
export const NATIVE_POLICY = "MangaStash.nativeRatingPolicy";
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
  if (
    typeof Application.filterMatureTitles !== "boolean" ||
    typeof Application.filterAdultTitles !== "boolean"
  )
    throw new Error("MangaStash requires the native Paperback content policy.");
  const native = JSON.stringify([Application.filterMatureTitles, Application.filterAdultTitles]);
  const previousNative = Application.getState(NATIVE_POLICY);
  const saved = Application.getState(PREFERENCES) as Preferences | undefined;
  if (saved === undefined || saved === null) {
    // A partial settings reset cannot revive grants from the previous policy epoch.
    const old = Application.getState("MangaStash.images");
    const highest = Array.isArray(old)
      ? old.reduce((n, e) => Math.max(n, Number.isSafeInteger(e?.revision) ? e.revision : 0), 0)
      : 0;
    const revision = highest + 1;
    if (!Number.isSafeInteger(revision)) throw new Error("MangaStash policy revision exhausted.");
    const value = { onlySafe: false, revision };
    Application.setState(value, PREFERENCES);
    Application.setState(native, NATIVE_POLICY);
    Application.setState([], "MangaStash.images");
    return value;
  }
  if (
    typeof saved !== "object" ||
    Array.isArray(saved) ||
    typeof saved.onlySafe !== "boolean" ||
    !Number.isSafeInteger(saved.revision) ||
    saved.revision < 1
  )
    throw new Error("MangaStash settings are invalid; reset source settings.");
  if (previousNative !== native) {
    const issued = Application.getState("MangaStash.images");
    const changed = previousNative !== undefined || (Array.isArray(issued) && issued.length > 0);
    const revision = saved.revision + (changed ? 1 : 0);
    if (!Number.isSafeInteger(revision)) throw new Error("MangaStash policy revision exhausted.");
    const value = { onlySafe: saved.onlySafe, revision };
    Application.setState(value, PREFERENCES);
    Application.setState(native, NATIVE_POLICY);
    if (changed) Application.setState([], "MangaStash.images");
    return value;
  }
  return { onlySafe: saved.onlySafe, revision: saved.revision };
};
export class MangaStashSettingsForm extends Form {
  override getSections() {
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
            value: preferences().onlySafe,
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
    const revision = preferences().revision + 1;
    if (!Number.isSafeInteger(revision)) throw new Error("MangaStash policy revision exhausted.");
    Application.setState({ onlySafe: value, revision }, PREFERENCES);
    Application.setState([], "MangaStash.images");
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
  async reset() {
    await this.setOnlySafe(false);
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
