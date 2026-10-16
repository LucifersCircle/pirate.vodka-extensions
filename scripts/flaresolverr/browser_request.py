"""Preserve JSON API requests inside FlareSolverr's existing Chromium session."""

import threading
import re
from urllib.parse import quote, unquote, urlparse

from bottle import request, response
from flaresolverr_service import SESSIONS_STORAGE

LOCKS = {}

NOVELI_PREFIX = 'https://noveli.to/api/novels'
NOVELI_SORTS = {'popular', 'trending', 'rating', 'newest', 'chapters', 'az'}
JS_WHITESPACE = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'


def positive_id(value):
    return (bool(re.fullmatch(r'[1-9][0-9]*', value))
            and len(value) <= 16 and int(value) <= 9007199254740991)


def is_noveli_metadata_url(raw):
    """Validate raw source-issued URLs before parsing can erase ambiguity.

    Keep this anonymous metadata contract in sync with noveli-test-browser-contract.mjs.
    """
    if (not isinstance(raw, str)
            or re.search(r'[\\#\s\x00-\x1f\x7f]', raw)):
        return False
    if raw in (NOVELI_PREFIX + '/rankings', NOVELI_PREFIX + '/tags'):
        return True
    if raw.startswith(NOVELI_PREFIX + '/'):
        route = raw[len(NOVELI_PREFIX):]
        detail = re.fullmatch(r'/([1-9][0-9]*)', route)
        if detail:
            return positive_id(detail[1])
        if re.fullmatch(r'/[a-z0-9][a-z0-9-]*/chapters', route):
            return True
        reader = re.fullmatch(r'/([1-9][0-9]*)/chapters/([1-9][0-9]*)', route)
        return bool(reader and positive_id(reader[1]) and positive_id(reader[2]))
    if not raw.startswith(NOVELI_PREFIX + '?'):
        return False
    values = {}
    try:
        for pair in raw[len(NOVELI_PREFIX) + 1:].split('&'):
            parts = pair.split('=')
            if len(parts) != 2:
                return False
            key, encoded = parts
            if key in values or key not in {'sort', 'page', 'limit', 'search', 'genres', 'status'}:
                return False
            value = unquote(encoded, encoding='utf-8', errors='strict')
            if (quote(value, safe="!()*-._~") != encoded
                    or re.search(r'[\x00-\x1f\x7f]', value)):
                return False
            values[key] = value
    except (UnicodeError, ValueError):
        return False
    genres = values.get('genres', '').split(',')
    return (values.get('sort') in NOVELI_SORTS
            and positive_id(values.get('page', '')) and int(values['page']) <= 10000
            and values.get('limit') == '36'
            and ('status' not in values or values['status'] in {'Ongoing', 'Completed'})
            and ('search' not in values or bool(values['search'].strip(JS_WHITESPACE)))
            and ('genres' not in values or (all(g.strip(JS_WHITESPACE) for g in genres)
                                           and len(set(genres)) == len(genres))))


def is_noveli_session_url(raw):
    return raw == 'https://noveli.to/' or is_noveli_metadata_url(raw)


def is_noveli_browser_request(payload):
    return (isinstance(payload, dict)
            and set(payload) <= {'session', 'url', 'method', 'headers', 'body'}
            and is_noveli_metadata_url(payload.get('url'))
            and payload.get('method') == 'GET' and payload.get('body') is None
            and isinstance(payload.get('headers'), dict) and not payload['headers'])

FETCH_SCRIPT = """
const payload = arguments[0];
const done = arguments[arguments.length - 1];
fetch(payload.url, {
    method: payload.method,
    headers: payload.headers,
    body: payload.body,
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(60000)
}).then(async result => done({
    url: result.url,
    status: result.status,
    headers: Object.fromEntries(result.headers.entries()),
    body: await result.text()
})).catch(error => done({error: String(error)}));
"""

# No caller-provided identity or credentials. Refuse redirects before following them.
NOVELI_FETCH_SCRIPT = """
const payload = arguments[0];
const done = arguments[arguments.length - 1];
fetch(payload.url, {
    method: 'GET',
    headers: {},
    credentials: 'include',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(60000)
}).then(async result => done({
    url: result.url,
    status: result.status,
    headers: Object.fromEntries(result.headers.entries()),
    body: await result.text()
})).catch(() => done({error: 'Noveli browser fetch failed'}));
"""


def register(app):
    @app.post('/browser/request')
    def browser_request():
        payload = request.json or {}
        if not isinstance(payload, dict) or not isinstance(payload.get('url'), str):
            response.status = 400
            return {'error': 'Unsupported browser API request'}
        try:
            url = urlparse(payload['url'])
            kagane = (url.scheme == 'https' and url.hostname == 'kagane.org'
                      and url.port in (None, 443) and url.path.startswith('/api/'))
        except ValueError:
            kagane = False
        noveli = is_noveli_browser_request(payload)
        if not kagane and not noveli:
            response.status = 400
            return {'error': 'Only approved Kagane or anonymous Noveli API requests are supported'}

        session_id = payload.get('session')
        if session_id not in SESSIONS_STORAGE.session_ids():
            response.status = 400
            return {'error': 'Create and warm a FlareSolverr session first'}

        # One WebDriver cannot execute concurrent commands. Taxonomy uses Promise.all.
        lock = LOCKS.setdefault(session_id, threading.Lock())
        try:
            with lock:
                session, _ = SESSIONS_STORAGE.get(session_id)
                driver = session.driver
                if noveli and not is_noveli_session_url(driver.current_url):
                    raise ValueError('Browser session must be on the exact Noveli HTTPS origin')
                if not noveli and urlparse(driver.current_url).hostname != 'kagane.org':
                    raise ValueError('Browser session must be on the Kagane origin')
                driver.set_script_timeout(65)
                # Chromium supplies cookies, Origin, Referer, and its real User-Agent.
                blocked = {'cookie', 'origin', 'referer', 'user-agent', 'host', 'content-length'}
                if not noveli:
                    payload['headers'] = {
                        key: value for key, value in payload.get('headers', {}).items()
                        if key.lower() not in blocked
                    }
                script = NOVELI_FETCH_SCRIPT if noveli else FETCH_SCRIPT
                result = driver.execute_async_script(script, payload)
                if noveli and (not isinstance(result, dict) or not result.get('error') and (
                        not is_noveli_metadata_url(result.get('url'))
                        or result['url'] != payload['url'])):
                    raise ValueError('Noveli browser metadata request redirected')
                if result.get('error'):
                    response.status = 502
                return result
        except Exception as error:
            response.status = 502
            if noveli:
                return {'error': 'Noveli browser session or metadata request failed'}
            return {'error': str(error)}
