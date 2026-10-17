# Paperback test WebView

The alpha.92 Node SDK implements `executeInWebView` as `Not Implemented`.
The test runner supplies the limited contract used by Marumaru through an
anonymous Chromium helper. This is not physical Paperback or WKWebView proof.
No production source imports the helper.

- The source first obtains HTML through its ordinary `Application.scheduleRequest`
  transport, including its normal SDK default User-Agent and response guards.
- Chromium receives those exact supplied UTF-8 bytes as the first main-document
  response at `source.baseUrl`. It does not fetch another document, fabricate an
  app shell, alter the source's scripts, add a base tag or replace URL properties.
- The actual `inject` function body runs in that document realm. Its Promise is
  awaited; URL, base URI and loader identity must remain unchanged.
- Each call has an isolated, disposable browser context. No cookies or identity
  are imported/exported. Only `loadCSS: true`, `loadImages: true`, empty cookie
  storage and no console capture are supported. Other options fail explicitly.
- TLS errors, browser security pages and visible interactive CAPTCHA controls
  stop the operation. No solver, click, TLS override or challenge bypass is used.
- Inputs, JSON results, resource count and execution lifetime are bounded.
  Cleanup also runs on failures and timeouts. Arbitrary upstream bodies and
  exception text are not logged.

The narrowly scoped preload checks the installed SDK versions and replaces only
the known unimplemented method on the official CLI's fresh Application namespace.
The official test runner, assertions and reports remain unchanged. Failed source
gates remain failed; the helper supplies no parser results or success fixtures.
The source's native image requests still validate real returned image bytes.

Run `npm test` for offline protocol/bridge contracts and all static checks.
Run `docker compose up -d --build --wait`, followed by `npm run test:extensions`
for the full live suite, then `docker compose down`. Changes to this shared test
host require all dynamically discovered sources, not only Marumaru, to pass.

Safety-observer and strict-JSON concepts in `paperback_webview.py` are adapted
from the GPL-3.0-or-later LucifersCircle/mana-extensions browser test host; that
file preserves attribution. Provider fixtures are not used by these tests.
