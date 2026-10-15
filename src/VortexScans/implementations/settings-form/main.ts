import { Form, Section, ToggleRow } from "@paperback/types";
import { contentSettings, setExcludeNSFW } from "../shared/content";

export class VortexSettingsForm extends Form {
  override getSections() {
    return [
      Section(
        {
          id: "content",
          footer:
            "Exclude source-labelled Mature, Ecchi, Suggestive, Adult, Smut, Hentai, Erotica and Pornographic/Pornography content. Unknown or incomplete labels stay visible with a conservative Mature badge: that badge is not a source adult label or an all-ages guarantee. Demographics and relationship tags do not determine this filter. Applies to Discover, search, saved details, chapters and reading; already downloaded pages cannot be revoked.",
        },
        [
          ToggleRow("excludeNSFW", {
            title: "Exclude NSFW content",
            value: contentSettings().excludeNSFW,
            subtitle: "On by default. Unknown titles remain visible with a Mature badge.",
            onValueChange: Application.Selector(this as VortexSettingsForm, "setExcludeNSFW"),
          }),
        ],
      ),
    ];
  }
  async setExcludeNSFW(value: boolean): Promise<void> {
    setExcludeNSFW(value);
    this.reloadForm();
  }
}
export class SettingsProvider {
  async getSettingsForm() {
    return new VortexSettingsForm();
  }
}
