"""Preserve JSON API requests inside FlareSolverr's existing Chromium session."""

import threading
from urllib.parse import urlparse

from bottle import request, response
from flaresolverr_service import SESSIONS_STORAGE
from passive_verification import reject_interactive_verification

LOCKS = {}

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


def register(app):
    @app.post('/browser/request')
    def browser_request():
        payload = request.json or {}
        url = urlparse(payload.get('url', ''))
        if (url.scheme != 'https' or url.hostname != 'kagane.org'
                or url.port not in (None, 443) or not url.path.startswith('/api/')):
            response.status = 400
            return {'error': 'Only Kagane HTTPS API requests are supported'}

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
                if urlparse(driver.current_url).hostname != 'kagane.org':
                    raise ValueError('Browser session must be on the Kagane origin')
                reject_interactive_verification(driver.page_source)
                driver.set_script_timeout(65)
                # Chromium supplies cookies, Origin, Referer, and its real User-Agent.
                blocked = {'cookie', 'origin', 'referer', 'user-agent', 'host', 'content-length'}
                payload['headers'] = {
                    key: value for key, value in payload.get('headers', {}).items()
                    if key.lower() not in blocked
                }
                result = driver.execute_async_script(FETCH_SCRIPT, payload)
                if 'text/html' in result.get('headers', {}).get('content-type', '').lower():
                    reject_interactive_verification(result.get('body', ''))
                if result.get('error'):
                    response.status = 502
                return result
        except Exception as error:
            response.status = 502
            return {'error': str(error)}
