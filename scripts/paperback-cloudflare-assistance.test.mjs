// Actual alpha.92 Application/selector/request-manager path and source VM objects.
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { ApplicationPolyfill } from "@paperback/runtime-polyfills";
import { createCloudflareAssistance } from "./cloudflare-assistance.mjs";

void test("Paperback source-realm headers and real request interceptors reach bounded assistance without bypassing authorization", async () => {
  const target = "https://marumaru105.com/api/works/17155";
  const calls = [],
    bytes = Buffer.from([0, 255, 128, 42, 0]);
  const assistance = createCloudflareAssistance({
    solverURL: "http://127.0.0.1:8191",
    log: () => {},
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url === target) {
        const response = new Response("<title>Just a moment...</title>", {
          status: 403,
          headers: { "cf-mitigated": "challenge", "content-type": "text/html" },
        });
        Object.defineProperty(response, "url", { value: target });
        return response;
      }
      const payload = JSON.parse(init.body);
      if (url.endsWith("/v1")) {
        assert(["sessions.create", "sessions.destroy"].includes(payload.cmd));
        return Response.json({ status: "ok" });
      }
      assert.equal(url, "http://127.0.0.1:8191/browser/assist");
      assert.equal(payload.headers["x-site"], "marumaru");
      assert.equal(payload.headers.accept, "application/json");
      assert.equal(payload.headers["user-agent"], undefined);
      return Response.json({
        url: target,
        status: 202,
        headers: { "content-type": "application/octet-stream", "x-real": "yes" },
        body: bytes.toString("base64"),
        encoding: "base64",
        byteLength: bytes.length,
        metrics: { navigationAttempts: 1, replayAttempts: 1 },
      });
    },
  });
  const originalFetch = globalThis.fetch;
  const app = ApplicationPolyfill();
  const context = vm.createContext({ Application: app });
  // These objects and callbacks are created in the same separate realm as a real
  // source bundle, while the installed official RequestManager stays untouched.
  const interceptor = vm.runInContext(
    `({
    blocked: false,
    request(value) {
      if (this.blocked) throw new Error('source ownership denied');
      return { ...value, headers: { ...value.headers, 'User-Agent': 'native-source-default' } };
    },
    response(request, response, data) {
      if (request.headers['User-Agent'] !== 'native-source-default' || response.status !== 202
          || response.headers['x-real'] !== 'yes') throw new Error('native contract changed');
      return data;
    }
  })`,
    context,
  );
  app.registerInterceptor(
    "real-source-selector-contract",
    app.Selector(interceptor, "request"),
    app.Selector(interceptor, "response"),
  );
  const request = vm.runInContext(
    `({url:${JSON.stringify(target)},method:'GET',headers:{Accept:'application/json','X-Site':'marumaru'}})`,
    context,
  );
  assert.notEqual(Object.getPrototypeOf(request.headers), Object.prototype);
  globalThis.fetch = (input, init) => assistance.fetch(input, init);
  try {
    const [response, data] = await app.scheduleRequest(request);
    assert.equal(response.url, target);
    assert.equal(response.status, 202);
    assert.deepEqual(Buffer.from(data), bytes);
    assert.equal(calls.filter((call) => call.url === target).length, 1);
    assert.equal(calls[0].init.headers["User-Agent"], "native-source-default");
    assert.equal(assistance.stats("Marumaru").successfulReplays, 1);
    const count = calls.length;
    interceptor.blocked = true;
    await assert.rejects(app.scheduleRequest(request), /source ownership denied/);
    assert.equal(calls.length, count, "Rejected source request reached direct or assisted network");
  } finally {
    globalThis.fetch = originalFetch;
    app.unregisterInterceptor("real-source-selector-contract");
    await assistance.close();
  }
});
