import assert from "node:assert/strict";
import test from "node:test";
import { createCloudflareAssistance, MAX_ASSISTANCE_ATTEMPTS } from "./cloudflare-assistance.mjs";
const target = "https://marumaru105.com/api/works/17155";
const options = { method: "GET", headers: { Accept: "application/json", "X-Site": "marumaru" } };
const html = "<html><title>Just a moment...</title><p>Checking your browser</p></html>";
const cfHeaders = { "cf-mitigated": "challenge", "content-type": "text/html" };
const response = (url, body = html, status = 403, headers = cfHeaders) => {
  const value = new Response(body, { status, headers });
  Object.defineProperty(value, "url", { value: url });
  return value;
};
const envelope = (
  url,
  bytes = Buffer.from([0, 255, 128, 17, 0]),
  status = 200,
  headers = { "content-type": "application/octet-stream", "x-real-response": "yes" },
) => ({
  url,
  status,
  headers,
  body: bytes.toString("base64"),
  encoding: "base64",
  byteLength: bytes.length,
  metrics: { navigationAttempts: 1, replayAttempts: 1 },
});
function fixture({
  direct = (url) => response(url),
  assist = (payload) => Response.json(envelope(payload.url)),
  lifecycle,
} = {}) {
  const calls = [],
    messages = [];
  const host = createCloudflareAssistance({
    solverURL: "http://127.0.0.1:8191",
    log: (message) => messages.push(message),
    fetchImpl: async (url, init) => {
      if (!url.startsWith("http://127.0.0.1:8191/")) {
        calls.push({ path: "native", url, init });
        return direct(url, init);
      }
      const payload = JSON.parse(init.body),
        path = new URL(url).pathname;
      calls.push({ path, payload });
      if (path === "/v1") {
        assert(
          ["sessions.create", "sessions.destroy"].includes(payload.cmd),
          "No automatic solver commands",
        );
        return lifecycle ? lifecycle(payload) : Response.json({ status: "ok" });
      }
      assert.equal(path, "/browser/assist");
      return assist(payload);
    },
  });
  return { host, calls, messages };
}

void test("unconfigured assistance is the identical direct transport and loopback configuration fails closed", () => {
  const direct = async () => response(target);
  const unconfigured = createCloudflareAssistance({ solverURL: "", fetchImpl: direct });
  // The identity assertion proves opt-out does not install a wrapper.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  assert.equal(unconfigured.fetch, direct);
  for (const url of [
    "https://127.0.0.1:8191",
    "http://localhost:8191",
    "http://127.0.0.1:8191/path",
    "http://user:pass@127.0.0.1:8191",
  ]) {
    assert.throws(() => createCloudflareAssistance({ solverURL: url }), /loopback/);
  }
});

void test("unchallenged success, ordinary 403/406/503, explicit denial and network failure never warm", async () => {
  for (const native of [
    response(target, "{}", 200, { "content-type": "application/json" }),
    response(target, "Forbidden", 403, {}),
    response(target, "Not acceptable", 406, cfHeaders),
    response(target, "Unavailable", 503, {}),
    response(
      target,
      "<title>Access denied</title> automated scraping agents are strictly prohibited",
    ),
  ]) {
    const { host, calls } = fixture({ direct: () => native });
    assert.equal(await host.fetch(target, options), native);
    assert.equal(calls.length, 1);
    await host.close();
  }
  const { host, calls } = fixture({
    direct: () => {
      throw new Error("native fetch failure");
    },
  });
  await assert.rejects(host.fetch(target, options), /native fetch failure/);
  assert.equal(calls.length, 1);
  await host.close();
});

void test("confirmed challenge uses one bounded passive operation and preserves every binary byte, status and application header", async () => {
  const bytes = Buffer.from([0, 255, 128, 0, 250, 15]);
  const { host, calls } = fixture({
    assist: (payload) => Response.json(envelope(payload.url, bytes, 201)),
  });
  const request = structuredClone(options),
    before = JSON.stringify(request);
  const replay = await host.fetch(target, request);
  assert.equal(replay.status, 201);
  assert.equal(replay.url, target);
  assert.equal(replay.headers.get("x-real-response"), "yes");
  assert.deepEqual(Buffer.from(await replay.arrayBuffer()), bytes);
  assert.equal(JSON.stringify(request), before);
  const operation = calls.find((call) => call.path === "/browser/assist").payload;
  assert.equal(operation.source, "Marumaru");
  assert.equal(operation.url, target);
  assert.equal(operation.navigationURL, target);
  assert.equal(operation.headers["x-site"], "marumaru");
  assert.equal(operation.headers.accept, "application/json");
  assert.equal(calls.filter((call) => call.path === "/browser/assist").length, 1);
  assert.deepEqual(
    calls.filter((call) => call.path === "/v1").map((call) => call.payload.cmd),
    ["sessions.create", "sessions.destroy"],
  );
  assert.equal(host.stats("Marumaru").assistanceAttempts, 1);
  assert.equal(host.stats("Marumaru").navigationAttempts, 1);
  assert.equal(host.stats("Marumaru").replayAttempts, 1);
  assert.equal(host.stats("Marumaru").browserSubresourcesCounted, false);
  await host.close();
});

void test("real unsuccessful replay and remaining challenge retain actual bytes and status then stop later assistance", async () => {
  for (const [status, headers, body] of [
    [406, { "content-type": "application/json" }, '{"error":"not acceptable"}'],
    [503, cfHeaders, html],
  ]) {
    const { host, calls } = fixture({
      assist: (payload) => Response.json(envelope(payload.url, Buffer.from(body), status, headers)),
    });
    const replay = await host.fetch(target, options);
    assert.equal(replay.status, status);
    assert.equal(await replay.text(), body);
    const second = await host.fetch(target.replace("17155", "17156"), options);
    assert.equal(second.status, 403);
    assert.equal(calls.filter((call) => call.path === "/browser/assist").length, 1);
    assert(host.stats("Marumaru").stopReason);
    assert.equal(host.stats("Marumaru").successfulReplays, 0);
    await host.close();
  }
});

void test("explicit CAPTCHA, security, denial and unresolved helper gates retain original response and never invoke solver", async () => {
  for (const code of ["captcha", "security", "denied", "unresolved"]) {
    const original = response(target);
    const { host, calls, messages } = fixture({
      direct: () => original.clone(),
      assist: () =>
        Response.json(
          {
            error: "secret-not-for-logs",
            code,
            metrics: { navigationAttempts: 1, replayAttempts: 0 },
          },
          { status: 409 },
        ),
    });
    const result = await host.fetch(target, options);
    assert.equal(result.status, 403);
    assert.equal(await result.text(), html);
    assert.equal(host.stats("Marumaru").stopReason, code);
    assert(!messages.join("").includes("secret-not-for-logs"));
    await host.fetch(target.replace("17155", "17156"), options);
    assert.equal(calls.filter((call) => call.path === "/browser/assist").length, 1);
    await host.close();
  }
});

void test("malformed byte envelopes, redirected results, cookies and dishonest metrics fail closed", async () => {
  for (const mutate of [
    (data) => ({ ...data, body: "////", byteLength: 1 }),
    (data) => ({ ...data, encoding: "utf8" }),
    (data) => ({ ...data, byteLength: 16 * 1024 * 1024 + 1 }),
    (data) => ({ ...data, url: "https://example.org/" }),
    (data) => ({ ...data, headers: { "set-cookie": "not-allowed=yes" } }),
    (data) => ({ ...data, metrics: { navigationAttempts: 4, replayAttempts: 1 } }),
  ]) {
    const { host } = fixture({ assist: (payload) => Response.json(mutate(envelope(payload.url))) });
    const result = await host.fetch(target, options);
    assert.equal(result.status, 403);
    assert.equal(await result.text(), html);
    assert.equal(host.stats("Marumaru").successfulReplays, 0);
    assert(host.stats("Marumaru").stopReason);
    await host.close();
  }
});

void test("three-attempt source cap is conservative across URLs and exact URL is never assisted twice", async () => {
  assert.equal(MAX_ASSISTANCE_ATTEMPTS, 3);
  const { host, calls } = fixture();
  for (let index = 0; index < 4; index++) {
    const value = await host.fetch(target.replace("17155", String(17155 + index)), options);
    assert.equal(value.status, index < 3 ? 200 : 403);
  }
  assert.equal((await host.fetch(target, options)).status, 403);
  assert.equal(calls.filter((call) => call.path === "/browser/assist").length, 3);
  assert.equal(host.stats("Marumaru").refusedAttempts, 2);
  await host.close();
});

void test("concurrent identical challenges share one replay without sharing a consumable response body", async () => {
  const bytes = Buffer.from([2, 3, 4]);
  const { host, calls } = fixture({
    assist: async (payload) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json(envelope(payload.url, bytes));
    },
  });
  const [first, second] = await Promise.all([
    host.fetch(target, options),
    host.fetch(target, options),
  ]);
  assert.deepEqual(Buffer.from(await first.arrayBuffer()), bytes);
  assert.deepEqual(Buffer.from(await second.arrayBuffer()), bytes);
  assert.equal(calls.filter((call) => call.path === "/browser/assist").length, 1);
  await host.close();
});

void test("concurrent different URLs serialize and an unresolved first attempt prevents queued helper traffic", async () => {
  const { host, calls } = fixture({
    assist: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json(
        {
          error: "unfinished",
          code: "unresolved",
          metrics: { navigationAttempts: 1, replayAttempts: 0 },
        },
        { status: 502 },
      );
    },
  });
  const replies = await Promise.all([
    host.fetch(target, options),
    host.fetch(target.replace("17155", "17156"), options),
  ]);
  assert(replies.every((reply) => reply.status === 403));
  assert.equal(calls.filter((call) => call.path === "/browser/assist").length, 1);
  assert.equal(host.stats("Marumaru").assistanceAttempts, 1);
  await host.close();
});

void test("unsupported public routes, credentials, POST, redirects and excluded sources stay direct", async () => {
  for (const [url, init] of [
    ["https://marumaru105.com/api/account", options],
    [target, { ...options, method: "POST", body: "{}" }],
    [target, { ...options, headers: { ...options.headers, Authorization: "not-a-real-secret" } }],
    [target, { ...options, headers: { Cookie: "not-a-real-cookie" } }],
  ]) {
    const { host, calls } = fixture();
    assert.equal((await host.fetch(url, init)).status, 403);
    assert.equal(calls.length, 1);
    await host.close();
  }
  const { host, calls } = fixture({ direct: () => response("https://example.org/") });
  assert.equal((await host.fetch(target, options)).status, 403);
  assert.equal(calls.length, 1);
  await host.close();
});

void test("unavailable helper outcome is explicitly unknown and the original challenge stays visible", async () => {
  const { host } = fixture({
    assist: () => {
      throw new Error("socket closed");
    },
  });
  assert.equal((await host.fetch(target, options)).status, 403);
  assert.equal(host.stats("Marumaru").unknownHelperOutcomes, 1);
  assert.equal(host.stats("Marumaru").navigationAttempts, 0);
  await host.close();
});

void test("caller signal cannot disable the fixed helper deadline", async () => {
  const originalTimeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout").value;
  const caller = new AbortController();
  const deadlines = [];
  // Keep the event loop alive while native AbortSignal.timeout uses an unref timer.
  const keepAlive = setTimeout(() => {}, 1000);
  AbortSignal.timeout = (milliseconds) => {
    deadlines.push(milliseconds);
    return originalTimeout(10);
  };
  const host = createCloudflareAssistance({
    solverURL: "http://127.0.0.1:8191",
    log: () => {},
    fetchImpl: async (url, init) => {
      if (url === target) return response(target);
      const payload = JSON.parse(init.body);
      if (payload.cmd === "sessions.destroy") return Response.json({ status: "ok" });
      assert.notEqual(init.signal, caller.signal);
      return new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    },
  });
  try {
    const result = await host.fetch(target, { ...options, signal: caller.signal });
    assert.equal(result.status, 403);
    assert.equal(caller.signal.aborted, false);
    assert.equal(host.stats("Marumaru").stopReason, "helper-unavailable");
    assert(deadlines.length >= 2 && deadlines.every((value) => value === 75_000));
    await host.close();
  } finally {
    AbortSignal.timeout = originalTimeout;
    clearTimeout(keepAlive);
  }
});
