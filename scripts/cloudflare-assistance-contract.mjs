// Test-only public GET routing. This supplements, never replaces, native source
// authorization (especially issued Marumaru image provenance). Keep Python in sync.
import { types as utilTypes } from "node:util";
const owners = {
  Marumaru: "https://marumaru105.com",
  Hijala: "https://en-hijala.com",
  MangaSushi: "https://mangasushi.org",
  ManhwaNex: "https://manhwanex.com",
  MangaStash: "https://mangastash.org",
  VortexScans: "https://vortexscans.org",
};
const statuses =
  "ONGOING COMPLETED CANCELLED DROPPED MASS_RELEASED COMING_SOON ONE_SHOT HIATUS".split(" ");
const types = "MANHWA MANHUA MANGA SPANISH RUSSIAN".split(" ");
const nexGenres =
  "action adventure cultivation-manhwa fantasy ghost-manhwa martial-arts romance system-manhwa".split(
    " ",
  );
const sorts = "lastChapterAddedAt totalViews createdAt chaptersCount postTitle".split(" ");
const stashReserved =
  "browse search account content assets trending collections admin api auth login logout register registration sign-in sign-out sign-up signin signout signup settings profile password reset-password forgot-password users user dashboard checkout cart subscribe subscription payment billing wp-admin".split(
    " ",
  );
const stashFilters = {
  status: "ongoing completed hiatus cancelled",
  genre:
    "action adventure comedy drama fantasy horror isekai mystery romance school-life sci-fi slice-of-life sports thriller",
  theme: "coming-of-age cooking first-love military politics revenge superpowers survival",
  mood: "bittersweet chill cozy dark dramatic eerie emotional grim heartwarming hopeful humorous intense melancholy mysterious nostalgic playful relaxing serene suspenseful tense triumphant uplifting whimsical wholesome",
  format: "4-koma manga manhua manhwa one-shot webtoon",
  demographic: "josei seinen shoujo shounen",
  language: "EN",
};
const controls = (value) =>
  [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const integer = (value, min = 1, max = 10000) =>
  typeof value === "string" &&
  /^(?:0|[1-9]\d*)$/.test(value) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) >= min &&
  Number(value) <= max;
const id = (value) => integer(value, 1, Number.MAX_SAFE_INTEGER);
const slug = (value) =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(value);
const search = (value, max = 512) =>
  typeof value === "string" && !!value.trim() && value.length <= max && !controls(value);
const oneOf = (value, options) => options.includes(value);
const listOf = (value, valid) =>
  typeof value === "string" &&
  value.split(",").every(valid) &&
  new Set(value.split(",")).size === value.split(",").length;
const strictEncode = (value) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const formEncode = (value) => new URLSearchParams({ v: value }).toString().slice(2);

function parse(raw) {
  if (typeof raw !== "string" || raw.length > 8192 || /[^\x21-\x7e]|[\\#"<>^`{}|]/.test(raw))
    return null;
  const match = /^https:\/\/([a-z0-9.-]+)(\/[^?]*)(?:\?(.+))?$/.exec(raw);
  if (!match || /%2f|%5c|%00|%25|(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(match[2])) return null;
  // No path normalization, escaped authority, non-default/explicit ports or credentials.
  if (new URL(raw).href !== raw) return null;
  const pairs = [];
  const seen = new Set();
  const arrayStyles = new Map();
  for (const pair of match[3]?.split("&") ?? []) {
    const fields = pair.split("=");
    if (fields.length !== 2) return null;
    const [key, value] = fields.map((part) => decodeURIComponent(part.replace(/\+/g, " ")));
    if (controls(key) || controls(value) || value.length > 1024) return null;
    if (![encodeURIComponent(key), formEncode(key)].includes(fields[0])) return null;
    if (![encodeURIComponent(value), strictEncode(value), formEncode(value)].includes(fields[1]))
      return null;
    if (seen.has(key) && !key.endsWith("[]")) return null;
    const array = /^([^[]+)\[(\d*)\]$/.exec(key);
    if (array) {
      const style = array[2] ? "indexed" : "appended";
      if (arrayStyles.has(array[1]) && arrayStyles.get(array[1]) !== style) return null;
      arrayStyles.set(array[1], style);
    }
    if (
      pairs.some(
        ([prior, item]) =>
          prior.replace(/\[(?:\d*)\]$/, "[]") === key.replace(/\[(?:\d*)\]$/, "[]") &&
          item === value,
      )
    )
      return null;
    seen.add(key);
    pairs.push([key, value]);
  }
  return { host: match[1], path: match[2], pairs, query: match[3] ?? "" };
}
const exact = (pairs, required, optional = {}) => {
  const values = Object.fromEntries(pairs);
  return (
    pairs.length === Object.keys(values).length &&
    Object.keys(required).every((key) => Object.hasOwn(values, key)) &&
    pairs.every(([key, value]) => (required[key] ?? optional[key])?.(value) === true)
  );
};
const eq = (expected) => (value) => value === expected;

function publicQuery(pairs, vortex = false) {
  const required = {
    page: integer,
    perPage: (v) => oneOf(v, vortex ? ["48"] : ["20", "100"]),
    orderBy: (v) => oneOf(v, vortex ? sorts.filter((s) => s !== "chaptersCount") : sorts),
    orderDirection: (v) => oneOf(v, ["asc", "desc"]),
  };
  const optional = {
    searchTerm: search,
    genreIds: (v) => listOf(v, id),
    excludedGenreIds: (v) => listOf(v, id),
    seriesStatus: (v) =>
      vortex
        ? oneOf(
            v,
            statuses.filter((s) => s !== "ONE_SHOT"),
          )
        : listOf(v, (s) => oneOf(s, statuses)),
    seriesType: (v) => (vortex ? oneOf(v, types) : listOf(v, (s) => oneOf(s, types))),
  };
  if (vortex) Object.assign(optional, { view: eq("archive"), isNovel: eq("false") });
  else
    Object.assign(optional, {
      minChapters: (v) => integer(v, 0, 1000000),
      maxChapters: (v) => integer(v, 0, 1000000),
      createdAfter: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
      createdBefore: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
    });
  return exact(pairs, required, optional);
}
function posts(pairs, vortex = false) {
  return exact(pairs, {
    page: integer,
    perPage: eq(vortex ? "36" : "20"),
    searchTerm: eq(""),
    isNovel: eq("false"),
    tag: (v) =>
      oneOf(
        v,
        vortex ? ["latestUpdatePinned", "new"] : ["latestUpdate", "latestUpdatePinned", "new"],
      ),
  });
}
function madara(path, pairs, sushi) {
  if (!sushi) {
    const genre = /^\/manga-genre\/([^/]+)\//.exec(path);
    const page = /\/page\/([0-9]+)\/$/.exec(path);
    if ((genre && !nexGenres.includes(genre[1])) || (page && !integer(page[1]))) return false;
  }
  const catalog = sushi
    ? path === "/"
    : /^(?:\/manga-genre\/[A-Za-z0-9_-]+)?\/(?:page\/[1-9]\d*\/)?$/.test(path);
  if (!pairs.length)
    return (
      catalog ||
      (sushi && /^\/manga-genre\/[a-z][a-z0-9-]*\/$/.test(path)) ||
      /^\/manga\/[A-Za-z0-9][A-Za-z0-9_-]*\/(?:[A-Za-z0-9][A-Za-z0-9_-]*\/)?$/.test(path)
    );
  if (!catalog) return false;
  const scalar = {
    s: (v) => v.length <= 512,
    post_type: eq("wp-manga"),
    op: (v) => oneOf(v, ["", "1"]),
    author: (v) => v.length <= 300,
    artist: (v) => v.length <= 300,
    release: (v) => v === "" || /^\d{4}$/.test(v),
    adult: (v) => oneOf(v, ["", "0", "1"]),
  };
  if (sushi)
    scalar.m_orderby = (v) =>
      oneOf(v, ["", "latest", "alphabet", "rating", "trending", "views", "new-manga"]);
  const values = Object.fromEntries(pairs);
  return (
    Object.hasOwn(values, "s") &&
    values.post_type === "wp-manga" &&
    pairs.every(([key, value]) => {
      const array = /^(genre|status)\[(?:0|[1-9]\d*)?\]$/.exec(key);
      if (array)
        return array[1] === "genre"
          ? sushi
            ? /^[a-z0-9-]+$/.test(value)
            : nexGenres.includes(value)
          : oneOf(value, ["on-going", "end", "canceled", "on-hold", "upcoming"]);
      return scalar[key]?.(value) === true;
    })
  );
}
function stash(path, pairs) {
  if (path === "/") return !pairs.length;
  if (path === "/search") return exact(pairs, { q: search }, { page: integer });
  if (path === "/browse/")
    return pairs.every(([key, value]) => {
      if (key === "page") return integer(value);
      if (key === "sort") return oneOf(value, ["latest", "popular-month", "popular-year", "title"]);
      if (key === "rating") return oneOf(value, ["safe", "suggestive", "mature"]);
      const match = /^([a-z]+)\[(?:0|[1-9]\d*)?\]$/.exec(key);
      return !!match && (stashFilters[match[1]]?.split(" ").includes(value) ?? false);
    });
  const match = /^\/([a-z0-9][a-z0-9-]{0,255})\/(?:chapter-[a-zA-Z0-9][a-zA-Z0-9.-]{0,127})?$/.exec(
    path,
  );
  return !pairs.length && !!match && !stashReserved.includes(match[1]) && !path.includes("..");
}
function sourceFor(parsed) {
  const { host, path, pairs, query } = parsed;
  if (host === "marumaru105.com") {
    const work = /^\/api\/works\/([1-9]\d*)$/.exec(path);
    if (work && !query && id(work[1])) return "Marumaru";
    if (
      path === "/api/works" &&
      /^mediaType=MANHWA&page=(?:0|[1-9]\d*)&size=49$/.test(query) &&
      exact(pairs, { mediaType: eq("MANHWA"), page: (v) => integer(v, 0, 9999), size: eq("49") })
    )
      return "Marumaru";
    if (
      path === "/api/search" &&
      /^q=(?:[A-Za-z0-9_.!~*'()-]|%[0-9A-F]{2})+&page=(?:0|[1-9]\d*)&media=MANHWA&sort=LATEST$/.test(
        query,
      ) &&
      exact(pairs, {
        q: (v) => search(v, 300),
        page: (v) => integer(v, 0, 9999),
        media: eq("MANHWA"),
        sort: eq("LATEST"),
      })
    )
      return "Marumaru";
  }
  if (host === "api.storagewebtoon.store" && !query) {
    const match = /^\/api\/v1\/reader\/A2\/(?:works|episodes)\/([1-9]\d*)$/.exec(path);
    if (match && id(match[1])) return "Marumaru";
  }
  if (host === "peer.storagewebtoon.store" && !query) {
    const cover = /^\/(?:manhwa|webtoon)\/([1-9]\d*)\/([A-Za-z0-9._-]{1,255})$/.exec(path);
    const page = /^\/api\/media\/episode\/([1-9]\d*)\/([1-9]\d*)\.webp$/.exec(path);
    if ((cover && id(cover[1]) && !cover[2].includes("..")) || (page && id(page[1]) && id(page[2])))
      return "Marumaru";
  }
  if (
    host === "en-hijala.com" &&
    !query &&
    (path === "/" ||
      path === "/series/" ||
      /^\/series\/[A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)?$/.test(path))
  )
    return "Hijala";
  if (
    host === "api.en-hijala.com" &&
    ((path === "/api/query" && publicQuery(pairs)) || (path === "/api/posts" && posts(pairs)))
  )
    return "Hijala";
  if (host === "mangasushi.org" && madara(path, pairs, true)) return "MangaSushi";
  if (host === "manhwanex.com" && madara(path, pairs, false)) return "ManhwaNex";
  if (host === "mangastash.org" && stash(path, pairs)) return "MangaStash";
  // Paperback excludes VortexScans downstream, retaining its existing path.
  if (host === "vortexscans.org" && path === "/" && !query) return "VortexScans";
  if (host === "api.vortexscans.org") {
    if (
      (!query && ["/api/genres", "/api/collections"].includes(path)) ||
      (!query && /^\/api\/collections\/[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(path))
    )
      return "VortexScans";
    if (path === "/api/query" && publicQuery(pairs, true)) return "VortexScans";
    if (path === "/api/posts" && posts(pairs, true)) return "VortexScans";
    if (path === "/api/post" && (exact(pairs, { postId: id }) || exact(pairs, { postSlug: slug })))
      return "VortexScans";
    if (path === "/api/chapter" && exact(pairs, { chapterId: id })) return "VortexScans";
    if (
      path === "/api/chapters" &&
      exact(pairs, {
        postId: id,
        skip: eq("0"),
        take: eq("500"),
        order: eq("desc"),
        search: eq(""),
      })
    )
      return "VortexScans";
  }
  return null;
}
// Paperback source headers originate in a VM. Recognize the actual foreign
// Object.prototype, not arbitrary objects with a borrowed constructor. Read only
// descriptors so caller accessors/proxy traps never run during classification.
const objectPrototypeKeys = new Set([
  "constructor",
  "__defineGetter__",
  "__defineSetter__",
  "hasOwnProperty",
  "__lookupGetter__",
  "__lookupSetter__",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toString",
  "valueOf",
  "__proto__",
  "toLocaleString",
]);
const objectConstructorSource = Function.prototype.toString.call(Object);
const nativeHeaderSlots = new Set(Reflect.ownKeys(new Headers()));
function plainPrototype(prototype) {
  if (prototype === null) return true;
  if (utilTypes.isProxy(prototype) || Object.getPrototypeOf(prototype) !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(prototype);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== objectPrototypeKeys.size || keys.some((key) => !objectPrototypeKeys.has(key)))
    return false;
  const constructor = descriptors.constructor;
  if (
    !constructor ||
    !Object.hasOwn(constructor, "value") ||
    constructor.enumerable ||
    typeof constructor.value !== "function" ||
    utilTypes.isProxy(constructor.value) ||
    Function.prototype.toString.call(constructor.value) !== objectConstructorSource
  )
    return false;
  const identity = Object.getOwnPropertyDescriptor(constructor.value, "prototype");
  if (!identity || !Object.hasOwn(identity, "value") || identity.value !== prototype) return false;
  return keys.every((key) => {
    const descriptor = descriptors[key];
    return (
      !descriptor.enumerable &&
      (key === "__proto__"
        ? typeof descriptor.get === "function" && typeof descriptor.set === "function"
        : Object.hasOwn(descriptor, "value") && typeof descriptor.value === "function")
    );
  });
}
function snapshotRecord(value) {
  if (
    !value ||
    typeof value !== "object" ||
    utilTypes.isProxy(value) ||
    !plainPrototype(Object.getPrototypeOf(value))
  )
    return null;
  const descriptors = Object.getOwnPropertyDescriptors(value),
    result = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))
      return null;
    result[key] = descriptor.value;
  }
  return result;
}
function snapshotArray(value) {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    return null;
  const descriptors = Object.getOwnPropertyDescriptors(value),
    length = descriptors.length?.value;
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > 32 ||
    Reflect.ownKeys(descriptors).length !== length + 1
  )
    return null;
  const result = [];
  for (let index = 0; index < length; index++) {
    const descriptor = descriptors[index];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return null;
    result.push(descriptor.value);
  }
  return result;
}
function headersFor(input, source, url) {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || utilTypes.isProxy(input)) return null;
  let pairs;
  if (Object.getPrototypeOf(input) === Headers.prototype) {
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (
      Reflect.ownKeys(descriptors).some(
        (key) => !nativeHeaderSlots.has(key) || !Object.hasOwn(descriptors[key], "value"),
      )
    )
      return null;
    pairs = [...Headers.prototype.entries.call(input)];
  } else if (Array.isArray(input)) {
    const entries = snapshotArray(input);
    if (!entries) return null;
    pairs = entries.map(snapshotArray);
    if (pairs.some((entry) => entry === null)) return null;
  } else {
    const record = snapshotRecord(input);
    if (!record) return null;
    pairs = Object.entries(record);
  }
  const result = {},
    seen = new Set();
  for (const entry of pairs) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [rawKey, value] = entry;
    if (
      typeof rawKey !== "string" ||
      typeof value !== "string" ||
      /[^\x20-\x7e]/.test(value) ||
      value.length > 1024
    )
      return null;
    const key = rawKey.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    if (key === "origin") {
      if (value !== owners[source]) return null;
    } else if (key === "referer") {
      if (value !== `${owners[source]}/`) return null;
    } else if (key === "user-agent") {
      if (!value.trim()) return null;
    } else if (key === "accept") {
      if (!value.trim()) return null;
      result[key] = value;
    } else if (key === "content-type") {
      if (!/^application\/json(?:; ?charset=(?:utf-8|UTF-8))?$/.test(value)) return null;
      result[key] = value;
    } else if (key === "x-site") {
      if (
        source !== "Marumaru" ||
        !url.startsWith(`${owners.Marumaru}/api/`) ||
        value !== "marumaru"
      )
        return null;
      result[key] = value;
    } else return null;
  }
  return result;
}
export function assistanceRequest(input, init = {}) {
  try {
    const options = snapshotRecord(init);
    if (
      !options ||
      Object.keys(options).some((key) => !["method", "headers", "signal", "body"].includes(key))
    )
      return null;
    if ((options.method !== undefined && options.method !== "GET") || options.body != null)
      return null;
    if (options.signal != null && !(options.signal instanceof AbortSignal)) return null;
    const parsed = parse(input);
    if (!parsed) return null;
    const source = sourceFor(parsed);
    if (!source) return null;
    const headers = headersFor(options.headers, source, input);
    return headers && { source, url: input, navigationURL: input, headers };
  } catch {
    return null;
  }
}
