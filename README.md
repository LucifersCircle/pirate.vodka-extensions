## Available Extensions

- Hijala
- VortexScans
- Kagane

## Extension health

All extensions are checked every 30 minutes at minutes 17 and 47 (UTC), and on
relevant source or configuration pushes to `0.9/stable`. Click a run link for full
logs and downloadable results.

<!-- LIVE_TEST_STATUS:START -->

Last checked: **2026-10-15 00:01:10 UTC** · [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38657461826)
Started: 2026-10-15 00:00:21 UTC
Tested commit: `f66bfe9`

| Extension   | Result  | Passed | Failed | Duration |
| ----------- | ------- | -----: | -----: | -------: |
| Hijala      | ✅ Pass |  14/14 |      0 |    4.72s |
| Kagane      | ✅ Pass |  12/12 |      0 |   11.26s |
| VortexScans | ✅ Pass |  12/12 |      0 |   16.97s |

<details>
<summary>Test output</summary>

| Extension   | Test                                     | Result  | Duration | Failure |
| ----------- | ---------------------------------------- | ------- | -------: | ------- |
| Hijala      | initialisation                           | ✅ Pass |    0.03s | —       |
| Hijala      | getDiscoverSections                      | ✅ Pass |    0.00s | —       |
| Hijala      | getSortingOptions                        | ✅ Pass |    0.00s | —       |
| Hijala      | getSearchResults                         | ✅ Pass |    0.50s | —       |
| Hijala      | getMangaDetails                          | ✅ Pass |    0.88s | —       |
| Hijala      | getChapters                              | ✅ Pass |    0.52s | —       |
| Hijala      | getChapterDetails                        | ✅ Pass |    0.28s | —       |
| Hijala      | getDiscoverSectionItems: featured        | ✅ Pass |    0.34s | —       |
| Hijala      | getDiscoverSectionItems: latest          | ✅ Pass |    0.51s | —       |
| Hijala      | getDiscoverSectionItems: hot             | ✅ Pass |    0.28s | —       |
| Hijala      | getDiscoverSectionItems: new             | ✅ Pass |    0.27s | —       |
| Hijala      | getDiscoverSectionItems: popular         | ✅ Pass |    0.24s | —       |
| Hijala      | getDiscoverSectionItems: updates         | ✅ Pass |    0.26s | —       |
| Hijala      | getDiscoverSectionItems: genres          | ✅ Pass |    0.63s | —       |
| Kagane      | initialisation                           | ✅ Pass |    0.02s | —       |
| Kagane      | getDiscoverSections                      | ✅ Pass |    0.00s | —       |
| Kagane      | getSortingOptions                        | ✅ Pass |    0.00s | —       |
| Kagane      | getSearchResults                         | ✅ Pass |    7.42s | —       |
| Kagane      | getMangaDetails                          | ✅ Pass |    0.25s | —       |
| Kagane      | getChapters                              | ✅ Pass |    0.83s | —       |
| Kagane      | getChapterDetails                        | ✅ Pass |    0.53s | —       |
| Kagane      | getDiscoverSectionItems: popular         | ✅ Pass |    1.53s | —       |
| Kagane      | getDiscoverSectionItems: trending        | ✅ Pass |    0.00s | —       |
| Kagane      | getDiscoverSectionItems: latest          | ✅ Pass |    0.34s | —       |
| Kagane      | getDiscoverSectionItems: recently-added  | ✅ Pass |    0.33s | —       |
| Kagane      | getDiscoverSectionItems: genres          | ✅ Pass |    0.00s | —       |
| VortexScans | initialisation                           | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSections                      | ✅ Pass |    0.00s | —       |
| VortexScans | getSortingOptions                        | ✅ Pass |    0.00s | —       |
| VortexScans | getSearchResults                         | ✅ Pass |   13.40s | —       |
| VortexScans | getMangaDetails                          | ✅ Pass |    2.12s | —       |
| VortexScans | getChapters                              | ✅ Pass |    0.17s | —       |
| VortexScans | getChapterDetails                        | ✅ Pass |    0.32s | —       |
| VortexScans | getDiscoverSectionItems: popular-today   | ✅ Pass |    0.41s | —       |
| VortexScans | getDiscoverSectionItems: latest-releases | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSectionItems: collections     | ✅ Pass |    0.16s | —       |
| VortexScans | getDiscoverSectionItems: most-popular    | ✅ Pass |    0.21s | —       |
| VortexScans | getDiscoverSectionItems: genres          | ✅ Pass |    0.16s | —       |

</details>

<details>
<summary>Recent checks (last 24 runs)</summary>

| Checked (UTC)           | Hijala       | Kagane  | VortexScans | Run                                                                                       |
| ----------------------- | ------------ | ------- | ----------- | ----------------------------------------------------------------------------------------- |
| 2026-10-15 00:01:10 UTC | ✅ Pass      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38657461826) |
| 2026-10-14 23:12:33 UTC | ❌ Fail      | ❌ Fail | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38652543587) |
| 2026-10-14 19:21:25 UTC | ✅ Pass      | ❌ Fail | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38622841691) |
| 2026-10-14 15:06:38 UTC | ✅ Pass      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38586304918) |
| 2026-10-14 10:10:01 UTC | ✅ Pass      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38547554906) |
| 2026-10-14 05:38:08 UTC | ✅ Pass      | ✅ Pass | ✅ Pass     | [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38517624246) |
| 2026-10-14 04:11:07 UTC | — Not tested | ✅ Pass | ✅ Pass     | Local verification                                                                        |
| 2026-10-14 04:00:47 UTC | — Not tested | ✅ Pass | ✅ Pass     | Local verification                                                                        |

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
```

Returned cover/page URLs are checked for structure, but images are not downloaded.

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
