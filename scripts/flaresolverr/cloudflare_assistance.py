# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Lucifers Circle
"""Test-only, passive Chromium assistance for exact anonymous source GETs.

This is neither an SDK identity emulator nor a CAPTCHA solver. A disposable
browser context makes one navigation (managed exact-URL reloads are counted)
and at most one same-origin fetch. Browser cookies/UA/Origin/Referer stay in
Chromium. Redirects, interactive verification, TLS exceptions, provider POSTs,
other documents, downloads and unapproved subresources fail closed.

The isolated observer and CDP event-pump architecture are adapted from the
GPL-3.0-or-later LucifersCircle/pirate.vodka-extensions paperback_webview.py.
"""

import base64
import binascii
import http.client
import json
import re
import threading
import time
from urllib.parse import urlparse

from cloudflare_assistance_contract import assistance_request

MAX_BODY = 16 * 1024 * 1024
MAX_REQUEST = 64 * 1024
MAX_WIRE = 24 * 1024 * 1024
MAX_RESOURCES = 512
MAX_NAVIGATIONS = 3
OPERATION_SECONDS = 57
WORLD = 'source-test-passive-assistance'
BINDING = '__source_test_assistance_notice__'
SCAN_EXPRESSION = 'globalThis.__source_test_assistance_scan__()'
LOCKS = {}
LOCKS_GUARD = threading.Lock()
CODES = frozenset({'operation', 'unresolved', 'denied', 'security', 'captcha'})
REASONS = frozenset({
    'invalid-request', 'session-not-found', 'session-busy', 'invalid-response',
    'insecure-capability', 'debugger-unavailable', 'browser-command-failed',
    'operation-timeout', 'challenge-unresolved', 'access-denied', 'captcha-visible',
    'security-warning', 'document-identity-changed', 'document-url-mismatch',
    'navigation-during-replay', 'unexpected-navigation-state', 'unverified-reload',
    'replay-context-lost', 'replay-loader-changed', 'redirect-blocked',
    'resource-blocked', 'resource-limit', 'navigation-limit', 'navigation-failed',
    'unexpected-target', 'unexpected-dialog', 'observer-unavailable',
    'replay-failed', 'response-too-large', 'browser-operation-failed',
})


class AssistanceFailure(Exception):
    """Never return provider text, URLs, cookies or exception text as an error."""
    def __init__(self, reason, code='operation'):
        self.reason = reason if reason in REASONS else 'browser-operation-failed'
        self.code = code if code in CODES else 'operation'
        super().__init__(self.reason)


class SafetyNavigationChanged(Exception):
    """Internal signal: observe an already-authorized reload, never retry I/O."""


def fail(reason, code='operation'):
    raise AssistanceFailure(reason, code)


def failure_payload(error, metrics):
    return {'error': 'Passive browser assistance failed', 'code': error.code,
            'reason': error.reason, 'metrics': dict(metrics)}


def strict_json(raw):
    def invalid(_):
        fail('invalid-request')

    def unique(pairs):
        result = dict(pairs)
        if len(result) != len(pairs):
            fail('invalid-request')
        return result

    try:
        return json.loads(raw, parse_constant=invalid, object_pairs_hook=unique)
    except (ValueError, UnicodeError):
        fail('invalid-request')


def validate_payload(payload):
    if (type(payload) is not dict
            or set(payload) != {'session', 'source', 'url', 'navigationURL', 'headers'}
            or not isinstance(payload['session'], str)
            or not re.fullmatch(r'[A-Za-z0-9-]{1,100}', payload['session'])):
        fail('invalid-request')
    try:
        checked = assistance_request({key: value for key, value in payload.items() if key != 'session'})
    except (ValueError, TypeError):
        fail('invalid-request')
    if type(checked) is not dict or checked.get('navigationURL') != checked.get('url'):
        fail('invalid-request')
    return {'session': payload['session'], **checked}


def validate_response(result, expected_url):
    if (type(result) is not dict or set(result) != {'url', 'status', 'headers', 'body', 'encoding', 'byteLength'}
            or result.get('url') != expected_url or result.get('encoding') != 'base64'
            or type(result.get('status')) is not int or not 200 <= result['status'] <= 599
            or 300 <= result['status'] < 400
            or type(result.get('byteLength')) is not int or not 0 <= result['byteLength'] <= MAX_BODY
            or type(result.get('body')) is not str or len(result['body']) > 4 * ((MAX_BODY + 2) // 3)
            or type(result.get('headers')) is not dict or len(result['headers']) > 128):
        fail('invalid-response')
    header_bytes = 0
    for key, value in result['headers'].items():
        if (type(key) is not str or not re.fullmatch(r"[!#$%&'*+.^_`|~0-9a-z-]+", key)
                or key in {'set-cookie', 'set-cookie2'} or type(value) is not str
                or re.search(r'[\x00-\x1f\x7f]', value)):
            fail('invalid-response')
        header_bytes += len(key.encode('utf-8')) + len(value.encode('utf-8'))
    if header_bytes > 64 * 1024:
        fail('invalid-response')
    try:
        raw = base64.b64decode(result['body'], validate=True)
    except (binascii.Error, ValueError):
        fail('invalid-response')
    if len(raw) != result['byteLength'] or base64.b64encode(raw).decode('ascii') != result['body']:
        fail('invalid-response')
    # Actual replay HTTP bytes/status remain authoritative, including failure.
    # A fixed terminal marker stops future assistance without hiding that HTTP
    # response behind a synthesized helper error.
    content_type = result['headers'].get('content-type', '').lower()
    text = raw[:128 * 1024].decode('utf-8', errors='replace').lower()
    html = 'text/html' in content_type or bool(re.match(r'\s*(?:<!doctype html|<html)', text))
    if (html or result['status'] in {401, 403}) and re.search(r'access denied|sorry, you have been blocked|error\s*(?:code\s*)?1020|cloudflare ray id.*blocked', text):
        return {**result, 'terminalReason': 'denied'}
    if result['headers'].get('cf-mitigated', '').lower() == 'challenge':
        return {**result, 'terminalReason': 'unresolved'}
    if html and re.search(r'just a moment|checking your browser|cf-chl-|challenge-platform|challenge-form', text):
        return {**result, 'terminalReason': 'unresolved'}
    return result


def debugger_url(driver, deadline):
    if driver.capabilities.get('acceptInsecureCerts') is not False:
        fail('insecure-capability', 'security')
    address = driver.capabilities.get('goog:chromeOptions', {}).get('debuggerAddress', '')
    match = re.fullmatch(r'(?:127\.0\.0\.1|localhost):([0-9]{1,5})', address)
    if not match or not 1 <= int(match[1]) <= 65535:
        fail('debugger-unavailable')
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        fail('operation-timeout')
    port = int(match[1])
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=min(remaining, 3))
    try:
        connection.request('GET', '/json/version')
        result = connection.getresponse()
        raw = result.read(65537)
        if result.status != 200 or len(raw) > 65536:
            fail('debugger-unavailable')
        value = json.loads(raw).get('webSocketDebuggerUrl', '')
    finally:
        connection.close()
    parsed = urlparse(value)
    if (parsed.scheme != 'ws' or parsed.hostname not in {'127.0.0.1', 'localhost'}
            or parsed.port != port or parsed.username or parsed.password or parsed.query or parsed.fragment
            or not re.fullmatch(r'/devtools/browser/[A-Za-z0-9-]+', parsed.path)):
        fail('debugger-unavailable')
    return 'ws://127.0.0.1:' + str(port) + parsed.path


# Executed in isolated realms in every document, never in the provider's world.
# This observes, but never clicks, types, solves or alters a challenge.
SAFETY_SCRIPT = r"""
(() => {
  const expected = EXPECTED_URL, report = globalThis.__source_test_assistance_notice__;
  let stopped = '', managed = false;
  const stop = reason => { if (!stopped) { stopped = reason; report(JSON.stringify({reason})); } return stopped; };
  const visible = element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
      && style.display !== 'none' && style.opacity !== '0';
  };
  const scan = () => {
    if (stopped) return stopped;
    const main = window === window.top;
    if (/^(chrome|chrome-error|edge|about):/.test(location.protocol)) return stop('security-warning');
    if (main && (location.href !== expected || document.URL !== expected || document.baseURI !== expected))
      return stop('document-identity-changed');
    const title = document.title.toLowerCase(), text = (document.body?.innerText ?? '').slice(0,131072).toLowerCase();
    if (/privacy error|connection is not private|certificate error|security warning|deceptive site|dangerous site|security error/.test(title)
        || /net::err_(cert|ssl)_|your connection is not private|this site is not secure/.test(text)
        || document.querySelector('#main-frame-error, #ssl-error, .interstitial-wrapper')) return stop('security-warning');
    const roots = [document];
    for (let index = 0; index < roots.length; index++) {
      const root = roots[index];
      if (index > 128) return stop('observer-unavailable');
      for (const element of root.querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot);
      const selector = main
        ? '#challenge-form input[type="checkbox"], #challenge-form [role="checkbox"], .cf-turnstile [role="checkbox"], '
          + '.g-recaptcha [role="checkbox"], .h-captcha [role="checkbox"], #challenge-form button, #challenge-form input[type="button"], '
          + '[data-captcha] button, button, input[type="button"]'
        : 'input[type="checkbox"], [role="checkbox"], input[type="button"], button';
      for (const element of root.querySelectorAll(selector)) {
        const label = `${element.textContent} ${element.value ?? ''} ${element.getAttribute('aria-label') ?? ''}`.toLowerCase();
        const challengeControl = !main || !!element.closest?.('#challenge-form, .cf-turnstile, .g-recaptcha, .h-captcha, [data-captcha]');
        if (visible(element) && (element.matches('input[type="checkbox"], [role="checkbox"]')
            || (challengeControl && /verify|human|robot|captcha/.test(label))
            || /verify.*human|human.*verif|not a robot|captcha|verify you are/.test(label)))
          return stop('captcha-visible');
      }
    }
    if (/access denied|sorry, you have been blocked|error\s*(?:code\s*)?1020/.test(title + ' ' + text)) return stop('access-denied');
    if (/just a moment|checking your browser|performing security verification|verifying your browser|enable javascript and cookies to continue/.test(title + ' ' + text)
        || document.querySelector('#challenge-form, #challenge-running, .cf-browser-verification, #cf-challenge-running')) {
      if (!managed) { managed = true; report(JSON.stringify({reason:'managed-challenge'})); }
      return 'pending';
    }
    return document.readyState === 'loading' ? 'pending' : 'ready';
  };
  Object.defineProperty(globalThis, '__source_test_assistance_scan__', {value:scan});
  new MutationObserver(scan).observe(document, {subtree:true,childList:true,attributes:true});
  addEventListener('DOMContentLoaded', scan); addEventListener('load', scan);
  setInterval(scan, 100); scan();
})();
"""

FETCH_SCRIPT = r"""
(async () => {
  const payload = REQUEST_PAYLOAD;
  const identity = () => location.href === payload.url && document.URL === payload.url && document.baseURI === payload.url;
  if (!identity()) return {error:'document-identity-changed'};
  try {
    const response = await fetch(payload.url, {method:'GET', headers:payload.headers,
      credentials:'include', cache:'no-store', redirect:'error', signal:AbortSignal.timeout(REMAINING_MS)});
    if (!identity() || response.url !== payload.url || response.redirected) return {error:'document-identity-changed'};
    if (response.type === 'opaque' || response.type === 'opaqueredirect') return {error:'replay-failed'};
    const declared = response.headers.get('content-length');
    if (declared && /^\d+$/.test(declared) && Number(declared) > 16 * 1024 * 1024) return {error:'response-too-large'};
    const chunks = []; let length = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > 16 * 1024 * 1024) { await reader.cancel(); return {error:'response-too-large'}; }
        chunks.push(chunk.value);
      }
    }
    if (!identity()) return {error:'document-identity-changed'};
    let binary = '';
    for (const chunk of chunks) for (let offset = 0; offset < chunk.length; offset += 0x8000)
      binary += String.fromCharCode(...chunk.subarray(offset, offset + 0x8000));
    return {url:response.url,status:response.status,headers:Object.fromEntries(response.headers.entries()),
      body:btoa(binary),encoding:'base64',byteLength:length};
  } catch { return {error:'replay-failed'}; }
})();
"""


def fetch_expression(payload, remaining):
    values = {'REQUEST_PAYLOAD': {'url': payload['url'], 'headers': payload['headers']},
              'REMAINING_MS': max(1, int(remaining * 1000))}
    return re.sub(r'\b(REQUEST_PAYLOAD|REMAINING_MS)\b', lambda match: json.dumps(values[match[0]]), FETCH_SCRIPT)


def safe_subresource_query(query, challenge):
    """Only bounded, literal public challenge/cache parameters, not credentials.

    Do not percent-decode keys or values: encoded aliases, nested escapes and
    arbitrary auth/token arguments cannot become an allowed parameter.
    """
    if not query:
        return True
    if len(query) > 256:
        return False
    pairs = query.split('&')
    allowed = {'ray', 'lang', 'v'} if challenge else {'v', 'ver', 'version'}
    if len(pairs) > (3 if challenge else 1):
        return False
    seen = set()
    for pair in pairs:
        parts = pair.split('=')
        if len(parts) != 2:
            return False
        key, value = parts
        if key not in allowed or key in seen:
            return False
        seen.add(key)
        if key == 'ray':
            if not re.fullmatch(r'[0-9a-fA-F]{16,32}', value):
                return False
        elif key == 'lang':
            if not re.fullmatch(r'[a-z]{2,3}(?:-[A-Za-z]{2,4})?|auto', value):
                return False
        elif not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._~-]{0,63}', value):
            return False
    return True


def safe_subresource(raw, source_url, resource):
    # Deliberately narrow: no external documents, arbitrary XHR, tracking,
    # websocket, worker, download, IP literal, HTTP or authenticated target.
    # Check raw spelling before parsing: Chromium and origin servers can
    # normalize encoded separators, dot segments or escapes differently.
    if (type(raw) is not str or len(raw) > 4096
            or re.search(r'[\\#\s\x00-\x20\x7f]', raw)):
        return False
    try:
        parsed, source = urlparse(raw), urlparse(source_url)
        port = parsed.port
    except ValueError:
        return False
    if (parsed.scheme != 'https' or parsed.username or parsed.password
            or port is not None or parsed.params or resource == 'Document'):
        return False
    if (not re.fullmatch(r'/[A-Za-z0-9._~/-]{1,2047}', parsed.path)
            or any(segment in {'', '.', '..'} for segment in parsed.path.split('/')[1:])):
        return False
    canonical = 'https://' + parsed.netloc + parsed.path
    if parsed.query:
        canonical += '?' + parsed.query
    if raw != canonical:
        return False
    challenge = parsed.path.startswith('/cdn-cgi/challenge-platform/')
    if not safe_subresource_query(parsed.query, challenge):
        return False
    if parsed.netloc == 'challenges.cloudflare.com':
        return challenge and resource in {'Script', 'Stylesheet', 'Image', 'Font', 'XHR', 'Fetch'}
    if parsed.netloc != source.netloc:
        return False
    if challenge:
        return resource in {'Script', 'Stylesheet', 'Image', 'Font', 'XHR', 'Fetch'}
    return (resource in {'Script', 'Stylesheet', 'Image', 'Font'}
            and bool(re.search(r'\.(?:js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf)$', parsed.path, re.I)))


class PassiveBrowser:
    def __init__(self, socket, payload, deadline, metrics=None):
        self.socket, self.payload, self.deadline = socket, payload, deadline
        self.metrics = metrics if metrics is not None else {'navigationAttempts': 0, 'replayAttempts': 0}
        self.serial, self.replies, self.resources = 0, {}, 0
        self.context = self.target = self.session = self.frame = self.loader = None
        self.sessions, self.safety_contexts = set(), {}
        self.committed = self.ready = self.fetching = self.closing = False
        self.challenge_pending = self.managed_challenge_observed = False
        self.navigation_generation = 0
        self.committed_generation = None
        self.awaiting_navigation = False
        self.safety_source = SAFETY_SCRIPT.replace('EXPECTED_URL', json.dumps(payload['url']))

    def remaining(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            fail('challenge-unresolved', 'unresolved') if self.challenge_pending else fail('operation-timeout')
        return remaining

    def send(self, method, params=None, session=None):
        self.remaining()
        self.serial += 1
        message = {'id': self.serial, 'method': method, 'params': params or {}}
        if session:
            message['sessionId'] = session
        self.socket.send(json.dumps(message, allow_nan=False))
        return self.serial

    def call(self, method, params=None, session=None):
        generation = self.navigation_generation
        identifier = self.send(method, params, session)
        while identifier not in self.replies:
            self.pump()
        reply = self.replies.pop(identifier)
        if 'error' in reply:
            error = reply['error']
            # A permitted managed same-URL reload can destroy a scan's isolated
            # context while the command is in flight. Only these known CDP
            # context-loss errors may restart observation, never navigation or
            # replay. All other command errors and all fetch-stage errors fail.
            if (method == 'Runtime.evaluate' and (params or {}).get('expression') == SCAN_EXPRESSION
                    and not self.fetching and self.navigation_generation != generation
                    and self.managed_challenge_observed
                    and type(error) is dict and error.get('code') == -32000
                    and error.get('message') in {'Cannot find context with specified id',
                                                 'Execution context was destroyed.'}):
                raise SafetyNavigationChanged()
            fail('browser-command-failed')
        return reply.get('result', {})

    def pump(self, timeout=None):
        remaining = self.remaining()
        try:
            message = json.loads(self.socket.recv(timeout=min(remaining, timeout) if timeout else remaining))
        except TimeoutError:
            if timeout is not None and self.remaining() > 0:
                return False
            fail('challenge-unresolved', 'unresolved') if self.challenge_pending else fail('operation-timeout')
        if 'id' in message:
            self.replies[message['id']] = message
        elif not self.closing:
            self.event(message)
        return True

    def enable_target(self, session):
        self.sessions.add(session)
        for method in ('Page.enable', 'Runtime.enable', 'Network.enable', 'Security.enable'):
            self.call(method, session=session)
        self.call('Page.setLifecycleEventsEnabled', {'enabled': True}, session)
        self.call('Network.setBypassServiceWorker', {'bypass': True}, session)
        self.call('Network.setCacheDisabled', {'cacheDisabled': True}, session)
        self.call('Network.setBlockedURLs', {'urls': ['ws://*', 'wss://*', 'http://*', 'ftp://*', 'file://*']}, session)
        self.call('Runtime.addBinding', {'name': BINDING, 'executionContextName': WORLD}, session)
        self.call('Page.addScriptToEvaluateOnNewDocument', {'source': self.safety_source,
                  'worldName': WORLD}, session)
        self.call('Fetch.enable', {'patterns': [{'urlPattern': '*', 'requestStage': stage}
                                              for stage in ('Request', 'Response')]}, session)
        self.call('Target.setAutoAttach', {'autoAttach': True, 'waitForDebuggerOnStart': True, 'flatten': True}, session)

    def notice(self, reason):
        if reason == 'managed-challenge':
            self.challenge_pending = self.managed_challenge_observed = True
            return
        if reason == 'captcha-visible':
            fail(reason, 'captcha')
        if reason == 'security-warning':
            fail(reason, 'security')
        if reason == 'access-denied':
            fail(reason, 'denied')
        if reason in {'document-identity-changed', 'observer-unavailable'}:
            fail(reason)
        if reason not in {'ready', 'pending'}:
            fail('observer-unavailable')

    def event(self, message):
        method, data, session = message.get('method'), message.get('params', {}), message.get('sessionId')
        if method == 'Target.attachedToTarget':
            child, info = data['sessionId'], data['targetInfo']
            if info['targetId'] == self.target or session not in self.sessions:
                return
            # No workers are resumed. Their requests could outlive the observed
            # document or fall outside its interception/safety lifecycle.
            if info.get('type') != 'iframe':
                fail('unexpected-target')
            self.enable_target(child)
            self.call('Runtime.runIfWaitingForDebugger', session=child)
            return
        if method == 'Target.targetCreated':
            info = data['targetInfo']
            if (self.target and info.get('browserContextId') == self.context
                    and info.get('type') == 'page' and info['targetId'] != self.target):
                fail('unexpected-target')
            return
        if session not in self.sessions:
            return
        if method == 'Runtime.executionContextCreated':
            context = data['context']
            if context.get('name') == WORLD:
                self.safety_contexts[(session, context['id'])] = context.get('auxData', {}).get('frameId')
                if len(self.safety_contexts) > 128:
                    fail('resource-limit')
        elif method == 'Runtime.executionContextDestroyed':
            frame = self.safety_contexts.pop((session, data.get('executionContextId')), None)
            if session == self.session and frame == self.frame:
                self.context_lost()
        elif method == 'Runtime.executionContextsCleared':
            self.safety_contexts = {key: value for key, value in self.safety_contexts.items() if key[0] != session}
            if session == self.session:
                self.context_lost()
        elif method == 'Runtime.bindingCalled' and data.get('name') == BINDING:
            # Only a registered isolated-world context can report a gate.
            if (session, data.get('executionContextId')) not in self.safety_contexts:
                fail('observer-unavailable')
            self.notice(json.loads(data.get('payload', '{}')).get('reason'))
        elif method == 'Network.loadingFailed' and re.search(r'ERR_CERT_|ERR_SSL_|ERR_INSECURE_RESPONSE', data.get('errorText', '')):
            fail('security-warning', 'security')
        elif method == 'Security.certificateError' or method == 'Page.interstitialShown':
            fail('security-warning', 'security')
        elif method in {'Security.securityStateChanged', 'Security.visibleSecurityStateChanged'}:
            state = data.get('visibleSecurityState', data).get('securityState')
            if self.committed and state not in {'secure', 'info'}:
                fail('security-warning', 'security')
        elif method in {'Network.webSocketCreated', 'Network.webTransportCreated'}:
            fail('resource-blocked')
        elif method == 'Page.javascriptDialogOpening':
            fail('unexpected-dialog')
        elif method == 'Page.navigatedWithinDocument' and session == self.session and data.get('frameId') == self.frame:
            if data.get('url') != self.payload['url']:
                fail('document-url-mismatch')
        elif method == 'Page.frameNavigated' and session == self.session and data['frame']['id'] == self.frame:
            frame = data['frame']
            if frame.get('url') != self.payload['url']:
                fail('document-url-mismatch')
            if self.fetching:
                fail('navigation-during-replay')
            if not self.awaiting_navigation:
                fail('unexpected-navigation-state')
            self.loader, self.committed, self.ready = frame.get('loaderId'), True, False
            self.committed_generation = self.navigation_generation
        elif (method == 'Page.lifecycleEvent' and session == self.session and self.committed
              and data.get('name') == 'DOMContentLoaded' and data.get('frameId') == self.frame
              and data.get('loaderId') == self.loader
              and self.committed_generation == self.navigation_generation):
            self.ready, self.awaiting_navigation = True, False
        elif method == 'Fetch.requestPaused':
            self.request_paused(data, session)

    def context_lost(self):
        # Context destruction is expected only while observing an already
        # intercepted/authorized main-document navigation. It never authorizes
        # a new request or permits the replay to be retried.
        if self.fetching:
            fail('replay-context-lost')
        if self.committed and not self.awaiting_navigation:
            fail('observer-unavailable')
        self.ready = False

    def ready_to_scan(self):
        return self.ready and any(session == self.session and frame == self.frame
                                  for (session, _), frame in self.safety_contexts.items())

    def request_paused(self, data, session):
        self.resources += 1
        if self.resources > MAX_RESOURCES:
            fail('resource-limit')
        request, identifier = data['request'], data['requestId']
        url, resource = request['url'], data.get('resourceType')
        main = session == self.session and data.get('frameId') == self.frame and resource == 'Document'
        replay = (session == self.session and data.get('frameId') == self.frame
                  and resource == 'Fetch' and url == self.payload['url'] and self.fetching)
        is_response = 'responseStatusCode' in data or 'responseErrorReason' in data
        if is_response:
            headers = {item.get('name', '').lower(): item.get('value', '') for item in data.get('responseHeaders', [])}
            if main and headers.get('cf-mitigated', '').lower() == 'challenge':
                self.challenge_pending = self.managed_challenge_observed = True
            if 300 <= data.get('responseStatusCode', 0) < 400:
                fail('redirect-blocked')
            if data.get('responseErrorReason'):
                fail('navigation-failed' if main else 'replay-failed')
        else:
            if request.get('method') != 'GET' or request.get('hasPostData') or request.get('postData'):
                fail('resource-blocked')
            if main:
                if url != self.payload['navigationURL']:
                    fail('document-url-mismatch')
                if self.fetching:
                    fail('navigation-during-replay')
                if self.metrics['navigationAttempts'] >= MAX_NAVIGATIONS:
                    fail('navigation-limit', 'unresolved')
                # Subsequent navigations may only reload the managed challenge.
                if self.metrics['navigationAttempts'] and not (self.challenge_pending and self.managed_challenge_observed):
                    fail('unverified-reload')
                self.metrics['navigationAttempts'] += 1
                self.navigation_generation += 1
                self.ready, self.awaiting_navigation = False, True
            elif replay:
                if self.metrics['replayAttempts']:
                    fail('resource-blocked')
                actual = {key.lower(): value for key, value in request.get('headers', {}).items()}
                if any(actual.get(key) != value for key, value in self.payload['headers'].items()):
                    fail('resource-blocked')
                self.metrics['replayAttempts'] += 1
            elif not safe_subresource(url, self.payload['url'], resource):
                fail('resource-blocked', 'unresolved' if resource == 'Document' else 'operation')
            # Do not send supplied app headers to any other URL or origin.
            if not replay:
                for key in self.payload['headers']:
                    if key not in {'accept', 'content-type'} and any(name.lower() == key for name in request.get('headers', {})):
                        fail('resource-blocked')
        # At response stage continuation happens before Chromium follows any
        # redirect. Never use fulfillRequest or turn blocked content into a 200.
        self.call('Fetch.continueRequest', {'requestId': identifier}, session)

    def check_safety(self):
        generation = self.navigation_generation
        main_context = None
        pending = False
        for (session, context), frame in list(self.safety_contexts.items()):
            if session == self.session and frame == self.frame:
                main_context = context
            result = self.call('Runtime.evaluate', {'expression': SCAN_EXPRESSION,
                               'contextId': context, 'returnByValue': True,
                               'timeout': max(1, int(self.remaining() * 1000))}, session)
            if result.get('exceptionDetails'):
                fail('observer-unavailable')
            state = result.get('result', {}).get('value')
            self.notice(state)
            if not self.fetching and self.navigation_generation != generation:
                # A stale 'ready' response cannot clear the new document's
                # pending gate. Re-observe its exact loader and isolated world.
                raise SafetyNavigationChanged()
            pending = pending or state == 'pending'
        if main_context is None:
            fail('observer-unavailable')
        self.challenge_pending = pending
        return main_context, pending

    def run(self):
        self.context = self.call('Target.createBrowserContext', {'disposeOnDetach': True})['browserContextId']
        self.call('Browser.setDownloadBehavior', {'behavior': 'deny', 'browserContextId': self.context})
        self.target = self.call('Target.createTarget', {'url': 'about:blank', 'browserContextId': self.context})['targetId']
        self.session = self.call('Target.attachToTarget', {'targetId': self.target, 'flatten': True})['sessionId']
        self.enable_target(self.session)
        self.call('Target.setDiscoverTargets', {'discover': True})
        self.frame = self.call('Page.getFrameTree', session=self.session)['frameTree']['frame']['id']
        # Pending is conservative during initial load, allowing only exact-URL
        # managed reloads. Once ready, no additional document request is allowed.
        self.challenge_pending = True
        navigation = self.call('Page.navigate', {'url': self.payload['navigationURL']}, self.session)
        if navigation.get('errorText'):
            fail('navigation-failed')
        while True:
            while not self.ready_to_scan():
                self.pump()
            try:
                context, pending = self.check_safety()
            except SafetyNavigationChanged:
                continue
            if not pending:
                break
            self.pump(timeout=.2)
        loader = self.loader
        self.fetching = True
        result = self.call('Runtime.evaluate', {'expression': fetch_expression(self.payload, self.remaining()),
                           'contextId': context, 'awaitPromise': True, 'returnByValue': True,
                           'timeout': max(1, int(self.remaining() * 1000))}, self.session)
        if result.get('exceptionDetails'):
            fail('replay-failed')
        value = result.get('result', {}).get('value')
        if type(value) is dict and 'error' in value:
            fail(value['error'] if value['error'] in REASONS else 'replay-failed')
        value = validate_response(value, self.payload['url'])
        if self.metrics['replayAttempts'] != 1:
            fail('replay-failed')
        frame = self.call('Page.getFrameTree', session=self.session)['frameTree']['frame']
        if frame.get('url') != self.payload['url']:
            fail('document-url-mismatch')
        if frame.get('loaderId') != loader:
            fail('replay-loader-changed')
        try:
            _, pending = self.check_safety()
        except AssistanceFailure as error:
            if error.code != 'denied':
                raise
            value = {**value, 'terminalReason': 'denied'}
            pending = False
        if pending and value.get('terminalReason') != 'denied':
            value = {**value, 'terminalReason': 'unresolved'}
        return {**value, 'metrics': dict(self.metrics)}

    def cleanup(self):
        self.closing = True
        self.deadline = time.monotonic() + 2
        if self.context:
            self.call('Target.disposeBrowserContext', {'browserContextId': self.context})
            self.context = None


def execute(driver, payload, deadline=None, metrics=None):
    payload = validate_payload(payload)
    deadline = deadline if deadline is not None else time.monotonic() + OPERATION_SECONDS
    endpoint = debugger_url(driver, deadline)
    from websockets.sync.client import connect
    with connect(endpoint, proxy=None, open_timeout=min(3, max(.01, deadline - time.monotonic())),
                 close_timeout=1, max_size=MAX_WIRE, max_queue=64) as socket:
        browser = PassiveBrowser(socket, payload, deadline, metrics)
        try:
            result = browser.run()
        except BaseException:
            try:
                browser.cleanup()
            except Exception:
                pass  # disposeOnDetach remains the final context cleanup boundary.
            raise
        browser.cleanup()
        return result


def register(app):
    from bottle import request, response
    from flaresolverr_service import SESSIONS_STORAGE

    @app.post('/browser/assist')
    def browser_assist():
        metrics = {'navigationAttempts': 0, 'replayAttempts': 0}
        try:
            if (request.get_header('Content-Type', '').split(';', 1)[0].strip().lower() != 'application/json'
                    or request.content_length is None or not 0 <= request.content_length <= MAX_REQUEST
                    or request.get_header('Transfer-Encoding')):
                fail('invalid-request')
            raw = request.environ['wsgi.input'].read(request.content_length)
            if len(raw) != request.content_length:
                fail('invalid-request')
            payload = validate_payload(strict_json(raw))
            deadline = time.monotonic() + OPERATION_SECONDS
            with LOCKS_GUARD:
                if payload['session'] in LOCKS:
                    fail('session-busy')
                LOCKS[payload['session']] = True
            try:
                # Never use get(), which silently creates missing sessions.
                if payload['session'] not in SESSIONS_STORAGE.session_ids():
                    fail('session-not-found')
                session = SESSIONS_STORAGE.sessions.get(payload['session'])
                if session is None:
                    fail('session-not-found')
                return execute(session.driver, payload, deadline, metrics)
            finally:
                with LOCKS_GUARD:
                    LOCKS.pop(payload['session'], None)
        except AssistanceFailure as error:
            response.status = 409 if error.code in {'captcha', 'security', 'denied'} else 502
            return failure_payload(error, metrics)
        except Exception:
            response.status = 502
            return failure_payload(AssistanceFailure('browser-operation-failed'), metrics)
