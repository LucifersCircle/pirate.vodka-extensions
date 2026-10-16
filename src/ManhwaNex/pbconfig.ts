/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "ManhwaNex",
  description:
    "Native ManhwaNex catalog, search and reader. NSFW exclusion is on by default; unclassified titles are hidden.",
  version: "0.0.1-alpha.6",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.ADULT,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [],
  developers: [
    {
      name: "Lucifers Circle",
      website: "https://pirate.vodka",
      github: "https://github.com/LucifersCircle",
    },
  ],
} satisfies ExtensionInfo;
