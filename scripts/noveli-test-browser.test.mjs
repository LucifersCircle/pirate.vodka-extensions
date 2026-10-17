import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  isNoveliBrowserRequest,
  isNoveliCoverURL,
  isNoveliMetadataURL,
  isNoveliSessionURL,
  isNoveliWarmSolution,
} from "./noveli-test-browser-contract.mjs";

const origin = "https://noveli.to";
const api = `${origin}/api/novels`;
const catalog = `${api}?sort=popular&page=1&limit=36`;
const positives = [
  `${api}/rankings`,
  `${api}/tags`,
  `${api}/1`,
  `${api}/9007199254740991`,
  `${api}/a-valid-slug-123/chapters`,
  `${api}/123/chapters`,
  `${api}/123/chapters/456`,
  ...["popular", "trending", "rating", "newest", "chapters", "az"].map(
    (sort) => `${api}?sort=${sort}&page=10000&limit=36`,
  ),
  catalog,
  `${catalog}&search=${encodeURIComponent("A book + 日本語 / &'()!*?#=").replace(/'/g, "%27")}`,
  `${catalog}&search=Book%27s&genres=Author%27s%20Choice`,
  `${catalog}&genres=Action%2CAdventure&status=Ongoing`,
  `${catalog}&status=Completed`,
];
const negatives = [
  null,
  {},
  `${origin}/`,
  `${api}/login`,
  `${api}/0`,
  `${api}/01`,
  `${api}/9007199254740992`,
  `${api}/1/chapters/0`,
  `${api}/1/chapters/9007199254740992`,
  `${api}/UPPER/chapters`,
  `${api}/-slug/chapters`,
  `${api}/a_slug/chapters`,
  `${api}/rankings/`,
  `${api}/tags?x=1`,
  `${api}/tags#`,
  `${api}/tags#fragment`,
  `${api}/tags\n`,
  ` ${api}/tags`,
  `${origin}/api/x/../novels/tags`,
  `${origin}/api/novels/../novels/tags`,
  `${origin}/api/%6eovels/tags`,
  `${api}/%74ags`,
  `${api}//tags`,
  `${api}/tags/..`,
  `${origin}\\api\\novels\\tags`,
  `https://noveli.to:443/api/novels/tags`,
  `https://noveli.to:444/api/novels/tags`,
  `https://name:password@noveli.to/api/novels/tags`,
  `https://noveli.to@other.example/api/novels/tags`,
  `https://noveli.to./api/novels/tags`,
  `https://NOVELI.to/api/novels/tags`,
  `https://noveli%2eto/api/novels/tags`,
  `http://noveli.to/api/novels/tags`,
  `https://sub.noveli.to/api/novels/tags`,
  `https://other.example/api/novels/tags`,
  `${catalog}&sort=rating`,
  `${catalog}&unknown=1`,
  `${catalog}&token=secret`,
  `${catalog}&search=x&search=y`,
  `${catalog}&%73earch=x`,
  `${catalog}&search`,
  `${catalog}&search=x=y`,
  `${catalog}&search=`,
  `${catalog}&search=%20`,
  `${catalog}&search=has+space`,
  `${catalog}&search=%2f`,
  `${catalog}&search=%61`,
  `${catalog}&search=Book's`,
  `${catalog}&genres=Author's%20Choice`,
  `${catalog}&search=%`,
  `${catalog}&search=%FF`,
  `${catalog}&search=%ED%A0%80`,
  `${catalog}&search=%00`,
  `${catalog}&search=%0A`,
  `${catalog}&genres=`,
  `${catalog}&genres=Action%2C`,
  `${catalog}&genres=Action%2CAction`,
  `${catalog}&status=all`,
  `${catalog}&`,
  `${api}?sort=unknown&page=1&limit=36`,
  `${api}?sort=popular&page=0&limit=36`,
  `${api}?sort=popular&page=01&limit=36`,
  `${api}?sort=popular&page=10001&limit=36`,
  `${api}?sort=popular&page=1.0&limit=36`,
  `${api}?sort=popular&page=1e1&limit=36`,
  `${api}?sort=popular&page=1&limit=100`,
  `${api}?sort=popular&page=1`,
  `${api}?page=1&limit=36`,
  `${origin}/uploads/covers/valid.webp`,
];

void test("Noveli raw metadata URLs admit only the source's canonical anonymous routes", () => {
  for (const raw of positives) assert.equal(isNoveliMetadataURL(raw), true, String(raw));
  for (const raw of negatives) assert.equal(isNoveliMetadataURL(raw), false, JSON.stringify(raw));
  assert.equal(isNoveliSessionURL(`${origin}/`), true);
  assert.equal(isNoveliSessionURL(`${origin}/login`), false);
  assert.equal(isNoveliCoverURL(`${origin}/uploads/covers/valid.webp`), true);
  assert.equal(isNoveliCoverURL(`${origin}/uploads/covers/../valid.webp`), false);
});

void test("Noveli browser requests reject methods, bodies, and caller identity headers", () => {
  assert.equal(isNoveliBrowserRequest(catalog, "GET", null, new Headers()), true);
  for (const method of ["get", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
    assert.equal(isNoveliBrowserRequest(catalog, method, null, new Headers()), false);
  for (const body of ["", "{}", {}, false, 0])
    assert.equal(isNoveliBrowserRequest(catalog, "GET", body, new Headers()), false);
  for (const key of ["Authorization", "Cookie", "Origin", "Referer", "User-Agent", "X-API-Key"])
    assert.equal(isNoveliBrowserRequest(catalog, "GET", null, new Headers({ [key]: "x" })), false);
});

void test("Noveli warm-up never accepts terminal denial or unresolved challenge state", () => {
  const valid = {
    status: 200,
    url: `${origin}/`,
    response: "<html>Public home</html>",
    headers: {},
  };
  assert.equal(isNoveliWarmSolution(valid, valid.url), true);
  for (const status of [undefined, 0, 301, 401, 403, 500])
    assert.equal(isNoveliWarmSolution({ ...valid, status }, valid.url), false);
  for (const response of [
    "Access denied",
    "Error code: 1020",
    "<title>Forbidden | Cloudflare</title>",
    "<title>Just a moment...</title>",
    '<script src="/cdn-cgi/challenge-platform/x"></script>',
    JSON.stringify({ success: false, message: "Unauthorized" }),
    JSON.stringify({ success: true, data: { requiresLogin: true } }),
    "<html><pre>{&quot;success&quot;:true,&quot;data&quot;:{&quot;accessDenied&quot;:true}}</pre></html>",
    "<html><body><pre>Access denied</pre></body></html>",
    "<html><body><pre>Error code: 1020</pre></body></html>",
    "<html><body><pre>Unauthorized</pre></body></html>",
  ])
    assert.equal(isNoveliWarmSolution({ ...valid, response }, valid.url), false);
  assert.equal(
    isNoveliWarmSolution({ ...valid, headers: { "CF-Mitigated": "challenge" } }, valid.url),
    false,
  );
});

void test("Python and JavaScript Noveli validators agree without server or provider access", () => {
  const cases = [...positives, ...negatives];
  const python = spawnSync(
    "python3",
    [
      "-c",
      `import importlib.util, json, sys, types
sys.dont_write_bytecode = True
sys.modules['bottle'] = types.SimpleNamespace(request=None, response=None)
sys.modules['flaresolverr_service'] = types.SimpleNamespace(SESSIONS_STORAGE=None)
spec = importlib.util.spec_from_file_location('browser_request', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
cases = json.load(sys.stdin)
print(json.dumps([module.is_noveli_metadata_url(raw) for raw in cases]))
for method in ['POST', 'PUT', 'DELETE', 'HEAD', 'get']:
    assert not module.is_noveli_browser_request({'url': cases[0], 'method': method, 'headers': {}, 'body': None})
for headers in [{'Authorization':'x'}, {'Cookie':'x'}, {'Origin':'x'}, {'User-Agent':'x'}, []]:
    assert not module.is_noveli_browser_request({'url': cases[0], 'method': 'GET', 'headers': headers, 'body': None})
assert module.is_noveli_browser_request({'url': cases[0], 'method': 'GET', 'headers': {}, 'body': None})
assert not module.is_noveli_browser_request({'url': cases[0], 'method': 'GET', 'headers': {}, 'body': ''})
assert not module.is_noveli_browser_request({'url': cases[0], 'method': 'GET', 'headers': {}, 'proxy': 'x'})
# Exercise the registered route with fake storage/WebDriver, not just the pure validator.
route = None
class App:
    def post(self, path):
        assert path == '/browser/request'
        def register(handler):
            global route
            route = handler
        return register
class Driver:
    current_url = 'https://noveli.to/'
    calls = 0
    final_url = cases[0]
    def set_script_timeout(self, timeout):
        assert timeout == 65
    def execute_async_script(self, script, payload):
        self.calls += 1
        assert script == module.NOVELI_FETCH_SCRIPT
        assert "redirect: 'error'" in script
        assert "method: 'GET'" in script and 'payload.headers' not in script
        assert payload['headers'] == {} and payload.get('body') is None
        return {'url': self.final_url, 'status': 200, 'headers': {'content-type':'application/json'}, 'body':'{}'}
driver = Driver()
module.request = types.SimpleNamespace(json=None)
module.response = types.SimpleNamespace(status=200)
module.SESSIONS_STORAGE = types.SimpleNamespace(session_ids=lambda: ['fresh'], get=lambda session: (types.SimpleNamespace(driver=driver), None))
module.register(App())
valid = {'session':'fresh', 'url':cases[0], 'method':'GET', 'headers':{}, 'body':None}
def invoke(payload):
    module.request.json = payload
    module.response.status = 200
    return route()
assert invoke(valid)['url'] == cases[0] and driver.calls == 1
for bad in [dict(valid, method='POST'), dict(valid, body=''), dict(valid, headers={'Cookie':'private'}), dict(valid, proxy='x'), dict(valid, url='https://noveli.to:443/api/novels/tags'), dict(valid, url='https://noveli.to/api/novels/login')]:
    before = driver.calls
    assert 'error' in invoke(bad) and module.response.status == 400 and driver.calls == before
for bad in ['http://noveli.to/', 'https://noveli.to:443/', 'https://user@noveli.to/', 'https://noveli.to./', 'https://other.example/', 'https://noveli.to/login']:
    driver.current_url = bad
    before = driver.calls
    assert 'error' in invoke(valid) and module.response.status == 502 and driver.calls == before
driver.current_url = 'https://noveli.to/'
for bad in ['https://other.example/', 'https://noveli.to/api/novels/tags', 'https://noveli.to:443/api/novels/rankings']:
    driver.final_url = bad
    assert 'error' in invoke(valid) and module.response.status == 502
driver.final_url = cases[0]
assert invoke(valid)['url'] == cases[0] and module.response.status == 200
`,
      fileURLToPath(new URL("./flaresolverr/browser_request.py", import.meta.url)),
    ],
    { input: JSON.stringify(cases), encoding: "utf8" },
  );
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), cases.map(isNoveliMetadataURL));
});

void test("Noveli transport keeps raw guards, isolated sessions, native covers, and bounded challenge handling", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let warmURL = `${origin}/`;
  let finalURL;
  let challenge = false;
  let denied = false;
  let privacyError = false;
  let warmOverride = {};
  const nativeStub = async (input, init = {}) => {
    const url = String(input);
    const payload = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, payload, headers: init.headers });
    if (url.endsWith("/v1")) {
      const solution = {
        status: 200,
        userAgent: "browser-owned",
        cookies: [{ name: "cf_clearance", value: "browser-only", domain: "noveli.to" }],
        url:
          payload.url === `${origin}/`
            ? warmURL
            : payload.url
              ? new Request(payload.url).url
              : undefined,
        response: privacyError ? "<title>Privacy error</title>" : "",
        ...warmOverride,
      };
      return Response.json({ status: "ok", solution });
    }
    if (url.endsWith("/browser/request")) {
      return Response.json({
        url: finalURL ?? new Request(payload.url).url,
        status: denied ? 401 : challenge ? 403 : 200,
        headers: challenge
          ? { "cf-mitigated": "challenge", "content-type": "text/html" }
          : { "content-type": "application/json" },
        body: "{}",
      });
    }
    return new Response("native");
  };
  let instance = 0;
  const cleanups = [];
  const loadBridge = async () => {
    globalThis.fetch = nativeStub;
    instance += 1;
    const existing = new Set(process.listeners("beforeExit"));
    await import(`./paperback-test-network.mjs?offline-noveli=${instance}`);
    for (const listener of process.listeners("beforeExit")) {
      if (existing.has(listener)) continue;
      process.removeListener("beforeExit", listener);
      cleanups.push(listener);
    }
    return globalThis.fetch;
  };
  try {
    const bridge = await loadBridge();
    for (const raw of negatives.filter((raw) => typeof raw === "string")) {
      let normalized;
      try {
        normalized = new URL(raw);
      } catch {
        continue;
      }
      if (normalized.hostname.replace(/\.+$/, "") !== "noveli.to" || isNoveliCoverURL(raw))
        continue;
      await assert.rejects(bridge(raw), /Noveli/);
    }
    for (const input of [new URL(catalog), new Request(catalog)])
      await assert.rejects(bridge(input), /raw Noveli/);
    for (const init of [
      { method: "POST" },
      { body: "" },
      { headers: { Cookie: "x" } },
      { headers: { Referer: "https://other.example/" } },
      { headers: { Referer: `${origin}/`, Cookie: "x" } },
      { credentials: "include" },
      { proxy: "x" },
      { redirect: "follow" },
      { unknown: true },
      { signal: "invalid" },
      { signal: null },
    ])
      await assert.rejects(bridge(catalog, init), /Noveli/);
    await assert.rejects(bridge(catalog, { signal: AbortSignal.abort() }), /abort/i);
    assert.equal(calls.length, 0);
    assert.equal(await (await bridge(`${origin}/uploads/covers/valid.webp`)).text(), "native");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${origin}/uploads/covers/valid.webp`);
    calls.length = 0;
    await bridge(`${origin}/uploads/covers/valid.webp`, {
      headers: { Referer: `${origin}/` },
    });
    assert.equal(new Headers(calls[0].headers).get("referer"), `${origin}/`);
    calls.length = 0;
    await Promise.all([
      bridge(`${api}/tags`),
      bridge(`${api}/rankings`, { headers: { Referer: `${origin}/` } }),
    ]);
    assert.equal(calls.filter((call) => call.payload?.cmd === "sessions.create").length, 1);
    assert.equal(calls.filter((call) => call.payload?.cmd === "request.get").length, 1);
    const requests = calls.filter((call) => call.url.endsWith("/browser/request"));
    assert.equal(requests.length, 2);
    for (const { payload } of requests) {
      assert.equal(payload.method, "GET");
      assert.equal(payload.body, null);
      assert.deepEqual(payload.headers, {});
      assert.equal(typeof payload.session, "string");
    }
    const apostropheURL = `${catalog}&search=Book%27s&genres=Author%27s%20Choice`;
    const apostropheResponse = await bridge(apostropheURL);
    assert.equal(apostropheResponse.url, apostropheURL);
    assert.equal(apostropheResponse.url, new Request(apostropheURL).url);
    finalURL = "https://other.example/api/novels/tags";
    await assert.rejects(bridge(`${api}/tags`), /redirected/);
    finalURL = undefined;
    challenge = true;
    calls.length = 0;
    assert.equal((await bridge(`${api}/tags`)).status, 403);
    assert.equal(calls.filter((call) => call.url.endsWith("/browser/request")).length, 2);
    assert.equal(calls.filter((call) => call.payload?.cmd === "request.get").length, 1);
    denied = true;
    calls.length = 0;
    assert.equal((await bridge(`${api}/tags`)).status, 401);
    assert.equal(calls.filter((call) => call.url.endsWith("/browser/request")).length, 1);
    assert.equal(calls.filter((call) => call.payload?.cmd === "request.get").length, 0);
    denied = false;
    challenge = false;
    // New module instances isolate state for hostile warm-up responses.
    for (const badURL of [
      "http://noveli.to/",
      "https://noveli.to:443/",
      `${origin}/login`,
      "https://other.example/",
      "chrome-error://chromewebdata/",
    ]) {
      warmURL = badURL;
      calls.length = 0;
      const hostileBridge = await loadBridge();
      await assert.rejects(hostileBridge(`${api}/tags`), /Noveli|securely/);
      assert.equal(calls.filter((call) => call.url.endsWith("/browser/request")).length, 0);
    }
    warmURL = `${origin}/`;
    privacyError = true;
    calls.length = 0;
    await assert.rejects((await loadBridge())(`${api}/tags`), /securely/);
    assert.equal(calls.filter((call) => call.url.endsWith("/browser/request")).length, 0);
    privacyError = false;
    for (const override of [
      { status: 401 },
      { status: 403 },
      { response: "<title>Just a moment...</title>" },
      { response: JSON.stringify({ success: true, accessDenied: true }) },
      { headers: { "cf-mitigated": "challenge" } },
      { response: "<html><body><pre>Access denied</pre></body></html>" },
      { response: "<html><body><pre>Error code: 1020</pre></body></html>" },
      { response: "<html><body><pre>Unauthorized</pre></body></html>" },
    ]) {
      warmOverride = override;
      calls.length = 0;
      await assert.rejects((await loadBridge())(`${api}/tags`), /denied, unresolved/);
      assert.equal(calls.filter((call) => call.url.endsWith("/browser/request")).length, 0);
    }
    warmOverride = {};
    for (const override of [
      { status: 403 },
      { response: "<html><body><pre>Access denied</pre></body></html>" },
      { response: "<html><body><pre>Error code: 1020</pre></body></html>" },
      { response: "<html><body><pre>Unauthorized</pre></body></html>" },
    ]) {
      const retryBridge = await loadBridge();
      await retryBridge(`${api}/tags`);
      challenge = true;
      warmOverride = override;
      calls.length = 0;
      await assert.rejects(retryBridge(`${api}/tags`), /denied, unresolved/);
      assert.equal(calls.filter((call) => call.url.endsWith("/browser/request")).length, 1);
      assert.equal(calls.filter((call) => call.payload?.cmd === "request.get").length, 1);
      warmOverride = {};
      challenge = false;
    }
    calls.length = 0;
    const legacyBridge = await loadBridge();
    await legacyBridge("https://kagane.org/api/example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"x":1}',
    });
    const kagane = calls.find((call) => call.url.endsWith("/browser/request"));
    assert.equal(kagane.payload.method, "POST");
    assert.equal(kagane.payload.body, '{"x":1}');
    assert.deepEqual(kagane.payload.headers, { "content-type": "application/json" });
    calls.length = 0;
    await legacyBridge("https://api.vortexscans.org/example");
    assert.equal(calls.filter((call) => call.payload?.cmd === "sessions.create").length, 0);
    assert.equal(calls.filter((call) => call.url.endsWith("/browser/request")).length, 0);
    const vortex = calls.find((call) => call.url === "https://api.vortexscans.org/example");
    assert.equal(vortex.headers.get("user-agent"), "browser-owned");
  } finally {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
    globalThis.fetch = originalFetch;
  }
});
