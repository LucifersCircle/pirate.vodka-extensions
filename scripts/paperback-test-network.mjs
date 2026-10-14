// Test-only bridge: the alpha.92 Node polyfill has no WebView/FlareSolverr support.
// API requests still use fetch, preserving JSON POST bodies and response headers.
const nativeFetch = globalThis.fetch;
const solverURL = process.env.FLARESOLVERR_URL ?? "http://127.0.0.1:8191";
const browserStates = new Map();
const sourceHosts = new Set(["kagane.org", "vortexscans.org", "api.vortexscans.org"]);

async function solve(url) {
  let response;
  try {
    response = await nativeFetch(`${solverURL.replace(/\/$/, "")}/v1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cmd: "request.get", url, maxTimeout: 60000 }),
      signal: AbortSignal.timeout(75000),
    });
  } catch (error) {
    throw new Error(`Could not reach FlareSolverr at ${solverURL}: ${String(error)}`);
  }
  const result = await response.json();
  if (!response.ok || result.status !== "ok" || !result.solution?.userAgent) {
    throw new Error(`FlareSolverr failed for ${url}: ${result.message ?? response.status}`);
  }
  if (
    result.solution.url?.startsWith("chrome-error:") ||
    result.solution.response?.includes("<title>Privacy error</title>")
  ) {
    throw new Error(`FlareSolverr browser could not securely load ${url}`);
  }
  return result.solution;
}

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
    browserState = solve(`${url.origin}/`);
    browserStates.set(url.origin, browserState);
  }
  let solution = await browserState;
  const headers = new Headers(
    init.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  const originalCookies = headers.get("cookie");

  async function send() {
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
    browserState = solve(url.toString());
    browserStates.set(url.origin, browserState);
    solution = await browserState;
    response = await send();
  }
  return response;
};
