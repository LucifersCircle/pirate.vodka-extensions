import { ContentRating, SourceIntents } from "@paperback/types";
import type { ExtensionInfo } from "@paperback/types";

export default {
  name: "Hijala Test",
  description: "Manga, manhwa, and manhua from en-hijala.com. Public chapters only.",
  version: "0.0.1-alpha.2",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.MATURE,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [],
  developers: [{ name: "Lucifers Circle" }],
} satisfies ExtensionInfo;
