## Available Extensions

- Hijala
- VortexScans
- Kagane

## Extension health

All extensions are checked hourly at minute 17 (UTC). Click a run link for full
logs and downloadable results.

<!-- LIVE_TEST_STATUS:START -->

Last checked: **2026-10-14 05:38:08 UTC** · [Run](https://github.com/LucifersCircle/pirate.vodka-extensions/actions/runs/38517624246)
Started: 2026-10-14 05:37:28 UTC
Tested commit: `9c3acc4`

| Extension   | Result  | Passed | Failed | Duration |
| ----------- | ------- | -----: | -----: | -------: |
| Hijala      | ✅ Pass |  14/14 |      0 |    4.07s |
| Kagane      | ✅ Pass |  12/12 |      0 |    8.38s |
| VortexScans | ✅ Pass |  12/12 |      0 |    6.78s |

<details>
<summary>Test output</summary>

| Extension   | Test                                     | Result  | Duration | Failure |
| ----------- | ---------------------------------------- | ------- | -------: | ------- |
| Hijala      | initialisation                           | ✅ Pass |    0.03s | —       |
| Hijala      | getDiscoverSections                      | ✅ Pass |    0.00s | —       |
| Hijala      | getSortingOptions                        | ✅ Pass |    0.00s | —       |
| Hijala      | getSearchResults                         | ✅ Pass |    0.45s | —       |
| Hijala      | getMangaDetails                          | ✅ Pass |    0.79s | —       |
| Hijala      | getChapters                              | ✅ Pass |    0.27s | —       |
| Hijala      | getChapterDetails                        | ✅ Pass |    0.25s | —       |
| Hijala      | getDiscoverSectionItems: featured        | ✅ Pass |    0.37s | —       |
| Hijala      | getDiscoverSectionItems: latest          | ✅ Pass |    0.45s | —       |
| Hijala      | getDiscoverSectionItems: hot             | ✅ Pass |    0.46s | —       |
| Hijala      | getDiscoverSectionItems: new             | ✅ Pass |    0.21s | —       |
| Hijala      | getDiscoverSectionItems: popular         | ✅ Pass |    0.19s | —       |
| Hijala      | getDiscoverSectionItems: updates         | ✅ Pass |    0.21s | —       |
| Hijala      | getDiscoverSectionItems: genres          | ✅ Pass |    0.39s | —       |
| Kagane      | initialisation                           | ✅ Pass |    0.02s | —       |
| Kagane      | getDiscoverSections                      | ✅ Pass |    0.00s | —       |
| Kagane      | getSortingOptions                        | ✅ Pass |    0.00s | —       |
| Kagane      | getSearchResults                         | ✅ Pass |    4.19s | —       |
| Kagane      | getMangaDetails                          | ✅ Pass |    0.76s | —       |
| Kagane      | getChapters                              | ✅ Pass |    0.42s | —       |
| Kagane      | getChapterDetails                        | ✅ Pass |    0.49s | —       |
| Kagane      | getDiscoverSectionItems: popular         | ✅ Pass |    1.92s | —       |
| Kagane      | getDiscoverSectionItems: trending        | ✅ Pass |    0.00s | —       |
| Kagane      | getDiscoverSectionItems: latest          | ✅ Pass |    0.29s | —       |
| Kagane      | getDiscoverSectionItems: recently-added  | ✅ Pass |    0.30s | —       |
| Kagane      | getDiscoverSectionItems: genres          | ✅ Pass |    0.00s | —       |
| VortexScans | initialisation                           | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSections                      | ✅ Pass |    0.00s | —       |
| VortexScans | getSortingOptions                        | ✅ Pass |    0.00s | —       |
| VortexScans | getSearchResults                         | ✅ Pass |    2.89s | —       |
| VortexScans | getMangaDetails                          | ✅ Pass |    2.46s | —       |
| VortexScans | getChapters                              | ✅ Pass |    0.15s | —       |
| VortexScans | getChapterDetails                        | ✅ Pass |    0.24s | —       |
| VortexScans | getDiscoverSectionItems: popular-today   | ✅ Pass |    0.36s | —       |
| VortexScans | getDiscoverSectionItems: latest-releases | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSectionItems: collections     | ✅ Pass |    0.17s | —       |
| VortexScans | getDiscoverSectionItems: most-popular    | ✅ Pass |    0.37s | —       |
| VortexScans | getDiscoverSectionItems: genres          | ✅ Pass |    0.15s | —       |

</details>

<details>
<summary>Recent checks (last 24 runs)</summary>

| Checked (UTC)           | Hijala       | Kagane  | VortexScans | Run                                                                                       |
| ----------------------- | ------------ | ------- | ----------- | ----------------------------------------------------------------------------------------- |
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
