/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";
export default {
  name: "Noveli",
  version: "0.0.1-alpha.2",
  icon: "icon.png",
  language: "en",
  description:
    "English web novels from Noveli, with search, curated lists and a text reader. Unclassified titles use Mature compatibility; source Adult warnings and Paperback’s filters are respected. Chapter publication dates are unavailable. Cover access may require reloading a title after restarting the source.",
  contentRating: ContentRating.ADULT,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
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
