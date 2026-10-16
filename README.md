# Pirate Vodka Extensions for Paperback

Community-maintained extensions for Paperback 0.9, with source-specific Discover,
search, details, chapters and readers. Available features depend on each website.

## Extension health

[![Live Extension Tests](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/workflows/live-tests.yaml/badge.svg?branch=0.9%2Fstable)](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/workflows/live-tests.yaml)

Full live sweeps run every 30 minutes at minutes 17 and 47 (UTC), and on manual
dispatch. GitHub may delay scheduled runs. Pull requests run live checks for
affected sources; shared or uncertain changes require the full live suite.
Merges do not start another live run. Full static checks and bundles still run on
pull requests and relevant `0.9/stable` pushes; publication remains independent.
The badge above tracks the latest Live Extension Tests run on 0.9/stable,
the default branch. The report below records that branch’s last full scheduled
or manually dispatched sweep and its tested commit. Later pull-request checks
can pass without updating either; neither is a pass for newer commits. Open the
workflow run list for PR-specific results.

<!-- LIVE_TEST_STATUS:START -->

Last checked: **2026-10-16 22:09:15 UTC** · [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38973635392)
Live scope: all; 6/6 sources selected; 6 complete reports. Non-PR events run the full live suite
Selected tests: 190/190 passed; 0 failed.
Started: 2026-10-16 22:05:44 UTC
Tested commit: `8c75c7b`

| Extension   | Result  | Passed | Failed | Duration |
| ----------- | ------- | -----: | -----: | -------: |
| Hijala      | ✅ Pass |  39/39 |      0 |  120.20s |
| Kagane      | ✅ Pass |  20/20 |      0 |   36.12s |
| MangaStash  | ✅ Pass |  22/22 |      0 |   20.65s |
| MangaSushi  | ✅ Pass |  52/52 |      0 |  176.63s |
| ManhwaNex   | ✅ Pass |  33/33 |      0 |  156.69s |
| VortexScans | ✅ Pass |  24/24 |      0 |   36.65s |

<details>
<summary>Test output</summary>

| Extension   | Test                                                                                                            | Result  | Duration | Failure |
| ----------- | --------------------------------------------------------------------------------------------------------------- | ------- | -------: | ------- |
| Hijala      | defaults: fresh persistent state                                                                                | ✅ Pass |    0.14s | —       |
| Hijala      | initialisation                                                                                                  | ✅ Pass |    0.00s | —       |
| Hijala      | getDiscoverSections                                                                                             | ✅ Pass |    6.85s | —       |
| Hijala      | getSortingOptions                                                                                               | ✅ Pass |    0.00s | —       |
| Hijala      | getSearchResults                                                                                                | ✅ Pass |    4.22s | —       |
| Hijala      | getMangaDetails                                                                                                 | ✅ Pass |    0.86s | —       |
| Hijala      | getChapters                                                                                                     | ✅ Pass |    0.34s | —       |
| Hijala      | getChapterDetails                                                                                               | ✅ Pass |    0.45s | —       |
| Hijala      | settings: honest default-on genre exclusion and complete native taxonomy                                        | ✅ Pass |    2.82s | —       |
| Hijala      | discover: actual current five sections and rendered Popular limit                                               | ✅ Pass |    2.52s | —       |
| Hijala      | discover: cold and warm native callbacks share bounded bulk requests without N+1                                | ✅ Pass |    6.15s | —       |
| Hijala      | discover: empty first-page metadata reuses finite home snapshots                                                | ✅ Pass |    6.96s | —       |
| Hijala      | discover: homepage order, covers and bounded snapshots match public source data                                 | ✅ Pass |    0.33s | —       |
| Hijala      | discover: every real per-chapter update retains identity and paid boundary                                      | ✅ Pass |    2.28s | —       |
| Hijala      | discover: New actual request, next page and repeated native requests                                            | ✅ Pass |    4.19s | —       |
| Hijala      | discover: Latest uses verified pinned feed and actual page 2                                                    | ✅ Pass |    3.88s | —       |
| Hijala      | pagination: complete live New and catalog have globally unique accumulated IDs                                  | ✅ Pass |   15.49s | —       |
| Hijala      | pagination: partial overlap and duplicate-only physical pages lose no live-derived IDs                          | ✅ Pass |   13.98s | —       |
| Hijala      | pagination: query filter sort section and settings changes reset old cursors                                    | ✅ Pass |    7.59s | —       |
| Hijala      | pagination: malformed bounded cursor metadata harmlessly resets to page one                                     | ✅ Pass |    1.81s | —       |
| Hijala      | pagination: changing totals missing records and duplicate loops require refresh                                 | ✅ Pass |    8.61s | —       |
| Hijala      | discover: stale hidden sections and disabled site tabs stay bounded empty                                       | ✅ Pass |    1.59s | —       |
| Hijala      | pagination: complete first responses are terminal while partial oversized responses fail                        | ✅ Pass |    2.07s | —       |
| Hijala      | search: malformed saved constraints fail before provider requests                                               | ✅ Pass |    0.39s | —       |
| Hijala      | search: every site sort, native advanced filters and true empty result                                          | ✅ Pass |    3.87s | —       |
| Hijala      | chapters: complete actual SourceManga reference and paid preference                                             | ✅ Pass |    2.65s | —       |
| Hijala      | reader: actual native Chapter and real first middle last public image bytes                                     | ✅ Pass |    0.49s | —       |
| Hijala      | chapters: real large full list, decimal numbers and source titles                                               | ✅ Pass |    4.93s | —       |
| Hijala      | safety: actual Mature tag and persisted opt-out do not bypass other filters                                     | ✅ Pass |    3.39s | —       |
| Hijala      | safety: missing live metadata fails closed by default but opt-out is explicit                                   | ✅ Pass |    4.53s | —       |
| Hijala      | native: string and incomplete chapter inputs fail before any network request                                    | ✅ Pass |    0.00s | —       |
| Hijala      | safety: pending cached discovery cannot survive a settings change                                               | ✅ Pass |    1.03s | —       |
| Hijala      | reader: live-derived malformed page order and duplicate URLs fail closed                                        | ✅ Pass |    2.10s | —       |
| Hijala      | safety: parser never evaluates current site scripts or weakens access checks                                    | ✅ Pass |    0.76s | —       |
| Hijala      | getDiscoverSectionItems: featured                                                                               | ✅ Pass |    0.51s | —       |
| Hijala      | getDiscoverSectionItems: latest                                                                                 | ✅ Pass |    0.80s | —       |
| Hijala      | getDiscoverSectionItems: new                                                                                    | ✅ Pass |    0.61s | —       |
| Hijala      | getDiscoverSectionItems: popular                                                                                | ✅ Pass |    0.68s | —       |
| Hijala      | getDiscoverSectionItems: updates                                                                                | ✅ Pass |    0.31s | —       |
| Kagane      | initialisation                                                                                                  | ✅ Pass |    0.12s | —       |
| Kagane      | getDiscoverSections                                                                                             | ✅ Pass |    0.01s | —       |
| Kagane      | getSortingOptions                                                                                               | ✅ Pass |    0.00s | —       |
| Kagane      | getSearchResults                                                                                                | ✅ Pass |   10.39s | —       |
| Kagane      | getMangaDetails                                                                                                 | ✅ Pass |    0.31s | —       |
| Kagane      | getChapters                                                                                                     | ✅ Pass |    1.07s | —       |
| Kagane      | getChapterDetails                                                                                               | ✅ Pass |    0.80s | —       |
| Kagane      | Reader: original native chapter and complete first/last source-issued image bytes                               | ✅ Pass |    3.48s | —       |
| Kagane      | Native directional sorts emit exact tokens and preserve consumed count/rating order                             | ✅ Pass |    4.61s | —       |
| Kagane      | Unknown malformed and stale tags fail before search; valid native payloads remain exact                         | ✅ Pass |    1.09s | —       |
| Kagane      | Native optional ranges serialize exactly, isolate continuation and reject malformed values before HTTP          | ✅ Pass |    0.06s | —       |
| Kagane      | Native pagination rejects malformed cursors before HTTP and preserves first pages and safe continuations        | ✅ Pass |    0.18s | —       |
| Kagane      | Optional listing type/rating defaults, persistence, exact subtitles and toggle reloads reuse consumed bulk rows | ✅ Pass |    0.09s | —       |
| Kagane      | Live chapter-count and start-year bounds match consumed bulk rows                                               | ✅ Pass |   11.53s | —       |
| Kagane      | Current live series translation and unknown language preserve native chapter identity                           | ✅ Pass |    0.07s | —       |
| Kagane      | getDiscoverSectionItems: popular                                                                                | ✅ Pass |    1.42s | —       |
| Kagane      | getDiscoverSectionItems: trending                                                                               | ✅ Pass |    0.00s | —       |
| Kagane      | getDiscoverSectionItems: latest                                                                                 | ✅ Pass |    0.30s | —       |
| Kagane      | getDiscoverSectionItems: recently-added                                                                         | ✅ Pass |    0.59s | —       |
| Kagane      | getDiscoverSectionItems: genres                                                                                 | ✅ Pass |    0.00s | —       |
| MangaStash  | initialisation: official host and explicit compatibility default                                                | ✅ Pass |    0.10s | —       |
| MangaStash  | settings: serialized lifecycle and explicit recovery retain strict policy                                       | ✅ Pass |    0.03s | —       |
| MangaStash  | home: exact same-response complete sequences and legitimate overlap                                             | ✅ Pass |    5.74s | —       |
| MangaStash  | search: q-only native results preserve explicit Safe                                                            | ✅ Pass |    1.14s | —       |
| MangaStash  | catalog: exact advertised covers retain ownership and issued URL provenance                                     | ✅ Pass |    2.97s | —       |
| MangaStash  | browse: exact declared controls and preserved real page-two scope                                               | ✅ Pass |    1.88s | —       |
| MangaStash  | invalid filters, text/filter combinations, sort and stale cursors fail before HTTP                              | ✅ Pass |    0.00s | —       |
| MangaStash  | details and complete native chapter inventory reuse one response                                                | ✅ Pass |    1.08s | —       |
| MangaStash  | public inventory omits locked rows but rejects a persisted locked identity before reader HTTP                   | ✅ Pass |    0.50s | —       |
| MangaStash  | reader: actual persisted native identity and ordered advertised credit pages                                    | ✅ Pass |    2.08s | —       |
| MangaStash  | images: complete original cover and first/middle/last transport with exact persisted grants                     | ✅ Pass |    0.44s | —       |
| MangaStash  | images: overlapping cover and reader roles retain independent fixed grants                                      | ✅ Pass |    0.00s | —       |
| MangaStash  | reader: live-derived wrong owner, chapter, config, ordering, gaps and duplicates reject                         | ✅ Pass |    0.11s | —       |
| MangaStash  | classification: genuine labels and unknown fallback never infer demographics                                    | ✅ Pass |    0.06s | —       |
| MangaStash  | policy: strict source exclusion errors honestly and revokes saved image access                                  | ✅ Pass |    1.14s | —       |
| MangaStash  | zero-results and optional metadata use explicit source semantics                                                | ✅ Pass |    0.04s | —       |
| MangaStash  | native rating uses the 0–1 scale and omits malformed source scores                                              | ✅ Pass |    0.17s | —       |
| MangaStash  | persisted evidence loss invalidates grants and cached responses                                                 | ✅ Pass |    0.49s | —       |
| MangaStash  | native input and finite-feed guards reject before network                                                       | ✅ Pass |    0.00s | —       |
| MangaStash  | settings race: pending result cannot survive an ABA policy change                                               | ✅ Pass |    0.21s | —       |
| MangaStash  | native app caps are current policy at catalogs, persisted readers and images                                    | ✅ Pass |    2.47s | —       |
| MangaStash  | redirect callback cancels changed destinations and response identity stays strict                               | ✅ Pass |    0.00s | —       |
| MangaSushi  | initialisation                                                                                                  | ✅ Pass |    0.06s | —       |
| MangaSushi  | URLs: native source parser preserves exact identities without host globals                                      | ✅ Pass |    0.01s | —       |
| MangaSushi  | getDiscoverSections: native section order                                                                       | ✅ Pass |    0.01s | —       |
| MangaSushi  | getSortingOptions: all seven site sorts                                                                         | ✅ Pass |    5.92s | —       |
| MangaSushi  | getSearchResults: native adult filter plus genre safety                                                         | ✅ Pass |    4.34s | —       |
| MangaSushi  | getSearchResults: displayed smart punctuation resolves by exact ID                                              | ✅ Pass |    0.85s | —       |
| MangaSushi  | getMangaDetails: full canonical metadata                                                                        | ✅ Pass |    0.02s | —       |
| MangaSushi  | getMangaDetails: unknown classification is blocked by default                                                   | ✅ Pass |    1.25s | —       |
| MangaSushi  | getChapters and reader: accessible with default exclusion                                                       | ✅ Pass |    5.60s | —       |
| MangaSushi  | getChapters and reader: cold-cache persisted records across three safe titles                                   | ✅ Pass |   23.07s | —       |
| MangaSushi  | getChapters and reader: Lonely Attack canonical underscore chapter IDs                                          | ✅ Pass |   21.05s | —       |
| MangaSushi  | English titles: exact source aliases keep original titles, full alternatives and IDs                            | ✅ Pass |   13.99s | —       |
| MangaSushi  | English titles: Japanese-only alternatives retain the source title                                              | ✅ Pass |    2.18s | —       |
| MangaSushi  | English titles: cold classification still queries the original source title                                     | ✅ Pass |    1.03s | —       |
| MangaSushi  | English titles: removing an alias from live metadata restores original display                                  | ✅ Pass |    1.83s | —       |
| MangaSushi  | getSearchResults: every native sort executes                                                                    | ✅ Pass |    6.40s | —       |
| MangaSushi  | getSearchResults: native continuation                                                                           | ✅ Pass |    2.00s | —       |
| MangaSushi  | getSearchResults: genuine empty query terminates                                                                | ✅ Pass |    0.49s | —       |
| MangaSushi  | advanced search: malformed saved constraints fail before native requests                                        | ✅ Pass |    0.01s | —       |
| MangaSushi  | advanced search: actual taxonomy and native options                                                             | ✅ Pass |    1.78s | —       |
| MangaSushi  | genres: exact native menu chips, safe defaults and lazy private routing                                         | ✅ Pass |    0.89s | —       |
| MangaSushi  | genres: exact archive canonical order, bounded enrichment and native continuation                               | ✅ Pass |    4.54s | —       |
| MangaSushi  | genres: finite Horror archive retains metadata and terminates with two cold requests                            | ✅ Pass |    1.58s | —       |
| MangaSushi  | genres: malformed cumulative history is rejected before source requests                                         | ✅ Pass |    2.16s | —       |
| MangaSushi  | genres: duplicate-only and excluded-only pages advance, while stalled archives stop visibly                     | ✅ Pass |   14.05s | —       |
| MangaSushi  | genres: out-of-page metadata fails closed without per-title fallback                                            | ✅ Pass |    3.13s | —       |
| MangaSushi  | genres: raw root and descendant warnings survive held metadata enrichment                                       | ✅ Pass |    4.24s | —       |
| MangaSushi  | metadata: rejected delayed warnings cannot seed a new local warning window                                      | ✅ Pass |    2.19s | —       |
| MangaSushi  | genres: Cooking archive is genuinely empty without metadata or catalog scans                                    | ✅ Pass |    0.48s | —       |
| MangaSushi  | advanced genres: ignored Cooking filter fails visibly in one native request                                     | ✅ Pass |    0.72s | —       |
| MangaSushi  | advanced genres: fresh malformed taxonomy and wrong-card evidence fail without scans                            | ✅ Pass |    8.93s | —       |
| MangaSushi  | advanced genres: rejected filters cannot discard fresh warnings or revive warm-safe titles                      | ✅ Pass |    9.20s | —       |
| MangaSushi  | advanced genres: changed or contradictory empty responses fail without scanning                                 | ✅ Pass |    2.40s | —       |
| MangaSushi  | advanced genres: native multiple-genre OR, AND and genuine empty remain distinct                                | ✅ Pass |    2.90s | —       |
| MangaSushi  | getDiscoverSectionItems: cold-cache default exactly mirrors eligible site rows                                  | ✅ Pass |    4.79s | —       |
| MangaSushi  | settings: pending native discovery batch is invalidated                                                         | ✅ Pass |    1.07s | —       |
| MangaSushi  | settings: explicit opt-out and finite Popular fidelity                                                          | ✅ Pass |    3.39s | —       |
| MangaSushi  | getDiscoverSectionItems: What's New native load more                                                            | ✅ Pass |    5.46s | —       |
| MangaSushi  | catalog: editorial posts are not manga even with exclusions off                                                 | ✅ Pass |    1.35s | —       |
| MangaSushi  | getMangaDetails: original title and alternatives                                                                | ✅ Pass |    0.15s | —       |
| MangaSushi  | getChapters: asynchronous full list and decimal labels                                                          | ✅ Pass |    1.35s | —       |
| MangaSushi  | getChapterDetails: exact ordered lazy pages                                                                     | ✅ Pass |    0.46s | —       |
| MangaSushi  | reader: duplicate pages and page-order gaps fail closed                                                         | ✅ Pass |    0.42s | —       |
| MangaSushi  | getChapterDetails: second chapter pages                                                                         | ✅ Pass |    0.29s | —       |
| MangaSushi  | metadata: ambiguous cursor fields and mutable final identity fail closed                                        | ✅ Pass |    0.00s | —       |
| MangaSushi  | metadata: pending cloned requests and HTML response boundary                                                    | ✅ Pass |    0.14s | —       |
| MangaSushi  | images: native issued URLs persist, reject mutation and expire without network requests                         | ✅ Pass |    0.03s | —       |
| MangaSushi  | settings: stale library and cached metadata cannot bypass exclusion                                             | ✅ Pass |    4.60s | —       |
| MangaSushi  | settings: pending permissive response cannot survive exclusion switch                                           | ✅ Pass |    2.73s | —       |
| MangaSushi  | getSearchResults: all-filtered native pages reach real end                                                      | ✅ Pass |    0.77s | —       |
| MangaSushi  | catalog: malformed response fails closed                                                                        | ✅ Pass |    0.00s | —       |
| MangaSushi  | images: native state roundtrip preserves evidence and retires legacy grants                                     | ✅ Pass |    0.34s | —       |
| ManhwaNex   | initialisation and persistent safe defaults                                                                     | ✅ Pass |    0.04s | —       |
| ManhwaNex   | discovery: exact native section names and order                                                                 | ✅ Pass |    2.70s | —       |
| ManhwaNex   | discovery: unprovable duplication preserves descriptors without relaxing row validation                         | ✅ Pass |    2.80s | —       |
| ManhwaNex   | discovery: two cold requests and zero warm without per-card lookups                                             | ✅ Pass |    2.87s | —       |
| ManhwaNex   | discovery: native page-two order and fixed Popular carousel                                                     | ✅ Pass |    2.61s | —       |
| ManhwaNex   | categories: exact linked native archives, bounded lazy requests, distinct titles and terminal pagination        | ✅ Pass |   61.12s | —       |
| ManhwaNex   | categories: observed adult conflicts revoke direct and in-flight access without losing metadata                 | ✅ Pass |   38.27s | —       |
| ManhwaNex   | categories: malformed home anchors and foreign or non-advancing archive routes fail closed                      | ✅ Pass |    1.59s | —       |
| ManhwaNex   | pagination: canonical-ID overlaps are removed, duplicate-only advancing pages retain later titles               | ✅ Pass |    3.48s | —       |
| ManhwaNex   | pagination: continuation is scoped to category, query, settings and refresh                                     | ✅ Pass |    3.61s | —       |
| ManhwaNex   | search: only the actually advertised Relevance sort                                                             | ✅ Pass |    1.35s | —       |
| ManhwaNex   | search: exact native order, pagination and no-result termination                                                | ✅ Pass |    1.70s | —       |
| ManhwaNex   | search: source title and punctuation are forwarded unchanged                                                    | ✅ Pass |    0.73s | —       |
| ManhwaNex   | advanced search: all actual genre and status choices                                                            | ✅ Pass |    0.16s | —       |
| ManhwaNex   | advanced search: every native genre, condition and status is exercised                                          | ✅ Pass |    7.44s | —       |
| ManhwaNex   | advanced search: malformed saved filters fail before requests without losing valid constraints                  | ✅ Pass |    0.17s | —       |
| ManhwaNex   | advanced search: author, artist, release and adult semantics                                                    | ✅ Pass |    4.45s | —       |
| ManhwaNex   | search: numeric-author redirect fails visibly and long titles retain native semantics                           | ✅ Pass |    1.23s | —       |
| ManhwaNex   | classification: unknown and conflicting source labels fail closed                                               | ✅ Pass |    0.92s | —       |
| ManhwaNex   | details: canonical identity, whole aliases and full metadata                                                    | ✅ Pass |    0.57s | —       |
| ManhwaNex   | details: reported title normalizes the native five-point rating                                                 | ✅ Pass |    0.64s | —       |
| ManhwaNex   | details: fresh live rating boundaries omit unrated and malformed scores                                         | ✅ Pass |    2.21s | —       |
| ManhwaNex   | chapters: complete public AJAX list, exact persisted reference and volume zero                                  | ✅ Pass |    1.27s | —       |
| ManhwaNex   | reader: persisted newest, oldest and decimal chapters with actual endpoint image bytes                          | ✅ Pass |    1.44s | —       |
| ManhwaNex   | reader: explicit opt-out retains exact native chapter pages and actual image bytes                              | ✅ Pass |    1.73s | —       |
| ManhwaNex   | reader: cold persisted inputs for two other native titles                                                       | ✅ Pass |    2.43s | —       |
| ManhwaNex   | reader guards: malformed IDs, foreign assets and exact chapter identity                                         | ✅ Pass |    0.20s | —       |
| ManhwaNex   | chapter subtitles: only redundant complete matching prefixes disappear                                          | ✅ Pass |    0.00s | —       |
| ManhwaNex   | chapters: real volume survives independently of leading chapter-title cleanup                                   | ✅ Pass |    0.19s | —       |
| ManhwaNex   | classification: unknown live-response metadata blocks all native entry points                                   | ✅ Pass |    4.42s | —       |
| ManhwaNex   | settings: opt-out is persistent, reset and issued-image invalidation                                            | ✅ Pass |    1.06s | —       |
| ManhwaNex   | reader authorization: persisted restart, settings change, unknown and evicted URLs                              | ✅ Pass |    2.46s | —       |
| ManhwaNex   | settings race: stale in-flight discovery cannot repopulate cache                                                | ✅ Pass |    0.84s | —       |
| VortexScans | initialisation                                                                                                  | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSections                                                                                             | ✅ Pass |    0.01s | —       |
| VortexScans | getSortingOptions                                                                                               | ✅ Pass |    0.00s | —       |
| VortexScans | getSearchResults                                                                                                | ✅ Pass |    6.14s | —       |
| VortexScans | getMangaDetails                                                                                                 | ✅ Pass |    4.55s | —       |
| VortexScans | getChapters                                                                                                     | ✅ Pass |    0.81s | —       |
| VortexScans | getChapterDetails                                                                                               | ✅ Pass |    0.84s | —       |
| VortexScans | home: one cold response, no warm requests or per-title enrichment                                               | ✅ Pass |    2.01s | —       |
| VortexScans | home: exact current 6/20/9 rows, original covers and terminal editorial rows                                    | ✅ Pass |    0.80s | —       |
| VortexScans | legacy latest: empty first-page metadata and real cursor guards reuse cached home                               | ✅ Pass |    0.23s | —       |
| VortexScans | latest: Browse chip preserves native query, exact source order and page-two continuation                        | ✅ Pass |    1.54s | —       |
| VortexScans | search cursors: numeric boundaries preserve first pages, continuations and policy resets                        | ✅ Pass |    0.04s | —       |
| VortexScans | metadata: explicit counts are not latest numbers and missing values stay absent                                 | ✅ Pass |    0.00s | —       |
| VortexScans | metadata: chapter subtitles retain decimals and genuine text with exact native references                       | ✅ Pass |    0.01s | —       |
| VortexScans | original reader: native source references, complete pages and first/last image bytes                            | ✅ Pass |   15.49s | —       |
| VortexScans | regression584: saved apostrophe ID details, original chapters/reader and complete image bytes                   | ✅ Pass |    2.78s | —       |
| VortexScans | content: persisted default-on exclusion keeps unknown Mature and excludes actual warning names                  | ✅ Pass |    0.00s | —       |
| VortexScans | content: a native request pending across a setting change cannot release stale results                          | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSectionItems: featured                                                                               | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSectionItems: popular-today                                                                          | ✅ Pass |    0.14s | —       |
| VortexScans | getDiscoverSectionItems: release-filters                                                                        | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSectionItems: collections                                                                            | ✅ Pass |    0.59s | —       |
| VortexScans | getDiscoverSectionItems: most-popular                                                                           | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSectionItems: genres                                                                                 | ✅ Pass |    0.64s | —       |

</details>

<details>
<summary>Recent checks (last 24 runs)</summary>

| Checked (UTC)           | Hijala  | Kagane  | MangaStash   | MangaSushi | ManhwaNex | VortexScans | Run                                                                                       |
| ----------------------- | ------- | ------- | ------------ | ---------- | --------- | ----------- | ----------------------------------------------------------------------------------------- |
| 2026-10-16 22:09:15 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38973635392) |
| 2026-10-16 18:51:57 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38950204219) |
| 2026-10-16 14:54:58 UTC | ✅ Pass | ✅ Pass | ✅ Pass      | ✅ Pass    | ✅ Pass   | ❌ Fail     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38919153542) |
| 2026-10-16 09:52:28 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38883085008) |
| 2026-10-16 05:06:40 UTC | ✅ Pass | ✅ Pass | — Not tested | ❌ Fail    | ✅ Pass   | ❌ Fail     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38853693388) |
| 2026-10-16 00:27:24 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38829309249) |
| 2026-10-15 21:50:39 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38812574546) |
| 2026-10-15 19:28:45 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ❌ Fail     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38793802356) |
| 2026-10-15 19:07:29 UTC | ❌ Fail | ❌ Fail | — Not tested | ❌ Fail    | ✅ Pass   | ❌ Fail     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38790920180) |
| 2026-10-15 18:44:07 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ❌ Fail   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38787589893) |
| 2026-10-15 16:47:31 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38771490471) |
| 2026-10-15 16:13:11 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38766709707) |
| 2026-10-15 15:02:46 UTC | ❌ Fail | ✅ Pass | — Not tested | ✅ Pass    | ❌ Fail   | ❌ Fail     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38756351888) |
| 2026-10-15 14:28:19 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38751259055) |
| 2026-10-15 09:30:27 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38713031694) |
| 2026-10-15 07:55:41 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38701718877) |
| 2026-10-15 07:27:58 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38698648488) |
| 2026-10-15 07:04:38 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38696063430) |
| 2026-10-15 06:42:38 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38693772613) |
| 2026-10-15 06:12:39 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38690813898) |
| 2026-10-15 06:04:21 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ❌ Fail   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38690068761) |
| 2026-10-15 05:35:29 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38687430692) |
| 2026-10-15 05:10:14 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38685134771) |
| 2026-10-15 04:51:12 UTC | ✅ Pass | ✅ Pass | — Not tested | ✅ Pass    | ✅ Pass   | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38683461628) |

</details>

<!-- LIVE_TEST_STATUS:END -->

## Installation

Add the repository from [read.pirate.vodka](https://read.pirate.vodka), then install
the extensions you want in Paperback.

## Available extensions

- [Hijala](src/Hijala)
- [Kagane](src/Kagane)
- [MangaStash](src/MangaStash)
- [MangaSushi](src/MangaSushi)
- [ManhwaNex](src/ManhwaNex)
- [Noveli](src/Noveli) · native HTML novels, Paperback only
- [VortexScans](src/VortexScans)

Source settings and website access restrictions vary. Review each extension's
settings; website content labels are not a guarantee of content safety.

## Contributing

Bug reports and focused pull requests are welcome. Include the affected source,
steps to reproduce and relevant test results. Do not include credentials or
private reading data.

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
ordered comic image pages or native novel HTML, and every discover section.
Source-specific reader checks validate actual image bodies or source-faithful
prose and canonical chapter identity. Results are written to
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

The **Live Extension Tests** workflow can be started manually from the Actions
tab. Scheduled and manual full runs on the default branch update only the marked
README status section and `reports/live-tests-history.json`, including failed
tests and setup errors. PR results remain in the job summary and artifacts, with
unselected sources explicitly identified, without editing README/history or
publishing extensions. Reports, CLI output, and browser logs are retained for
seven days.

Stop the test service when finished:

```sh
docker compose down
```

## Source-specific notes

<details>
<summary>Hijala</summary>

[Hijala](https://en-hijala.com/) is a native Paperback source.

**Discover and search**

- Featured, Latest Releases, New, Most Popular and Latest Updates follow the website.
  Latest and New remain distinct; pagination and chapter-update identities come
  from the source. Popular uses the rendered homepage selection, not a different ranking.
- Live genres, source filters and sorting are available in advanced search.
  Shared bounded caches avoid fetching details for every title.

**Details and reader**

- Source-provided covers, canonical titles and complete available chapter lists.
  Decimal chapter numbers, genuine subtitles and the supplied `SourceManga`
  reference are preserved. Reader checks load actual image bytes.

**Settings and limitations**

- NSFW exclusion is on by default and uses verified source genre labels.
  Unknown classifications are hidden by default; explicit genre exclusions remain
  fail-closed even after opting out. Demographic and relationship labels are not
  invented adult classifications.
- Content-type choices and paid-chapter hiding intersect those preferences.
  Login, paid and protected content remain on the website.

Implementation: [`src/Hijala`](src/Hijala).

</details>

<details>
<summary>Kagane</summary>

[Kagane](https://kagane.org/) is a native Paperback source.

**Discover and search**

- Popular, Latest Updates and Recently Added, with Popularity and Genres chip
  destinations. Search exposes supported directional sorts, grouped and typed
  tags, genre/tag matching, format, upload status and source filters.
- Optional type and star-rating subtitles apply to Recently Added and search
  cards. They do not replace chapter labels in Latest Updates or the Featured layout.

**Details and reader**

- Original titles, associated names, staff, source genres/tags, synopsis and
  publication/upload status are retained when supplied. Edition and source labels
  can be added to titles without changing their canonical IDs.
- Chapter pagination uses the current source index; reader pages follow the
  public manifest order. Chapter title mode and data saver are configurable.

**Settings and limitations**

- Persistent content-rating and language choices, source choices, excluded genres
  and hidden tags control browsing. Grouped and custom hidden tags remain distinct
  from a numeric review score.
- Listing ratings use Kagane's documented score scale; missing values are not
  invented. Unsupported source sort tokens are not advertised as working options.
- Source access restrictions still apply. Metadata availability and language labels
  depend on the source; aliases are not translated or guessed.

Implementation: [`src/Kagane`](src/Kagane). Existing GPL copyright and attribution
are retained in the source files.

</details>

<details>
<summary>MangaStash</summary>

[MangaStash](https://mangastash.org/) is a native Paperback source.

**Discover and search**

- Popular This Month, New Additions and Latest Updates retain the website's
  distinct feeds. Catalog browsing uses the site's declared filters and sorts;
  title search uses its separate search endpoint rather than silently ignoring
  unsupported combinations.
- Pagination retains the original query scope, canonical IDs and source order.
  Covers use the largest candidate actually advertised in each response, without
  guessed image rewrites or a detail request for every card.

**Details and reader**

- Source titles, synopsis, classifications and the complete available chapter
  inventory retain their canonical routes. Decimal chapter identities are not
  reconstructed from a rounded chapter number.
- Ordered public-reader images preserve the source's credit pages as well as
  reading pages. Reader ownership and issued image URLs are checked before use.
- Unavailable bulk chapter dates are omitted rather than invented.

**Settings and limitations**

- Paperback has no Unknown or Suggestive item rating. Unclassified items use an
  explained Mature compatibility fallback; a genuine Suggestive source label is
  also mapped conservatively to Mature, without inventing a Safe classification.
  Paperback's own Mature and Adult filters remain in force for catalogs, saved
  readers and image requests.
- The optional extra source exclusion is **off by default**. Enabling it requires
  verified Safe metadata; unclassified home/catalog cards cannot bypass that
  choice. A wholly blocked feed explains the policy limitation instead of
  pretending the provider returned no titles.
- Home/catalog cards do not consistently supply individual age ratings. No
  demographic or review score is treated as an age classification, and no
  per-card requests are added just to infer one. Source access restrictions remain.

Implementation: [`src/MangaStash`](src/MangaStash).

</details>

<details>
<summary>MangaSushi</summary>

[MangaSushi](https://mangasushi.org/) is a native Paperback source.

**Discover and search**

- Popular Series and What's New preserve source order and native load-more
  continuation. Genre chips lazily open the website's real archives.
- Search follows the website's sorts and genre OR/AND, author, artist, release
  year, status and adult-content filters. Ignored genre filters report an error
  rather than unrelated results; a verified empty archive stays empty.
- Shared homepage responses and bounded page metadata avoid per-title enrichment.
  Missing homepage batch entries retain the canonical-ID search fallback.

**Details and reader**

- Audited English aliases are preferred only while the complete alias is still
  present in current metadata. Originals, full alternatives and canonical IDs remain;
  removed or unverified aliases fall back without invented translations.
- Complete asynchronous chapter lists preserve decimal numbers, real subtitles,
  special labels and valid underscore IDs. Redundant chapter-number prefixes are
  omitted because Paperback renders the number; missing volumes use zero.
- Chapters keep the exact supplied `SourceManga` reference, including cold-cache
  saved titles. Native reader checks verify actual first/last image bodies.

**Settings and limitations**

- NSFW exclusion is on by default: the site's adult filter and verified explicit
  genre labels apply across browsing, saved details, chapters and reader entry.
  Unknown genre classifications are hidden; demographic/relationship tags alone
  are not adult evidence. Turning it off permits unclassified titles.
- Setting changes invalidate source caches but cannot revoke downloaded pages.
  Website labels cannot guarantee image safety. Verified donation/recruitment
  announcements are excluded as non-reading content.
- Exact punctuation-sensitive titles use verified source-title fallbacks; ordinary
  partial search is unchanged. Login, paid access and security gates are not bypassed.

Implementation: [`src/MangaSushi`](src/MangaSushi).

</details>

<details>
<summary>ManhwaNex</summary>

[ManhwaNex](https://manhwanex.com/) is a native Paperback source.

**Discover and search**

- Popular Series, Latest Updates and the homepage-linked genre archives preserve
  native order and continuation. Archives load lazily with bounded page metadata.
- Popular and Latest share homepage metadata rather than fetching each card's
  details. Pagination removes repeated canonical IDs, not distinct source titles.
- Search keeps the site's native filters and query behavior.

**Details and reader**

- Original titles, full alternatives, available metadata and public chapter
  identities are preserved. Five-star review scores use Paperback's normalized
  0–1 scale; missing or invalid scores are omitted.
- Reader pages keep source order. Only publicly listed chapters are returned,
  which can be a recent subset rather than every historical release.

**Settings and limitations**

- NSFW exclusion is on by default across browsing, saved details, chapters and
  reader entry. It requires the source's non-adult flag and verified genre metadata;
  unknown or conflicting classifications are hidden.
- The site has no verified granular age taxonomy. The conservative Mature badge
  is not an all-ages guarantee, and downloaded pages cannot be revoked.
- Long punctuated searches can return unrelated native matches; some numeric
  author queries redirect to the homepage and report an error. Try a shorter title
  fragment or another author spelling. Separate entries and aliases are not merged
  or translated to compensate.

Implementation: [`src/ManhwaNex`](src/ManhwaNex).

</details>

<details>
<summary>Noveli</summary>

[Noveli](https://noveli.to/) is a native HTML-novel source for Paperback only.

**Discover and search**

- Translated by Novelito, Trending Novels, Latest Chapter Updates, Top Rated by
  Readers and Completed & Bingeable use the site's finite ranked lists. Explore
  Web Novels follows the paginated catalog. The repeated Spotlight feed is omitted.
- Search preserves the site's genre, status and sort choices, exact novel IDs and
  continuation. Shared bulk responses avoid per-title card enrichment.

**Details and reader**

- Source titles, authors, aliases, synopsis and genre labels are retained. Valid
  five-point review scores use Paperback's normalized 0–1 rating scale.
- The complete source chapter list preserves canonical IDs and chapter numbers.
  Missing literary volumes use zero; catalog ingestion timestamps are not
  presented as chapter publication dates.
- Native HTML keeps the source's visible paragraph order, Unicode and credits.
  Text is escaped rather than executing site markup or scripts; source-hidden
  display records remain hidden. No prose is converted into images.

**Settings and limitations**

- Explicit adult source labels take precedence; unclassified novels use
  Paperback's conservative Mature classification, not an all-ages guarantee.
- Reading is limited to anonymously available source chapters. Login, paid access,
  access restrictions and TLS safeguards are not bypassed.
- Website/browser and native-suite checks do not establish physical Paperback
  rendering. Actual app presentation remains subject to the app's HTML reader.

Implementation: [`src/Noveli`](src/Noveli).

</details>

<details>
<summary>VortexScans</summary>

[VortexScans](https://vortexscans.org/) is a native Paperback source.

**Discover and search**

- Featured, Popular Today and Most Popular retain the website's curated order.
  Browse releases, Collections and Genres chips open their distinct destinations;
  Latest remains available without a duplicate whole-feed Discover section.
- Shared homepage data avoids per-title enrichment. Search provides source genres,
  inclusion/exclusion, status, type and supported sorting filters.

**Details and reader**

- Canonical IDs, available original titles, source metadata and public chapter
  identities are retained. Original covers are preferred when the response supplies
  them; reader checks verify complete ordered pages and actual image bytes.
- Details may legitimately have no description. The extension does not invent a
  synopsis or substitute generic search-engine text.

**Settings and limitations**

- NSFW exclusion is on by default and uses actual source warning labels.
  Unknown/incomplete labels remain visible with a conservative Mature badge,
  not a fabricated adult classification or all-ages guarantee.
- The filter applies to Discover, search, saved details, chapters and reading;
  demographic/relationship tags do not determine it. Downloaded pages cannot be revoked.
- Locked chapters are excluded. Cloudflare/vShield challenges use Paperback's
  supported resolution flow; access restrictions and TLS safeguards remain intact.

Implementation: [`src/VortexScans`](src/VortexScans).

</details>
