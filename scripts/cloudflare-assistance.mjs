// Test-only, positive-evidence passive Chromium assistance. No production imports.
// A bounded helper response replaces transport bytes, never a native SDK method.
import { randomUUID } from "node:crypto";
import { assistanceRequest } from "./cloudflare-assistance-contract.mjs";

export const MAX_ASSISTANCE_ATTEMPTS = 3;
const MAX_BYTES = 16 * 1024 * 1024;
const DENIAL =
  /access denied|you have been blocked|automated scraping agents.{0,100}prohibited|error(?:\s*code)?\s*:?\s*(?:1006|1007|1008|1010|1020)\b/i;
const failures = new Set([
  "captcha",
  "security",
  "unresolved",
  "denied",
  "unsupported",
  "operation",
]);

async function challenge(response) {
  if (
    ![403, 503].includes(response.status) ||
    response.headers.get("cf-mitigated")?.toLowerCase() !== "challenge" ||
    !/^text\/html(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")
  )
    return false;
  const copy = response.clone(),
    reader = copy.body?.getReader();
  if (!reader) return false;
  const chunks = [];
  let bytes = 0,
    timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), 2000);
  });
  try {
    while (bytes < 64 * 1024) {
      const item = await Promise.race([reader.read(), timeout]);
      if (!item) return false;
      if (item.done) break;
      const part = Buffer.from(item.value).subarray(0, 64 * 1024 - bytes);
      chunks.push(part);
      bytes += part.length;
    }
    return !DENIAL.test(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function decode(data, expectedURL) {
  if (
    !data ||
    data.url !== expectedURL ||
    !Number.isInteger(data.status) ||
    data.status < 200 ||
    data.status > 599 ||
    (data.status >= 300 && data.status < 400) ||
    data.encoding !== "base64" ||
    typeof data.body !== "string" ||
    !Number.isSafeInteger(data.byteLength) ||
    data.byteLength < 0 ||
    data.byteLength > MAX_BYTES ||
    data.body.length !== Math.ceil(data.byteLength / 3) * 4 ||
    !data.headers ||
    typeof data.headers !== "object" ||
    Array.isArray(data.headers)
  ) {
    throw new Error("invalid-response");
  }
  const bytes = Buffer.from(data.body, "base64");
  if (bytes.length !== data.byteLength || bytes.toString("base64") !== data.body)
    throw new Error("invalid-response");
  // Headers are real browser response metadata. They must not carry new cookies
  // into Node or manufacture an implicit authenticated session.
  const headers = new Headers();
  for (const [key, value] of Object.entries(data.headers)) {
    if (typeof value !== "string" || /^set-cookie2?$/i.test(key))
      throw new Error("invalid-response");
    headers.append(key, value);
  }
  if ([204, 205, 304].includes(data.status) && bytes.length) throw new Error("invalid-response");
  const response = new Response([204, 205, 304].includes(data.status) ? null : bytes, {
    status: data.status,
    headers,
  });
  Object.defineProperty(response, "url", { value: data.url });
  return response;
}

export function createCloudflareAssistance({
  solverURL = process.env.FLARESOLVERR_URL,
  fetchImpl = globalThis.fetch,
  excludedSources = [],
  log = (message) => console.log(message),
} = {}) {
  const states = new Map(),
    sessions = new Map();
  let closed = false;
  const stateFor = (source) => {
    if (!states.has(source))
      states.set(source, {
        positiveChallenges: 0,
        assistanceAttempts: 0,
        helperCalls: 0,
        sessionLifecycleCalls: 0,
        navigationAttempts: 0,
        replayAttempts: 0,
        unknownHelperOutcomes: 0,
        refusedAttempts: 0,
        successfulReplays: 0,
        attempted: new Set(),
        pending: new Map(),
        queue: Promise.resolve(),
      });
    return states.get(source);
  };
  const stats = (source) => {
    const snapshot = (value) => {
      const { attempted: _attempted, pending: _pending, queue: _queue, ...counts } = value;
      return {
        ...counts,
        assistanceLimit: MAX_ASSISTANCE_ATTEMPTS,
        browserSubresourcesCounted: false,
      };
    };
    return source
      ? snapshot(stateFor(source))
      : Object.fromEntries([...states].map(([name, state]) => [name, snapshot(state)]));
  };
  if (!solverURL) return { fetch: fetchImpl, close: async () => {}, stats };
  const solver = new URL(solverURL);
  if (
    solver.protocol !== "http:" ||
    solver.hostname !== "127.0.0.1" ||
    solver.username ||
    solver.password ||
    solver.pathname !== "/" ||
    solver.search ||
    solver.hash
  )
    throw new Error("Cloudflare assistance requires the loopback test helper");
  const excluded = new Set(excludedSources);
  async function command(path, payload, state, signal) {
    state.helperCalls += 1;
    if (path === "/v1") state.sessionLifecycleCalls += 1;
    let response, result;
    try {
      response = await fetchImpl(`${solver.origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(75_000)])
          : AbortSignal.timeout(75_000),
      });
      result = await response.json();
    } catch {
      if (path === "/browser/assist") state.unknownHelperOutcomes += 1;
      throw new Error("helper-unavailable");
    }
    if (path === "/browser/assist") {
      const metrics = result?.metrics;
      if (
        metrics &&
        Number.isSafeInteger(metrics.navigationAttempts) &&
        metrics.navigationAttempts >= 0 &&
        metrics.navigationAttempts <= 3 &&
        Number.isSafeInteger(metrics.replayAttempts) &&
        metrics.replayAttempts >= 0 &&
        metrics.replayAttempts <= 1
      ) {
        state.navigationAttempts += metrics.navigationAttempts;
        state.replayAttempts += metrics.replayAttempts;
      } else {
        state.unknownHelperOutcomes += 1;
        throw new Error("invalid-metrics");
      }
    }
    if (
      !response.ok ||
      !result ||
      typeof result !== "object" ||
      result.error ||
      (path === "/v1" && result.status !== "ok")
    ) {
      throw new Error(failures.has(result?.code) ? result.code : "helper-failed");
    }
    return result;
  }
  async function destroy(session, state) {
    await command("/v1", { cmd: "sessions.destroy", session }, state);
    sessions.delete(session);
  }
  async function assist(request, state, signal) {
    const session = randomUUID();
    sessions.set(session, state); // Even an uncertain create outcome is cleaned up.
    try {
      signal?.throwIfAborted();
      await command("/v1", { cmd: "sessions.create", session }, state, signal);
      signal?.throwIfAborted();
      const data = await command("/browser/assist", { session, ...request }, state, signal);
      signal?.throwIfAborted();
      const response = decode(data, request.url);
      if (["unresolved", "denied"].includes(data.terminalReason))
        state.stopReason = data.terminalReason;
      else if (response.headers.get("cf-mitigated")?.toLowerCase() === "challenge")
        state.stopReason = "unresolved";
      else if (!response.ok) state.stopReason = "unsuccessful-response";
      else state.successfulReplays += 1;
      // Even a remaining challenge, 406 or other failure remains its real replay
      // status/headers/bytes. Only unavailable/invalid helper output retains the
      // original challenge; neither path manufactures a successful body.
      if (state.stopReason)
        log(
          `[cloudflare-assistance] ${request.source}: stopped (${state.stopReason}); actual replay retained`,
        );
      return response;
    } catch (error) {
      const known = new Set([
        ...failures,
        "helper-unavailable",
        "helper-failed",
        "invalid-response",
        "invalid-metrics",
      ]);
      state.stopReason = known.has(error.message) ? error.message : "operation";
      log(
        `[cloudflare-assistance] ${request.source}: stopped (${state.stopReason}); original response retained`,
      );
      return null;
    } finally {
      try {
        await destroy(session, state);
      } catch {
        state.stopReason ??= "cleanup-failed";
      }
    }
  }
  return {
    async fetch(input, init = {}) {
      // Never convert a network error, unsupported route or ordinary 406/403 into
      // a browser attempt. The original native operation always executes first.
      const response = await fetchImpl(input, init);
      const request = assistanceRequest(input, init);
      if (
        !request ||
        excluded.has(request.source) ||
        closed ||
        (response.url && response.url !== request.url) ||
        !(await challenge(response))
      )
        return response;
      const state = stateFor(request.source);
      state.positiveChallenges += 1;
      init.signal?.throwIfAborted();
      const fingerprint = JSON.stringify(request.headers);
      const inFlight = state.pending.get(request.url);
      let pending;
      if (inFlight && inFlight.fingerprint === fingerprint) pending = inFlight.promise;
      else if (
        state.stopReason ||
        state.attempted.has(request.url) ||
        state.attempted.size >= MAX_ASSISTANCE_ATTEMPTS
      ) {
        state.refusedAttempts += 1;
        return response;
      } else {
        state.attempted.add(request.url);
        pending = state.queue.then(async () => {
          if (state.stopReason || closed) {
            state.refusedAttempts += 1;
            return null;
          }
          init.signal?.throwIfAborted();
          state.assistanceAttempts += 1;
          return assist(request, state, init.signal);
        });
        state.queue = pending.catch(() => {});
        state.pending.set(request.url, { fingerprint, promise: pending });
        void pending.then(
          () => state.pending.delete(request.url),
          () => state.pending.delete(request.url),
        );
      }
      const replay = await pending;
      init.signal?.throwIfAborted();
      if (!replay) return response;
      void response.body?.cancel().catch(() => {});
      const copy = replay.clone();
      Object.defineProperty(copy, "url", { value: replay.url });
      return copy;
    },
    stats,
    async close() {
      closed = true;
      await Promise.all(
        [...states.values()].flatMap((state) =>
          [...state.pending.values()].map((item) => item.promise),
        ),
      );
      await Promise.all(
        [...sessions].map(async ([session, state]) => {
          try {
            await destroy(session, state);
          } catch {
            state.stopReason ??= "cleanup-failed";
          }
        }),
      );
      if (sessions.size) throw new Error("Cloudflare assistance session cleanup failed");
    },
  };
}
