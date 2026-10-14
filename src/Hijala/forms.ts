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
  TriStateSelectRow,
  type Metadata,
  type SearchQuery,
  type TriStateSelectRowProps,
} from "@paperback/types";
import {
  SECTIONS,
  STATUSES,
  TYPES,
  LABELS,
  type Preferences,
  type SearchFilters,
  type SeriesMetadata,
} from "./models";

export const readFilters = (metadata?: Metadata): SearchFilters => {
  const data = (metadata ?? {}) as Partial<SearchFilters>;
  return {
    genres: Object.fromEntries(
      Object.entries(data.genres ?? {}).filter(
        ([id, value]) => /^\d+$/.test(id) && (value === "included" || value === "excluded"),
      ),
    ),
    statuses: Array.isArray(data.statuses)
      ? data.statuses.filter((value) => STATUSES.includes(value))
      : [],
    types: Array.isArray(data.types) ? data.types.filter((value) => TYPES.includes(value)) : [],
    direction: ["asc", "desc"].includes(data.direction ?? "") ? data.direction! : "default",
    minChapters: typeof data.minChapters === "string" ? data.minChapters : "",
    maxChapters: typeof data.maxChapters === "string" ? data.maxChapters : "",
    createdAfter: typeof data.createdAfter === "string" ? data.createdAfter : "",
    createdBefore: typeof data.createdBefore === "string" ? data.createdBefore : "",
  };
};

export const preferences = (): Preferences => {
  const saved = Application.getState("Hijala.preferences") as Partial<Preferences> | undefined;
  return {
    hidePaid: saved?.hidePaid ?? true,
    sections: saved?.sections ?? SECTIONS.map((section) => section.id),
    types: saved?.types ?? [...TYPES],
    excludedGenres: saved?.excludedGenres ?? [],
  };
};

export const matchesPreferences = (item: { metadata?: unknown }, saved: Preferences): boolean => {
  const data = item.metadata as SeriesMetadata;
  return (
    !data.novel &&
    (!data.type || saved.types.includes(data.type)) &&
    !data.genres.some((id) => saved.excludedGenres.includes(id)) &&
    (!saved.hidePaid || !data.paid)
  );
};

export const queryWithPreferences = (
  query: SearchQuery<Metadata>,
  saved: Preferences,
): SearchQuery<Metadata> | undefined => {
  const filters = readFilters(query.metadata);
  const types = filters.types.length
    ? filters.types.filter((type) => saved.types.includes(type))
    : saved.types;
  if (!types.length || saved.excludedGenres.some((id) => filters.genres[id] === "included"))
    return undefined;
  return {
    ...query,
    metadata: {
      ...filters,
      types,
      genres: {
        ...filters.genres,
        ...Object.fromEntries(saved.excludedGenres.map((id) => [id, "excluded"])),
      },
    },
  };
};

export class HijalaSettingsForm extends Form {
  constructor(private genres: TriStateSelectRowProps["items"]) {
    super();
  }

  override getSections() {
    const saved = preferences();
    return [
      Section({ id: "preferences", header: "Hijala" }, [
        SelectRow("types", {
          title: "Content types",
          subtitle: "Show these types in Discover and Search.",
          layout: "list",
          items: TYPES.map((id) => ({ id, title: LABELS[id] })),
          value: [...saved.types],
          minItemCount: 1,
          maxItemCount: TYPES.length,
          onValueChange: Application.Selector(this as HijalaSettingsForm, "setTypes"),
        }),
        SelectRow("excludedGenres", {
          title: "Excluded genres",
          subtitle: "Hide matching titles in Discover and Search.",
          layout: "list",
          items: this.genres,
          value: [...saved.excludedGenres],
          minItemCount: 0,
          maxItemCount: this.genres.length,
          onValueChange: Application.Selector(this as HijalaSettingsForm, "setExcludedGenres"),
        }),
        ToggleRow("hidePaid", {
          title: "Hide paid chapters",
          subtitle:
            "Applies to chapter lists and chapter updates. Purchases remain on the website.",
          value: saved.hidePaid,
          onValueChange: Application.Selector(this as HijalaSettingsForm, "setHidePaid"),
        }),
        SelectRow("sections", {
          title: "Discover sections",
          layout: "list",
          items: SECTIONS.map((section) => ({ id: section.id, title: section.title })),
          value: saved.sections,
          minItemCount: 1,
          maxItemCount: SECTIONS.length,
          onValueChange: Application.Selector(this as HijalaSettingsForm, "setSections"),
        }),
        ButtonRow("reset", {
          title: "Reset settings",
          onSelect: Application.Selector(this as HijalaSettingsForm, "reset"),
        }),
      ]),
    ];
  }

  async setHidePaid(value: boolean) {
    Application.setState({ ...preferences(), hidePaid: value }, "Hijala.preferences");
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async setTypes(value: string[]) {
    const types = TYPES.filter((type) => value.includes(type));
    if (!types.length) throw new Error("Select at least one content type.");
    Application.setState({ ...preferences(), types }, "Hijala.preferences");
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async setExcludedGenres(value: string[]) {
    const excludedGenres = this.genres
      .filter((genre) => value.includes(genre.id))
      .map((genre) => genre.id);
    Application.setState({ ...preferences(), excludedGenres }, "Hijala.preferences");
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async setSections(value: string[]) {
    const sections = SECTIONS.filter((section) => value.includes(section.id)).map(
      (section) => section.id,
    );
    if (!sections.length) throw new Error("Select at least one Discover section.");
    Application.setState({ ...preferences(), sections }, "Hijala.preferences");
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async reset() {
    Application.setState(undefined, "Hijala.preferences");
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
}

export class HijalaSearchForm extends AdvancedSearchForm {
  private draft: SearchFilters;

  constructor(
    query: SearchQuery<Metadata>,
    private genres: TriStateSelectRowProps["items"],
  ) {
    super();
    this.draft = readFilters(query.metadata);
  }

  override getSections() {
    return [
      Section(
        {
          id: "filters",
          header: "Filter series",
          footer: "Source content types and excluded genres also apply.",
        },
        [
          TriStateSelectRow("genres", {
            title: "Genres",
            layout: "list",
            items: this.genres,
            value: { ...this.draft.genres },
            allowExclusion: true,
            allowEmptySelection: true,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setGenres"),
          }),
          SelectRow("statuses", {
            title: "Status",
            layout: "list",
            items: STATUSES.map((id) => ({ id, title: LABELS[id] })),
            value: [...this.draft.statuses],
            minItemCount: 0,
            maxItemCount: STATUSES.length,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setStatuses"),
          }),
          SelectRow("types", {
            title: "Type",
            layout: "list",
            items: TYPES.map((id) => ({ id, title: LABELS[id] })),
            value: [...this.draft.types],
            minItemCount: 0,
            maxItemCount: TYPES.length,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setTypes"),
          }),
          SelectRow("direction", {
            title: "Sort direction",
            layout: "list",
            items: [
              { id: "default", title: "Default for sort" },
              { id: "asc", title: "Ascending" },
              { id: "desc", title: "Descending" },
            ],
            value: [this.draft.direction],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setDirection"),
          }),
        ],
      ),
      Section(
        {
          id: "ranges",
          header: "Limits",
          footer:
            "Leave limits blank for any value. Dates use YYYY-MM-DD and refer to when the series was added.",
        },
        [
          InputRow("minChapters", {
            title: "Minimum chapters",
            value: this.draft.minChapters,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setMinChapters"),
          }),
          InputRow("maxChapters", {
            title: "Maximum chapters",
            value: this.draft.maxChapters,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setMaxChapters"),
          }),
          InputRow("createdAfter", {
            title: "Created after",
            value: this.draft.createdAfter,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setCreatedAfter"),
          }),
          InputRow("createdBefore", {
            title: "Created before",
            value: this.draft.createdBefore,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setCreatedBefore"),
          }),
          ButtonRow("reset", {
            title: "Reset filters",
            onSelect: Application.Selector(this as HijalaSearchForm, "reset"),
          }),
        ],
      ),
    ];
  }

  async setGenres(value: SearchFilters["genres"]) {
    this.draft.genres = { ...value };
    this.reloadForm();
  }
  async setStatuses(value: string[]) {
    this.draft.statuses = [...value];
    this.reloadForm();
  }
  async setTypes(value: string[]) {
    this.draft.types = [...value];
    this.reloadForm();
  }
  async setDirection(value: string[]) {
    this.draft.direction = value[0] ?? "default";
    this.reloadForm();
  }
  async setMinChapters(value: string) {
    this.draft.minChapters = value.trim();
  }
  async setMaxChapters(value: string) {
    this.draft.maxChapters = value.trim();
  }
  async setCreatedAfter(value: string) {
    this.draft.createdAfter = value.trim();
  }
  async setCreatedBefore(value: string) {
    this.draft.createdBefore = value.trim();
  }
  async reset() {
    this.draft = readFilters();
    this.reloadForm();
  }

  override async formDidSubmit() {
    for (const value of [this.draft.minChapters, this.draft.maxChapters]) {
      if (value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))))
        throw new Error("Chapter limits must be whole numbers of zero or more.");
    }
    if (
      this.draft.minChapters &&
      this.draft.maxChapters &&
      Number(this.draft.minChapters) > Number(this.draft.maxChapters)
    )
      throw new Error("Minimum chapters cannot exceed maximum chapters.");
    for (const value of [this.draft.createdAfter, this.draft.createdBefore]) {
      if (!value) continue;
      const date = new Date(`${value}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      )
        throw new Error("Enter a valid date in YYYY-MM-DD format.");
    }
    if (
      this.draft.createdAfter &&
      this.draft.createdBefore &&
      this.draft.createdAfter > this.draft.createdBefore
    )
      throw new Error("Created after cannot be later than created before.");
  }

  override getSearchQueryMetadata(): Metadata {
    return {
      ...this.draft,
      genres: { ...this.draft.genres },
      statuses: [...this.draft.statuses],
      types: [...this.draft.types],
    };
  }
}
