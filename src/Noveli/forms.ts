/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  AdvancedSearchForm,
  ButtonRow,
  Section,
  SelectRow,
  type Metadata,
  type SearchQuery,
} from "@paperback/types";
import { type Filters } from "./models";
import { labelId, readFilters } from "./urls";
export class NoveliSearchForm extends AdvancedSearchForm {
  private draft: Filters;
  constructor(
    query: SearchQuery<Metadata>,
    private taxonomy: string[],
  ) {
    super();
    this.draft = readFilters(query.metadata);
  }
  override getSections() {
    return [
      Section(
        {
          id: "filters",
          header: "Noveli search",
          footer: "Genres and tags use Noveli’s current labels. Paperback’s content filters apply.",
        },
        [
          SelectRow("genres", {
            title: "Genres & tags",
            layout: "list",
            items: this.taxonomy.map((label) => ({ id: labelId(label), title: label })),
            value: this.draft.genres.map(labelId),
            minItemCount: 0,
            maxItemCount: this.taxonomy.length,
            onValueChange: Application.Selector(this as NoveliSearchForm, "setGenres"),
          }),
          SelectRow("status", {
            title: "Status",
            layout: "list",
            items: [
              { id: "all", title: "All statuses" },
              { id: "Ongoing", title: "Ongoing" },
              { id: "Completed", title: "Completed" },
            ],
            value: [this.draft.status || "all"],
            minItemCount: 1,
            maxItemCount: 1,
            onValueChange: Application.Selector(this as NoveliSearchForm, "setStatus"),
          }),
          ButtonRow("reset", {
            title: "Reset filters",
            onSelect: Application.Selector(this as NoveliSearchForm, "reset"),
          }),
        ],
      ),
    ];
  }
  async setGenres(value: string[]) {
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string"))
      throw new Error("Invalid Noveli genre selection.");
    const labels = new Map(this.taxonomy.map((label) => [labelId(label), label]));
    if (value.some((id) => !labels.has(id))) throw new Error("Unknown Noveli genre or tag.");
    this.draft = readFilters({ ...this.draft, genres: value.map((id) => labels.get(id)!) });
    this.reloadForm();
  }
  async setStatus(value: string[]) {
    if (
      !Array.isArray(value) ||
      value.length !== 1 ||
      !["all", "Ongoing", "Completed"].includes(value[0])
    )
      throw new Error("Invalid Noveli status selection.");
    this.draft = readFilters({ ...this.draft, status: value[0] === "all" ? "" : value[0] });
    this.reloadForm();
  }
  async reset() {
    this.draft = readFilters(undefined);
    this.reloadForm();
  }
  override getSearchQueryMetadata(): Metadata {
    return { genres: [...this.draft.genres], status: this.draft.status };
  }
}
