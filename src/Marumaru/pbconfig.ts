/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";
export default {
  name: "Marumaru",
  version: "0.0.1-alpha.4",
  icon: "icon.png",
  language: "ko",
  description:
    "Korean manga catalog and reader through the site-advertised public API. Unclassified titles use Mature compatibility, not a source age rating. Explicit adult warnings and original chapter labels are preserved.",
  contentRating: ContentRating.ADULT,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
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
