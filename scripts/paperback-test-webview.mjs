// Test-only alpha.92 supplied-HTML WebView host. This is anonymous Chromium,
// not an iOS/WKWebView emulator. Production bundles never import this module.
import { randomUUID } from "node:crypto";

const MAX_JSON = 4 * 1024 * 1024;
const TIMEOUT = 30;

function record(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Unsupported WebView object");
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      !allowed.includes(key) ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new Error("Unsupported WebView property");
    result[key] = descriptor.value;
  }
  return result;
}

export function assertPaperbackDocumentURL(value) {
  const reject = () => {
    throw new Error("Unsupported Paperback test WebView document");
  };
  if (
    typeof value !== "string" ||
    /[\\#]/.test(value) ||
    value.split("").some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
  )
    reject();
  let url;
  try {
    url = new URL(value);
  } catch {
    reject();
  }
  if (
    url.href !== value ||
    url.origin !== "https://marumaru105.com" ||
    url.username ||
    url.password ||
    !/^\/(?:manhwa(?:\/[1-9]\d*(?:\/[1-9]\d*)?)?|search)$/.test(url.pathname)
  )
    reject();
  const keys = [...url.searchParams.keys()];
  if (
    new Set(keys).size !== keys.length ||
    [...url.searchParams.values()].some((value) =>
      value.split("").some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
    )
  )
    reject();
  const page = url.searchParams.get("page");
  if (page !== null && !/^[1-9]\d*$/.test(page)) reject();
  if (url.pathname === "/search") {
    const q = url.searchParams.get("q");
    if (
      !q?.trim() ||
      q.length > 300 ||
      url.searchParams.get("kind") !== "manhwa" ||
      keys.some((key) => !["q", "kind", "page"].includes(key))
    )
      reject();
  } else if (keys.length && (url.pathname !== "/manhwa" || keys.length !== 1 || keys[0] !== "page"))
    reject();
}

export function validatePaperbackWebViewContext(context) {
  const input = record(context, ["source", "inject", "storage", "captureConsoleLog"]);
  const source = record(input.source, ["html", "baseUrl", "loadCSS", "loadImages"]);
  const storage = record(input.storage, ["cookies"]);
  assertPaperbackDocumentURL(source.baseUrl);
  if (
    typeof source.html !== "string" ||
    !source.html ||
    Buffer.byteLength(source.html) > MAX_JSON ||
    Buffer.from(source.html).toString("utf8") !== source.html ||
    typeof input.inject !== "string" ||
    !input.inject ||
    Buffer.byteLength(input.inject) > 128 * 1024 ||
    source.loadCSS !== true ||
    source.loadImages !== true ||
    (input.captureConsoleLog !== undefined && input.captureConsoleLog !== false) ||
    !Array.isArray(storage.cookies) ||
    Reflect.ownKeys(storage.cookies).join(",") !== "length" ||
    storage.cookies.length !== 0
  )
    throw new Error("Unsupported Paperback test WebView options");
  // No caller identity, cookie import/export, console capture or ignored options.
  return { source: { ...source }, inject: input.inject, cookies: [] };
}

export function strictWebViewJSON(value) {
  const active = new Set();
  let nodes = 0;
  function visit(item, depth = 0) {
    if (++nodes > 100000 || depth > 64) throw new Error("WebView JSON complexity limit");
    if (item === null || typeof item === "boolean" || typeof item === "string") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || active.has(item))
      throw new Error("WebView requires finite acyclic JSON");
    const array = Array.isArray(item),
      prototype = Object.getPrototypeOf(item);
    if (!array && prototype !== null) {
      const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
      if (
        Object.getPrototypeOf(prototype) !== null ||
        typeof constructor !== "function" ||
        Function.prototype.toString.call(constructor) !== Function.prototype.toString.call(Object)
      )
        throw new Error("WebView JSON object is not plain");
    }
    active.add(item);
    const output = array ? [] : Object.create(null);
    let index = 0;
    for (const key of Reflect.ownKeys(item)) {
      if (array && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (
        typeof key !== "string" ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        (array && key !== String(index++))
      )
        throw new Error("WebView JSON contains hidden, sparse or accessor values");
      output[key] = visit(descriptor.value, depth + 1);
    }
    if (array && output.length !== item.length) throw new Error("WebView JSON array is sparse");
    active.delete(item);
    return output;
  }
  const json = JSON.stringify(visit(value));
  if (Buffer.byteLength(json) > MAX_JSON) throw new Error("WebView JSON size limit");
  return JSON.parse(json);
}

export async function boundedWebViewResponse(response, signal) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing WebView helper body");
  const chunks = [];
  let size = 0;
  let abort;
  const deadline = new Promise((_, reject) => {
    abort = () => reject(new Error("WebView helper response timeout"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    for (let reads = 0; ; reads++) {
      signal.throwIfAborted();
      if (reads > 65536) throw new Error("WebView helper body read limit");
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON + 4096) throw new Error("WebView helper body size limit");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createPaperbackTestWebView({
  solverURL = process.env.FLARESOLVERR_URL ?? "http://127.0.0.1:8191",
  fetchImpl = globalThis.fetch,
} = {}) {
  const helper = new URL(solverURL);
  if (
    helper.protocol !== "http:" ||
    helper.hostname !== "127.0.0.1" ||
    helper.username ||
    helper.password ||
    helper.pathname !== "/" ||
    helper.search ||
    helper.hash
  )
    throw new Error("WebView helper must be loopback HTTP");
  const active = new Set();
  let closed = false,
    stopped;
  async function command(path, payload, seconds = TIMEOUT) {
    const signal = AbortSignal.timeout((seconds + 5) * 1000);
    let response, result;
    try {
      response = await fetchImpl(helper.origin + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal,
        redirect: "error",
        credentials: "omit",
      });
      result = JSON.parse(await boundedWebViewResponse(response, signal));
    } catch {
      throw new Error("Paperback WebView helper failed; upstream bodies are not logged");
    }
    if (
      !response.ok ||
      !result ||
      typeof result !== "object" ||
      result.error ||
      (path === "/v1" && result.status !== "ok")
    ) {
      if (result?.code === "captcha")
        stopped = new Error("Explicit CAPTCHA requires approval; Paperback WebView checks stopped");
      if (result?.code === "security")
        stopped = new Error("Browser security warning; Paperback WebView checks stopped");
      if (stopped) throw stopped;
      // Never place arbitrary provider/helper error strings or HTML in CI logs.
      const reasons = [
        "operation-timeout",
        "document-identity-changed",
        "document-not-supplied",
        "callback-rejected",
        "serialization-error",
        "result-too-large",
        "invalid-result",
        "browser-command-failed",
        "browser-operation-failed",
        "navigation-error",
        "evaluation-failed",
        "resource-limit",
        "resource-load-failed",
        "unsupported-subresource",
        "private-subresource",
        "unexpected-window",
        "unexpected-dialog",
        "unsupported-browser-target",
        "session-not-found",
        "session-busy",
        "debugger-unavailable",
        "unsupported-debugger-address",
      ];
      const reason = reasons.includes(result?.reason) ? result.reason : "unknown";
      const stages = [
        "same-document-event",
        "main-frame-url",
        "main-frame-recommit",
        "main-response-redirect",
        "main-request-identity",
        "isolated-observer",
        "safety-before-inject",
        "safety-after-inject",
        "inject-result",
        "final-frame-url",
        "final-loader",
      ];
      const stage = stages.includes(result?.stage) ? `; ${result.stage}` : "";
      throw new Error(`Paperback WebView operation failed (${reason}${stage})`);
    }
    return result;
  }
  const open = () => {
    if (closed || stopped) throw stopped ?? new Error("Paperback WebView host is closed");
  };
  return {
    executeInWebView(context) {
      open();
      const payload = validatePaperbackWebViewContext(context),
        session = randomUUID();
      const operation = (async () => {
        let primary, answer;
        try {
          // Never call request.get/request.post or a challenge-solving path.
          await command("/v1", { cmd: "sessions.create", session });
          open();
          const result = await command("/browser/paperback-webview", {
            session,
            ...payload,
            timeout: TIMEOUT,
          });
          open();
          if (
            Object.keys(result).sort().join(",") !== "url,value" ||
            result.url !== payload.source.baseUrl
          )
            throw new Error("Paperback WebView result document identity changed");
          answer = { result: strictWebViewJSON(result.value), storage: { cookies: [] } };
        } catch (error) {
          primary = error;
        } finally {
          // Even a lost create response may have created this unique session.
          try {
            await command("/v1", { cmd: "sessions.destroy", session }, 10);
          } catch (error) {
            primary ??= error;
          }
        }
        if (primary) throw primary;
        return answer;
      })();
      active.add(operation);
      void operation.finally(() => active.delete(operation)).catch(() => {});
      return operation;
    },
    async close() {
      closed = true;
      await Promise.allSettled(active);
    },
  };
}
