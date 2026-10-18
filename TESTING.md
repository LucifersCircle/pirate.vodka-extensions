# Native extension contracts

CI runs the official `@paperback/toolchain` test CLI and the actual `@paperback/types`
interfaces. The runner/logger follows the toolchain-generated alpha.92 test template.
There is no replacement extension, generic application mock, replayed source response,
or separate parser-only acceptance gate.

## Source coverage

Each source registers at most eight semantic contracts:

1. Initialise the source and check every advertised capability's native methods.
2. Check discovery descriptor schemas, then fetch one explicit content section.
3. Check search cards, round-trip one displayed title to the same ID, and consume one
   continuation if the source offers one.
4. Check native manga identity/metadata and download the complete cover image.
5. Check the complete native chapter inventory, its source-issued IDs/order, and the
   exact `SourceManga` reference supplied to `getChapters`.
6. Pass an original returned `Chapter` to the native reader; check its identity and
   manifest plus complete first/last unique image transfers, or actual novel HTML text.
7. Check available settings/filter/sort schemas and perform one native filter change,
   metadata round-trip and search using a returned sort option.
8. Exercise a focused fail-closed policy/ownership guard without live requests and
   enforce the measured request budget.

These are eight actual registered tests, not the previous broad tests renamed as eight
nested groups. Optional missing methods are logged as N/A, never counted as passing.
Marumaru has no advertised controls, so it registers seven tests and a separate source
`notApplicable` record. The eight maintained sources currently total **63 source tests**.
Unsupported advertised capabilities fail. Reporting/discovery/transport infrastructure
regressions run separately under `npm run test:report`; they are not source tests.

The suite reuses native returned objects and captures the responses consumed by native
methods. Completeness checks do not fetch independent duplicate reference pages or
truncate chapter inventories to meet a budget. Tests do not request every discover
section, crawl whole catalogs, mutate every setting, or assert visual styling. The old
breadth suites remain available through Git history for local investigation rather
than in the always-on CI path. No permanent source-fixture layer is maintained.

## Request budget and measured baseline

The target is **12 document/API attempts and 3 image-transfer attempts per source**, including
native bootstrap and inventory requests. A measured, explained exception can allow up
to 20 document/API requests. A source needing more must improve its native sampling or
request reuse, not drop chapters. First and last being the same image costs one transfer.
Noveli reads actual text and needs only the cover image.

Direct official-CLI preflight on 2026-10-17, with ordinary native HTTP transport:

| Source      | Registered tests | Document/API requests | Images |
| ----------- | ---------------: | --------------------: | -----: |
| Hijala      |                8 |                     7 |      3 |
| Kagane      |                8 |                    15 |      3 |
| MangaStash  |                8 |                     5 |      3 |
| MangaSushi  |                8 |                    12 |      3 |
| ManhwaNex   |                8 |                     8 |      3 |
| Marumaru    |                7 |                     6 |      3 |
| Noveli      |                8 |                     8 |      1 |
| VortexScans |                8 |                     8 |      3 |

Kagane's documented 20-request ceiling accounts for taxonomy bootstrap, discovery,
three search calls, details, full chapter index/paging, integrity/reader manifest and
one filter round-trip. The measured fixed canary, The Beginning After the End, has
293 chapters across two native cursor pages and used 15 document attempts. The native
inventory must consume its offered continuation and validate every ID against the
complete index. Its simple discovery list avoids Featured's per-card detail enrichment.
Dynamic catalogs may change these counts, so every run reports actual per-contract and
per-source attempt totals and enforces the ceiling.

Budget fences reject excess attempts before native dispatch, and attempted requests
(including failed or rejected attempts) remain in the counts. Complete inventories are
never accepted partially. The observer is registered before source initialisation and
never moved after production interceptors, preserving the SDK's real final headers.

The report keys are `documentAttempts`, `imageAttempts`, `totalAttempts` and
`blockedAttempts`. A budget-blocked attempt is never mislabeled a completed transfer.
Counts represent calls made through native `Application.scheduleRequest`, including
actual image GETs. The existing optional test transport bridge's own bootstrap traffic
is not hidden inside these numbers or claimed to be device traffic. The direct baseline
above did not need that bridge. Failed runs and access prerequisites remain failures;
no substitute payload makes them pass.

## Bounded passive challenge assistance

The [test-only passive assistance path](scripts/flaresolverr/CLOUDFLARE_ASSISTANCE.md)
extends verified public GET coverage beyond the existing Kagane/Noveli/Vortex bridge.
It runs only after confirmed Cloudflare response evidence, never for ordinary 406s,
network failures or explicit access denials. At most three helper operations per
source are allowed; unresolved/CAPTCHA/security failures stop further assistance.
The new path does not invoke FlareSolverr's CAPTCHA solver. Native source interceptors
still authorize requests first and consume the actual replay bytes/status/headers.

`cloudflareAssistance` counters in each affected report are separate from native SDK
budgets. They record local helper calls and reported navigation/replay attempts, not
browser subresources or legacy helper traffic. Neither counter set is total provider
traffic. Browser-managed identity and cookies are not claimed identical to app state.
See the linked contract for exact limits, supported routes and unresolved outcomes.

## Test-host compatibility, not device proof

Alpha.92's official CLI injects its outer Node `Promise` into a VM whose native async
functions create VM-intrinsic promises. Its actual SDK `SearchFilterForm` uses
`instanceof Promise`, so it misclassifies these promises and throws
`this.filters.map is not a function`. The installed CLI exposes no supported context
configuration hook.

`scripts/paperback-test-native-runtime.mjs` is loaded only for the official CLI test
child. It checks the exact alpha.92 toolchain/types/runtime versions and the reviewed
upstream test-host SHA-256. Only an identified SDK `Logger` context with the expected
native `Application` and exact injected binding is changed: that binding is deleted,
allowing the VM's own native `Promise` to work. No Promise implementation, SDK form,
Application method, assertion, response or transport is replaced. A changed version,
changed host or malformed SDK context fails closed; unrelated contexts are untouched.
Three offline infrastructure regressions demonstrate the original failure using the
actual SDK form, its corrected native async behavior, unchanged Application/transport,
and refusal of unreviewed versions/hosts. This is CLI-host compatibility evidence, not
an iOS/device test.

## Commands and adding a source

- `npm test`: reporting/host infrastructure, TypeScript, lint, formatting and bundles.
- `npm run test:extensions`: repository live runner with its existing transport and
  report handling, plus the scoped native-runtime preload.
- Direct native measurement (use the environment's ordinary proxy option only when
  needed):
  ```sh
  node --import ./scripts/paperback-test-native-runtime.mjs \
    node_modules/@paperback/toolchain/dist/cli.mjs test --noGenerate \
    --output /tmp/source-native.json SourceName
  ```
  The CLI console exit status alone is not the test result; inspect the report summary.

The image gate validates complete JPEG/PNG/WebP containers, dimensions and MIME against
the received bytes. JPEG must contain an actual nonempty scan through its final EOI;
PNG/WebP must include complete image-data chunks. It is not a pixel decoder or device
rendering proof. Other formats fail closed rather than pass on a signature or length.

A source's `src/tests/SourceName.ts` exports `runTests(logger)`, constructs `TestSuite`,
and calls `registerNativeContracts(suite, source, sourceInfo, options)`. Options specify
one discovery section, a search/reader seed when needed (or `detailMangaId` for a fixed
detail/inventory canary independent of the search round-trip), consumed-response inventory
assertions, one real native form interaction, and a local fail-closed guard. Optional
`documentBudget: { maximum, reason }` must be justified by native measurements. Call
`suite.run()`, log `probe.counts()` in `finally`, and unregister the observer. See the
maintained source test files for the exact typed API and native-selector examples.
