## Available Extensions

- VortexScans
- Kagane

## Extension health

Checks run hourly at minute 17 (UTC) after this workflow reaches the default branch.
GitHub may delay scheduled runs. Both extensions are tested against their configured
sites, including `kagane.org`. Click a run link for full logs and downloadable results.

<!-- LIVE_TEST_STATUS:START -->

Last checked: **2026-10-14 04:00:47 UTC** · Local verification
Started: 2026-10-14 03:59:41 UTC

| Extension   | Result  | Passed | Failed | Duration |
| ----------- | ------- | -----: | -----: | -------: |
| Kagane      | ✅ Pass |  12/12 |      0 |    8.15s |
| VortexScans | ✅ Pass |  12/12 |      0 |    9.95s |

<details>
<summary>Test output</summary>

| Extension   | Test                                     | Result  | Duration | Failure |
| ----------- | ---------------------------------------- | ------- | -------: | ------- |
| Kagane      | initialisation                           | ✅ Pass |    0.03s | —       |
| Kagane      | getDiscoverSections                      | ✅ Pass |    0.00s | —       |
| Kagane      | getSortingOptions                        | ✅ Pass |    0.00s | —       |
| Kagane      | getSearchResults                         | ✅ Pass |    4.31s | —       |
| Kagane      | getMangaDetails                          | ✅ Pass |    0.24s | —       |
| Kagane      | getChapters                              | ✅ Pass |    0.28s | —       |
| Kagane      | getChapterDetails                        | ✅ Pass |    0.71s | —       |
| Kagane      | getDiscoverSectionItems: popular         | ✅ Pass |    1.50s | —       |
| Kagane      | getDiscoverSectionItems: trending        | ✅ Pass |    0.00s | —       |
| Kagane      | getDiscoverSectionItems: latest          | ✅ Pass |    0.58s | —       |
| Kagane      | getDiscoverSectionItems: recently-added  | ✅ Pass |    0.48s | —       |
| Kagane      | getDiscoverSectionItems: genres          | ✅ Pass |    0.00s | —       |
| VortexScans | initialisation                           | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSections                      | ✅ Pass |    0.00s | —       |
| VortexScans | getSortingOptions                        | ✅ Pass |    0.00s | —       |
| VortexScans | getSearchResults                         | ✅ Pass |    5.45s | —       |
| VortexScans | getMangaDetails                          | ✅ Pass |    3.10s | —       |
| VortexScans | getChapters                              | ✅ Pass |    0.17s | —       |
| VortexScans | getChapterDetails                        | ✅ Pass |    0.28s | —       |
| VortexScans | getDiscoverSectionItems: popular-today   | ✅ Pass |    0.39s | —       |
| VortexScans | getDiscoverSectionItems: latest-releases | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSectionItems: collections     | ✅ Pass |    0.16s | —       |
| VortexScans | getDiscoverSectionItems: most-popular    | ✅ Pass |    0.22s | —       |
| VortexScans | getDiscoverSectionItems: genres          | ✅ Pass |    0.17s | —       |

</details>

<details>
<summary>Recent checks (last 24 runs)</summary>

| Checked (UTC)           | Kagane  | VortexScans | Run                |
| ----------------------- | ------- | ----------- | ------------------ |
| 2026-10-14 04:00:47 UTC | ✅ Pass | ✅ Pass     | Local verification |

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

`npm test` checks TypeScript, lint, formatting, and bundles both extensions.
Paperback's live tests are separate and require working source websites:

```sh
docker compose up -d --build --wait --wait-timeout 90
npm run test:extensions
```

The suites exercise initialisation, sorting, search, manga details, chapters,
nonempty chapter page URLs, and every discover section. Results are written to
`bundles/live-test-results.json`. The runner returns a nonzero exit code for a
failed or missing suite; Paperback CLI alpha.92 itself reports failures but exits
successfully.

To test a single extension:

```sh
npm run test:extensions -- VortexScans
npm run test:extensions -- Kagane
```

Kagane uses `kagane.org` because the previous `.to` domain is unavailable.
Returned cover/page URLs are checked for structure, but images are not downloaded.

The test bridge warms source origins through FlareSolverr and reuses its browser
user agent and cookies for API requests. It retries a Cloudflare/vShield challenge
once through the browser. This supplements the toolchain's Node polyfill, which
does not implement Paperback's WebView bypass. It does not validate the app's
WebView or extension bypass callbacks. Set `FLARESOLVERR_URL` to use another
instance; the default is `http://127.0.0.1:8191`.

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
