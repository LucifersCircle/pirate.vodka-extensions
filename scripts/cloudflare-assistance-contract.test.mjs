import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { assistanceRequest } from "./cloudflare-assistance-contract.mjs";

const accepted = [
  ["Marumaru", "https://marumaru105.com/api/works?mediaType=MANHWA&page=0&size=49"],
  ["Marumaru", "https://marumaru105.com/api/works/123"],
  [
    "Marumaru",
    "https://marumaru105.com/api/search?q=Hero%20%E6%97%A5%E6%9C%AC&page=0&media=MANHWA&sort=LATEST",
  ],
  ["Marumaru", "https://api.storagewebtoon.store/api/v1/reader/A2/works/123"],
  ["Marumaru", "https://api.storagewebtoon.store/api/v1/reader/A2/episodes/456"],
  ["Marumaru", "https://peer.storagewebtoon.store/manhwa/123/opaque-cover_abc"],
  ["Marumaru", "https://peer.storagewebtoon.store/webtoon/123/cover.jpg"],
  ["Marumaru", "https://peer.storagewebtoon.store/api/media/episode/456/1.webp"],
  ["Hijala", "https://en-hijala.com/"],
  ["Hijala", "https://en-hijala.com/series/"],
  ["Hijala", "https://en-hijala.com/series/a-series"],
  ["Hijala", "https://en-hijala.com/series/a-series/chapter-1"],
  [
    "Hijala",
    "https://api.en-hijala.com/api/query?page=1&perPage=20&orderBy=lastChapterAddedAt&orderDirection=desc",
  ],
  [
    "Hijala",
    "https://api.en-hijala.com/api/query?page=1&perPage=100&orderBy=totalViews&orderDirection=asc&searchTerm=Hero+Book&seriesType=MANHWA%2CMANGA&genreIds=1%2C2&excludedGenreIds=3&seriesStatus=ONGOING%2CHIATUS&minChapters=0&maxChapters=100&createdAfter=2025-01-01&createdBefore=2026-12-31",
  ],
  [
    "Hijala",
    "https://api.en-hijala.com/api/posts?page=2&perPage=20&searchTerm=&isNovel=false&tag=latestUpdatePinned",
  ],
  ["MangaSushi", "https://mangasushi.org/"],
  ["MangaSushi", "https://mangasushi.org/manga-genre/action/"],
  ["MangaSushi", "https://mangasushi.org/manga/hero/"],
  ["MangaSushi", "https://mangasushi.org/manga/hero/chapter-1/"],
  ["MangaSushi", "https://mangasushi.org/?s=Hero&post_type=wp-manga"],
  [
    "MangaSushi",
    "https://mangasushi.org/?s=Hero%27s%20book&post_type=wp-manga&m_orderby=latest&op=1&author=&artist=&release=2025&adult=0&genre%5B0%5D=action&status%5B0%5D=on-going",
  ],
  [
    "MangaSushi",
    "https://mangasushi.org/?s=&post_type=wp-manga&genre%5B%5D=action&genre%5B%5D=romance",
  ],
  ["ManhwaNex", "https://manhwanex.com/"],
  ["ManhwaNex", "https://manhwanex.com/page/2/"],
  ["ManhwaNex", "https://manhwanex.com/manga-genre/action/page/2/"],
  ["ManhwaNex", "https://manhwanex.com/manga/hero/"],
  ["ManhwaNex", "https://manhwanex.com/manga/hero/chapter-1/"],
  [
    "ManhwaNex",
    "https://manhwanex.com/page/2/?s=Hero&post_type=wp-manga&op=&author=&artist=&release=&adult=0&genre%5B0%5D=action",
  ],
  ["MangaStash", "https://mangastash.org/"],
  ["MangaStash", "https://mangastash.org/browse/"],
  [
    "MangaStash",
    "https://mangastash.org/browse/?genre%5B%5D=action&genre%5B%5D=adventure&format%5B0%5D=manhwa&rating=safe&sort=title&page=2",
  ],
  ["MangaStash", "https://mangastash.org/search?q=Hero+book&page=2"],
  ["MangaStash", "https://mangastash.org/hero/"],
  ["MangaStash", "https://mangastash.org/hero/chapter-1.5"],
  ["VortexScans", "https://vortexscans.org/"],
  ["VortexScans", "https://api.vortexscans.org/api/genres"],
  ["VortexScans", "https://api.vortexscans.org/api/collections"],
  ["VortexScans", "https://api.vortexscans.org/api/collections/featured"],
  ["VortexScans", "https://api.vortexscans.org/api/post?postId=123"],
  ["VortexScans", "https://api.vortexscans.org/api/post?postSlug=hero"],
  ["VortexScans", "https://api.vortexscans.org/api/chapter?chapterId=456"],
  [
    "VortexScans",
    "https://api.vortexscans.org/api/chapters?postId=123&skip=0&take=500&order=desc&search=",
  ],
  [
    "VortexScans",
    "https://api.vortexscans.org/api/query?page=1&perPage=48&orderBy=postTitle&orderDirection=asc&searchTerm=Hero&genreIds=1%2C2&seriesStatus=ONGOING&seriesType=MANHWA",
  ],
  [
    "VortexScans",
    "https://api.vortexscans.org/api/query?page=1&perPage=48&view=archive&orderBy=totalViews&orderDirection=desc&isNovel=false",
  ],
  [
    "VortexScans",
    "https://api.vortexscans.org/api/posts?page=2&perPage=36&searchTerm=&isNovel=false&tag=new",
  ],
];
const rejected = [
  "https://marumaru105.com/",
  "https://marumaru105.com/api/works/0",
  "https://marumaru105.com/api/works/01",
  "https://marumaru105.com/api/works/9007199254740992",
  "https://marumaru105.com/api/works/123?token=secret",
  "https://marumaru105.com/api/works?mediaType=MANHWA&page=10000&size=49",
  "https://marumaru105.com/api/works?mediaType=MANGA&page=0&size=49",
  "https://marumaru105.com/api/search?q=Hero+Book&page=0&media=MANHWA&sort=LATEST",
  "https://api.storagewebtoon.store/api/v1/reader/A1/works/123",
  "https://api.storagewebtoon.store/api/v1/reader/A2/users/123",
  "https://peer.storagewebtoon.store/manhwa/123/cover.webp?token=x",
  "https://peer.storagewebtoon.store/manhwa/123/../cover.webp",
  "https://peer.storagewebtoon.store/manhwa/123/a..b",
  "https://peer.storagewebtoon.store/api/media/episode/456/0.webp",
  "https://peer.storagewebtoon.store/api/media/episode/456/01.webp",
  "https://cdn.manhwanex.com/manga_123/page.webp",
  "https://en-hijala.com/account",
  "https://en-hijala.com/series/hero?token=x",
  "https://api.en-hijala.com/api/chapter?chapterId=1",
  "https://api.en-hijala.com/api/query?page=1&perPage=20&orderBy=unknown&orderDirection=desc",
  "https://api.en-hijala.com/api/query?page=1&perPage=20&orderBy=totalViews&orderDirection=desc&token=x",
  "https://mangasushi.org/wp-admin/admin-ajax.php",
  "https://mangasushi.org/manga/hero/ajax/chapters/",
  "https://mangasushi.org/?s=Hero",
  "https://mangasushi.org/?s=Hero&post_type=post",
  "https://mangasushi.org/?s=Hero&post_type=wp-manga&post_status=private",
  "https://mangasushi.org/?s=Hero&post_type=wp-manga&s=Other",
  "https://mangasushi.org/?s=Hero&post_type=wp-manga&%61dult=0",
  "https://manhwanex.com/page/10001/",
  "https://manhwanex.com/manga-genre/unverified/",
  "https://manhwanex.com/?s=Hero&post_type=wp-manga&m_orderby=rating",
  "https://mangastash.org/account/",
  "https://mangastash.org/login/",
  "https://mangastash.org/api/",
  "https://mangastash.org/admin/",
  "https://mangastash.org/content/covers/hero.jpg",
  "https://mangastash.org/search?q=Hero&sort=latest",
  "https://mangastash.org/browse/?genre%5B%5D=unknown",
  "https://mangastash.org/browse/?genre%5B%5D=action&genre%5B%5D=action",
  "https://mangastash.org/browse/?page=1&page=2",
  "https://mangastash.org/browse/?genre%5B%5D=action&genre%5B0%5D=adventure",
  "https://mangastash.org/browse/?rating%5B%5D=safe",
  "https://mangastash.org/hero/chapter-1..2",
  "https://vortexscans.org",
  "https://vortexscans.org/login",
  "https://api.vortexscans.org/api/post?postId=1&postSlug=hero",
  "https://api.vortexscans.org/api/chapters?postId=1&skip=500&take=500&order=desc&search=",
  "https://api.vortexscans.org/api/posts?page=2&perPage=48&searchTerm=&isNovel=false&tag=new",
  "https://api.vortexscans.org/api/query?page=1&perPage=48&orderBy=chaptersCount&orderDirection=desc",
  "https://noveli.to/api/novels/tags",
  "https://kagane.org/",
  "https://other.invalid/",
];
const url = accepted[0][1];
const payload = (source, target) => ({ source, url: target, navigationURL: target, headers: {} });
function pythonResults(values) {
  const directory = fileURLToPath(new URL("./flaresolverr/", import.meta.url));
  const process = spawnSync(
    "python3",
    [
      "-c",
      `import json, sys\nsys.path.insert(0, ${JSON.stringify(directory)})\nfrom cloudflare_assistance_contract import assistance_request\nresults=[]\nfor value in json.load(sys.stdin):\n try: results.append(assistance_request(value))\n except ValueError: results.append(None)\nprint(json.dumps(results))`,
    ],
    { input: JSON.stringify(values), encoding: "utf8" },
  );
  assert.equal(process.status, 0, process.stderr);
  return JSON.parse(process.stdout);
}

void test("only verified public GET route families are assisted, preserving exact navigation", () => {
  for (const [source, target] of accepted)
    assert.deepEqual(assistanceRequest(target), payload(source, target), target);
  for (const target of rejected) assert.equal(assistanceRequest(target), null, target);
});
void test("raw authority, path and query normalization cannot expand the allowlist", () => {
  const target = "https://marumaru105.com/api/works/123";
  const variants = [
    target + "#",
    target + "\n",
    target + "?",
    target + "/",
    " " + target,
    target.replace("https:", "http:"),
    target.replace("marumaru105.com", "MARUMARU105.com"),
    target.replace("marumaru105.com", "marumaru105.com:443"),
    target.replace("marumaru105.com", "marumaru105.com:8443"),
    target.replace("marumaru105.com", "u:p@marumaru105.com"),
    target.replace("marumaru105.com", "marumaru105.com."),
    target.replace("/api/", "/x/../api/"),
    target.replace("/api/", "/%2e%2e/api/"),
    target.replace("/api/", "/api%2f"),
    target.replace("/api/", "/api%5c"),
    target.replace("/api/", "/api%252f"),
    target.replace("/api/", "\\api\\"),
  ];
  for (const value of variants) assert.equal(assistanceRequest(value), null, value);
  const results = pythonResults(variants.map((value) => payload("Marumaru", value)));
  assert.ok(results.every((result) => result === null));
});
void test("JS and independent Python validators agree on route acceptance", () => {
  const inputs = [
    ...accepted.map(([source, target]) => payload(source, target)),
    ...rejected.map((target) => payload("Marumaru", target)),
  ];
  assert.deepEqual(pythonResults(inputs), [
    ...accepted.map(([source, target]) => payload(source, target)),
    ...rejected.map(() => null),
  ]);
  // Reject route negatives for every claimed source, not only a mismatched label.
  for (const source of [
    "Marumaru",
    "Hijala",
    "MangaSushi",
    "ManhwaNex",
    "MangaStash",
    "VortexScans",
  ])
    assert.ok(
      pythonResults(rejected.map((target) => payload(source, target))).every(
        (result) => result === null,
      ),
      source,
    );
});
void test("source headers are verified, browser-managed headers stripped, application headers retained", () => {
  const input = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Site": "marumaru",
    Origin: "https://marumaru105.com",
    Referer: "https://marumaru105.com/",
    "User-Agent": "Native test UA/1.0",
  };
  const expected = {
    ...payload("Marumaru", url),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-site": "marumaru",
    },
  };
  for (const headers of [input, new Headers(input), Object.entries(input)])
    assert.deepEqual(assistanceRequest(url, { method: "GET", headers }), expected);
  assert.deepEqual(pythonResults([expected]), [expected]);
  assert.equal(
    assistanceRequest("https://api.storagewebtoon.store/api/v1/reader/A2/works/1", {
      headers: { "X-Site": "marumaru" },
    }),
    null,
  );
});
void test("unsupported inputs, init options, methods and bodies fail closed", () => {
  for (const input of [null, 123, {}, new URL(url), new Request(url)])
    assert.equal(assistanceRequest(input), null);
  for (const init of [
    null,
    [],
    "GET",
    { method: "POST" },
    { method: "get" },
    { method: "HEAD" },
    { body: "" },
    { credentials: "omit" },
    { credentials: "include" },
    { redirect: "manual" },
    { mode: "cors" },
    { cache: "no-store" },
    { signal: {} },
    { [Symbol("hidden")]: true },
    Object.create({ credentials: "include" }),
  ])
    assert.equal(assistanceRequest(url, init), null);
  assert.ok(assistanceRequest(url, { signal: new AbortController().signal }));
  // The pinned Mana host passes an own undefined body even for native GETs.
  const nativeOptions = {
    method: "GET",
    headers: new Headers({ Accept: "application/json", "X-Site": "marumaru" }),
    body: undefined,
    signal: new AbortController().signal,
  };
  assert.ok(assistanceRequest(url, nativeOptions));
  assert.ok(assistanceRequest(url, { ...nativeOptions, body: null }));
  for (const body of ["", "x", new ArrayBuffer(0), new Uint8Array(0)])
    assert.equal(assistanceRequest(url, { ...nativeOptions, body }), null);
});
void test("cookies, auth, forwarding, identity mismatches and unsafe header values never cross the boundary", () => {
  const invalid = [
    { Cookie: "a=b" },
    { Authorization: "Bearer secret" },
    { "Proxy-Authorization": "x" },
    { Host: "localhost" },
    { "X-Forwarded-Host": "localhost" },
    { "Sec-Fetch-Site": "same-origin" },
    { Origin: "https://other.invalid" },
    { Referer: "https://marumaru105.com/account" },
    { "User-Agent": "bad\nvalue" },
    { "User-Agent": "" },
    { Accept: "text/html\u007f" },
    { Accept: "" },
    { Accept: 3 },
    { "X-Site": "other" },
    { "Content-Type": "application/x-www-form-urlencoded" },
    { " accept": "application/json" },
    [
      ["accept", "a"],
      ["Accept", "b"],
    ],
  ];
  for (const headers of invalid)
    assert.equal(assistanceRequest(url, { headers }), null, JSON.stringify(headers));
  const valid = payload("Marumaru", url);
  const badPayloads = [
    null,
    [],
    {},
    { ...valid, source: "Hijala" },
    { ...valid, navigationURL: "https://marumaru105.com/" },
    { ...valid, session: "caller-owned" },
    { ...valid, method: "POST" },
    { ...valid, headers: { Cookie: "a=b" } },
    { ...valid, headers: { origin: "https://marumaru105.com" } },
    { ...valid, headers: { "user-agent": "UA" } },
    { ...valid, headers: { Accept: "application/json" } },
    { ...valid, headers: { accept: "application/json\n" } },
    { ...valid, headers: [] },
  ];
  assert.ok(pythonResults(badPayloads).every((result) => result === null));
});
void test("query encoding, duplicates and non-public controls stay fail-closed in both languages", () => {
  const base = "https://mangasushi.org/?s=";
  const suffix = "&post_type=wp-manga";
  const invalidValues = [
    "%",
    "%GG",
    "%0A",
    "%7F",
    "%C0%AF",
    "%ED%A0%80",
    "hello=world",
    "A'B",
    "x&token=secret",
    "x&%70ost_type=wp-manga",
    "x&post_type%5B%5D=private",
    "x&&unknown=y",
  ];
  const targets = invalidValues.map((value) => base + value + suffix);
  for (const target of targets) assert.equal(assistanceRequest(target), null, target);
  assert.ok(
    pythonResults(targets.map((target) => payload("MangaSushi", target))).every(
      (result) => result === null,
    ),
  );
});

void test("all route families reject foreign authority, credentials, fragments and signed query additions", () => {
  const matrix = [];
  for (const [source, target] of accepted) {
    const parsed = new URL(target);
    for (const value of [
      target + "#section",
      target + (target.includes("?") ? "&" : "?") + "token=secret",
      target.replace(parsed.host, "user@" + parsed.host),
      target.replace(parsed.host, parsed.host + ":443"),
      target.replace(parsed.host, "unverified." + parsed.host),
      target.replace(parsed.host, parsed.host + ".other.invalid"),
      target.replace("https://", "http://"),
    ]) {
      assert.equal(assistanceRequest(value), null, value);
      matrix.push(payload(source, value));
    }
  }
  assert.ok(pythonResults(matrix).every((result) => result === null));
});

void test("genuine cross-realm source header and init records are snapshotted without getters", () => {
  const foreign = runInNewContext(
    `({ method: "GET", headers: { Accept: "application/json", "X-Site": "marumaru", Origin: "https://marumaru105.com", Referer: "https://marumaru105.com/", "User-Agent": "Paperback native UA" }, body: undefined })`,
  );
  const expected = {
    ...payload("Marumaru", url),
    headers: { accept: "application/json", "x-site": "marumaru" },
  };
  assert.notEqual(Object.getPrototypeOf(foreign.headers), Object.prototype);
  assert.deepEqual(assistanceRequest(url, foreign), expected);
  assert.deepEqual(assistanceRequest(url, { method: "GET", headers: foreign.headers }), expected);
  const nullPrototype = runInNewContext(
    `Object.assign(Object.create(null), { Accept: "application/json" })`,
  );
  assert.deepEqual(assistanceRequest(url, { headers: nullPrototype }), {
    ...payload("Marumaru", url),
    headers: { accept: "application/json" },
  });
  assert.deepEqual(pythonResults([expected]), [expected]);
});
void test("custom prototypes, inherited credentials, hidden fields and accessors remain rejected", () => {
  let touches = 0;
  const getter = () => {
    touches += 1;
    return "application/json";
  };
  const inherited = Object.create({ Cookie: "secret" });
  inherited.Accept = "application/json";
  const fakePrototype = Object.create(null);
  Object.defineProperty(fakePrototype, "constructor", { value: Object });
  const fake = Object.create(fakePrototype);
  fake.Accept = "application/json";
  const headers = [
    inherited,
    fake,
    new Date(),
    new Map([["Accept", "application/json"]]),
    Object.defineProperty({}, "Accept", { enumerable: true, get: getter }),
    Object.defineProperty({ Accept: "application/json" }, "Cookie", { value: "secret" }),
    { Accept: "application/json", [Symbol("secret")]: "hidden" },
    new Proxy(
      { Accept: "application/json" },
      {
        getPrototypeOf() {
          touches += 1;
          return Object.prototype;
        },
      },
    ),
    runInNewContext(
      `Object.assign(Object.create({ Cookie: "secret" }), { Accept: "application/json" })`,
    ),
    runInNewContext(`Object.prototype.Cookie = "secret"; ({ Accept: "application/json" })`),
    runInNewContext(
      `Object.defineProperty(Object.prototype, "Cookie", { get() { throw new Error("must not run"); } }); ({ Accept: "application/json" })`,
    ),
    runInNewContext(
      `Object.create(Object.assign(Object.create(null), { constructor: Object }), { Accept: { value: "application/json", enumerable: true } })`,
    ),
  ];
  for (const value of headers) assert.equal(assistanceRequest(url, { headers: value }), null);
  for (const key of ["method", "headers", "body", "signal", "credentials"]) {
    const init = Object.defineProperty({}, key, { enumerable: true, get: getter });
    assert.equal(assistanceRequest(url, init), null, key);
  }
  assert.equal(
    assistanceRequest(
      url,
      new Proxy(
        {},
        {
          ownKeys() {
            touches += 1;
            return [];
          },
        },
      ),
    ),
    null,
  );
  assert.equal(assistanceRequest(url, Object.create({ credentials: "include" })), null);
  const entry = ["Accept", "application/json"];
  Object.defineProperty(entry, "1", { enumerable: true, get: getter });
  assert.equal(assistanceRequest(url, { headers: [entry] }), null);
  const list = [["Accept", "application/json"]];
  Object.defineProperty(list, "0", { enumerable: true, get: getter });
  assert.equal(assistanceRequest(url, { headers: list }), null);
  const decoratedHeaders = new Headers({ Accept: "application/json" });
  Object.defineProperty(decoratedHeaders, Symbol.iterator, { get: getter });
  assert.equal(assistanceRequest(url, { headers: decoratedHeaders }), null);
  const credentialIterator = new Headers({ Accept: "application/json" });
  credentialIterator[Symbol.iterator] = function* () {
    yield ["Authorization", "Bearer secret"];
  };
  assert.equal(assistanceRequest(url, { headers: credentialIterator }), null);
  assert.equal(touches, 0, "classification must not invoke caller getters or proxy traps");
});
