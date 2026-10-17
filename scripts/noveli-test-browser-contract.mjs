// Test-only anonymous Noveli metadata contract. Keep in sync with browser_request.py.
export const NOVELI_ORIGIN = "https://noveli.to";
const prefix = `${NOVELI_ORIGIN}/api/novels`;
const sorts = new Set(["popular", "trending", "rating", "newest", "chapters", "az"]);
const positiveID = (value) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
const hasControls = (value) =>
  [...value].some((char) => char.charCodeAt(0) < 32 || char === "\u007f");

export function isNoveliMetadataURL(raw) {
  // Inspect source-issued strings, not a URL parser's normalized path or authority.
  if (typeof raw !== "string" || /[\\#\s]/u.test(raw) || hasControls(raw)) return false;
  if (raw === `${prefix}/rankings` || raw === `${prefix}/tags`) return true;
  if (raw.startsWith(`${prefix}/`)) {
    const route = raw.slice(prefix.length);
    const detail = /^\/([1-9]\d*)$/.exec(route);
    if (detail) return positiveID(detail[1]);
    if (/^\/[a-z0-9][a-z0-9-]*\/chapters$/.test(route)) return true;
    const reader = /^\/([1-9]\d*)\/chapters\/([1-9]\d*)$/.exec(route);
    return !!reader && positiveID(reader[1]) && positiveID(reader[2]);
  }
  if (!raw.startsWith(`${prefix}?`)) return false;
  const values = Object.create(null);
  try {
    for (const pair of raw.slice(prefix.length + 1).split("&")) {
      const [key, encoded, extra] = pair.split("=");
      if (
        encoded === undefined ||
        extra !== undefined ||
        Object.hasOwn(values, key) ||
        !["sort", "page", "limit", "search", "genres", "status"].includes(key)
      )
        return false;
      const value = decodeURIComponent(encoded);
      if (encodeURIComponent(value).replace(/'/g, "%27") !== encoded || hasControls(value))
        return false;
      values[key] = value;
    }
  } catch {
    return false;
  }
  return (
    sorts.has(values.sort) &&
    positiveID(values.page ?? "") &&
    Number(values.page) <= 10000 &&
    values.limit === "36" &&
    (values.status === undefined || ["Ongoing", "Completed"].includes(values.status)) &&
    (values.search === undefined || !!values.search.trim()) &&
    (values.genres === undefined ||
      (values.genres.split(",").every((genre) => !!genre.trim()) &&
        new Set(values.genres.split(",")).size === values.genres.split(",").length))
  );
}

export const isNoveliSessionURL = (raw) => raw === `${NOVELI_ORIGIN}/` || isNoveliMetadataURL(raw);

const deniedFlags = [
  "locked",
  "is_locked",
  "isLocked",
  "paid",
  "is_paid",
  "isPaid",
  "premium",
  "isPremium",
  "restricted",
  "is_restricted",
  "isRestricted",
  "requires_login",
  "requires_auth",
  "requiresAuth",
  "authentication_required",
  "requiresLogin",
  "login_required",
  "requiresPayment",
  "requires_payment",
  "payment_required",
  "is_premium",
  "requires_subscription",
  "subscription_required",
  "access_denied",
  "accessDenied",
];
const deniedText =
  /^(?:error code:\s*(?:1010|1020)|access denied|forbidden|unauthorized|login required|authentication required|sign in required)(?:[.!:\s]|$)/i;

export function isNoveliWarmSolution(solution, expectedURL) {
  if (
    solution?.status !== 200 ||
    !isNoveliSessionURL(solution.url) ||
    solution.url !== expectedURL ||
    typeof solution.response !== "string" ||
    Object.entries(solution.headers ?? {}).some(
      ([key, value]) =>
        key.toLowerCase() === "cf-mitigated" && String(value).trim().toLowerCase() === "challenge",
    )
  )
    return false;
  const body = solution.response;
  const sample = body.slice(0, 32768);
  if (
    /(?:\/cdn-cgi\/challenge-platform\/|\b_cf_chl_opt\b|<title[^>]*>\s*Just a moment(?:\.{3}|…)?\s*<\/title>)/i.test(
      sample,
    ) ||
    deniedText.test(body.trim()) ||
    /<title[^>]*>\s*(?:Access denied|Forbidden|Unauthorized|Login required|Authentication required|Sign in required)(?:\s*[|:-][^<]*)?\s*<\/title>/i.test(
      sample,
    )
  )
    return false;
  // Chromium may display an API JSON document inside a <pre> wrapper.
  const pre = /<pre\b[^>]*>([\s\S]*?)<\/pre>/i.exec(body);
  const jsonText = pre
    ? pre[1].replace(
        /&(quot|#39|lt|gt|amp);/g,
        (entity) =>
          ({
            "&quot;": '"',
            "&#39;": "'",
            "&lt;": "<",
            "&gt;": ">",
            "&amp;": "&",
          })[entity],
      )
    : body;
  if (deniedText.test(jsonText.trim())) return false;
  let json;
  try {
    json = JSON.parse(jsonText);
  } catch {
    return true;
  }
  const pending = [json];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    if (
      deniedFlags.some(
        (key) => key in value && ![undefined, null, false, 0].includes(value[key]),
      ) ||
      ["canRead", "can_read", "hasAccess", "has_access", "isAccessible"].some(
        (key) => key in value && value[key] !== true && value[key] !== 1,
      ) ||
      (typeof value.status === "string" &&
        /^(?:denied|locked|paid|restricted|login[_ -]?required|unauthorized|forbidden)$/i.test(
          value.status,
        )) ||
      (value.success !== true &&
        ["message", "error"].some(
          (key) => typeof value[key] === "string" && deniedText.test(value[key].trim()),
        ))
    )
      return false;
    pending.push(...Object.values(value));
  }
  return true;
}

export const isNoveliCoverURL = (raw) =>
  typeof raw === "string" &&
  /^https:\/\/noveli\.to\/uploads\/covers\/[A-Za-z0-9_~.-]+\.(?:webp|png|jpe?g|avif)$/.test(raw) &&
  !raw.includes("/..");

export const isNoveliBrowserRequest = (raw, method, body, headers) =>
  isNoveliMetadataURL(raw) &&
  method === "GET" &&
  body == null &&
  headers instanceof Headers &&
  [...headers].length === 0;
