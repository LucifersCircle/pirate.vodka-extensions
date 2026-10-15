## Available Extensions

- Hijala
- VortexScans
- Kagane
- Mangasushi
- ManhwaNex

## Hijala

Version `0.0.1-alpha.4` follows the current Hijala website: Featured, Latest
Releases, New, Most Popular and Latest Updates. Latest/New use verified source
pagination; Popular uses the rendered first nine titles and chapter updates use
actual source chapter identities. Stale Hot and homepage Genres rows are removed;
all live genres remain available in advanced search and source settings.

Latest and New are separate native rows for the site's tabs.

Default-on persistent NSFW exclusion uses verified source genre labels, not an
invented four-category rating or demographic guesses. Unknown classification is
hidden by default, and explicit genre exclusions remain fail-closed after opt-out.
Existing content types and paid-chapter hiding intersect those preferences across
browsing, details, chapters and readers; protected chapters remain on the website.
Bounded caches reused across callbacks avoid per-title metadata requests.

Native checks preserve the exact supplied `SourceManga` reference, all source
chapters and genuine decimal numbers, semantic titles, paid boundaries and real
first/middle/last reader image bytes. Covers retain their source-provided URLs.

## Extension health

All extensions are checked every 30 minutes at minutes 17 and 47 (UTC), and on
relevant source or configuration pushes to `0.9/stable`. Click a run link for full
logs and downloadable results.

<!-- LIVE_TEST_STATUS:START -->

Last checked: **2026-10-15 19:28:45 UTC** · [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38793802356)
Live scope: all; 5/5 sources selected; 5 complete reports. Non-PR events run the full live suite
Selected tests: 145/149 passed; 4 failed.
Started: 2026-10-15 19:25:43 UTC
Tested commit: `a37f99d`

| Extension   | Result  | Passed | Failed | Duration |
| ----------- | ------- | -----: | -----: | -------: |
| Hijala      | ✅ Pass |  37/37 |      0 |  116.90s |
| Kagane      | ✅ Pass |  15/15 |      0 |   30.35s |
| MangaSushi  | ✅ Pass |  45/45 |      0 |  140.48s |
| ManhwaNex   | ✅ Pass |  31/31 |      0 |  140.64s |
| VortexScans | ❌ Fail |  17/21 |      4 |   41.07s |

<details>
<summary>Test output</summary>

| Extension   | Test                                                                                                     | Result  | Duration | Failure                 |
| ----------- | -------------------------------------------------------------------------------------------------------- | ------- | -------: | ----------------------- |
| Hijala      | defaults: fresh persistent state                                                                         | ✅ Pass |    0.10s | —                       |
| Hijala      | initialisation                                                                                           | ✅ Pass |    0.00s | —                       |
| Hijala      | getDiscoverSections                                                                                      | ✅ Pass |    2.56s | —                       |
| Hijala      | getSortingOptions                                                                                        | ✅ Pass |    0.00s | —                       |
| Hijala      | getSearchResults                                                                                         | ✅ Pass |    2.46s | —                       |
| Hijala      | getMangaDetails                                                                                          | ✅ Pass |    1.09s | —                       |
| Hijala      | getChapters                                                                                              | ✅ Pass |    0.68s | —                       |
| Hijala      | getChapterDetails                                                                                        | ✅ Pass |    0.81s | —                       |
| Hijala      | settings: honest default-on genre exclusion and complete native taxonomy                                 | ✅ Pass |    1.08s | —                       |
| Hijala      | discover: actual current five sections and rendered Popular limit                                        | ✅ Pass |    3.43s | —                       |
| Hijala      | discover: cold and warm native callbacks share bounded bulk requests without N+1                         | ✅ Pass |    8.97s | —                       |
| Hijala      | discover: homepage order, covers and bounded snapshots match public source data                          | ✅ Pass |    0.34s | —                       |
| Hijala      | discover: every real per-chapter update retains identity and paid boundary                               | ✅ Pass |    2.44s | —                       |
| Hijala      | discover: New actual request, next page and repeated native requests                                     | ✅ Pass |    4.37s | —                       |
| Hijala      | discover: Latest uses verified pinned feed and actual page 2                                             | ✅ Pass |    3.40s | —                       |
| Hijala      | pagination: complete live New and catalog have globally unique accumulated IDs                           | ✅ Pass |   15.56s | —                       |
| Hijala      | pagination: partial overlap and duplicate-only physical pages lose no live-derived IDs                   | ✅ Pass |   14.77s | —                       |
| Hijala      | pagination: query filter sort section and settings changes reset old cursors                             | ✅ Pass |    9.70s | —                       |
| Hijala      | pagination: malformed bounded cursor metadata harmlessly resets to page one                              | ✅ Pass |    1.84s | —                       |
| Hijala      | pagination: changing totals missing records and duplicate loops require refresh                          | ✅ Pass |   10.07s | —                       |
| Hijala      | discover: stale hidden sections and disabled site tabs stay bounded empty                                | ✅ Pass |    1.86s | —                       |
| Hijala      | pagination: complete first responses are terminal while partial oversized responses fail                 | ✅ Pass |    4.50s | —                       |
| Hijala      | search: every site sort, native advanced filters and true empty result                                   | ✅ Pass |    5.71s | —                       |
| Hijala      | chapters: complete actual SourceManga reference and paid preference                                      | ✅ Pass |    3.22s | —                       |
| Hijala      | reader: actual native Chapter and real first middle last public image bytes                              | ✅ Pass |    1.65s | —                       |
| Hijala      | chapters: real large full list, decimal numbers and source titles                                        | ✅ Pass |    3.39s | —                       |
| Hijala      | safety: actual Mature tag and persisted opt-out do not bypass other filters                              | ✅ Pass |    3.66s | —                       |
| Hijala      | safety: missing live metadata fails closed by default but opt-out is explicit                            | ✅ Pass |    1.76s | —                       |
| Hijala      | native: string and incomplete chapter inputs fail before any network request                             | ✅ Pass |    0.00s | —                       |
| Hijala      | safety: pending cached discovery cannot survive a settings change                                        | ✅ Pass |    1.22s | —                       |
| Hijala      | reader: live-derived malformed page order and duplicate URLs fail closed                                 | ✅ Pass |    1.69s | —                       |
| Hijala      | safety: parser never evaluates current site scripts or weakens access checks                             | ✅ Pass |    0.91s | —                       |
| Hijala      | getDiscoverSectionItems: featured                                                                        | ✅ Pass |    0.67s | —                       |
| Hijala      | getDiscoverSectionItems: latest                                                                          | ✅ Pass |    0.95s | —                       |
| Hijala      | getDiscoverSectionItems: new                                                                             | ✅ Pass |    0.73s | —                       |
| Hijala      | getDiscoverSectionItems: popular                                                                         | ✅ Pass |    0.96s | —                       |
| Hijala      | getDiscoverSectionItems: updates                                                                         | ✅ Pass |    0.33s | —                       |
| Kagane      | initialisation                                                                                           | ✅ Pass |    0.09s | —                       |
| Kagane      | getDiscoverSections                                                                                      | ✅ Pass |    0.01s | —                       |
| Kagane      | getSortingOptions                                                                                        | ✅ Pass |    0.00s | —                       |
| Kagane      | getSearchResults                                                                                         | ✅ Pass |   19.11s | —                       |
| Kagane      | getMangaDetails                                                                                          | ✅ Pass |    2.40s | —                       |
| Kagane      | getChapters                                                                                              | ✅ Pass |    1.13s | —                       |
| Kagane      | getChapterDetails                                                                                        | ✅ Pass |    0.79s | —                       |
| Kagane      | Reader: original native chapter and complete first/last source-issued image bytes                        | ✅ Pass |    1.93s | —                       |
| Kagane      | Unknown malformed and stale tags fail before search; valid native payloads remain exact                  | ✅ Pass |    1.59s | —                       |
| Kagane      | Current live series translation and unknown language preserve native chapter identity                    | ✅ Pass |    0.06s | —                       |
| Kagane      | getDiscoverSectionItems: popular                                                                         | ✅ Pass |    2.16s | —                       |
| Kagane      | getDiscoverSectionItems: trending                                                                        | ✅ Pass |    0.00s | —                       |
| Kagane      | getDiscoverSectionItems: latest                                                                          | ✅ Pass |    0.58s | —                       |
| Kagane      | getDiscoverSectionItems: recently-added                                                                  | ✅ Pass |    0.51s | —                       |
| Kagane      | getDiscoverSectionItems: genres                                                                          | ✅ Pass |    0.00s | —                       |
| MangaSushi  | initialisation                                                                                           | ✅ Pass |    0.06s | —                       |
| MangaSushi  | getDiscoverSections: native section order                                                                | ✅ Pass |    0.01s | —                       |
| MangaSushi  | getSortingOptions: all seven site sorts                                                                  | ✅ Pass |    1.96s | —                       |
| MangaSushi  | getSearchResults: native adult filter plus genre safety                                                  | ✅ Pass |    2.65s | —                       |
| MangaSushi  | getSearchResults: displayed smart punctuation resolves by exact ID                                       | ✅ Pass |    0.54s | —                       |
| MangaSushi  | getMangaDetails: full canonical metadata                                                                 | ✅ Pass |    0.00s | —                       |
| MangaSushi  | getMangaDetails: unknown classification is blocked by default                                            | ✅ Pass |    1.92s | —                       |
| MangaSushi  | getChapters and reader: accessible with default exclusion                                                | ✅ Pass |    3.90s | —                       |
| MangaSushi  | getChapters and reader: cold-cache persisted records across three safe titles                            | ✅ Pass |   18.22s | —                       |
| MangaSushi  | getChapters and reader: Lonely Attack canonical underscore chapter IDs                                   | ✅ Pass |   16.23s | —                       |
| MangaSushi  | English titles: exact source aliases keep original titles, full alternatives and IDs                     | ✅ Pass |   14.24s | —                       |
| MangaSushi  | English titles: Japanese-only alternatives retain the source title                                       | ✅ Pass |    1.46s | —                       |
| MangaSushi  | English titles: cold classification still queries the original source title                              | ✅ Pass |    0.98s | —                       |
| MangaSushi  | English titles: removing an alias from live metadata restores original display                           | ✅ Pass |    0.81s | —                       |
| MangaSushi  | getSearchResults: every native sort executes                                                             | ✅ Pass |    5.05s | —                       |
| MangaSushi  | getSearchResults: native continuation                                                                    | ✅ Pass |    1.12s | —                       |
| MangaSushi  | getSearchResults: genuine empty query terminates                                                         | ✅ Pass |    0.59s | —                       |
| MangaSushi  | advanced search: actual taxonomy and native options                                                      | ✅ Pass |    1.38s | —                       |
| MangaSushi  | genres: exact native menu chips, safe defaults and lazy private routing                                  | ✅ Pass |    1.13s | —                       |
| MangaSushi  | genres: exact archive canonical order, bounded enrichment and native continuation                        | ✅ Pass |    4.44s | —                       |
| MangaSushi  | genres: finite Horror archive retains metadata and terminates with two cold requests                     | ✅ Pass |    1.18s | —                       |
| MangaSushi  | genres: malformed cumulative history is rejected before source requests                                  | ✅ Pass |    1.67s | —                       |
| MangaSushi  | genres: duplicate-only and excluded-only pages advance, while stalled archives stop visibly              | ✅ Pass |   14.23s | —                       |
| MangaSushi  | genres: out-of-page metadata fails closed without per-title fallback                                     | ✅ Pass |    3.73s | —                       |
| MangaSushi  | genres: raw root and descendant warnings survive held metadata enrichment                                | ✅ Pass |    3.86s | —                       |
| MangaSushi  | genres: Cooking archive is genuinely empty without metadata or catalog scans                             | ✅ Pass |    0.60s | —                       |
| MangaSushi  | advanced genres: ignored Cooking filter fails visibly in one native request                              | ✅ Pass |    2.38s | —                       |
| MangaSushi  | advanced genres: fresh malformed taxonomy and wrong-card evidence fail without scans                     | ✅ Pass |    5.63s | —                       |
| MangaSushi  | advanced genres: rejected filters cannot discard fresh warnings or revive warm-safe titles               | ✅ Pass |    5.82s | —                       |
| MangaSushi  | advanced genres: changed or contradictory empty responses fail without scanning                          | ✅ Pass |    1.72s | —                       |
| MangaSushi  | advanced genres: native multiple-genre OR, AND and genuine empty remain distinct                         | ✅ Pass |    2.36s | —                       |
| MangaSushi  | getDiscoverSectionItems: cold-cache default exactly mirrors eligible site rows                           | ✅ Pass |    5.42s | —                       |
| MangaSushi  | settings: pending native discovery batch is invalidated                                                  | ✅ Pass |    0.93s | —                       |
| MangaSushi  | settings: explicit opt-out and finite Popular fidelity                                                   | ✅ Pass |    1.82s | —                       |
| MangaSushi  | getDiscoverSectionItems: What's New native load more                                                     | ✅ Pass |    1.83s | —                       |
| MangaSushi  | catalog: editorial posts are not manga even with exclusions off                                          | ✅ Pass |    0.95s | —                       |
| MangaSushi  | getMangaDetails: original title and alternatives                                                         | ✅ Pass |    0.22s | —                       |
| MangaSushi  | getChapters: asynchronous full list and decimal labels                                                   | ✅ Pass |    1.84s | —                       |
| MangaSushi  | getChapterDetails: exact ordered lazy pages                                                              | ✅ Pass |    0.82s | —                       |
| MangaSushi  | reader: duplicate pages and page-order gaps fail closed                                                  | ✅ Pass |    0.21s | —                       |
| MangaSushi  | getChapterDetails: second chapter pages                                                                  | ✅ Pass |    0.47s | —                       |
| MangaSushi  | settings: stale library and cached metadata cannot bypass exclusion                                      | ✅ Pass |    4.07s | —                       |
| MangaSushi  | settings: pending permissive response cannot survive exclusion switch                                    | ✅ Pass |    1.47s | —                       |
| MangaSushi  | getSearchResults: all-filtered native pages reach real end                                               | ✅ Pass |    0.56s | —                       |
| MangaSushi  | catalog: malformed response fails closed                                                                 | ✅ Pass |    0.00s | —                       |
| ManhwaNex   | initialisation and persistent safe defaults                                                              | ✅ Pass |    0.04s | —                       |
| ManhwaNex   | discovery: exact native section names and order                                                          | ✅ Pass |    1.54s | —                       |
| ManhwaNex   | discovery: two cold requests and zero warm without per-card lookups                                      | ✅ Pass |    2.14s | —                       |
| ManhwaNex   | discovery: native page-two order and fixed Popular carousel                                              | ✅ Pass |    1.94s | —                       |
| ManhwaNex   | categories: exact linked native archives, bounded lazy requests, distinct titles and terminal pagination | ✅ Pass |   53.62s | —                       |
| ManhwaNex   | categories: observed adult conflicts revoke direct and in-flight access without losing metadata          | ✅ Pass |   33.16s | —                       |
| ManhwaNex   | categories: malformed home anchors and foreign or non-advancing archive routes fail closed               | ✅ Pass |    1.15s | —                       |
| ManhwaNex   | pagination: canonical-ID overlaps are removed, duplicate-only advancing pages retain later titles        | ✅ Pass |    2.73s | —                       |
| ManhwaNex   | pagination: continuation is scoped to category, query, settings and refresh                              | ✅ Pass |    3.73s | —                       |
| ManhwaNex   | search: only the actually advertised Relevance sort                                                      | ✅ Pass |    0.49s | —                       |
| ManhwaNex   | search: exact native order, pagination and no-result termination                                         | ✅ Pass |    3.10s | —                       |
| ManhwaNex   | search: source title and punctuation are forwarded unchanged                                             | ✅ Pass |    0.84s | —                       |
| ManhwaNex   | advanced search: all actual genre and status choices                                                     | ✅ Pass |    0.10s | —                       |
| ManhwaNex   | advanced search: every native genre, condition and status is exercised                                   | ✅ Pass |    8.73s | —                       |
| ManhwaNex   | advanced search: author, artist, release and adult semantics                                             | ✅ Pass |    5.78s | —                       |
| ManhwaNex   | search: numeric-author redirect fails visibly and long titles retain native semantics                    | ✅ Pass |    1.39s | —                       |
| ManhwaNex   | classification: unknown and conflicting source labels fail closed                                        | ✅ Pass |    0.63s | —                       |
| ManhwaNex   | details: canonical identity, whole aliases and full metadata                                             | ✅ Pass |    0.30s | —                       |
| ManhwaNex   | details: reported title normalizes the native five-point rating                                          | ✅ Pass |    0.92s | —                       |
| ManhwaNex   | details: fresh live rating boundaries omit unrated and malformed scores                                  | ✅ Pass |    1.35s | —                       |
| ManhwaNex   | chapters: complete public AJAX list, exact persisted reference and volume zero                           | ✅ Pass |    1.62s | —                       |
| ManhwaNex   | reader: persisted newest, oldest and decimal chapters with actual endpoint image bytes                   | ✅ Pass |    1.95s | —                       |
| ManhwaNex   | reader: explicit opt-out retains exact native chapter pages and actual image bytes                       | ✅ Pass |    2.20s | —                       |
| ManhwaNex   | reader: cold persisted inputs for two other native titles                                                | ✅ Pass |    2.49s | —                       |
| ManhwaNex   | reader guards: malformed IDs, foreign assets and exact chapter identity                                  | ✅ Pass |    0.18s | —                       |
| ManhwaNex   | chapter subtitles: only redundant complete matching prefixes disappear                                   | ✅ Pass |    0.00s | —                       |
| ManhwaNex   | chapters: real volume survives independently of leading chapter-title cleanup                            | ✅ Pass |    0.21s | —                       |
| ManhwaNex   | classification: unknown live-response metadata blocks all native entry points                            | ✅ Pass |    4.48s | —                       |
| ManhwaNex   | settings: opt-out is persistent, reset and issued-image invalidation                                     | ✅ Pass |    1.36s | —                       |
| ManhwaNex   | reader authorization: persisted restart, settings change, unknown and evicted URLs                       | ✅ Pass |    1.33s | —                       |
| ManhwaNex   | settings race: stale in-flight discovery cannot repopulate cache                                         | ✅ Pass |    1.13s | —                       |
| VortexScans | initialisation                                                                                           | ✅ Pass |    0.00s | —                       |
| VortexScans | getDiscoverSections                                                                                      | ✅ Pass |    0.01s | —                       |
| VortexScans | getSortingOptions                                                                                        | ✅ Pass |    0.00s | —                       |
| VortexScans | getSearchResults                                                                                         | ✅ Pass |    5.82s | —                       |
| VortexScans | getMangaDetails                                                                                          | ✅ Pass |   10.58s | —                       |
| VortexScans | getChapters                                                                                              | ✅ Pass |    0.33s | —                       |
| VortexScans | getChapterDetails                                                                                        | ✅ Pass |    0.43s | —                       |
| VortexScans | home: one cold response, no warm requests or per-title enrichment                                        | ✅ Pass |    0.91s | —                       |
| VortexScans | home: exact current 6/20/36/9 rows, original covers and terminal editorial rows                          | ✅ Pass |    1.03s | —                       |
| VortexScans | latest: two genuine 36-post continuations preserve order and unique IDs                                  | ✅ Pass |    3.17s | —                       |
| VortexScans | original reader: native source references, complete pages and first/last image bytes                     | ❌ Fail |    6.89s | TypeError: fetch failed |
| VortexScans | regression584: saved apostrophe ID details, original chapters/reader and complete image bytes            | ❌ Fail |    9.17s | TypeError: fetch failed |
| VortexScans | content: persisted default-on exclusion keeps unknown Mature and excludes actual warning names           | ✅ Pass |    0.00s | —                       |
| VortexScans | content: a native request pending across a setting change cannot release stale results                   | ✅ Pass |    0.00s | —                       |
| VortexScans | getDiscoverSectionItems: featured                                                                        | ✅ Pass |    0.25s | —                       |
| VortexScans | getDiscoverSectionItems: popular-today                                                                   | ✅ Pass |    0.13s | —                       |
| VortexScans | getDiscoverSectionItems: latest-releases                                                                 | ✅ Pass |    0.00s | —                       |
| VortexScans | getDiscoverSectionItems: release-filters                                                                 | ✅ Pass |    0.00s | —                       |
| VortexScans | getDiscoverSectionItems: collections                                                                     | ❌ Fail |    1.16s | TypeError: fetch failed |
| VortexScans | getDiscoverSectionItems: most-popular                                                                    | ✅ Pass |    0.00s | —                       |
| VortexScans | getDiscoverSectionItems: genres                                                                          | ❌ Fail |    1.19s | TypeError: fetch failed |

</details>

<details>
<summary>Recent checks (last 24 runs)</summary>

| Checked (UTC)           | Hijala  | Kagane  | MangaSushi   | ManhwaNex    | VortexScans | Run                                                                                       |
| ----------------------- | ------- | ------- | ------------ | ------------ | ----------- | ----------------------------------------------------------------------------------------- |
| 2026-10-15 19:28:45 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ❌ Fail     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38793802356) |
| 2026-10-15 19:07:29 UTC | ❌ Fail | ❌ Fail | ❌ Fail      | ✅ Pass      | ❌ Fail     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38790920180) |
| 2026-10-15 18:44:07 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ❌ Fail      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38787589893) |
| 2026-10-15 16:47:31 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38771490471) |
| 2026-10-15 16:13:11 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38766709707) |
| 2026-10-15 15:02:46 UTC | ❌ Fail | ✅ Pass | ✅ Pass      | ❌ Fail      | ❌ Fail     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38756351888) |
| 2026-10-15 14:28:19 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38751259055) |
| 2026-10-15 09:30:27 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38713031694) |
| 2026-10-15 07:55:41 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38701718877) |
| 2026-10-15 07:27:58 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38698648488) |
| 2026-10-15 07:04:38 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38696063430) |
| 2026-10-15 06:42:38 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38693772613) |
| 2026-10-15 06:12:39 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38690813898) |
| 2026-10-15 06:04:21 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ❌ Fail      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38690068761) |
| 2026-10-15 05:35:29 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38687430692) |
| 2026-10-15 05:10:14 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38685134771) |
| 2026-10-15 04:51:12 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38683461628) |
| 2026-10-15 04:40:33 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38682553981) |
| 2026-10-15 03:27:14 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38676207727) |
| 2026-10-15 02:51:40 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38673070170) |
| 2026-10-15 02:31:45 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38671316621) |
| 2026-10-15 02:10:15 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38669433234) |
| 2026-10-15 01:42:52 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38666994881) |
| 2026-10-15 00:01:10 UTC | ✅ Pass | ✅ Pass | — Not tested | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38657461826) |

</details>

<!-- LIVE_TEST_STATUS:END -->

## Installation

To add these extensions to Paperback, install from [here]

## Contributing

Make a pull request if you want to.

## Development and tests

Use Node.js 24. Install the locked dependencies and run the offline checks:

```sh
npm ci
npm test
```

`npm test` checks TypeScript, lint, formatting, and bundles all extensions.
Paperback's live tests are separate and require working source websites:

```sh
docker compose up -d --build --wait --wait-timeout 90
npm run test:extensions
```

The suites exercise initialisation, sorting, search, manga details, chapters,
nonempty chapter page URLs, and every discover section. Results are written to
`bundles/live-test-results.json`. Failed or missing suites return a nonzero exit
code. Extension directories with a `pbconfig.ts` are discovered automatically, so
new extensions must have a passing suite and appear in the status report.

To test a single extension:

```sh
npm run test:extensions -- VortexScans
npm run test:extensions -- Kagane
npm run test:extensions -- Hijala
npm run test:extensions -- MangaSushi
```

Mangasushi `0.0.1-alpha.7` uses the website's Popular Series slider and What's New
feed, including native load-more pagination. A lightweight Genres chip row follows
the homepage menu; each selected genre lazily opens its exact native archive,
preserving source order and AJAX continuation without loading all archives. Its search mirrors the seven website sorts and the
actual genre OR/AND, author, artist, release year, adult-content and status filters.
The two verified donation/recruitment announcement posts are not treated as manga.
If the website ignores a selected search genre, the extension reports an error
rather than returning unrelated titles. A verified empty archive remains empty.

Discovery shares the homepage response and a page-sized native AJAX metadata
request across concurrent sections instead of searching once per title. Short-lived,
setting-keyed caches also avoid repeat requests on warm loads. Exact homepage order,
upstream continuation, explicit-tag exclusions and unknown-title blocking remain
unchanged. Homepage titles missing from a batch retain the canonical-ID search
fallback; genre archives use only their bounded page metadata and hide unknown
classifications, without per-title requests.

NSFW exclusion is enabled by default in Mangasushi's source settings. It applies
the site's non-adult filter plus Adult, Mature, Smut, Hentai, Erotica and Ecchi genre
exclusions across discovery, search, details, chapters and reading. Titles without
reliable genre metadata are hidden; BL/Yuri or demographic tags alone are not
classified as adult. Website classification is incomplete and cannot guarantee
content safety. At the 2026-10-15 check, 37 of 46 manga titles were visible with the
default filter: five lacked genre metadata and four were adult-flagged or carried
excluded tags. All five Popular Series and 17 of the first 20 What's New entries
remained visible. These are a dated audit, not fixed catalog limits. Turning the
setting off restores unclassified titles such as Welcome to the Cheap Restaurant
of Outcasts! Settings changes invalidate source caches, but cannot revoke pages
already downloaded by Paperback. Login, paid access and security gates are not
bypassed.

Mangasushi prefers audited English aliases only while the exact complete alias is
still present in current source metadata. Original titles and full alternative text
remain available, and canonical IDs do not change. Unverified or removed aliases
fall back to the original title; no translations or language guesses are generated.
Discovery reuses the native metadata batch for this in both content-setting modes,
without one request per title. Exact punctuation-sensitive full-title searches use
verified source-title fallbacks; ordinary partial searches are unchanged.

Mangasushi's maintained live suite also checks native continuation, strict NSFW
handling, exact metadata, decimal chapter numbers, complete asynchronous chapter
lists, multiple readers and settings/cache transitions. Paperback renders the chapter
number itself, so redundant matching number prefixes are removed from chapter titles;
real subtitles and special labels remain. Chapters without a reported volume use zero. Chapter lists must retain
the exact SourceManga object supplied by Paperback, including when loading saved
titles with cold caches. Valid underscore chapter IDs are retained, including the
named Lonely Attack on the Different World chapter-list and reader regression.
Reader tests fetch the first and last images of sampled
safe and decimal chapters and verify successful responses, image MIME types and
image signatures. This does not replace testing the physical iOS app.

Use the included FlareSolverr test image. Set `FLARESOLVERR_URL` to connect to
another instance of that image; the default is `http://127.0.0.1:8191`.

For a managed cloud environment with an outbound TLS proxy:

```sh
docker compose -f compose.yaml -f compose.proxy.yaml up -d --build --wait --wait-timeout 90
```

This mounts the public CA at `CODEX_PROXY_CERT` into the browser trust store and
supplies it to the build. FlareSolverr uses Docker's configured HTTPS/HTTP proxy
unless `PROXY_URL` is set on the container. The test runner uses Node's environment
proxy support. Keep the environment's Node CA trust configuration. TLS
verification stays enabled in the browser.

The **Live Extension Tests** workflow also runs on PRs that affect extensions or
the test setup, and can be started manually from the Actions tab. Every completed
scheduled run on the default branch updates only the marked README status section
and `reports/live-tests-history.json`, including failed tests and setup errors.
PR runs publish their results in the job summary and artifacts without editing the
README. Full reports, CLI output, and browser logs are retained for seven days.

Stop the test service when finished:

```sh
docker compose down
```

[here]: https://read.pirate.vodka

## ManhwaNex

ManhwaNex `0.0.1-alpha.4` preserves the public website's Popular Series and Latest
Updates sections, canonical releases, native search filters, and reader pages.
Website five-star scores are converted to Paperback's normalized 0–1 rating scale;
unrated or invalid scores are omitted.
Popular and Latest share one bounded homepage metadata batch, without fetching
details for every card.

The eight genre archives linked from the homepage are separate Discover sections,
in the site's order. Each archive loads only when requested and uses bounded,
page-sized metadata batches when classification is needed. Native archive order
and next-page links are preserved. Repeated canonical IDs are omitted across a
pagination chain, including duplicate-only intermediate pages; distinct source
entries remain separate even when they share titles or artwork.

NSFW exclusion is on by default and applies to discovery, search, saved-title
details, chapters, and reader entry. It requires the website's non-adult flag and
verified genre metadata; unknown or conflicting classifications are hidden. The
site has no verified granular age-rating taxonomy, so selective age ratings are
not offered. Paperback's conservative Mature badge is not an all-ages guarantee.
Website labels can be incomplete, and downloaded pages cannot be revoked.

Search preserves the site's query behavior, including its limitations: long
punctuated titles can return unrelated native matches, and some numeric author
queries redirect to the homepage and report an error. Try a short title fragment
or another author spelling. Alternative-title text is preserved without guessing
translations or merging separate source entries. Only publicly listed chapters
are returned, which may be a recent subset rather than every historical release.
