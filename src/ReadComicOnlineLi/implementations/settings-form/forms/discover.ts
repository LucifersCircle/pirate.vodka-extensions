import {
  Form,
  Section,
  ToggleRow,
  type FormItemElement,
  type FormSectionElement,
  type ToggleRowProps,
} from "@paperback/types";
import { getHiddenDiscoverSections, setHiddenDiscoverSections } from "./main";

export class DiscoverSettingsForm extends Form {
  override getSections(): FormSectionElement[] {
    return [
      Section(
        {
          id: "general-discover-sections",
          footer: "Toggle discover sections on or off.",
        },
        [
          this.latestUpdateRow(),
          this.newComicRow(),
          this.topDayRow(),
          this.topWeekRow(),
          this.topMonthRow(),
          this.mostPopularRow(),
        ],
      ),
      Section(
        {
          id: "marvel-discover-sections",
          footer: "Toggle Marvel Comics subsections on or off.",
        },
        [
          this.marvelAlphabeticalRow(),
          this.marvelLatestRow(),
          this.marvelPopularRow(),
          this.marvelNewRow(),
        ],
      ),
      Section(
        {
          id: "dc-discover-sections",
          footer: "Toggle DC Comics subsections on or off.",
        },
        [this.dcAlphabeticalRow(), this.dcLatestRow(), this.dcPopularRow(), this.dcNewRow()],
      ),
    ];
  }

  private isVisible(sectionId: string): boolean {
    return !getHiddenDiscoverSections().includes(sectionId);
  }

  private updateHiddenSections(sectionId: string, visible: boolean): void {
    let hiddenSections = getHiddenDiscoverSections();

    if (visible) {
      hiddenSections = hiddenSections.filter((id) => id !== sectionId);
    } else if (!hiddenSections.includes(sectionId)) {
      hiddenSections = [...hiddenSections, sectionId];
    }

    setHiddenDiscoverSections(hiddenSections);
    this.reloadForm();
  }

  latestUpdateRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "Latest Update",
      value: this.isVisible("latest-update"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleLatestUpdate"),
    };

    return ToggleRow("toggle-latest-update", props);
  }

  newComicRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "New Comic",
      value: this.isVisible("new-comic"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleNewComic"),
    };

    return ToggleRow("toggle-new-comic", props);
  }

  topDayRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "Top Day",
      value: this.isVisible("top-day"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleTopDay"),
    };

    return ToggleRow("toggle-top-day", props);
  }

  topWeekRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "Top Week",
      value: this.isVisible("top-week"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleTopWeek"),
    };

    return ToggleRow("toggle-top-week", props);
  }

  topMonthRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "Top Month",
      value: this.isVisible("top-month"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleTopMonth"),
    };

    return ToggleRow("toggle-top-month", props);
  }

  mostPopularRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "Most Popular",
      value: this.isVisible("most-popular"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleMostPopular"),
    };

    return ToggleRow("toggle-most-popular", props);
  }

  marvelAlphabeticalRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "Marvel Comics: Alphabetical",
      value: this.isVisible("marvel-comics-alphabetical"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleMarvelAlphabetical"),
    };

    return ToggleRow("toggle-marvel-comics-alphabetical", props);
  }

  marvelLatestRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "Marvel Comics: Latest",
      value: this.isVisible("marvel-comics-latest"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleMarvelLatest"),
    };

    return ToggleRow("toggle-marvel-comics-latest", props);
  }

  marvelPopularRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "Marvel Comics: Popular",
      value: this.isVisible("marvel-comics-popular"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleMarvelPopular"),
    };

    return ToggleRow("toggle-marvel-comics-popular", props);
  }

  marvelNewRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "Marvel Comics: New",
      value: this.isVisible("marvel-comics-new"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleMarvelNew"),
    };

    return ToggleRow("toggle-marvel-comics-new", props);
  }

  dcAlphabeticalRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "DC Comics: Alphabetical",
      value: this.isVisible("dc-comics-alphabetical"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleDcAlphabetical"),
    };

    return ToggleRow("toggle-dc-comics-alphabetical", props);
  }

  dcLatestRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "DC Comics: Latest",
      value: this.isVisible("dc-comics-latest"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleDcLatest"),
    };

    return ToggleRow("toggle-dc-comics-latest", props);
  }

  dcPopularRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "DC Comics: Popular",
      value: this.isVisible("dc-comics-popular"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleDcPopular"),
    };

    return ToggleRow("toggle-dc-comics-popular", props);
  }

  dcNewRow(): FormItemElement<unknown> {
    const props: ToggleRowProps = {
      title: "DC Comics: New",
      value: this.isVisible("dc-comics-new"),
      onValueChange: Application.Selector(this as DiscoverSettingsForm, "handleDcNew"),
    };

    return ToggleRow("toggle-dc-comics-new", props);
  }

  async handleLatestUpdate(value: boolean): Promise<void> {
    this.updateHiddenSections("latest-update", value);
  }

  async handleNewComic(value: boolean): Promise<void> {
    this.updateHiddenSections("new-comic", value);
  }

  async handleTopDay(value: boolean): Promise<void> {
    this.updateHiddenSections("top-day", value);
  }

  async handleTopWeek(value: boolean): Promise<void> {
    this.updateHiddenSections("top-week", value);
  }

  async handleTopMonth(value: boolean): Promise<void> {
    this.updateHiddenSections("top-month", value);
  }

  async handleMostPopular(value: boolean): Promise<void> {
    this.updateHiddenSections("most-popular", value);
  }

  async handleMarvelAlphabetical(value: boolean): Promise<void> {
    this.updateHiddenSections("marvel-comics-alphabetical", value);
  }

  async handleMarvelLatest(value: boolean): Promise<void> {
    this.updateHiddenSections("marvel-comics-latest", value);
  }

  async handleMarvelPopular(value: boolean): Promise<void> {
    this.updateHiddenSections("marvel-comics-popular", value);
  }

  async handleMarvelNew(value: boolean): Promise<void> {
    this.updateHiddenSections("marvel-comics-new", value);
  }

  async handleDcAlphabetical(value: boolean): Promise<void> {
    this.updateHiddenSections("dc-comics-alphabetical", value);
  }

  async handleDcLatest(value: boolean): Promise<void> {
    this.updateHiddenSections("dc-comics-latest", value);
  }

  async handleDcPopular(value: boolean): Promise<void> {
    this.updateHiddenSections("dc-comics-popular", value);
  }

  async handleDcNew(value: boolean): Promise<void> {
    this.updateHiddenSections("dc-comics-new", value);
  }
}
