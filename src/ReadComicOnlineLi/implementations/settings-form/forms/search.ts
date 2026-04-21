import {
  Form,
  Section,
  SelectRow,
  type FormItemElement,
  type FormSectionElement,
  type SelectRowProps,
} from "@paperback/types";
import {
  getDefaultSearchPage,
  getDefaultSearchSort,
  setDefaultSearchPage,
  setDefaultSearchSort,
} from "./main";
import { DEFAULT_PAGE_OPTIONS, SEARCH_STATUS_OPTIONS } from "../models";

export class SearchSettingsForm extends Form {
  override getSections(): FormSectionElement<unknown>[] {
    const sections: FormSectionElement<unknown>[] = [
      Section(
        {
          id: "default-sort",
          footer: "Status option applied by default in search.",
        },
        [this.defaultSortRow()],
      ),
    ];

    if (getDefaultSearchSort() === "") {
      sections.push(
        Section(
          {
            id: "default-search-page",
            footer: "Page used when search is opened without a query or filters.",
          },
          [this.defaultSearchPageRow()],
        ),
      );
    }

    return sections;
  }

  defaultSortRow(): FormItemElement<unknown> {
    const props: SelectRowProps = {
      title: "Default Sort",
      options: SEARCH_STATUS_OPTIONS,
      value: [getDefaultSearchSort()],
      minItemCount: 1,
      maxItemCount: 1,
      onValueChange: Application.Selector(this as SearchSettingsForm, "handleDefaultSortChange"),
    };

    return SelectRow("default-search-sort", props);
  }

  defaultSearchPageRow(): FormItemElement<unknown> {
    const props: SelectRowProps = {
      title: "Default Page",
      options: DEFAULT_PAGE_OPTIONS,
      value: [getDefaultSearchPage()],
      minItemCount: 1,
      maxItemCount: 1,
      onValueChange: Application.Selector(
        this as SearchSettingsForm,
        "handleDefaultSearchPageChange",
      ),
    };

    return SelectRow("default-search-page", props);
  }

  async handleDefaultSortChange(value: string[]): Promise<void> {
    setDefaultSearchSort(value[0] ?? "");
    this.reloadForm();
  }

  async handleDefaultSearchPageChange(value: string[]): Promise<void> {
    setDefaultSearchPage(value[0] ?? "most-popular");
    this.reloadForm();
  }
}
