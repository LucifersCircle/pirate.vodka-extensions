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

Last checked: **2026-10-21 01:00:21 UTC** · [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39524594716)
Live scope: all; 8/8 sources selected; 8 complete reports. Non-PR events run the full live suite
Selected tests: 55/63 passed; 8 failed; 0 Cloudflared; 0 blocked. Cloudflared and blocked tests are not verified passes.
Started: 2026-10-21 00:59:12 UTC
Tested commit: `ec147ac`

| Extension   | Result  | Passed | Failed | Cloudflared | Blocked | Duration |
| ----------- | ------- | -----: | -----: | ----------: | ------: | -------: |
| Hijala      | ✅ Pass |    8/8 |      0 |           0 |       0 |   10.07s |
| Kagane      | ✅ Pass |    8/8 |      0 |           0 |       0 |   16.40s |
| MangaStash  | ❌ Fail |    7/8 |      1 |           0 |       0 |    8.37s |
| MangaSushi  | ✅ Pass |    8/8 |      0 |           0 |       0 |   27.80s |
| ManhwaNex   | ❌ Fail |    7/8 |      1 |           0 |       0 |    8.40s |
| Marumaru    | ❌ Fail |    1/7 |      6 |           0 |       0 |    3.16s |
| Noveli      | ✅ Pass |    8/8 |      0 |           0 |       0 |   14.81s |
| VortexScans | ✅ Pass |    8/8 |      0 |           0 |       0 |   17.30s |

<details>
<summary>Test output</summary>

| Extension   | Test                                                               | Result  | Duration | Failure                                                                                    |
| ----------- | ------------------------------------------------------------------ | ------- | -------: | ------------------------------------------------------------------------------------------ |
| Hijala      | 01 initialise and advertised native methods                        | ✅ Pass |    0.19s | —                                                                                          |
| Hijala      | 02 discover schema and one content section                         | ✅ Pass |    4.22s | —                                                                                          |
| Hijala      | 03 search schema, exact title identity and one continuation        | ✅ Pass |    1.53s | —                                                                                          |
| Hijala      | 04 native details identity, schema and complete cover bytes        | ✅ Pass |    1.14s | —                                                                                          |
| Hijala      | 05 complete native chapter inventory, references and order         | ✅ Pass |    1.04s | —                                                                                          |
| Hijala      | 06 native reader identity and real first/last images or novel text | ✅ Pass |    0.83s | —                                                                                          |
| Hijala      | 07 advertised forms, sorts and one representative filter roundtrip | ✅ Pass |    1.13s | —                                                                                          |
| Hijala      | 08 fail-closed ownership/policy guard and request budget           | ✅ Pass |    0.00s | —                                                                                          |
| Kagane      | 01 initialise and advertised native methods                        | ✅ Pass |    0.16s | —                                                                                          |
| Kagane      | 02 discover schema and one content section                         | ✅ Pass |    9.35s | —                                                                                          |
| Kagane      | 03 search schema, exact title identity and one continuation        | ✅ Pass |    1.52s | —                                                                                          |
| Kagane      | 04 native details identity, schema and complete cover bytes        | ✅ Pass |    0.90s | —                                                                                          |
| Kagane      | 05 complete native chapter inventory, references and order         | ✅ Pass |    1.78s | —                                                                                          |
| Kagane      | 06 native reader identity and real first/last images or novel text | ✅ Pass |    1.32s | —                                                                                          |
| Kagane      | 07 advertised forms, sorts and one representative filter roundtrip | ✅ Pass |    1.36s | —                                                                                          |
| Kagane      | 08 fail-closed ownership/policy guard and request budget           | ✅ Pass |    0.00s | —                                                                                          |
| MangaStash  | 01 initialise and advertised native methods                        | ✅ Pass |    0.13s | —                                                                                          |
| MangaStash  | 02 discover schema and one content section                         | ✅ Pass |    1.67s | —                                                                                          |
| MangaStash  | 03 search schema, exact title identity and one continuation        | ✅ Pass |    1.48s | —                                                                                          |
| MangaStash  | 04 native details identity, schema and complete cover bytes        | ✅ Pass |    1.90s | —                                                                                          |
| MangaStash  | 05 complete native chapter inventory, references and order         | ✅ Pass |    0.11s | —                                                                                          |
| MangaStash  | 06 native reader identity and real first/last images or novel text | ❌ Fail |    1.08s | Error: Invalid MangaStash URL.                                                             |
| MangaStash  | 07 advertised forms, sorts and one representative filter roundtrip | ✅ Pass |    1.99s | —                                                                                          |
| MangaStash  | 08 fail-closed ownership/policy guard and request budget           | ✅ Pass |    0.00s | —                                                                                          |
| MangaSushi  | 01 initialise and advertised native methods                        | ✅ Pass |    0.11s | —                                                                                          |
| MangaSushi  | 02 discover schema and one content section                         | ✅ Pass |    4.87s | —                                                                                          |
| MangaSushi  | 03 search schema, exact title identity and one continuation        | ✅ Pass |    3.27s | —                                                                                          |
| MangaSushi  | 04 native details identity, schema and complete cover bytes        | ✅ Pass |    0.45s | —                                                                                          |
| MangaSushi  | 05 complete native chapter inventory, references and order         | ✅ Pass |    6.67s | —                                                                                          |
| MangaSushi  | 06 native reader identity and real first/last images or novel text | ✅ Pass |    1.18s | —                                                                                          |
| MangaSushi  | 07 advertised forms, sorts and one representative filter roundtrip | ✅ Pass |   11.26s | —                                                                                          |
| MangaSushi  | 08 fail-closed ownership/policy guard and request budget           | ✅ Pass |    0.00s | —                                                                                          |
| ManhwaNex   | 01 initialise and advertised native methods                        | ✅ Pass |    0.08s | —                                                                                          |
| ManhwaNex   | 02 discover schema and one content section                         | ✅ Pass |    3.24s | —                                                                                          |
| ManhwaNex   | 03 search schema, exact title identity and one continuation        | ✅ Pass |    0.65s | —                                                                                          |
| ManhwaNex   | 04 native details identity, schema and complete cover bytes        | ✅ Pass |    0.34s | —                                                                                          |
| ManhwaNex   | 05 complete native chapter inventory, references and order         | ✅ Pass |    0.71s | —                                                                                          |
| ManhwaNex   | 06 native reader identity and real first/last images or novel text | ❌ Fail |    1.17s | TypeError: fetch failed                                                                    |
| ManhwaNex   | 07 advertised forms, sorts and one representative filter roundtrip | ✅ Pass |    2.23s | —                                                                                          |
| ManhwaNex   | 08 fail-closed ownership/policy guard and request budget           | ✅ Pass |    0.00s | —                                                                                          |
| Marumaru    | 01 initialise and advertised native methods                        | ✅ Pass |    0.06s | —                                                                                          |
| Marumaru    | 02 discover schema and one content section                         | ❌ Fail |    0.42s | Error: Marumaru response redirected.                                                       |
| Marumaru    | 03 search schema, exact title identity and one continuation        | ❌ Fail |    2.68s | Error: Marumaru response redirected.                                                       |
| Marumaru    | 04 native details identity, schema and complete cover bytes        | ❌ Fail |    0.00s | AssertionError: search prerequisite: expected undefined to not equal undefined             |
| Marumaru    | 05 complete native chapter inventory, references and order         | ❌ Fail |    0.00s | AssertionError: details prerequisite: expected undefined to not equal undefined            |
| Marumaru    | 06 native reader identity and real first/last images or novel text | ❌ Fail |    0.00s | AssertionError: complete inventory prerequisite: expected undefined to not equal undefined |
| Marumaru    | 08 fail-closed ownership/policy guard and request budget           | ❌ Fail |    0.00s | AssertionError: expected undefined to not equal undefined                                  |
| Noveli      | 01 initialise and advertised native methods                        | ✅ Pass |    0.03s | —                                                                                          |
| Noveli      | 02 discover schema and one content section                         | ✅ Pass |    8.72s | —                                                                                          |
| Noveli      | 03 search schema, exact title identity and one continuation        | ✅ Pass |    2.39s | —                                                                                          |
| Noveli      | 04 native details identity, schema and complete cover bytes        | ✅ Pass |    0.45s | —                                                                                          |
| Noveli      | 05 complete native chapter inventory, references and order         | ✅ Pass |    1.45s | —                                                                                          |
| Noveli      | 06 native reader identity and real first/last images or novel text | ✅ Pass |    0.41s | —                                                                                          |
| Noveli      | 07 advertised forms, sorts and one representative filter roundtrip | ✅ Pass |    1.33s | —                                                                                          |
| Noveli      | 08 fail-closed ownership/policy guard and request budget           | ✅ Pass |    0.04s | —                                                                                          |
| VortexScans | 01 initialise and advertised native methods                        | ✅ Pass |    0.00s | —                                                                                          |
| VortexScans | 02 discover schema and one content section                         | ✅ Pass |    9.74s | —                                                                                          |
| VortexScans | 03 search schema, exact title identity and one continuation        | ✅ Pass |    4.82s | —                                                                                          |
| VortexScans | 04 native details identity, schema and complete cover bytes        | ✅ Pass |    0.81s | —                                                                                          |
| VortexScans | 05 complete native chapter inventory, references and order         | ✅ Pass |    0.18s | —                                                                                          |
| VortexScans | 06 native reader identity and real first/last images or novel text | ✅ Pass |    1.33s | —                                                                                          |
| VortexScans | 07 advertised forms, sorts and one representative filter roundtrip | ✅ Pass |    0.40s | —                                                                                          |
| VortexScans | 08 fail-closed ownership/policy guard and request budget           | ✅ Pass |    0.03s | —                                                                                          |

</details>

<details>
<summary>Recent checks (last 24 runs)</summary>

| Checked (UTC)           | Hijala  | Kagane  | MangaStash | MangaSushi | ManhwaNex | Marumaru     | Noveli  | VortexScans | Run                                                                                       |
| ----------------------- | ------- | ------- | ---------- | ---------- | --------- | ------------ | ------- | ----------- | ----------------------------------------------------------------------------------------- |
| 2026-10-21 01:00:21 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ❌ Fail   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39524594716) |
| 2026-10-20 22:41:23 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39509825284) |
| 2026-10-20 19:36:54 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39484817202) |
| 2026-10-20 15:23:54 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ❌ Fail    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39447856500) |
| 2026-10-20 10:26:59 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39407897154) |
| 2026-10-20 05:22:02 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39374402583) |
| 2026-10-20 00:45:58 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ❌ Fail | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39349237659) |
| 2026-10-19 21:46:03 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ❌ Fail   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39329918274) |
| 2026-10-19 17:34:32 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39295138851) |
| 2026-10-19 11:17:55 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ❌ Fail   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39243504241) |
| 2026-10-19 05:22:23 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ❌ Fail   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39204108317) |
| 2026-10-19 00:32:09 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39181114225) |
| 2026-10-18 22:38:09 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ❌ Fail | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39173016536) |
| 2026-10-18 20:44:07 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39164558471) |
| 2026-10-18 18:06:38 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39152570574) |
| 2026-10-18 14:52:46 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39137878832) |
| 2026-10-18 11:45:31 UTC | ✅ Pass | ✅ Pass | ❌ Fail    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39124455532) |
| 2026-10-18 06:37:37 UTC | ✅ Pass | ✅ Pass | ✅ Pass    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39104653894) |
| 2026-10-18 01:33:51 UTC | ✅ Pass | ✅ Pass | ✅ Pass    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39086894404) |
| 2026-10-17 23:30:20 UTC | ✅ Pass | ✅ Pass | ✅ Pass    | ✅ Pass    | ✅ Pass   | ❌ Fail      | ❌ Fail | ❌ Fail     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39079045030) |
| 2026-10-17 21:31:35 UTC | ✅ Pass | ✅ Pass | ✅ Pass    | ✅ Pass    | ✅ Pass   | ✅ Pass      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39071056043) |
| 2026-10-17 18:55:05 UTC | ✅ Pass | ✅ Pass | ✅ Pass    | ✅ Pass    | ✅ Pass   | — Not tested | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39059910875) |
| 2026-10-17 16:29:26 UTC | ✅ Pass | ✅ Pass | ✅ Pass    | ✅ Pass    | ✅ Pass   | — Not tested | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39049427223) |
| 2026-10-17 13:16:43 UTC | ✅ Pass | ✅ Pass | ✅ Pass    | ✅ Pass    | ✅ Pass   | — Not tested | ✅ Pass | ❌ Fail     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/39035679789) |

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
