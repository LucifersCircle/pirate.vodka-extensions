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
import { GENRE_ROUTE_KEY, STATUSES, type Preferences, type SearchFilters } from "./models";

export const preferences = (): Preferences => {
  const saved = Application.getState("MangaSushi.preferences") as Partial<Preferences> | undefined;
  return {
    excludeNSFW: saved?.excludeNSFW !== false,
    revision: Number.isSafeInteger(saved?.revision) ? saved!.revision! : 0,
  };
};
export const readFilters = (metadata?: Metadata): SearchFilters => {
  const data = (metadata ?? {}) as Partial<SearchFilters>;
  const invalid = (field: string): never => {
    throw new Error(
      `Mangasushi saved ${field} filter is invalid; clear your search filters and retry.`,
    );
  };
  if (typeof data !== "object" || Array.isArray(data)) invalid("search");
  if (
    data.genres != null &&
    (!Array.isArray(data.genres) ||
      [...data.genres].some((id) => typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)))
  )
    invalid("genre");
  if (
    data.statuses != null &&
    (!Array.isArray(data.statuses) ||
      [...data.statuses].some((id) => !STATUSES.some((status) => status.id === id)))
  )
    invalid("status");
  // SelectRow callbacks use arrays, but the form persists these single choices as strings.
  if (data.condition != null && !["", "1"].includes(data.condition)) invalid("genre condition");
  if (data.adult != null && !["", "0", "1"].includes(data.adult)) invalid("adult");
  for (const key of ["author", "artist", "release"] as const)
    if (data[key] != null && typeof data[key] !== "string") invalid(key);
  return {
    genres: [...(data.genres ?? [])],
    condition: data.condition ?? "",
    author: data.author?.trim() ?? "",
    artist: data.artist?.trim() ?? "",
    release: data.release?.trim() ?? "",
    adult: data.adult ?? "",
    statuses: [...(data.statuses ?? [])],
  };
};
export class MangaSushiSettingsForm extends Form {
  override getSections() {
    return [
      Section(
        {
          id: "content",
          header: "Mangasushi",
          footer:
            "Uses the site's non-adult filter and hides Adult, Mature, Smut, Hentai, Erotica and Ecchi genres. Titles without reliable genre metadata are hidden too, including saved titles. Paperback's Mature badge is a conservative app rating, not the site's Mature genre, which is excluded. Website tags can be incomplete, so this is not a content guarantee. Changes apply to future requests; pages already downloaded by Paperback cannot be revoked.",
        },
        [
          ToggleRow("excludeNSFW", {
            title: "Exclude NSFW content",
            subtitle:
              "On by default. Applies to Discover, Search, details, chapters and reader access.",
            value: preferences().excludeNSFW,
            onValueChange: Application.Selector(this as MangaSushiSettingsForm, "setExcludeNSFW"),
          }),
          ButtonRow("reset", {
            title: "Reset settings",
            onSelect: Application.Selector(this as MangaSushiSettingsForm, "reset"),
          }),
        ],
      ),
    ];
  }
  async setExcludeNSFW(value: boolean) {
    Application.setState(
      { excludeNSFW: value, revision: preferences().revision + 1 },
      "MangaSushi.preferences",
    );
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
  async reset() {
    await this.setExcludeNSFW(true);
  }
}
export class MangaSushiSearchForm extends AdvancedSearchForm {
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
          header: "Mangasushi search",
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
            onValueChange: Application.Selector(this as MangaSushiSearchForm, "setGenres"),
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
            onValueChange: Application.Selector(this as MangaSushiSearchForm, "setCondition"),
          }),
          InputRow("author", {
            title: "Author",
            value: this.draft.author,
            onValueChange: Application.Selector(this as MangaSushiSearchForm, "setAuthor"),
          }),
          InputRow("artist", {
            title: "Artist",
            value: this.draft.artist,
            onValueChange: Application.Selector(this as MangaSushiSearchForm, "setArtist"),
          }),
          InputRow("release", {
            title: "Year of Released",
            value: this.draft.release,
            onValueChange: Application.Selector(this as MangaSushiSearchForm, "setRelease"),
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
                  onValueChange: Application.Selector(this as MangaSushiSearchForm, "setAdult"),
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
            onValueChange: Application.Selector(this as MangaSushiSearchForm, "setStatuses"),
          }),
          ButtonRow("reset", {
            title: "Reset filters",
            onSelect: Application.Selector(this as MangaSushiSearchForm, "reset"),
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

export const readGenreRoute = (metadata?: Metadata): string | undefined => {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !Object.prototype.hasOwnProperty.call(metadata, GENRE_ROUTE_KEY)
  )
    return undefined;
  if (Array.isArray(metadata)) throw new Error("Invalid Mangasushi genre archive selection.");
  const value = metadata[GENRE_ROUTE_KEY];
  if (
    typeof value !== "string" ||
    !/^[a-z][a-z0-9-]*$/.test(value) ||
    Object.keys(metadata).length !== 1
  )
    throw new Error("Invalid Mangasushi genre archive selection.");
  return value;
};
export class MangaSushiGenreForm extends AdvancedSearchForm {
  constructor(private readonly id: string) {
    super();
  }
  override getSections() {
    return [];
  }
  override getSearchQueryMetadata(): Metadata {
    return { [GENRE_ROUTE_KEY]: this.id };
  }
}
