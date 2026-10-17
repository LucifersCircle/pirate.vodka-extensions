# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Lucifers Circle
"""Test-only Chromium host for the supported Paperback supplied-HTML contract.

This is not WKWebView/iOS emulation. It fulfills exactly one main-document
request with the caller's unchanged UTF-8 HTML, so Chromium supplies genuine
URL, origin, base resolution and script execution. It never fetches a second
provider document, invokes a solver, exports cookies or overrides TLS errors.
The original HTML must already have come from the native checked transport.

Safety selectors/JSON bridge ideas are adapted from the GPL-3.0-or-later
LucifersCircle/mana-extensions scripts/flaresolverr/{browser_request,webview_page}.py.
"""

import base64
import http.client
import ipaddress
import json
import math
import re
import threading
import time
from urllib.parse import parse_qsl, urlparse

MAX_HTML = 4 * 1024 * 1024
MAX_SCRIPT = 128 * 1024
MAX_RESULT = 4 * 1024 * 1024
MAX_REQUEST = MAX_HTML + MAX_SCRIPT + 128 * 1024
MAX_WIRE = 8 * MAX_RESULT
MAX_REQUESTS = 4096
WORLD = 'paperback-test-safety'
BINDING = '__paperback_test_safety__'
GATES = frozenset({'captcha-visible', 'certificate-marker', 'internal-page',
                   'document-identity-changed', 'tls-resource-error'})
IDENTITY_STAGES = frozenset({'same-document-event', 'main-frame-url', 'main-frame-recommit',
                            'main-response-redirect', 'main-request-identity', 'isolated-observer',
                            'safety-before-inject', 'safety-after-inject', 'inject-result',
                            'final-frame-url', 'final-loader'})


class WebViewFailure(Exception):
    """Only fixed, non-sensitive codes may cross the HTTP bridge."""
    def __init__(self, reason, code='operation', stage=None):
        super().__init__(reason)
        self.reason, self.code = reason, code
        self.stage = stage if stage in IDENTITY_STAGES else None


def fail(reason, code='operation', stage=None):
    raise WebViewFailure(reason, code, stage)


def failure_payload(error):
    result = {'error': 'Paperback test WebView failed', 'code': error.code, 'reason': error.reason}
    if error.stage in IDENTITY_STAGES:
        result['stage'] = error.stage
    return result


def assert_document_url(value):
    if (not isinstance(value, str) or len(value) > 4096
            or re.search(r'[\\#\s\x00-\x20\x7f]', value)
            or not re.fullmatch(r'https://marumaru105\.com/[^#\\]*', value)):
        fail('unsupported-document')
    url = urlparse(value)
    if url.netloc != 'marumaru105.com' or url.params:
        fail('unsupported-document')
    if not re.fullmatch(r'/(?:manhwa(?:/[1-9][0-9]*(?:/[1-9][0-9]*)?)?|search)', url.path):
        fail('unsupported-document')
    if re.search(r'%(?![0-9a-fA-F]{2})', url.query):
        fail('unsupported-query')
    pairs = parse_qsl(url.query, keep_blank_values=True, strict_parsing=True, errors='strict')
    if any(re.search(r'[\x00-\x1f\x7f]', key + value) for key, value in pairs):
        fail('unsupported-query')
    params = dict(pairs)
    if len(pairs) != len(params) or ('page' in params and not re.fullmatch(r'[1-9][0-9]*', params['page'])):
        fail('unsupported-query')
    if url.path == '/search':
        if (not params.get('q', '').strip() or len(params.get('q', '').encode('utf-16-le')) > 600
                or params.get('kind') != 'manhwa' or not params.keys() <= {'q', 'kind', 'page'}):
            fail('unsupported-query')
    elif params and (url.path != '/manhwa' or set(params) != {'page'}):
        fail('unsupported-query')


def validate_payload(payload):
    if (type(payload) is not dict or set(payload) != {'session', 'source', 'inject', 'cookies', 'timeout'}
            or not isinstance(payload['session'], str)
            or not re.fullmatch(r'[A-Za-z0-9-]{1,100}', payload['session'])):
        fail('unsupported-payload')
    source = payload['source']
    if (type(source) is not dict or set(source) != {'html', 'baseUrl', 'loadCSS', 'loadImages'}
            or source['loadCSS'] is not True or source['loadImages'] is not True
            or not isinstance(source['html'], str)
            or len(source['html'].encode('utf-8')) > MAX_HTML
            or not isinstance(payload['inject'], str)
            or len(payload['inject'].encode('utf-8')) > MAX_SCRIPT
            or payload['cookies'] != [] or type(payload['cookies']) is not list):
        fail('unsupported-options')
    timeout = payload['timeout']
    if type(timeout) not in (int, float) or not math.isfinite(timeout) or not 0 < timeout <= 120:
        fail('invalid-timeout')
    assert_document_url(source['baseUrl'])
    return payload


def debugger_url(driver, deadline):
    """Only the selected driver's local DevTools endpoint, never caller URLs."""
    if driver.capabilities.get('acceptInsecureCerts') is not False:
        fail('insecure-capability', 'security')
    address = driver.capabilities.get('goog:chromeOptions', {}).get('debuggerAddress', '')
    match = re.fullmatch(r'(?:127\.0\.0\.1|localhost):([0-9]{1,5})', address)
    if not match or not 1 <= int(match[1]) <= 65535:
        fail('unsupported-debugger-address')
    port = int(match[1])
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        fail('operation-timeout')
    # A direct loopback HTTPConnection cannot inherit outbound proxy credentials.
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=min(remaining, 5))
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
    if (parsed.scheme != 'ws' or parsed.hostname not in ('127.0.0.1', 'localhost')
            or parsed.port != port or parsed.username or parsed.password or parsed.query or parsed.fragment
            or not re.fullmatch(r'/devtools/browser/[A-Za-z0-9-]+', parsed.path)):
        fail('unsupported-debugger-address')
    return 'ws://127.0.0.1:' + str(port) + parsed.path


# This observer lives in a distinct Chromium isolated world. It does not replace
# or alter source functions, HTML, document properties, or URL identity guards.
SAFETY_SCRIPT = r"""
(() => {
  const expected = EXPECTED_URL;
  const report = globalThis.__paperback_test_safety__;
  let stopped = '';
  const stop = reason => { if (!stopped) { stopped = reason; report(JSON.stringify({reason})); } return stopped; };
  const visible = element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
      && style.display !== 'none' && style.opacity !== '0';
  };
  const scan = () => {
    if (stopped) return stopped;
    const main = window === window.top;
    if (main && (location.href !== expected || document.URL !== expected || document.baseURI !== expected))
      return stop('document-identity-changed');
    if (/^(chrome|chrome-error):/.test(location.protocol)) return stop('internal-page');
    const title = document.title.toLowerCase();
    if (/privacy error|your connection is not private|certificate error/.test(title)
        || /net::err_cert_/i.test(document.body?.innerText ?? '')) return stop('certificate-marker');
    const challengeFrame = !main && /challenges\.cloudflare\.com|recaptcha|hcaptcha/i.test(location.href);
    const selector = challengeFrame
      ? 'input[type="checkbox"], [role="checkbox"], input[type="button"], button'
      : '#challenge-form input[type="checkbox"], #challenge-form [role="checkbox"], '
        + '.cf-turnstile [role="checkbox"], #challenge-form input[type="button"], #challenge-form button';
    for (const element of document.querySelectorAll(selector)) {
      if (visible(element) && (element.matches('input[type="checkbox"], [role="checkbox"]')
          || /verify|human|robot|captcha/i.test(`${element.textContent} ${element.value ?? ''} ${element.getAttribute('aria-label') ?? ''}`)))
        return stop('captcha-visible');
    }
  };
  Object.defineProperty(globalThis, '__paperback_test_scan__', {value:scan});
  new MutationObserver(scan).observe(document, {subtree:true,childList:true,attributes:true});
  addEventListener('DOMContentLoaded', scan); addEventListener('load', scan);
  setInterval(scan, 100); scan();
})();
"""

# A function body, not a function expression: this matches executeInWebView's
# inject contract. Promise.resolve also awaits source-created Promise values.
# Descriptor-only encoding rejects getters, toJSON, cycles and non-JSON values.
EVALUATE_SCRIPT = r"""
(async () => {
  const expected = EXPECTED_URL, body = INJECT_BODY;
  const failure = reason => ({error:reason});
  const identity = () => location.href === expected && document.URL === expected && document.baseURI === expected;
  let nodes = 0;
  const encode = (value, ancestors = new Set(), depth = 0) => {
    if (++nodes > 200000 || depth > 100) throw new Error('limit');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (typeof value !== 'object' || ancestors.has(value)) throw new Error('not-json');
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('not-json');
    ancestors.add(value);
    const parts = []; let bytes = 2;
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      if (array && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) throw new Error('not-index');
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !d.enumerable || !('value' in d)) throw new Error('not-json');
      const part = (array ? '' : JSON.stringify(key) + ':') + encode(d.value, ancestors, depth + 1);
      bytes += new TextEncoder().encode(part).length + 1;
      if (bytes > 4 * 1024 * 1024) throw new Error('limit');
      parts.push(part);
    }
    if (array && parts.length !== value.length) throw new Error('sparse');
    ancestors.delete(value);
    return array ? '[' + parts.join(',') + ']' : '{' + parts.join(',') + '}';
  };
  if (!identity()) return failure('document-identity-changed');
  let value;
  try { value = await Promise.resolve((new Function(body))()); }
  catch { return failure('callback-rejected'); }
  if (!identity()) return failure('document-identity-changed');
  try {
    const encoded = encode(value);
    if (new TextEncoder().encode(encoded).length > 4 * 1024 * 1024) return failure('result-too-large');
    return {url:location.href, encoded};
  } catch { return failure('serialization-error'); }
})();
"""


def evaluation_expression(payload):
    values = {'EXPECTED_URL': payload['source']['baseUrl'], 'INJECT_BODY': payload['inject']}
    return re.sub(r'\b(EXPECTED_URL|INJECT_BODY)\b', lambda match: json.dumps(values[match[0]]), EVALUATE_SCRIPT)


def strict_json(value):
    def reject_constant(_):
        fail('invalid-json')

    def unique(pairs):
        result = dict(pairs)
        if len(result) != len(pairs):
            fail('invalid-json')
        return result

    return json.loads(value, parse_constant=reject_constant, object_pairs_hook=unique)


class ChromiumHTMLHost:
    """A synchronous CDP event pump with an independent wall-clock deadline."""
    def __init__(self, socket, payload, deadline):
        self.socket, self.payload, self.deadline = socket, payload, deadline
        self.serial, self.replies = 0, {}
        self.session = self.context = self.target = self.frame = self.loader = None
        self.sessions = set()
        self.safety_contexts = {}
        self.injected = self.committed = self.ready = False
        self.requests = 0
        self.closing = False
        self.safety_source = SAFETY_SCRIPT.replace('EXPECTED_URL', json.dumps(payload['source']['baseUrl']))

    def remaining(self):
        value = self.deadline - time.monotonic()
        if value <= 0:
            fail('operation-timeout')
        return value

    def send(self, method, params=None, session=None):
        self.remaining()
        self.serial += 1
        message = {'id': self.serial, 'method': method, 'params': params or {}}
        if session:
            message['sessionId'] = session
        self.socket.send(json.dumps(message, allow_nan=False))
        return self.serial

    def call(self, method, params=None, session=None):
        identifier = self.send(method, params, session)
        while identifier not in self.replies:
            self.pump()
        reply = self.replies.pop(identifier)
        if 'error' in reply:
            fail('browser-command-failed')
        return reply.get('result', {})

    def pump(self):
        message = json.loads(self.socket.recv(timeout=self.remaining()))
        if 'id' in message:
            self.replies[message['id']] = message
        elif not self.closing:
            self.event(message)

    def enable_target(self, session, document=True):
        self.sessions.add(session)
        domains = ('Page.enable', 'Runtime.enable', 'Network.enable', 'Security.enable') if document else ('Runtime.enable', 'Network.enable')
        for method in domains:
            self.call(method, session=session)
        if document:
            self.call('Runtime.addBinding', {'name': BINDING, 'executionContextName': WORLD}, session)
            self.call('Page.addScriptToEvaluateOnNewDocument', {'source': self.safety_source,
                      'worldName': WORLD, 'runImmediately': session != self.session}, session)
        self.call('Fetch.enable', {'patterns': [{'urlPattern': '*', 'requestStage': stage}
                                              for stage in ('Request', 'Response')]}, session)
        self.call('Target.setAutoAttach', {'autoAttach': True, 'waitForDebuggerOnStart': True, 'flatten': True}, session)

    def event(self, message):
        method, data, session = message.get('method'), message.get('params', {}), message.get('sessionId')
        if method == 'Target.attachedToTarget':
            child, info = data['sessionId'], data['targetInfo']
            if info['targetId'] == self.target:
                return
            if session not in self.sessions:
                return
            if info.get('type') not in ('iframe', 'worker', 'shared_worker', 'service_worker'):
                fail('unsupported-browser-target')
            self.enable_target(child, document=info.get('type') == 'iframe')
            self.call('Runtime.runIfWaitingForDebugger', session=child)
            return
        if method == 'Target.targetCreated':
            info = data['targetInfo']
            if (self.target and info.get('browserContextId') == self.context
                    and info.get('type') == 'page' and info['targetId'] != self.target):
                fail('unexpected-window')
            return
        if session not in self.sessions:
            return
        if method == 'Runtime.executionContextCreated':
            context = data['context']
            if context.get('name') == WORLD:
                self.safety_contexts[(session, context['id'])] = context.get('auxData', {}).get('frameId')
                if len(self.safety_contexts) > 256:
                    fail('frame-limit')
        elif method == 'Runtime.executionContextDestroyed':
            self.safety_contexts.pop((session, data.get('executionContextId')), None)
        elif method == 'Runtime.executionContextsCleared':
            self.safety_contexts = {key:value for key,value in self.safety_contexts.items() if key[0] != session}
        elif method == 'Runtime.bindingCalled' and data.get('name') == BINDING:
            notice = json.loads(data.get('payload', '{}'))
            reason = notice.get('reason')
            if reason in GATES:
                fail(reason, 'captcha' if reason == 'captcha-visible' else
                     'security' if reason != 'document-identity-changed' else 'operation',
                     stage='isolated-observer' if reason == 'document-identity-changed' else None)
        elif method == 'Network.loadingFailed' and re.search(r'ERR_CERT_|ERR_SSL_', data.get('errorText', '')):
            fail('tls-resource-error', 'security')
        elif method == 'Security.certificateError':
            fail('tls-resource-error', 'security')
        elif method == 'Page.javascriptDialogOpening':
            fail('unexpected-dialog')
        elif method == 'Page.navigatedWithinDocument' and session == self.session and data.get('frameId') == self.frame:
            # SPAs may replaceState with the same URL without changing document
            # identity. Accept only the exact expected URL; no URL normalization.
            if data.get('url') != self.payload['source']['baseUrl']:
                fail('document-identity-changed', stage='same-document-event')
        elif method == 'Page.frameNavigated' and session == self.session and data['frame']['id'] == self.frame:
            frame = data['frame']
            if frame.get('url') != self.payload['source']['baseUrl']:
                fail('document-identity-changed', stage='main-frame-url')
            if self.committed:
                fail('document-identity-changed', stage='main-frame-recommit')
            self.loader, self.committed = frame.get('loaderId'), True
        elif method == 'Page.domContentEventFired' and session == self.session and self.committed:
            self.ready = True
        elif method == 'Fetch.requestPaused':
            self.request_paused(data, session)

    def request_paused(self, data, session):
        self.requests += 1
        if self.requests > MAX_REQUESTS:
            fail('resource-limit')
        request, identifier = data['request'], data['requestId']
        url, resource = request['url'], data.get('resourceType')
        main = session == self.session and data.get('frameId') == self.frame and resource == 'Document'
        if 'responseStatusCode' in data or 'responseErrorReason' in data:
            if main and data.get('responseErrorReason'):
                fail('resource-load-failed')
            # Ordinary subresource failures belong to Chromium and the source's
            # own DOM readiness/completeness checks. Continue the failed request
            # unchanged, not with a fabricated successful response. Independent
            # Network/Security TLS events still terminate the operation.
            if main and 300 <= data.get('responseStatusCode', 0) < 400:
                fail('document-identity-changed', stage='main-response-redirect')
        elif main:
            if self.injected or url != self.payload['source']['baseUrl'] or request.get('method') != 'GET':
                fail('document-identity-changed', stage='main-request-identity')
            self.injected = True
            # Exact UTF-8 supplied HTML. No base tag, URL stub, bootstrap, fixture,
            # CSP or JavaScript substitution is introduced by this host.
            self.call('Fetch.fulfillRequest', {'requestId': identifier, 'responseCode': 200,
                      'responseHeaders': [{'name': 'Content-Type', 'value': 'text/html; charset=utf-8'},
                                          {'name': 'Cache-Control', 'value': 'no-store'}],
                      'body': base64.b64encode(self.payload['source']['html'].encode('utf-8')).decode('ascii')}, session)
            return
        else:
            parsed = urlparse(url)
            # Preserve script-issued methods and ordinary HTTPS subresources.
            # The main URL is strictly Marumaru-only; this hostname/literal-IP
            # filter merely rejects obvious local targets, not DNS resolution or
            # rebinding. It is not a network-layer public-address containment
            # boundary. Chromium retains its normal TLS and network protections.
            if (parsed.scheme != 'https' or not parsed.hostname
                    or parsed.username or parsed.password):
                fail('unsupported-subresource')
            hostname = parsed.hostname.rstrip('.').lower()
            if (hostname == 'localhost' or hostname.endswith(('.localhost', '.local', '.internal'))
                    or '.' not in hostname):
                fail('private-subresource')
            try:
                address = ipaddress.ip_address(hostname)
            except ValueError:
                address = None
            if address is not None and not address.is_global:
                fail('private-subresource')
        self.call('Fetch.continueRequest', {'requestId': identifier}, session)

    def check_safety(self, stage):
        # A synchronous scan in each isolated realm closes the gap between the
        # last DOM mutation, its observer notification, and the final result.
        if self.frame not in self.safety_contexts.values():
            fail('safety-observer-unavailable')
        for (session, context), _ in list(self.safety_contexts.items()):
            result = self.call('Runtime.evaluate', {'expression': 'globalThis.__paperback_test_scan__()',
                               'contextId': context, 'returnByValue': True,
                               'timeout': max(1, int(self.remaining() * 1000))}, session)
            if result.get('exceptionDetails'):
                fail('safety-observer-unavailable')
            reason = result.get('result', {}).get('value')
            if reason in GATES:
                fail(reason, 'captcha' if reason == 'captcha-visible' else
                     'security' if reason != 'document-identity-changed' else 'operation',
                     stage=stage if reason == 'document-identity-changed' else None)

    def run(self):
        self.context = self.call('Target.createBrowserContext', {'disposeOnDetach': True})['browserContextId']
        self.target = self.call('Target.createTarget', {'url': 'about:blank', 'browserContextId': self.context})['targetId']
        self.session = self.call('Target.attachToTarget', {'targetId': self.target, 'flatten': True})['sessionId']
        self.enable_target(self.session)
        self.call('Target.setDiscoverTargets', {'discover': True})
        self.frame = self.call('Page.getFrameTree', session=self.session)['frameTree']['frame']['id']
        navigation = self.call('Page.navigate', {'url': self.payload['source']['baseUrl']}, self.session)
        if navigation.get('errorText'):
            fail('navigation-error')
        while not self.ready:
            self.pump()
        if not self.injected or not self.committed:
            fail('document-not-supplied')
        self.check_safety('safety-before-inject')
        expression = evaluation_expression(self.payload)
        result = self.call('Runtime.evaluate', {'expression': expression, 'awaitPromise': True,
                           'returnByValue': True, 'timeout': max(1, int(self.remaining() * 1000))}, self.session)
        if result.get('exceptionDetails'):
            fail('evaluation-failed')
        value = result.get('result', {}).get('value')
        if type(value) is not dict:
            fail('evaluation-failed')
        if value.get('error') in {'callback-rejected', 'document-identity-changed', 'serialization-error', 'result-too-large'}:
            fail(value['error'], stage='inject-result' if value['error'] == 'document-identity-changed' else None)
        if (value.get('url') != self.payload['source']['baseUrl'] or not isinstance(value.get('encoded'), str)
                or len(value['encoded'].encode('utf-8')) > MAX_RESULT):
            fail('invalid-result')
        # A round trip flushes safety notices queued alongside the result before
        # success. It also verifies the real loader did not change undetected.
        frame = self.call('Page.getFrameTree', session=self.session)['frameTree']['frame']
        if frame.get('url') != value['url']:
            fail('document-identity-changed', stage='final-frame-url')
        if frame.get('loaderId') != self.loader:
            fail('document-identity-changed', stage='final-loader')
        self.check_safety('safety-after-inject')
        return {'url': value['url'], 'value': strict_json(value['encoded'])}

    def cleanup(self):
        # A distinct bounded cleanup budget applies even after the script deadline.
        # disposeOnDetach additionally closes the context if the socket is lost.
        self.closing = True
        self.deadline = time.monotonic() + 3
        if self.context:
            self.call('Target.disposeBrowserContext', {'browserContextId': self.context})
            self.context = None


def execute(driver, payload, deadline=None):
    validate_payload(payload)
    deadline = deadline if deadline is not None else time.monotonic() + payload['timeout']
    endpoint = debugger_url(driver, deadline)
    from websockets.sync.client import connect
    # proxy=None is only for the local debugger socket, not browser networking.
    with connect(endpoint, proxy=None, open_timeout=min(5, max(.01, deadline - time.monotonic())),
                 close_timeout=1, max_size=MAX_WIRE, max_queue=64) as socket:
        host = ChromiumHTMLHost(socket, payload, deadline)
        try:
            result = host.run()
        except BaseException:
            try:
                host.cleanup()
            except Exception:
                pass  # disposeOnDetach closes this context when the socket closes.
            raise
        host.cleanup()
        return result


def register(app):
    from bottle import request, response
    from browser_request import LOCKS
    from flaresolverr_service import SESSIONS_STORAGE

    @app.post('/browser/paperback-webview')
    def paperback_webview():
        try:
            # Bottle's eager request.json would read an unbounded body first.
            if (request.get_header('Content-Type', '').split(';', 1)[0].strip().lower() != 'application/json'
                    or request.content_length is None or not 0 <= request.content_length <= MAX_REQUEST
                    or request.get_header('Transfer-Encoding')):
                fail('request-too-large')
            raw = request.environ['wsgi.input'].read(request.content_length)
            if len(raw) != request.content_length:
                fail('invalid-payload')
            payload = validate_payload(strict_json(raw))
            deadline = time.monotonic() + payload['timeout']
            lock = LOCKS.setdefault(payload['session'], threading.Lock())
            if not lock.acquire(timeout=payload['timeout']):
                fail('session-busy')
            try:
                # get() would create an absent session; never permit that side effect.
                if payload['session'] not in SESSIONS_STORAGE.session_ids():
                    fail('session-not-found')
                session = SESSIONS_STORAGE.sessions.get(payload['session'])
                if session is None:
                    fail('session-not-found')
                return execute(session.driver, payload, deadline)
            finally:
                lock.release()
        except WebViewFailure as error:
            response.status = 409 if error.code in ('captcha', 'security') else 502
            return failure_payload(error)
        except TimeoutError:
            response.status = 502
            return {'error': 'Paperback test WebView failed', 'code': 'operation', 'reason': 'operation-timeout'}
        except Exception:
            # Never expose HTML, scripts, cookies, exception text or debugger URLs.
            response.status = 502
            return {'error': 'Paperback test WebView failed', 'code': 'operation', 'reason': 'browser-operation-failed'}
