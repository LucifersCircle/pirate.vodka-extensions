## Available Extensions

- Hijala
- VortexScans
- Kagane
- Mangasushi
- ManhwaNex

## Extension health

All extensions are checked every 30 minutes at minutes 17 and 47 (UTC), and on
relevant source or configuration pushes to `0.9/stable`. Click a run link for full
logs and downloadable results.

<!-- LIVE_TEST_STATUS:START -->

Last checked: **2026-10-15 05:10:14 UTC** · [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38685134771)
Started: 2026-10-15 05:08:07 UTC
Tested commit: `94388ef`

| Extension   | Result  | Passed | Failed | Duration |
| ----------- | ------- | -----: | -----: | -------: |
| Hijala      | ✅ Pass |  14/14 |      0 |   10.70s |
| Kagane      | ✅ Pass |  12/12 |      0 |   20.26s |
| MangaSushi  | ✅ Pass |  32/32 |      0 |   83.80s |
| ManhwaNex   | ✅ Pass |  23/23 |      0 |   34.13s |
| VortexScans | ✅ Pass |  12/12 |      0 |   14.59s |

<details>
<summary>Test output</summary>

| Extension   | Test                                                                                   | Result  | Duration | Failure |
| ----------- | -------------------------------------------------------------------------------------- | ------- | -------: | ------- |
| Hijala      | initialisation                                                                         | ✅ Pass |    0.10s | —       |
| Hijala      | getDiscoverSections                                                                    | ✅ Pass |    0.01s | —       |
| Hijala      | getSortingOptions                                                                      | ✅ Pass |    0.00s | —       |
| Hijala      | getSearchResults                                                                       | ✅ Pass |    1.16s | —       |
| Hijala      | getMangaDetails                                                                        | ✅ Pass |    3.44s | —       |
| Hijala      | getChapters                                                                            | ✅ Pass |    1.33s | —       |
| Hijala      | getChapterDetails                                                                      | ✅ Pass |    0.50s | —       |
| Hijala      | getDiscoverSectionItems: featured                                                      | ✅ Pass |    0.60s | —       |
| Hijala      | getDiscoverSectionItems: latest                                                        | ✅ Pass |    0.82s | —       |
| Hijala      | getDiscoverSectionItems: hot                                                           | ✅ Pass |    0.81s | —       |
| Hijala      | getDiscoverSectionItems: new                                                           | ✅ Pass |    0.47s | —       |
| Hijala      | getDiscoverSectionItems: popular                                                       | ✅ Pass |    0.26s | —       |
| Hijala      | getDiscoverSectionItems: updates                                                       | ✅ Pass |    0.36s | —       |
| Hijala      | getDiscoverSectionItems: genres                                                        | ✅ Pass |    0.84s | —       |
| Kagane      | initialisation                                                                         | ✅ Pass |    0.08s | —       |
| Kagane      | getDiscoverSections                                                                    | ✅ Pass |    0.01s | —       |
| Kagane      | getSortingOptions                                                                      | ✅ Pass |    0.00s | —       |
| Kagane      | getSearchResults                                                                       | ✅ Pass |   15.99s | —       |
| Kagane      | getMangaDetails                                                                        | ✅ Pass |    0.26s | —       |
| Kagane      | getChapters                                                                            | ✅ Pass |    0.85s | —       |
| Kagane      | getChapterDetails                                                                      | ✅ Pass |    0.53s | —       |
| Kagane      | getDiscoverSectionItems: popular                                                       | ✅ Pass |    1.69s | —       |
| Kagane      | getDiscoverSectionItems: trending                                                      | ✅ Pass |    0.00s | —       |
| Kagane      | getDiscoverSectionItems: latest                                                        | ✅ Pass |    0.40s | —       |
| Kagane      | getDiscoverSectionItems: recently-added                                                | ✅ Pass |    0.44s | —       |
| Kagane      | getDiscoverSectionItems: genres                                                        | ✅ Pass |    0.00s | —       |
| MangaSushi  | initialisation                                                                         | ✅ Pass |    0.06s | —       |
| MangaSushi  | getDiscoverSections: native section order                                              | ✅ Pass |    0.01s | —       |
| MangaSushi  | getSortingOptions: all seven site sorts                                                | ✅ Pass |    4.22s | —       |
| MangaSushi  | getSearchResults: native adult filter plus genre safety                                | ✅ Pass |    2.26s | —       |
| MangaSushi  | getSearchResults: displayed smart punctuation resolves by exact ID                     | ✅ Pass |    0.90s | —       |
| MangaSushi  | getMangaDetails: full canonical metadata                                               | ✅ Pass |    0.00s | —       |
| MangaSushi  | getMangaDetails: unknown classification is blocked by default                          | ✅ Pass |    1.13s | —       |
| MangaSushi  | getChapters and reader: accessible with default exclusion                              | ✅ Pass |    3.55s | —       |
| MangaSushi  | getChapters and reader: cold-cache persisted records across three safe titles          | ✅ Pass |    7.82s | —       |
| MangaSushi  | getChapters and reader: Lonely Attack canonical underscore chapter IDs                 | ✅ Pass |   12.82s | —       |
| MangaSushi  | English titles: exact source aliases keep original titles, full alternatives and IDs   | ✅ Pass |   11.38s | —       |
| MangaSushi  | English titles: Japanese-only alternatives retain the source title                     | ✅ Pass |    1.38s | —       |
| MangaSushi  | English titles: cold classification still queries the original source title            | ✅ Pass |    0.76s | —       |
| MangaSushi  | English titles: removing an alias from live metadata restores original display         | ✅ Pass |    0.98s | —       |
| MangaSushi  | getSearchResults: every native sort executes                                           | ✅ Pass |    5.14s | —       |
| MangaSushi  | getSearchResults: native continuation                                                  | ✅ Pass |    1.41s | —       |
| MangaSushi  | getSearchResults: genuine empty query terminates                                       | ✅ Pass |    0.61s | —       |
| MangaSushi  | advanced search: actual taxonomy and native options                                    | ✅ Pass |    1.22s | —       |
| MangaSushi  | getDiscoverSectionItems: cold-cache default exactly mirrors eligible site rows         | ✅ Pass |    3.69s | —       |
| MangaSushi  | settings: pending native discovery batch is invalidated                                | ✅ Pass |    0.88s | —       |
| MangaSushi  | settings: explicit opt-out and finite Popular fidelity                                 | ✅ Pass |    1.46s | —       |
| MangaSushi  | getDiscoverSectionItems: What's New native load more                                   | ✅ Pass |    2.01s | —       |
| MangaSushi  | catalog: editorial posts are not manga even with exclusions off                        | ✅ Pass |    1.02s | —       |
| MangaSushi  | getMangaDetails: original title and alternatives                                       | ✅ Pass |    0.25s | —       |
| MangaSushi  | getChapters: asynchronous full list and decimal labels                                 | ✅ Pass |    1.33s | —       |
| MangaSushi  | getChapterDetails: exact ordered lazy pages                                            | ✅ Pass |    2.79s | —       |
| MangaSushi  | reader: duplicate pages and page-order gaps fail closed                                | ✅ Pass |    0.22s | —       |
| MangaSushi  | getChapterDetails: second chapter pages                                                | ✅ Pass |    0.46s | —       |
| MangaSushi  | settings: stale library and cached metadata cannot bypass exclusion                    | ✅ Pass |   10.61s | —       |
| MangaSushi  | settings: pending permissive response cannot survive exclusion switch                  | ✅ Pass |    2.71s | —       |
| MangaSushi  | getSearchResults: all-filtered native pages reach real end                             | ✅ Pass |    0.73s | —       |
| MangaSushi  | catalog: malformed response fails closed                                               | ✅ Pass |    0.00s | —       |
| ManhwaNex   | initialisation and persistent safe defaults                                            | ✅ Pass |    0.04s | —       |
| ManhwaNex   | discovery: exact native section names and order                                        | ✅ Pass |    1.06s | —       |
| ManhwaNex   | discovery: two cold requests and zero warm without per-card lookups                    | ✅ Pass |    2.54s | —       |
| ManhwaNex   | discovery: native page-two order and fixed Popular carousel                            | ✅ Pass |    1.74s | —       |
| ManhwaNex   | search: only the actually advertised Relevance sort                                    | ✅ Pass |    0.99s | —       |
| ManhwaNex   | search: exact native order, pagination and no-result termination                       | ✅ Pass |    1.74s | —       |
| ManhwaNex   | search: source title and punctuation are forwarded unchanged                           | ✅ Pass |    0.80s | —       |
| ManhwaNex   | advanced search: all actual genre and status choices                                   | ✅ Pass |    0.26s | —       |
| ManhwaNex   | advanced search: every native genre, condition and status is exercised                 | ✅ Pass |    7.30s | —       |
| ManhwaNex   | advanced search: author, artist, release and adult semantics                           | ✅ Pass |    4.03s | —       |
| ManhwaNex   | search: numeric-author redirect fails visibly and long titles retain native semantics  | ✅ Pass |    1.13s | —       |
| ManhwaNex   | classification: unknown and conflicting source labels fail closed                      | ✅ Pass |    0.59s | —       |
| ManhwaNex   | details: canonical identity, whole aliases and full metadata                           | ✅ Pass |    0.33s | —       |
| ManhwaNex   | chapters: complete public AJAX list, exact persisted reference and volume zero         | ✅ Pass |    0.84s | —       |
| ManhwaNex   | reader: persisted newest, oldest and decimal chapters with actual endpoint image bytes | ✅ Pass |    0.80s | —       |
| ManhwaNex   | reader: cold persisted inputs for two other native titles                              | ✅ Pass |    2.50s | —       |
| ManhwaNex   | reader guards: malformed IDs, foreign assets and exact chapter identity                | ✅ Pass |    0.15s | —       |
| ManhwaNex   | chapter subtitles: only redundant complete matching prefixes disappear                 | ✅ Pass |    0.00s | —       |
| ManhwaNex   | chapters: real volume survives independently of leading chapter-title cleanup          | ✅ Pass |    0.18s | —       |
| ManhwaNex   | classification: unknown live-response metadata blocks all native entry points          | ✅ Pass |    3.34s | —       |
| ManhwaNex   | settings: opt-out is persistent, reset and issued-image invalidation                   | ✅ Pass |    1.28s | —       |
| ManhwaNex   | reader authorization: persisted restart, settings change, unknown and evicted URLs     | ✅ Pass |    1.34s | —       |
| ManhwaNex   | settings race: stale in-flight discovery cannot repopulate cache                       | ✅ Pass |    1.16s | —       |
| VortexScans | initialisation                                                                         | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSections                                                                    | ✅ Pass |    0.01s | —       |
| VortexScans | getSortingOptions                                                                      | ✅ Pass |    0.00s | —       |
| VortexScans | getSearchResults                                                                       | ✅ Pass |    6.81s | —       |
| VortexScans | getMangaDetails                                                                        | ✅ Pass |    5.75s | —       |
| VortexScans | getChapters                                                                            | ✅ Pass |    0.24s | —       |
| VortexScans | getChapterDetails                                                                      | ✅ Pass |    0.40s | —       |
| VortexScans | getDiscoverSectionItems: popular-today                                                 | ✅ Pass |    0.67s | —       |
| VortexScans | getDiscoverSectionItems: latest-releases                                               | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSectionItems: collections                                                   | ✅ Pass |    0.23s | —       |
| VortexScans | getDiscoverSectionItems: most-popular                                                  | ✅ Pass |    0.29s | —       |
| VortexScans | getDiscoverSectionItems: genres                                                        | ✅ Pass |    0.19s | —       |

</details>

<details>
<summary>Recent checks (last 24 runs)</summary>

| Checked (UTC)           | Hijala       | Kagane  | MangaSushi   | ManhwaNex    | VortexScans | Run                                                                                       |
| ----------------------- | ------------ | ------- | ------------ | ------------ | ----------- | ----------------------------------------------------------------------------------------- |
| 2026-10-15 05:10:14 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38685134771) |
| 2026-10-15 04:51:12 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38683461628) |
| 2026-10-15 04:40:33 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38682553981) |
| 2026-10-15 03:27:14 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38676207727) |
| 2026-10-15 02:51:40 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38673070170) |
| 2026-10-15 02:31:45 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38671316621) |
| 2026-10-15 02:10:15 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38669433234) |
| 2026-10-15 01:42:52 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38666994881) |
| 2026-10-15 00:01:10 UTC | ✅ Pass      | ✅ Pass | — Not tested | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38657461826) |
| 2026-10-14 23:12:33 UTC | ❌ Fail      | ❌ Fail | — Not tested | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38652543587) |
| 2026-10-14 19:21:25 UTC | ✅ Pass      | ❌ Fail | — Not tested | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38622841691) |
| 2026-10-14 15:06:38 UTC | ✅ Pass      | ✅ Pass | — Not tested | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38586304918) |
| 2026-10-14 10:10:01 UTC | ✅ Pass      | ✅ Pass | — Not tested | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38547554906) |
| 2026-10-14 05:38:08 UTC | ✅ Pass      | ✅ Pass | — Not tested | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38517624246) |
| 2026-10-14 04:11:07 UTC | — Not tested | ✅ Pass | — Not tested | — Not tested | ✅ Pass     | Local verification                                                                        |
| 2026-10-14 04:00:47 UTC | — Not tested | ✅ Pass | — Not tested | — Not tested | ✅ Pass     | Local verification                                                                        |

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

Mangasushi uses the website's Popular Series slider and What's New feed, including
native load-more pagination. Its search mirrors the seven website sorts and the
actual genre OR/AND, author, artist, release year, adult-content and status filters.
The two verified donation/recruitment announcement posts are not treated as manga.

Discovery shares the homepage response and a page-sized native AJAX metadata
request across concurrent sections instead of searching once per title. Short-lived,
setting-keyed caches also avoid repeat requests on warm loads. Exact homepage order,
upstream continuation, explicit-tag exclusions and unknown-title blocking remain
unchanged; titles missing from a batch retain the canonical-ID search fallback.

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

ManhwaNex uses the public website's Popular Series and Latest Updates sections,
canonical releases, native search filters, and reader pages. Homepage metadata is
fetched in one bounded batch, shared by both sections; it does not fetch details
for every card.

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
