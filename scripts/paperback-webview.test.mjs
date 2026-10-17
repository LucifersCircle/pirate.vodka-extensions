import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertPaperbackDocumentURL,
  boundedWebViewResponse,
  createPaperbackTestWebView,
  strictWebViewJSON,
  validatePaperbackWebViewContext,
} from "./paperback-test-webview.mjs";

const url = "https://marumaru105.com/manhwa";
const context = () => ({
  source: {
    html: "<!doctype html><title>Contract unit test</title><script>window.answer=42</script>",
    baseUrl: url,
    loadCSS: true,
    loadImages: true,
  },
  inject: "return Promise.resolve(window.answer);",
  storage: { cookies: [] },
});
const response = (value) => new Response(JSON.stringify(value));
function fixture(reply = { url, value: 42 }) {
  const calls = [];
  const host = createPaperbackTestWebView({
    fetchImpl: async (target, init) => {
      assert.equal(init.redirect, "error");
      assert.equal(init.credentials, "omit");
      assert.equal(init.headers["content-type"], "application/json");
      const payload = JSON.parse(init.body);
      calls.push({ target, payload });
      return response(target.endsWith("/v1") ? { status: "ok" } : reply);
    },
  });
  return { host, calls };
}

void test("Paperback WebView preserves exact HTML, inject body and base URL; isolated lifetime", async () => {
  const { host, calls } = fixture(),
    input = context();
  assert.deepEqual(await host.executeInWebView(input), { result: 42, storage: { cookies: [] } });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].payload.cmd, "sessions.create");
  assert.deepEqual(calls[1].payload.source, input.source);
  assert.equal(calls[1].payload.inject, input.inject);
  assert.deepEqual(calls[1].payload.cookies, []);
  assert.equal(calls[2].payload.cmd, "sessions.destroy");
  assert.equal(new Set(calls.map((call) => call.payload.session)).size, 1);
  await host.executeInWebView(input);
  assert.notEqual(calls[0].payload.session, calls[3].payload.session);
  await host.close();
  assert.throws(() => host.executeInWebView(input), /closed/);
});

void test("Unsupported identity, cookies, loading and capture options fail before network", () => {
  const { host, calls } = fixture();
  for (const change of [
    (c) => (c.source.userAgent = "custom"),
    (c) => (c.source.loadCSS = false),
    (c) => (c.source.loadImages = false),
    (c) => (c.captureConsoleLog = true),
    (c) => c.storage.cookies.push({ name: "session", value: "not-sent" }),
    (c) => (c.storage.extra = true),
    (c) => (c.extra = true),
    (c) => (c.source.html = "x".repeat(4 * 1024 * 1024 + 1)),
    (c) => (c.source.html = "\ud800"),
    (c) => (c.inject = ""),
    (c) => (c.source.baseUrl += "/../account"),
  ]) {
    const input = context();
    change(input);
    assert.throws(() => host.executeInWebView(input));
  }
  const getter = context();
  Object.defineProperty(getter, "inject", {
    get() {
      assert.fail("Getter invoked");
    },
  });
  assert.throws(() => validatePaperbackWebViewContext(getter));
  assert.equal(calls.length, 0);
});

void test("Only canonical public Marumaru document routes are accepted", () => {
  for (const target of [
    url,
    `${url}?page=2`,
    `${url}/17155`,
    `${url}/17155/21331`,
    "https://marumaru105.com/search?q=test&kind=manhwa&page=2",
  ])
    assert.doesNotThrow(() => assertPaperbackDocumentURL(target));
  for (const target of [
    "http://marumaru105.com/manhwa",
    "https://user@marumaru105.com/manhwa",
    "https://marumaru105.com:443/manhwa",
    `${url}#x`,
    `${url}?page=1&page=2`,
    `${url}/%31`,
    `${url}/1?x=1`,
    `${url}?page=0`,
    "https://marumaru105.com/account",
    "https://marumaru105.com/search?q=%00&kind=manhwa",
  ])
    assert.throws(() => assertPaperbackDocumentURL(target));
});

void test("JSON rejects silent coercions, getters, cycles, sparse arrays and oversized output", () => {
  assert.deepEqual(strictWebViewJSON({ ok: true, value: [1, "한글", null] }), {
    ok: true,
    value: [1, "한글", null],
  });
  const cycle = {};
  cycle.self = cycle;
  for (const bad of [
    undefined,
    Infinity,
    NaN,
    1n,
    () => 1,
    new Date(),
    cycle,
    Object.assign([], { length: 2 }),
    { value: undefined },
    {
      toJSON() {
        return 1;
      },
    },
    "x".repeat(4 * 1024 * 1024),
  ])
    assert.throws(() => strictWebViewJSON(bad));
  assert.throws(() =>
    strictWebViewJSON({
      get value() {
        assert.fail("Getter invoked");
      },
    }),
  );
});

void test("Identity, malformed result and source failure are not converted to passes", async () => {
  for (const reply of [
    { url: url + "/1", value: 42 },
    { url },
    { url, value: 42, extra: true },
    { error: "private-body", reason: "private-secret" },
  ]) {
    const { host, calls } = fixture(reply);
    await assert.rejects(
      host.executeInWebView(context()),
      (error) => !error.message.includes("private"),
    );
    assert.equal(calls.at(-1).payload.cmd, "sessions.destroy");
  }
});

void test("CAPTCHA/security gates are sticky and cleanup occurs without solving", async () => {
  for (const code of ["captcha", "security"]) {
    const { host, calls } = fixture({ error: "denied", code });
    await assert.rejects(host.executeInWebView(context()), /stopped/);
    assert.throws(() => host.executeInWebView(context()), /stopped/);
    assert.equal(calls.length, 3);
    assert.equal(calls.at(-1).payload.cmd, "sessions.destroy");
  }
});

void test("Lost session-creation response still attempts destruction; no execution retry", async () => {
  const calls = [];
  const host = createPaperbackTestWebView({
    fetchImpl: async (_, init) => {
      const payload = JSON.parse(init.body);
      calls.push(payload);
      if (payload.cmd === "sessions.create") throw new Error("lost response");
      return response({ status: "ok" });
    },
  });
  await assert.rejects(host.executeInWebView(context()), /helper failed/);
  assert.deepEqual(
    calls.map((call) => call.cmd),
    ["sessions.create", "sessions.destroy"],
  );
});

void test("Helper body limit and stalled stream cancel cleanly", async () => {
  await assert.rejects(
    boundedWebViewResponse(
      new Response("x".repeat(4 * 1024 * 1024 + 4097)),
      new AbortController().signal,
    ),
    /size limit/,
  );
  let cancelled = false;
  const controller = new AbortController();
  const pending = boundedWebViewResponse(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pending, /timeout/);
  assert.equal(cancelled, true);
});

void test("Official alpha.92 CLI VM gets only the reviewed WebView method; reporting stays honest", () => {
  const directory = mkdtempSync(join(tmpdir(), "paperback-webview-contract-"));
  try {
    const bundle = join(directory, "suite.js");
    writeFileSync(
      bundle,
      `var source={async runTests(logger){ const result=await Application.executeInWebView(${JSON.stringify(context())}); logger.log('actual',result.result); logger.list('tests').scope('intentional-negative').log('passed',false); }};`,
    );
    const script = `
      import assert from 'node:assert/strict'; import vm from 'node:vm';
      import {ApplicationPolyfill} from '@paperback/runtime-polyfills';
      const base=import.meta.resolve('@paperback/toolchain/package.json');
      const {Logger}=await import(new URL('./dist/src/toolchain/test/logger.mjs',base));
      const {runSourceTests}=await import(new URL('./dist/src/toolchain/test/test.mjs',base));
      const calls=[];globalThis.fetch=async(target,init)=>{const p=JSON.parse(init.body);calls.push(p);return new Response(JSON.stringify(target.endsWith('/v1')?{status:'ok'}:{url:p.source.baseUrl,value:42}));};
      await import(${JSON.stringify(new URL("./paperback-test-webview-preload.mjs", import.meta.url).href)});
      const app=ApplicationPolyfill(), before=Object.getOwnPropertyDescriptors(app);const sdk=new Logger();
      vm.createContext({Application:app,logger:sdk});
      for(const [key,descriptor] of Object.entries(before)) if(key!=='executeInWebView') assert.deepEqual(Object.getOwnPropertyDescriptor(app,key),descriptor);
      const ordinary=ApplicationPolyfill(), original=ordinary.executeInWebView;vm.createContext({Application:ordinary,logger:{console(){return console}}});assert.equal(ordinary.executeInWebView,original);
      const logger=new Logger();await runSourceTests(logger,${JSON.stringify(bundle)});assert.equal(logger.raw().actual,42);assert.equal(logger.raw().tests[0].passed,false);assert.equal(calls.length,3);
      assert.throws(()=>vm.createContext({Application:{...ApplicationPolyfill(),executeInWebView(){return 'not stub'}},logger:new Logger()}),/refusing/);
    `;
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: new URL("../", import.meta.url),
      stdio: "pipe",
      timeout: 15000,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

void test("Python Chromium protocol contract uses only offline test data", () => {
  execFileSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "scripts/flaresolverr", "-p", "test_paperback_webview.py"],
    { cwd: new URL("../", import.meta.url), stdio: "pipe", timeout: 30000 },
  );
});
