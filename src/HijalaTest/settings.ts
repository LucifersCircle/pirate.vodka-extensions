import { Form, Section, SelectRow, ToggleRow } from "@paperback/types";
import type { FormSectionElement } from "@paperback/types";
import { TYPES, record, stringList } from "./models";
import type { Genre, Preferences } from "./models";

const KEY = "HijalaTest.preferences.v1";

export function getPreferences(): Preferences {
  const raw = record(Application.getState(KEY));
  const types = stringList(raw.types, TYPES);
  return {
    types: types.length ? types : [...TYPES],
    excludedGenres: stringList(raw.excludedGenres).filter((id) => /^\d+$/.test(id)),
    showLocked: raw.showLocked === true,
  };
}

export class HijalaSettingsForm extends Form {
  constructor(private readonly genres: Genre[]) {
    super();
  }

  override getSections(): FormSectionElement<unknown>[] {
    const settings = getPreferences();
    return [
      Section(
        {
          id: "catalog",
          footer:
            "Types and excluded genres apply to both Discover and Search. Hijala does not publish age ratings; unrated titles use Mature. The site's Novel catalog is currently empty and novel reading is not supported.",
        },
        [
          SelectRow("types", {
            title: "Comic types",
            layout: "list",
            items: TYPES.map((id) => ({ id, title: id })),
            value: settings.types,
            minItemCount: 1,
            maxItemCount: TYPES.length,
            onValueChange: Application.Selector(this as HijalaSettingsForm, "setTypes"),
          }),
          SelectRow("excluded-genres", {
            title: "Excluded genres",
            layout: "list",
            items: this.genres.map((genre) => ({ id: String(genre.id), title: genre.name })),
            value: settings.excludedGenres,
            minItemCount: 0,
            maxItemCount: this.genres.length,
            onValueChange: Application.Selector(this as HijalaSettingsForm, "setExcludedGenres"),
          }),
        ],
      ),
      Section(
        {
          id: "chapters",
          footer:
            "Locked chapters require access on Hijala's website. Paperback handles your library and reader display preferences.",
        },
        [
          ToggleRow("show-locked", {
            title: "Show locked chapters",
            value: settings.showLocked,
            onValueChange: Application.Selector(this as HijalaSettingsForm, "setShowLocked"),
          }),
        ],
      ),
    ];
  }

  private save(value: Preferences): void {
    Application.setState(value, KEY);
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }

  async setTypes(value: string[]): Promise<void> {
    const types = stringList(value, TYPES);
    if (!types.length) throw new Error("Select at least one comic type.");
    this.save({ ...getPreferences(), types });
  }
  async setExcludedGenres(value: string[]): Promise<void> {
    this.save({
      ...getPreferences(),
      excludedGenres: stringList(
        value,
        this.genres.map((g) => String(g.id)),
      ),
    });
  }
  async setShowLocked(value: boolean): Promise<void> {
    this.save({ ...getPreferences(), showLocked: value });
  }
}
