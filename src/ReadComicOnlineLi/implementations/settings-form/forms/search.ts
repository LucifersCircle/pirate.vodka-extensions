import { Form, Section, type FormSectionElement } from "@paperback/types";

export class SearchSettingsForm extends Form {
  override getSections(): FormSectionElement[] {
    return [
      Section(
        {
          id: "search-settings-placeholder",
          footer: "Search settings will be added later.",
        },
        [],
      ),
    ];
  }
}
