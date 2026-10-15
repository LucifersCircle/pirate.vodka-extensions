/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

// The site's Alternative field has no language labels. These English aliases were
// audited against each canonical MangaSushi ID on 2026-10-15. Never infer a
// language from ASCII/romanization, translate titles, or split aliases on commas.
// https://mangasushi.org/manga/{canonical ID}/ is the source for each entry.
const ENGLISH_TITLES: Readonly<Record<string, string>> = {
  "academy-saikyou-no-mob-healer-shinigee-sekai-no-mob-ni-tensei-shita-ore-wa-hazure-job-healer-to-gensaku-chishiki-de-musou-suru":
    "The Academy's Strongest Mob Healer: Reincarnated as a Mob in a Deadly Game World, I Dominate with the Useless Job [Healer] and My Original Knowledge",
  "hisabisa-ni-kenko-shindan-wo-uketara-saikyo-status-ni-natteita-tsuiho-sareta-ossan-boken-sha-imasara-eiyu-wo-mezasu":
    "Journey of an Exiled Middle-Aged Adventurer Becoming a Hero",
  "shoukan-sareta-kenja-wa-isekai-wo-yuku": "A Sage Is Summoned to Another World",
  "logout-shita-no-wa-vrmmo-janaku-honmono-no-isekai-deshita-genjitsu-ni-modotte-mo-status-ga-kowareteiru-ken":
    "The Real Other World I Logged Out From There, Not A Vrmmo",
  "dame-skill-auto-mode-ga-kakuseishimashita-are-guild-no-scout-san-ore-wo-iranai-tte-itte-masendeshita":
    "The Useless Skill [Auto Mode] Has Been Awakened ~Huh, Guild's Scout, Didn't You Say I Wasn't Needed Anymore?~",
  "tensei-akuma-no-saikyou-yuusha-ikusei-keikaku":
    "Reincarnated Devil’s Plan for Raising the Strongest Hero",
  "goinkyo-maou-sama-no-kaerizaki": "The Return of the Retired Demon Lord",
  "level-1-kara-hajimaru-shoukan-musou": "Summon Warriors : Hack n’ Slash Starting from Level 1",
  "isekai-kokka-alchimaira-saijaku-no-ou-to-musou-no-gunzei":
    "Another World Nation Archimaira: The Weakest King and his Unparalleled Army",
  "ikitsuku-saki-wa-yuusha-ka-maou-ka": "Is the destination a hero or a demon king?",
  "sss-rank-dungeon-de-knife-ippon-tewatasare-tsuihou-sareta-shiro-madoushi-yggdrasil-no-noroi-ni-yori-jakuten-de-aru-maryoku-fusoku-wo-kokufuku-shi-sekai-saikyou-e-to-itaru":
    "A white mage who was exiled after being handed a knife in an SSS rank dungeon. Due to the curse of Yggdrasil, he overcame his weak point, lack of magical power, and became the strongest in the world",
  "realist-maou-niyoru-seiiki-naki-isekai-kaikaku":
    "The Legendary Rebuilding of a World by a Realist Demon King",
  "isekai-mahou-wa-okureteru": "The Magic in this Other World is Too Far Behind!",
  "botsuraku-yotei-nanode-kajishokunin-wo-mezasu":
    "Expecting to Fall into Ruin, I Aim to Become a Blacksmith",
  "konjiki-no-word-master-yuusha-yonin-ni-makikomareta-unique-cheat":
    "The Golden Word Master - The Four Heroes and the Innocent Bystander with the Unique Cheat",
  "isekai-de-te-ni-ireta-seisan-skill-wa-saikyou-datta-you-desu":
    "It Seems the Production Skill Acquired in Another World is the Strongest",
  "nido-tensei-shita-shounen-wa-s-rank-boukensha-toshite-heion-ni-sugosu-zense-ga-kenja-de-eiyuu-datta-boku-wa-raisede-wa-jimini-ikiru":
    "A Boy Who Has Been Reincarnated Twice Spends Peacefully as an S-Rank Adventurer",
  "saikyou-yuusha-wa-oharai-hako-maou-ni-nattara-zutto-ore-no-musou-return":
    "From Mightiest Hero to Demon King",
  "shijou-saikyou-no-mahou-kenshi-f-rank-boukensha-ni-tensei-suru":
    "The Strongest Magical Swordsman Ever Reborn as an F-Rank Adventurer",
  "ore-no-ie-ga-maryoku-spot-datta-ken-sundeiru-dake-de-sekai-saikyou":
    "My House is a Magic Power Spot - Just by Living there I Become the Strongest in the World",
  "kanzen-kaihi-healer-no-kiseki": "The Path of the Perfect Evasion Healer",
  "ore-no-genjitsu-wa-renai-game-ka-to-omottara-inochigake-no-game-datta":
    "Is My Reality a Love Game?? ~I Thought it Was a Life Like Game~",
  "kouryakuhon-o-kushi-suru-saikyou-no-mahoutsukai-meirei-sa-sero-to-wa-iwa-senai-oreryuu-mao-tobatsu-saizen-ruuto":
    'The Strongest Sorcerer Who Makes Full Use of the "Strategy Guide"',
  "yondome-wa-iya-na-shizokusei-majutsushi": "Death Attribute Magician",
  "yakudatazu-skill-ni-jinsei-o-sosogikomi-25-nen-imasara-saikyou-no-boukentan-midori-kashi-no-akira":
    "Adventurer Tale of Pouring 25 Years of Life Into a Useless Skill, and Now After All That Time Is the Strongest",
  "game-of-familia-kazoku-senki": "Game of Familia –Family War Chronicles–",
  "kyoukai-meikyuu-to-ikai-no-majutsushi": "Boundary Labyrinth and Magician of Alien World",
};

export function englishTitle(
  id: string,
  original: string,
  alternatives: readonly string[],
): string {
  const candidate = ENGLISH_TITLES[id];
  if (typeof candidate !== "string") return original;
  // Require the exact complete alias in current source metadata. Commas inside
  // an English title are meaningful; inspect only its outer list boundaries.
  for (const value of alternatives) {
    let offset = value.indexOf(candidate);
    while (offset !== -1) {
      const before = value.slice(0, offset).trim();
      const after = value.slice(offset + candidate.length).trim();
      if ((!before || before.endsWith(",")) && (!after || after.startsWith(","))) return candidate;
      offset = value.indexOf(candidate, offset + 1);
    }
  }
  return original;
}

// Exact full-title exceptions verified against live native search. WordPress
// misses the Academy's long sentence and normalizes the Devil alias differently.
// Leave partial queries, filters, and classification's original titles untouched.
export function searchTitle(query: string): string {
  const exceptions: Readonly<Record<string, string>> = {
    "The Academy's Strongest Mob Healer: Reincarnated as a Mob in a Deadly Game World, I Dominate with the Useless Job [Healer] and My Original Knowledge":
      "Academy Saikyou no Mob Healer Shinigee",
    "Academy Saikyou no Mob Healer ~Shinigee Sekai no Mob ni Tensei Shita Ore wa, Hazure Job “Healer” to Gensaku Chishiki de Musou Suru~":
      "Academy Saikyou no Mob Healer Shinigee",
    "Reincarnated Devil’s Plan for Raising the Strongest Hero":
      "Tensei Akuma no Saikyou Yuusha Ikusei Keikaku",
  };
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .toLowerCase();
  const key = normalize(query);
  return Object.entries(exceptions).find(([title]) => normalize(title) === key)?.[1] ?? query;
}
