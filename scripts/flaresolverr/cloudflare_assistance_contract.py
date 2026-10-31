"""Test-only, anonymous public GET allowlist, independent of the Node caller.

This does not grant source content/image authorization. The native source must
already have authorized the exact request. Keep cloudflare-assistance-contract.mjs
in sync; unsupported routes and payload fields fail closed.
"""
import re
from urllib.parse import quote, quote_plus, unquote

OWNERS = {
    "Marumaru": "https://marumaru105.com",
    "Hijala": "https://en-hijala.com",
    "MangaSushi": "https://mangasushi.org",
    "ManhwaNex": "https://manhwanex.com",
    "MangaStash": "https://mangastash.org",
    "VortexScans": "https://vortexscans.org",
}
STATUSES = "ONGOING COMPLETED CANCELLED DROPPED MASS_RELEASED COMING_SOON ONE_SHOT HIATUS".split()
TYPES = "MANHWA MANHUA MANGA SPANISH RUSSIAN".split()
NEX_GENRES = "action adventure cultivation-manhwa fantasy ghost-manhwa martial-arts romance system-manhwa".split()
SORTS = "lastChapterAddedAt totalViews createdAt chaptersCount postTitle".split()
STASH_RESERVED = "browse search account content assets trending collections admin api auth login logout register registration sign-in sign-out sign-up signin signout signup settings profile password reset-password forgot-password users user dashboard checkout cart subscribe subscription payment billing wp-admin".split()
STASH_FILTERS = {
    "status": "ongoing completed hiatus cancelled",
    "genre": "action adventure comedy drama fantasy horror isekai mystery romance school-life sci-fi slice-of-life sports thriller",
    "theme": "coming-of-age cooking first-love military politics revenge superpowers survival",
    "mood": "bittersweet chill cozy dark dramatic eerie emotional grim heartwarming hopeful humorous intense melancholy mysterious nostalgic playful relaxing serene suspenseful tense triumphant uplifting whimsical wholesome",
    "format": "4-koma manga manhua manhwa one-shot webtoon",
    "demographic": "josei seinen shoujo shounen",
    "language": "EN",
}


def full(pattern, value):
    return re.fullmatch(pattern, value, re.ASCII)


def length(value):
    # Match JavaScript's UTF-16 code-unit bounds, including non-BMP search text.
    return len(value.encode("utf-16-le")) // 2


def controls(value):
    return re.search(r"[\x00-\x1f\x7f]", value) is not None


def integer(value, minimum=1, maximum=10000):
    return isinstance(value, str) and bool(full(r"(?:0|[1-9]\d*)", value)) and minimum <= int(value) <= maximum


def identifier(value):
    return integer(value, 1, 9007199254740991)


def slug(value):
    return isinstance(value, str) and bool(full(r"[A-Za-z0-9][A-Za-z0-9_-]{0,255}", value))


def search(value, maximum=512):
    return isinstance(value, str) and bool(value.strip()) and length(value) <= maximum and not controls(value)


def list_of(value, valid):
    return isinstance(value, str) and all(valid(v) for v in value.split(",")) and len(set(value.split(","))) == len(value.split(","))


def component(value):
    return quote(value, safe="~()*!.'-_")


def form_component(value):
    # URLSearchParams uses application/x-www-form-urlencoded, including ~ -> %7E.
    return quote_plus(value, safe="*-._").replace("~", "%7E")


def parse(raw):
    if not isinstance(raw, str) or len(raw) > 8192 or re.search(r'[^\x21-\x7e]|[\\#"<>^`{}|]', raw):
        return None
    matched = full(r"https://([a-z0-9.-]+)(/[^?]*)(?:\?(.+))?", raw)
    if not matched:
        return None
    host, path, query = matched.groups()
    if re.search(r"%2f|%5c|%00|%25|(?:^|/)(?:\.|%2e){1,2}(?:/|$)", path, re.I):
        return None
    # WHATWG HTTPS URL parsing rewrites a raw apostrophe in a query. Never let
    # Python accept bytes which the JS/browser side would normalize differently.
    if query is not None and "'" in query:
        return None
    pairs, seen, array_styles = [], set(), {}
    for pair in query.split("&") if query else []:
        fields = pair.split("=")
        if len(fields) != 2 or any(re.search(r"%(?![0-9A-Fa-f]{2})", p) for p in fields):
            return None
        key, value = [unquote(part.replace("+", " "), errors="strict") for part in fields]
        if controls(key) or controls(value) or length(value) > 1024:
            return None
        if fields[0] not in (component(key), form_component(key)):
            return None
        if fields[1] not in (component(value), quote(value, safe="-_.~"), form_component(value)):
            return None
        if key in seen and not key.endswith("[]"):
            return None
        array = full(r"([^[]+)\[(\d*)\]", key)
        if array:
            style = "indexed" if array[2] else "appended"
            if array[1] in array_styles and array_styles[array[1]] != style:
                return None
            array_styles[array[1]] = style
        normalized = re.sub(r"\[(?:\d*)\]$", "[]", key, flags=re.ASCII)
        if any(re.sub(r"\[(?:\d*)\]$", "[]", previous, flags=re.ASCII) == normalized and item == value for previous, item in pairs):
            return None
        seen.add(key)
        pairs.append((key, value))
    return host, path, pairs, query or ""


def exact(pairs, required, optional=None):
    values = dict(pairs)
    validators = {**required, **(optional or {})}
    return len(pairs) == len(values) and all(key in values for key in required) and all(key in validators and validators[key](value) for key, value in pairs)


def eq(expected):
    return lambda value: value == expected


def public_query(pairs, vortex=False):
    required = {"page": integer, "perPage": lambda v: v in (["48"] if vortex else ["20", "100"]), "orderBy": lambda v: v in SORTS and (not vortex or v != "chaptersCount"), "orderDirection": lambda v: v in ("asc", "desc")}
    optional = {
        "searchTerm": search,
        "genreIds": lambda v: list_of(v, identifier), "excludedGenreIds": lambda v: list_of(v, identifier),
        "seriesStatus": lambda v: (v in STATUSES and v != "ONE_SHOT") if vortex else list_of(v, lambda item: item in STATUSES),
        "seriesType": lambda v: (v in TYPES) if vortex else list_of(v, lambda item: item in TYPES),
    }
    if vortex:
        optional.update({"view": eq("archive"), "isNovel": eq("false")})
    else:
        optional.update({"minChapters": lambda v: integer(v, 0, 1000000), "maxChapters": lambda v: integer(v, 0, 1000000), "createdAfter": lambda v: bool(full(r"\d{4}-\d{2}-\d{2}", v)), "createdBefore": lambda v: bool(full(r"\d{4}-\d{2}-\d{2}", v))})
    return exact(pairs, required, optional)


def posts(pairs, vortex=False):
    return exact(pairs, {"page": integer, "perPage": eq("36" if vortex else "20"), "searchTerm": eq(""), "isNovel": eq("false"), "tag": lambda v: v in (["latestUpdatePinned", "new"] if vortex else ["latestUpdate", "latestUpdatePinned", "new"])})


def madara(path, pairs, sushi):
    if not sushi:
        genre = re.match(r"/manga-genre/([^/]+)/", path)
        page = re.search(r"/page/([0-9]+)/$", path)
        if (genre and genre[1] not in NEX_GENRES) or (page and not integer(page[1])):
            return False
    catalog = path == "/" if sushi else bool(full(r"(?:/manga-genre/[A-Za-z0-9_-]+)?/(?:page/[1-9]\d*/)?", path))
    if not pairs:
        return catalog or (sushi and bool(full(r"/manga-genre/[a-z][a-z0-9-]*/", path))) or bool(full(r"/manga/[A-Za-z0-9][A-Za-z0-9_-]*/(?:[A-Za-z0-9][A-Za-z0-9_-]*/)?", path))
    if not catalog:
        return False
    scalar = {"s": lambda v: length(v) <= 512, "post_type": eq("wp-manga"), "op": lambda v: v in ("", "1"), "author": lambda v: length(v) <= 300, "artist": lambda v: length(v) <= 300, "release": lambda v: v == "" or bool(full(r"\d{4}", v)), "adult": lambda v: v in ("", "0", "1")}
    if sushi:
        scalar["m_orderby"] = lambda v: v in ("", "latest", "alphabet", "rating", "trending", "views", "new-manga")
    values = dict(pairs)
    if "s" not in values or values.get("post_type") != "wp-manga":
        return False
    for key, value in pairs:
        array = full(r"(genre|status)\[(?:0|[1-9]\d*)?\]", key)
        if array:
            if not ((bool(full(r"[a-z0-9-]+", value)) if sushi else value in NEX_GENRES) if array[1] == "genre" else value in ("on-going", "end", "canceled", "on-hold", "upcoming")):
                return False
        elif key not in scalar or not scalar[key](value):
            return False
    return True


def stash(path, pairs):
    if path == "/":
        return not pairs
    if path == "/search":
        return exact(pairs, {"q": search}, {"page": integer})
    if path == "/browse/":
        for key, value in pairs:
            if key == "page":
                valid = integer(value)
            elif key == "sort":
                valid = value in ("latest", "popular-month", "popular-year", "title")
            elif key == "rating":
                valid = value in ("safe", "suggestive", "mature")
            else:
                matched = full(r"([a-z]+)\[(?:0|[1-9]\d*)?\]", key)
                valid = matched and value in STASH_FILTERS.get(matched[1], "").split()
            if not valid:
                return False
        return True
    matched = full(r"/([a-z0-9][a-z0-9-]{0,255})/(?:chapter-[a-zA-Z0-9][a-zA-Z0-9.-]{0,127})?", path)
    return not pairs and bool(matched) and matched[1] not in STASH_RESERVED and ".." not in path


def source_for(parsed):
    host, path, pairs, query = parsed
    if host == "marumaru105.com":
        work = full(r"/api/works/([1-9]\d*)", path)
        if work and not query and identifier(work[1]):
            return "Marumaru"
        if path == "/api/works" and full(r"mediaType=MANHWA&page=(?:0|[1-9]\d*)&size=49", query) and exact(pairs, {"mediaType": eq("MANHWA"), "page": lambda v: integer(v, 0, 9999), "size": eq("49")}):
            return "Marumaru"
        if path == "/api/search" and full(r"q=(?:[A-Za-z0-9_.!~*'()-]|%[0-9A-F]{2})+&page=(?:0|[1-9]\d*)&media=MANHWA&sort=LATEST", query) and exact(pairs, {"q": lambda v: search(v, 300), "page": lambda v: integer(v, 0, 9999), "media": eq("MANHWA"), "sort": eq("LATEST")}):
            return "Marumaru"
    if host == "api.storagewebtoon.store" and not query:
        matched = full(r"/api/v1/reader/A2/(?:works|episodes)/([1-9]\d*)", path)
        if matched and identifier(matched[1]):
            return "Marumaru"
    if host == "peer.storagewebtoon.store" and not query:
        cover = full(r"/(?:manhwa|webtoon)/([1-9]\d*)/([A-Za-z0-9._-]{1,255})", path)
        page = full(r"/api/media/episode/([1-9]\d*)/([1-9]\d*)\.webp", path)
        if (cover and identifier(cover[1]) and ".." not in cover[2]) or (page and identifier(page[1]) and identifier(page[2])):
            return "Marumaru"
    if host == "en-hijala.com" and not query and (path in ("/", "/series/") or full(r"/series/[A-Za-z0-9][A-Za-z0-9_-]*(?:/[A-Za-z0-9][A-Za-z0-9_-]*)?", path)):
        return "Hijala"
    if host == "api.en-hijala.com" and ((path == "/api/query" and public_query(pairs)) or (path == "/api/posts" and posts(pairs))):
        return "Hijala"
    if host == "mangasushi.org" and madara(path, pairs, True):
        return "MangaSushi"
    if host == "manhwanex.com" and madara(path, pairs, False):
        return "ManhwaNex"
    if host == "mangastash.org" and stash(path, pairs):
        return "MangaStash"
    if host == "vortexscans.org" and path == "/" and not query:
        return "VortexScans"
    if host == "api.vortexscans.org":
        if not query and (path in ("/api/genres", "/api/collections") or full(r"/api/collections/[A-Za-z0-9][A-Za-z0-9_-]{0,255}", path)):
            return "VortexScans"
        if path == "/api/query" and public_query(pairs, True):
            return "VortexScans"
        if path == "/api/posts" and posts(pairs, True):
            return "VortexScans"
        if path == "/api/post" and (exact(pairs, {"postId": identifier}) or exact(pairs, {"postSlug": slug})):
            return "VortexScans"
        if path == "/api/chapter" and exact(pairs, {"chapterId": identifier}):
            return "VortexScans"
        if path == "/api/chapters" and exact(pairs, {"postId": identifier, "skip": eq("0"), "take": eq("500"), "order": eq("desc"), "search": eq("")}):
            return "VortexScans"
    return None


def assistance_request(payload):
    """Return the validated payload or raise ValueError, never normalize a URL."""
    try:
        if type(payload) is not dict or set(payload) != {"source", "url", "navigationURL", "headers"}:
            raise ValueError("Unsupported assistance payload")
        parsed = parse(payload["url"])
        source = source_for(parsed) if parsed else None
        if not source or payload["source"] != source or payload["navigationURL"] != payload["url"]:
            raise ValueError("Unsupported assistance route")
        headers = payload["headers"]
        if type(headers) is not dict:
            raise ValueError("Unsupported assistance headers")
        for key, value in headers.items():
            if not isinstance(value, str) or len(value) > 1024 or re.search(r"[^\x20-\x7e]", value):
                raise ValueError("Unsupported assistance header value")
            if key == "accept" and value.strip():
                continue
            if key == "content-type" and full(r"application/json(?:; ?charset=(?:utf-8|UTF-8))?", value):
                continue
            if key == "x-site" and source == "Marumaru" and payload["url"].startswith(OWNERS[source] + "/api/") and value == "marumaru":
                continue
            # Browser-managed identity headers are never caller-controlled here.
            raise ValueError("Unsupported assistance header")
        return {"source": source, "url": payload["url"], "navigationURL": payload["url"], "headers": dict(headers)}
    except (TypeError, UnicodeError, OverflowError) as error:
        raise ValueError("Unsupported assistance payload") from error
