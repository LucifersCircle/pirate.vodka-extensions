## Available Extensions

- Hijala
- VortexScans
- Kagane
- Mangasushi

## Extension health

All extensions are checked every 30 minutes at minutes 17 and 47 (UTC), and on
relevant source or configuration pushes to `0.9/stable`. Click a run link for full
logs and downloadable results.

<!-- LIVE_TEST_STATUS:START -->

Last checked: **2026-10-15 02:51:40 UTC** · [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38673070170)
Started: 2026-10-15 02:50:06 UTC
Tested commit: `7b7b6fb`

| Extension   | Result  | Passed | Failed | Duration |
| ----------- | ------- | -----: | -----: | -------: |
| Hijala      | ✅ Pass |  14/14 |      0 |    6.08s |
| Kagane      | ✅ Pass |  12/12 |      0 |   18.31s |
| MangaSushi  | ✅ Pass |  32/32 |      0 |   61.09s |
| VortexScans | ✅ Pass |  12/12 |      0 |   11.07s |

<details>
<summary>Test output</summary>

| Extension   | Test                                                                                 | Result  | Duration | Failure |
| ----------- | ------------------------------------------------------------------------------------ | ------- | -------: | ------- |
| Hijala      | initialisation                                                                       | ✅ Pass |    0.07s | —       |
| Hijala      | getDiscoverSections                                                                  | ✅ Pass |    0.01s | —       |
| Hijala      | getSortingOptions                                                                    | ✅ Pass |    0.00s | —       |
| Hijala      | getSearchResults                                                                     | ✅ Pass |    0.64s | —       |
| Hijala      | getMangaDetails                                                                      | ✅ Pass |    0.98s | —       |
| Hijala      | getChapters                                                                          | ✅ Pass |    1.16s | —       |
| Hijala      | getChapterDetails                                                                    | ✅ Pass |    0.43s | —       |
| Hijala      | getDiscoverSectionItems: featured                                                    | ✅ Pass |    0.51s | —       |
| Hijala      | getDiscoverSectionItems: latest                                                      | ✅ Pass |    0.43s | —       |
| Hijala      | getDiscoverSectionItems: hot                                                         | ✅ Pass |    0.22s | —       |
| Hijala      | getDiscoverSectionItems: new                                                         | ✅ Pass |    0.22s | —       |
| Hijala      | getDiscoverSectionItems: popular                                                     | ✅ Pass |    0.22s | —       |
| Hijala      | getDiscoverSectionItems: updates                                                     | ✅ Pass |    0.56s | —       |
| Hijala      | getDiscoverSectionItems: genres                                                      | ✅ Pass |    0.66s | —       |
| Kagane      | initialisation                                                                       | ✅ Pass |    0.06s | —       |
| Kagane      | getDiscoverSections                                                                  | ✅ Pass |    0.01s | —       |
| Kagane      | getSortingOptions                                                                    | ✅ Pass |    0.00s | —       |
| Kagane      | getSearchResults                                                                     | ✅ Pass |   14.92s | —       |
| Kagane      | getMangaDetails                                                                      | ✅ Pass |    0.20s | —       |
| Kagane      | getChapters                                                                          | ✅ Pass |    0.79s | —       |
| Kagane      | getChapterDetails                                                                    | ✅ Pass |    0.43s | —       |
| Kagane      | getDiscoverSectionItems: popular                                                     | ✅ Pass |    1.25s | —       |
| Kagane      | getDiscoverSectionItems: trending                                                    | ✅ Pass |    0.00s | —       |
| Kagane      | getDiscoverSectionItems: latest                                                      | ✅ Pass |    0.29s | —       |
| Kagane      | getDiscoverSectionItems: recently-added                                              | ✅ Pass |    0.36s | —       |
| Kagane      | getDiscoverSectionItems: genres                                                      | ✅ Pass |    0.00s | —       |
| MangaSushi  | initialisation                                                                       | ✅ Pass |    0.03s | —       |
| MangaSushi  | getDiscoverSections: native section order                                            | ✅ Pass |    0.01s | —       |
| MangaSushi  | getSortingOptions: all seven site sorts                                              | ✅ Pass |    1.26s | —       |
| MangaSushi  | getSearchResults: native adult filter plus genre safety                              | ✅ Pass |    1.56s | —       |
| MangaSushi  | getSearchResults: displayed smart punctuation resolves by exact ID                   | ✅ Pass |    0.62s | —       |
| MangaSushi  | getMangaDetails: full canonical metadata                                             | ✅ Pass |    0.00s | —       |
| MangaSushi  | getMangaDetails: unknown classification is blocked by default                        | ✅ Pass |    0.85s | —       |
| MangaSushi  | getChapters and reader: accessible with default exclusion                            | ✅ Pass |    1.29s | —       |
| MangaSushi  | getChapters and reader: cold-cache persisted records across three safe titles        | ✅ Pass |    7.38s | —       |
| MangaSushi  | getChapters and reader: Lonely Attack canonical underscore chapter IDs               | ✅ Pass |    3.26s | —       |
| MangaSushi  | English titles: exact source aliases keep original titles, full alternatives and IDs | ✅ Pass |   12.70s | —       |
| MangaSushi  | English titles: Japanese-only alternatives retain the source title                   | ✅ Pass |    1.40s | —       |
| MangaSushi  | English titles: cold classification still queries the original source title          | ✅ Pass |    0.63s | —       |
| MangaSushi  | English titles: removing an alias from live metadata restores original display       | ✅ Pass |    1.01s | —       |
| MangaSushi  | getSearchResults: every native sort executes                                         | ✅ Pass |    6.44s | —       |
| MangaSushi  | getSearchResults: native continuation                                                | ✅ Pass |    1.49s | —       |
| MangaSushi  | getSearchResults: genuine empty query terminates                                     | ✅ Pass |    0.41s | —       |
| MangaSushi  | advanced search: actual taxonomy and native options                                  | ✅ Pass |    2.39s | —       |
| MangaSushi  | getDiscoverSectionItems: cold-cache default exactly mirrors eligible site rows       | ✅ Pass |    3.02s | —       |
| MangaSushi  | settings: pending native discovery batch is invalidated                              | ✅ Pass |    0.77s | —       |
| MangaSushi  | settings: explicit opt-out and finite Popular fidelity                               | ✅ Pass |    1.50s | —       |
| MangaSushi  | getDiscoverSectionItems: What's New native load more                                 | ✅ Pass |    1.98s | —       |
| MangaSushi  | catalog: editorial posts are not manga even with exclusions off                      | ✅ Pass |    1.24s | —       |
| MangaSushi  | getMangaDetails: original title and alternatives                                     | ✅ Pass |    0.14s | —       |
| MangaSushi  | getChapters: asynchronous full list and decimal labels                               | ✅ Pass |    1.26s | —       |
| MangaSushi  | getChapterDetails: exact ordered lazy pages                                          | ✅ Pass |    0.73s | —       |
| MangaSushi  | reader: duplicate pages and page-order gaps fail closed                              | ✅ Pass |    0.16s | —       |
| MangaSushi  | getChapterDetails: second chapter pages                                              | ✅ Pass |    0.28s | —       |
| MangaSushi  | settings: stale library and cached metadata cannot bypass exclusion                  | ✅ Pass |    4.14s | —       |
| MangaSushi  | settings: pending permissive response cannot survive exclusion switch                | ✅ Pass |    1.53s | —       |
| MangaSushi  | getSearchResults: all-filtered native pages reach real end                           | ✅ Pass |    1.61s | —       |
| MangaSushi  | catalog: malformed response fails closed                                             | ✅ Pass |    0.00s | —       |
| VortexScans | initialisation                                                                       | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSections                                                                  | ✅ Pass |    0.01s | —       |
| VortexScans | getSortingOptions                                                                    | ✅ Pass |    0.00s | —       |
| VortexScans | getSearchResults                                                                     | ✅ Pass |    4.77s | —       |
| VortexScans | getMangaDetails                                                                      | ✅ Pass |    4.60s | —       |
| VortexScans | getChapters                                                                          | ✅ Pass |    0.27s | —       |
| VortexScans | getChapterDetails                                                                    | ✅ Pass |    0.27s | —       |
| VortexScans | getDiscoverSectionItems: popular-today                                               | ✅ Pass |    0.74s | —       |
| VortexScans | getDiscoverSectionItems: latest-releases                                             | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSectionItems: collections                                                 | ✅ Pass |    0.13s | —       |
| VortexScans | getDiscoverSectionItems: most-popular                                                | ✅ Pass |    0.15s | —       |
| VortexScans | getDiscoverSectionItems: genres                                                      | ✅ Pass |    0.14s | —       |

</details>

<details>
<summary>Recent checks (last 24 runs)</summary>

| Checked (UTC)           | Hijala       | Kagane  | MangaSushi   | VortexScans | Run                                                                                       |
| ----------------------- | ------------ | ------- | ------------ | ----------- | ----------------------------------------------------------------------------------------- |
| 2026-10-15 02:51:40 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38673070170) |
| 2026-10-15 02:31:45 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38671316621) |
| 2026-10-15 02:10:15 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38669433234) |
| 2026-10-15 01:42:52 UTC | ✅ Pass      | ✅ Pass | ✅ Pass      | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38666994881) |
| 2026-10-15 00:01:10 UTC | ✅ Pass      | ✅ Pass | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38657461826) |
| 2026-10-14 23:12:33 UTC | ❌ Fail      | ❌ Fail | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38652543587) |
| 2026-10-14 19:21:25 UTC | ✅ Pass      | ❌ Fail | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38622841691) |
| 2026-10-14 15:06:38 UTC | ✅ Pass      | ✅ Pass | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38586304918) |
| 2026-10-14 10:10:01 UTC | ✅ Pass      | ✅ Pass | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38547554906) |
| 2026-10-14 05:38:08 UTC | ✅ Pass      | ✅ Pass | — Not tested | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38517624246) |
| 2026-10-14 04:11:07 UTC | — Not tested | ✅ Pass | — Not tested | ✅ Pass     | Local verification                                                                        |
| 2026-10-14 04:00:47 UTC | — Not tested | ✅ Pass | — Not tested | ✅ Pass     | Local verification                                                                        |

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
