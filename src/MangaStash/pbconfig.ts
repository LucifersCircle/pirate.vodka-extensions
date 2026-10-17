/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";
export default {
  name: "MangaStash",
  version: "0.0.1-alpha.6",
  icon: "icon.png",
  language: "en",
  description:
    "Native MangaStash catalog, search and reader. Unclassified and Suggestive titles use Mature compatibility; optional explicitly-Safe-only exclusion is off by default. Bulk chapter dates are unavailable.",
  contentRating: ContentRating.ADULT,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
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
