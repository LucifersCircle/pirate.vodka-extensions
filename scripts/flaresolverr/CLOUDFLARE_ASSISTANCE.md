# Bounded passive Cloudflare assistance

This optional **test-only** path is separate from the native extension and its SDK.
It uses Chromium inside the existing loopback FlareSolverr container. It is not the
upstream `request.get` / `request.post` solver and never clicks CAPTCHA controls.
Existing Kagane transport, and Paperback's existing Noveli/Vortex transport, remain
separate and unchanged.

## Trigger and limits

The native request and production request interceptors run first. Assistance is
considered only for an allowlisted anonymous GET whose actual response has all of:

- HTTP 403 or 503;
- `cf-mitigated: challenge`;
- HTML content type; and
- no explicit access-denial marker in the bounded response prefix.

A bare 403, ordinary 406, fetch error, redirect, explicit provider refusal, unsupported
route or request containing account credentials does not trigger assistance. No
source is warmed merely because it is listed in the suite.

There are at most **three assistance operations per source per test process**, across
all its origins. Each exact URL is attempted at most once; concurrent identical
requests share one replay. Different requests serialize per source. An unresolved
challenge, CAPTCHA, security warning, invalid helper output or other helper failure
stops subsequent assistance for that source. The limit is not raised to make tests
pass.

Each operation creates an anonymous, disposable browser session/context. It allows
one exact challenged document navigation plus at most two same-URL managed reloads,
then at most one same-URL GET replay. Redirects, other document origins, provider
POSTs and unapproved subresources are blocked before dispatch. Explicit interactive
verification and certificate/security warnings stop the operation; TLS verification
stays enabled. Sessions are destroyed in `finally`, with bounded cleanup at shutdown.
Cross-origin challenge frames are deliberately unsupported, so some managed challenges
will remain unresolved.

## Public route scope

The independent JavaScript and Python validators contain the authoritative exact
schemas. They reject ambiguous raw URLs, credentials, fragments, path traversal,
unknown queries and unsupported methods. The initial verified families cover:

- Marumaru's exact catalog/search/work GET APIs, its advertised StorageWebtoon A2
  work/episode GET APIs, and the already source-authorized peer cover/episode image
  shapes. Native issuing-policy/image ownership checks still run before transport.
- Hijala's public home/series documents and bounded query/posts GET APIs.
- MangaSushi and ManhwaNex public catalog/search/detail/chapter documents, not their
  POST chapter/catalog AJAX operations.
- MangaStash's public home/browse/search/title/chapter documents.
- Mana VortexScans' verified public home and API GET families. Paperback retains its
  existing VortexScans path instead.

Non-Marumaru CDNs, arbitrary external image URLs, signed-token URLs, account routes,
unverified paths and POST operations retain ordinary native transport. Public ASCII
slug validation is intentionally conservative; unsupported encoded slugs stay direct.

Only allowlisted application headers, including Marumaru's `X-Site` and `Accept`, are
forwarded. Source Origin/Referer values must match the fixed source owner; browser-
managed User-Agent, Cookie, Origin and Referer are supplied by the anonymous browser,
not exported, injected into Node, or claimed identical to native app state. No source
method, parser, request authorization, assertion or production bundle is replaced.

## Honest responses and counts

Successful helper transport returns the actual URL, status, response headers and
strictly validated base64 bytes, up to 16 MiB. Binary data never round-trips through
UTF-8. A valid failed replay (including a remaining challenge or 406) is delivered
unchanged to the native SDK. If no valid replay exists, the original challenged
response stays visible. A helper success is not itself a passing source test or
physical-device proof.

The report's `cloudflareAssistance` entry measures only this new path:

- `positiveChallenges`: eligible challenged native responses;
- `assistanceAttempts`: helper operations started, with `assistanceLimit: 3`;
- `helperCalls` and `sessionLifecycleCalls`: local helper HTTP calls;
- `navigationAttempts` and `replayAttempts`: provider attempts actually reported by
  the helper, including permitted same-URL managed reloads;
- `unknownHelperOutcomes`: calls whose provider outcome could not be established;
- `refusedAttempts`, `successfulReplays` and optional `stopReason`.

These are separate from native SDK request budgets. Browser-loaded subresources are
not counted (`browserSubresourcesCounted: false`), and legacy Kagane/Noveli/Vortex
helper traffic is not included in this new entry. Neither set of counters is a total
provider-traffic count. Unverified/failed checks stay unverified/failed; no payload or
HTTP success is invented to make a report green.
