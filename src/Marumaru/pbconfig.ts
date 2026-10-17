/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";
export default {
  name: "Marumaru",
  version: "0.0.1-alpha.1",
  icon: "icon.png",
  language: "ko",
  description:
    "Experimental Korean manga catalog and reader from rendered public Marumaru pages. Native WebView validation is pending. Unclassified titles use Mature compatibility, not a source age rating. Explicit 19 warnings are preserved. Reload titles after restarting the source to refresh image access.",
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
