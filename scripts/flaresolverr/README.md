# Passive-only test browser

This test helper permits normal navigation, ordinary HTTP/form requests, and passive
browser/JavaScript waiting. It does not click verification buttons, press CAPTCHA
keys, or dispatch verification input. Extension source files and native test suites
are unchanged.

The image build first verifies exact SHA-256 pins for the four official FlareSolverr
v3.4.6 application files. `patch_passive.py` then removes `click_verify`, its only
call, and the `ActionChains`/`Keys` imports. It substitutes a read-only HTML check
inside the existing wait loop and before returning content. An AST audit rejects
remaining input methods or input CDP commands. A changed upstream file or source
structure fails the build instead of guessing a replacement.

Known CAPTCHA widgets and human-verification controls produce an explicit
"Interactive verification required (CAPTCHA); automated interaction is disabled"
error. Detection is deliberately conservative: even an auto-completing Turnstile
widget is rejected. An ordinary Cloudflare JS wait page without CAPTCHA markers
may finish passively. A passive wait timeout explains that interactive verification
may be required; it does not trigger input or another transport. Unknown CAPTCHA
markup may reach that timeout, but cannot restore the removed input code.

Kagane browser-origin API fetches keep their existing request semantics and origin
restriction. The same guard checks the current browser page and HTML API responses.
TLS bypass flags are removed with asserted exact replacements, as before; Chromium
must use its existing trusted certificate store. No certificate exception, proxy,
credentials, new permissions, or alternate endpoint is added.

## Offline verification

- `npm run test:report` runs the guard, upstream-drift, source-audit, and bridge tests.
- The Docker build also runs `python /app/test_passive.py --source /app` against the
  actual patched upstream service. Its fake driver has no mouse/key/action methods.
  Tests cover ordinary pages, repeated passive waits, CAPTCHA appearing initially
  or during waiting, delayed returns, cookie-only requests, and explicit API errors.
- To reproduce the source test without Docker, copy the four exact official files
  into an isolated directory, run `python3 scripts/flaresolverr/patch_passive.py DIR`,
  then `python3 scripts/flaresolverr/test_passive.py --source DIR`. These commands
  inspect local files only and do not start Chromium or contact a provider.

The first image build and any live provider tests remain separate verification
steps. A CAPTCHA-required site can now fail live tests rather than pass via an
automated verification click. Reusing an old, unpatched solver service does not
provide this safeguard.

Official upstream evidence:

- [Service and verification loop](https://github.com/FlareSolverr/FlareSolverr/blob/v3.4.6/src/flaresolverr_service.py)
- [Browser setup and TLS flags](https://github.com/FlareSolverr/FlareSolverr/blob/v3.4.6/src/utils.py)
- [Session lifecycle](https://github.com/FlareSolverr/FlareSolverr/blob/v3.4.6/src/sessions.py)
- [API registration](https://github.com/FlareSolverr/FlareSolverr/blob/v3.4.6/src/flaresolverr.py)
