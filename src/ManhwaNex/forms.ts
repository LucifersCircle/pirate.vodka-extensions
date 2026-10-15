/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  AdvancedSearchForm,
  ButtonRow,
  Form,
  InputRow,
  Section,
  SelectRow,
  ToggleRow,
  type Metadata,
  type SearchQuery,
} from "@paperback/types";
import { STATUSES, type Preferences, type SearchFilters } from "./models";

export const preferences = (): Preferences => {
  const saved = Application.getState("ManhwaNex.preferences") as Partial<Preferences> | undefined;
  return {
    excludeNSFW: saved?.excludeNSFW !== false,
    revision: Number.isSafeInteger(saved?.revision) ? saved!.revision! : 0,
  };
};
export const readFilters = (metadata?: Metadata): SearchFilters => {
  const data = (metadata ?? {}) as Partial<SearchFilters>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return {
    genres: Array.isArray(data.genres)
      ? data.genres.filter((id) => typeof id === "string" && /^[a-z0-9-]+$/.test(id))
      : [],
    condition: data.condition === "1" ? "1" : "",
    author: text(data.author),
    artist: text(data.artist),
    release: text(data.release),
    adult: ["0", "1"].includes(data.adult ?? "") ? data.adult! : "",
    statuses: Array.isArray(data.statuses)
      ? data.statuses.filter((id) => STATUSES.some((status) => status.id === id))
      : [],
  };
};
export class ManhwaNexSettingsForm extends Form {
  override getSections() {
    return [
      Section(
        {
          id: "content",
          header: "ManhwaNex",
          footer:
            "Uses the website's non-adult search filter plus its verified genre taxonomy. Unknown or conflicting classifications are hidden, including saved titles. The website has no granular age-rating taxonomy, so selective age ratings are unavailable. Paperback's Mature badge is conservative, not a claim of all-ages suitability. Website labels can be incomplete. Changes apply to future requests; downloaded pages cannot be revoked.",
        },
        [
          ToggleRow("excludeNSFW", {
            title: "Exclude NSFW content",
            subtitle:
              "On by default. Applies to Discover, Search, details, chapters and reader access.",
            value: preferences().excludeNSFW,
            onValueChange: Application.Selector(this as ManhwaNexSettingsForm, "setExcludeNSFW"),
          }),
          ButtonRow("reset", {
            title: "Reset settings",
            onSelect: Application.Selector(this as ManhwaNexSettingsForm, "reset"),
          }),
        ],
      ),
    ];
  }
  async setExcludeNSFW(value: boolean) {
    Application.setState(
      { excludeNSFW: value, revision: preferences().revision + 1 },
      "ManhwaNex.preferences",
    );
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
  async reset() {
    await this.setExcludeNSFW(true);
  }
}
export class ManhwaNexSearchForm extends AdvancedSearchForm {
  private draft: SearchFilters;
  constructor(
    query: SearchQuery<Metadata>,
    private genres: { id: string; title: string }[],
  ) {
    super();
    this.draft = readFilters(query.metadata);
  }
  override getSections() {
    return [
      Section(
        {
          id: "filters",
          header: "ManhwaNex search",
          footer: preferences().excludeNSFW
            ? "NSFW exclusion overrides the site's Adult selector. Unclassified titles are hidden."
            : "Matches the site's advanced search. Genres use the selected OR / AND condition.",
        },
        [
          SelectRow("genres", {
            title: "Genres",
            layout: "list",
            items: this.genres,
            value: [...this.draft.genres],
            minItemCount: 0,
            maxItemCount: this.genres.length,
            onValueChange: Application.Selector(this as ManhwaNexSearchForm, "setGenres"),
          }),
          SelectRow("condition", {
            title: "Genres condition",
            layout: "list",
            items: [
              { id: "", title: "OR (one selected genre)" },
              { id: "1", title: "AND (all selected genres)" },
            ],
            value: [this.draft.condition],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as ManhwaNexSearchForm, "setCondition"),
          }),
          InputRow("author", {
            title: "Author",
            value: this.draft.author,
            onValueChange: Application.Selector(this as ManhwaNexSearchForm, "setAuthor"),
          }),
          InputRow("artist", {
            title: "Artist",
            value: this.draft.artist,
            onValueChange: Application.Selector(this as ManhwaNexSearchForm, "setArtist"),
          }),
          InputRow("release", {
            title: "Year of Released",
            value: this.draft.release,
            onValueChange: Application.Selector(this as ManhwaNexSearchForm, "setRelease"),
          }),
          ...(!preferences().excludeNSFW
            ? [
                SelectRow("adult", {
                  title: "Adult content",
                  layout: "list",
                  items: [
                    { id: "", title: "All" },
                    { id: "0", title: "None adult content" },
                    { id: "1", title: "Only adult content" },
                  ],
                  value: [this.draft.adult],
                  minItemCount: 1,
                  maxItemCount: 1,
                  onValueChange: Application.Selector(this as ManhwaNexSearchForm, "setAdult"),
                }),
              ]
            : []),
          SelectRow("statuses", {
            title: "Status",
            layout: "list",
            items: STATUSES,
            value: [...this.draft.statuses],
            minItemCount: 0,
            maxItemCount: STATUSES.length,
            onValueChange: Application.Selector(this as ManhwaNexSearchForm, "setStatuses"),
          }),
          ButtonRow("reset", {
            title: "Reset filters",
            onSelect: Application.Selector(this as ManhwaNexSearchForm, "reset"),
          }),
        ],
      ),
    ];
  }
  async setGenres(value: string[]) {
    this.draft.genres = this.genres
      .filter((genre) => value.includes(genre.id))
      .map((genre) => genre.id);
    this.reloadForm();
  }
  async setCondition(value: string[]) {
    this.draft.condition = value[0] === "1" ? "1" : "";
    this.reloadForm();
  }
  async setAuthor(value: string) {
    this.draft.author = value.trim();
  }
  async setArtist(value: string) {
    this.draft.artist = value.trim();
  }
  async setRelease(value: string) {
    this.draft.release = value.trim();
  }
  async setAdult(value: string[]) {
    this.draft.adult = value[0] ?? "";
    this.reloadForm();
  }
  async setStatuses(value: string[]) {
    this.draft.statuses = STATUSES.filter((status) => value.includes(status.id)).map(
      (status) => status.id,
    );
    this.reloadForm();
  }
  async reset() {
    this.draft = readFilters();
    this.reloadForm();
  }
  override async formDidSubmit() {
    if (this.draft.release && !/^\d{4}$/.test(this.draft.release))
      throw new Error("Release year must contain four digits.");
  }
  override getSearchQueryMetadata(): Metadata {
    return { ...this.draft, genres: [...this.draft.genres], statuses: [...this.draft.statuses] };
  }
}
