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
import { readFilters } from "./urls";
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
            items: this.taxonomy.map((label) => ({ id: label, title: label })),
            value: [...this.draft.genres],
            minItemCount: 0,
            maxItemCount: this.taxonomy.length,
            onValueChange: Application.Selector(this as NoveliSearchForm, "setGenres"),
          }),
          SelectRow("status", {
            title: "Status",
            layout: "list",
            items: [
              { id: "", title: "All statuses" },
              { id: "Ongoing", title: "Ongoing" },
              { id: "Completed", title: "Completed" },
            ],
            value: [this.draft.status],
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
    const candidate = readFilters({ ...this.draft, genres: value });
    if (candidate.genres.some((label) => !this.taxonomy.includes(label)))
      throw new Error("Unknown Noveli genre or tag.");
    this.draft = candidate;
    this.reloadForm();
  }
  async setStatus(value: string[]) {
    if (!Array.isArray(value) || value.length !== 1)
      throw new Error("Invalid Noveli status selection.");
    this.draft = readFilters({ ...this.draft, status: value[0] });
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
