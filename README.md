## Available Extensions

- VortexScans
- Kagane

## Extension health

Checks run hourly at minute 17 (UTC) after this workflow reaches the default branch.
GitHub may delay scheduled runs. Both extensions are tested against their configured
sites, including `kagane.org`. Click a run link for full logs and downloadable results.

<!-- LIVE_TEST_STATUS:START -->

Last checked: **2026-10-14 04:11:07 UTC** · Local verification

| Extension   | Result  | Passed | Failed | Duration |
| ----------- | ------- | -----: | -----: | -------: |
| Kagane      | ✅ Pass |  12/12 |      0 |   11.37s |
| VortexScans | ✅ Pass |  12/12 |      0 |   10.27s |

<details>
<summary>Test output</summary>

| Extension   | Test                                     | Result  | Duration | Failure |
| ----------- | ---------------------------------------- | ------- | -------: | ------- |
| Kagane      | initialisation                           | ✅ Pass |    0.06s | —       |
| Kagane      | getDiscoverSections                      | ✅ Pass |    0.01s | —       |
| Kagane      | getSortingOptions                        | ✅ Pass |    0.00s | —       |
| Kagane      | getSearchResults                         | ✅ Pass |    5.33s | —       |
| Kagane      | getMangaDetails                          | ✅ Pass |    1.63s | —       |
| Kagane      | getChapters                              | ✅ Pass |    0.46s | —       |
| Kagane      | getChapterDetails                        | ✅ Pass |    0.82s | —       |
| Kagane      | getDiscoverSectionItems: popular         | ✅ Pass |    2.40s | —       |
| Kagane      | getDiscoverSectionItems: trending        | ✅ Pass |    0.00s | —       |
| Kagane      | getDiscoverSectionItems: latest          | ✅ Pass |    0.33s | —       |
| Kagane      | getDiscoverSectionItems: recently-added  | ✅ Pass |    0.32s | —       |
| Kagane      | getDiscoverSectionItems: genres          | ✅ Pass |    0.00s | —       |
| VortexScans | initialisation                           | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSections                      | ✅ Pass |    0.01s | —       |
| VortexScans | getSortingOptions                        | ✅ Pass |    0.01s | —       |
| VortexScans | getSearchResults                         | ✅ Pass |    4.72s | —       |
| VortexScans | getMangaDetails                          | ✅ Pass |    3.47s | —       |
| VortexScans | getChapters                              | ✅ Pass |    0.23s | —       |
| VortexScans | getChapterDetails                        | ✅ Pass |    0.43s | —       |
| VortexScans | getDiscoverSectionItems: popular-today   | ✅ Pass |    0.76s | —       |
| VortexScans | getDiscoverSectionItems: latest-releases | ✅ Pass |    0.00s | —       |
| VortexScans | getDiscoverSectionItems: collections     | ✅ Pass |    0.18s | —       |
| VortexScans | getDiscoverSectionItems: most-popular    | ✅ Pass |    0.24s | —       |
| VortexScans | getDiscoverSectionItems: genres          | ✅ Pass |    0.21s | —       |

</details>

<details>
<summary>Recent checks (last 24 runs)</summary>

| Checked (UTC)           | Kagane  | VortexScans | Run                |
| ----------------------- | ------- | ----------- | ------------------ |
| 2026-10-14 04:11:07 UTC | ✅ Pass | ✅ Pass     | Local verification |
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

The test bridge warms source origins through FlareSolverr. Kagane API requests run
inside its Chromium session because Cloudflare challenges Node's network stack on
GitHub-hosted runners even when browser cookies are supplied. The local test image
adds `/browser/request` to preserve JSON POST bodies, headers, and response status
codes. VortexScans reuses browser cookies and its user agent with Node fetch. The
bridge retries a Cloudflare/vShield challenge once. This supplements the Node polyfill, which
does not implement Paperback's WebView bypass. It does not validate the app's
WebView or extension bypass callbacks. Set `FLARESOLVERR_URL` to use another
instance of this test image; the default is `http://127.0.0.1:8191`.

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
