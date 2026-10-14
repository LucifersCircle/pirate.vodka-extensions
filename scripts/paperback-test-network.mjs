// Test-only bridge: the alpha.92 Node polyfill has no WebView/FlareSolverr support.
// Kagane API requests use Chromium's network stack, preserving JSON POST bodies.
const nativeFetch = globalThis.fetch;
const solverURL = process.env.FLARESOLVERR_URL ?? "http://127.0.0.1:8191";
const browserStates = new Map();
const sourceHosts = new Set(["kagane.org", "vortexscans.org", "api.vortexscans.org"]);
const sessions = new Set();

async function solverCommand(payload) {
  let response;
  try {
    response = await nativeFetch(`${solverURL.replace(/\/$/, "")}/v1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(75000),
    });
  } catch (error) {
    throw new Error(`Could not reach FlareSolverr at ${solverURL}: ${String(error)}`);
  }
  const result = await response.json();
  if (!response.ok || result.status !== "ok") {
    throw new Error(`FlareSolverr failed: ${result.message ?? response.status}`);
  }
  return result;
}

async function solve(url, session) {
  const result = await solverCommand({ cmd: "request.get", url, session, maxTimeout: 60000 });
  if (!result.solution?.userAgent) throw new Error(`Missing FlareSolverr solution for ${url}`);
  if (
    result.solution.url?.startsWith("chrome-error:") ||
    result.solution.response?.includes("<title>Privacy error</title>")
  ) {
    throw new Error(`FlareSolverr browser could not securely load ${url}`);
  }
  return { ...result.solution, session };
}

process.once("beforeExit", async () => {
  await Promise.allSettled(
    [...sessions].map((session) => solverCommand({ cmd: "sessions.destroy", session })),
  );
});

function cookiesForURL(cookies, url) {
  return cookies
    .filter((cookie) => {
      const domain = cookie.domain.replace(/^\./, "");
      const path = cookie.path ?? "/";
      return (
        (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) &&
        (url.pathname === path ||
          url.pathname.startsWith(path.endsWith("/") ? path : `${path}/`)) &&
        (!cookie.expiry || cookie.expiry > Date.now() / 1000)
      );
    })
    .map((cookie) => `${cookie.name}=${cookie.value}`);
}

globalThis.fetch = async function paperbackTestFetch(input, init = {}) {
  const inputURL = typeof input === "string" || input instanceof URL ? input : input.url;
  const url = new URL(inputURL);
  if (!sourceHosts.has(url.hostname)) return nativeFetch(input, init);

  // Warm up each origin once, including concurrent taxonomy requests.
  let browserState = browserStates.get(url.origin);
  if (!browserState) {
    browserState = (async () => {
      let session;
      if (url.hostname === "kagane.org") {
        session = crypto.randomUUID();
        await solverCommand({ cmd: "sessions.create", session });
        sessions.add(session);
      }
      return solve(`${url.origin}/`, session);
    })();
    browserStates.set(url.origin, browserState);
  }
  let solution = await browserState;
  const headers = new Headers(
    init.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  const originalCookies = headers.get("cookie");

  async function send() {
    if (url.hostname === "kagane.org" && url.pathname.startsWith("/api/")) {
      const result = await nativeFetch(`${solverURL.replace(/\/$/, "")}/browser/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session: solution.session,
          url: url.toString(),
          method: init.method ?? (input instanceof Request ? input.method : "GET"),
          headers: Object.fromEntries(headers),
          body: init.body ?? null,
        }),
        signal: init.signal ?? AbortSignal.timeout(75000),
      });
      const data = await result.json();
      if (!result.ok || data.error || !data.status) {
        throw new Error(`Browser API request failed for ${url}: ${data.error ?? result.status}`);
      }
      const response = new Response([204, 205, 304].includes(data.status) ? null : data.body, {
        status: data.status,
        headers: data.headers,
      });
      Object.defineProperty(response, "url", { value: data.url });
      return response;
    }
    headers.set("user-agent", solution.userAgent);
    const cookies = new Map();
    for (const entry of [
      ...(originalCookies?.split(";") ?? []),
      ...cookiesForURL(solution.cookies ?? [], url),
    ]) {
      const delimiter = entry.indexOf("=");
      if (delimiter > 0) cookies.set(entry.slice(0, delimiter).trim(), entry.slice(delimiter + 1));
    }
    if (cookies.size) {
      headers.set("cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    } else {
      headers.delete("cookie");
    }
    const options = { ...init, headers, signal: init.signal ?? AbortSignal.timeout(60000) };
    return nativeFetch(input instanceof Request ? new Request(url, input) : url, options);
  }

  let response = await send();
  const isChallenge =
    response.headers.get("cf-mitigated") === "challenge" ||
    (response.headers.get("content-type")?.includes("text/html") &&
      (await response.clone().text()).includes("vShield"));
  if (isChallenge) {
    await response.body?.cancel();
    browserState = solve(url.toString(), solution.session);
    browserStates.set(url.origin, browserState);
    solution = await browserState;
    response = await send();
  }
  return response;
};
