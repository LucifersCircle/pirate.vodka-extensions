import { SORT_OPTIONS } from "../shared/models";

export const SEARCH_STATUS_OPTIONS = SORT_OPTIONS.map((option) => ({
  id: option.id,
  title: option.label,
}));

export const DEFAULT_PAGE_OPTIONS = [
  { id: "most-popular", title: "Most Popular" },
  { id: "latest-update", title: "Latest Update" },
  { id: "new-comic", title: "New Comic" },
];
