import {
  AdvancedSearchForm,
  ButtonRow,
  InputRow,
  Section,
  SelectRow,
  TriStateSelectRow,
} from "@paperback/types";
import type { FormSectionElement } from "@paperback/types";
import { STATUSES, TYPES, readFilters, stringList, validateFilters } from "./models";
import type { Filters, Genre, GenreSelection } from "./models";

export class HijalaSearchForm extends AdvancedSearchForm {
  private draft: Filters;
  constructor(
    metadata: unknown,
    private readonly genres: Genre[],
  ) {
    super();
    this.draft = readFilters(metadata);
  }

  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section(
        {
          id: "filters",
          footer:
            "All included genres must match. Excluded genres and source settings still apply. Empty type/status selections mean all allowed values.",
        },
        [
          TriStateSelectRow("genres", {
            title: "Genres",
            layout: "list",
            items: this.genres.map((genre) => ({ id: String(genre.id), title: genre.name })),
            value: { ...this.draft.genres },
            allowExclusion: true,
            allowEmptySelection: true,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setGenres"),
          }),
          SelectRow("types", {
            title: "Types",
            layout: "list",
            items: TYPES.map((id) => ({ id, title: id })),
            value: [...this.draft.types],
            minItemCount: 0,
            maxItemCount: TYPES.length,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setTypes"),
          }),
          SelectRow("statuses", {
            title: "Status",
            layout: "list",
            items: STATUSES.map((id) => ({ id, title: id.replaceAll("_", " ") })),
            value: [...this.draft.statuses],
            minItemCount: 0,
            maxItemCount: STATUSES.length,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setStatuses"),
          }),
          SelectRow("direction", {
            title: "Sort direction",
            layout: "list",
            items: [
              { id: "default", title: "Default for selected sort" },
              { id: "asc", title: "Ascending" },
              { id: "desc", title: "Descending" },
            ],
            value: [this.draft.direction || "default"],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setDirection"),
          }),
        ],
      ),
      Section(
        {
          id: "limits",
          footer:
            "Chapter counts must be whole numbers. Dates use YYYY-MM-DD. Leave a field blank for no limit.",
        },
        [
          InputRow("min-chapters", {
            title: "Minimum chapters",
            value: this.draft.minChapters,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setMinChapters"),
          }),
          InputRow("max-chapters", {
            title: "Maximum chapters",
            value: this.draft.maxChapters,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setMaxChapters"),
          }),
          InputRow("created-after", {
            title: "Created after",
            value: this.draft.createdAfter,
            onValueChange: Application.Selector(this as HijalaSearchForm, "setCreatedAfter"),
          }),
          InputRow("created-before", {
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

  override async formDidSubmit(): Promise<void> {
    validateFilters(this.draft);
  }
  override getSearchQueryMetadata(): Filters {
    return readFilters(this.draft);
  }
  async setGenres(value: GenreSelection): Promise<void> {
    this.draft.genres = readFilters({ genres: value }).genres;
  }
  async setTypes(value: string[]): Promise<void> {
    this.draft.types = stringList(value, TYPES);
  }
  async setStatuses(value: string[]): Promise<void> {
    this.draft.statuses = stringList(value, STATUSES);
  }
  async setDirection(value: string[]): Promise<void> {
    this.draft.direction = value[0] === "asc" || value[0] === "desc" ? value[0] : "";
  }
  async setMinChapters(value: string): Promise<void> {
    this.draft.minChapters = value.trim();
  }
  async setMaxChapters(value: string): Promise<void> {
    this.draft.maxChapters = value.trim();
  }
  async setCreatedAfter(value: string): Promise<void> {
    this.draft.createdAfter = value.trim();
  }
  async setCreatedBefore(value: string): Promise<void> {
    this.draft.createdBefore = value.trim();
  }
  async reset(): Promise<void> {
    this.draft = readFilters(undefined);
    this.reloadForm();
  }
}
