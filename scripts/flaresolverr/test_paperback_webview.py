# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Lucifers Circle
"""Offline host-contract tests. Synthetic protocol/JS only, not source fixtures.

Run: python -m unittest discover -s scripts/flaresolverr -p test_paperback_webview.py
No provider request, scraper result, source fixture or iOS equivalence is asserted.
"""
import base64
import json
import pathlib
import shutil
import subprocess
import sys
import time
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import paperback_webview as host

URL = 'https://marumaru105.com/manhwa/123'


def payload(**updates):
    value = {'session': 'test-session', 'source': {'html': '<!doctype html><html><head><script>window.original=1;</script></head><body>한글</body></html>',
             'baseUrl': URL, 'loadCSS': True, 'loadImages': True}, 'inject': 'return Promise.resolve({answer:42});', 'cookies': [], 'timeout': 1}
    value.update(updates)
    return value


class RecordingHost(host.ChromiumHTMLHost):
    def __init__(self, data=None):
        super().__init__(None, data or payload(), time.monotonic() + 1)
        self.session, self.frame, self.target, self.context = 'main', 'frame', 'target', 'context'
        self.sessions = {'main'}
        self.calls = []

    def call(self, method, params=None, session=None):
        self.calls.append((method, params, session))
        return {}


def paused(url=URL, resource='Document', frame='frame', method='GET', **extra):
    return {'requestId': 'request', 'frameId': frame, 'resourceType': resource,
            'request': {'url': url, 'method': method}, **extra}


class PayloadTests(unittest.TestCase):
    def test_supported_exact_options(self):
        self.assertEqual(host.validate_payload(payload()), payload())

    def test_bad_options_are_not_silently_ignored(self):
        options = [dict(userAgent='UA'), dict(loadCSS=False), dict(loadImages=False), dict(html=7)]
        for changed in options:
            data = payload(); data['source'].update(changed)
            with self.subTest(changed=changed), self.assertRaises(host.WebViewFailure):
                host.validate_payload(data)
        for changed in [{'cookies': [{}]}, {'cookies': {}}, {'console': True}, {'timeout': True},
                        {'timeout': float('nan')}, {'timeout': 121}, {'inject': None}, {'session': '../x'}]:
            with self.subTest(changed=changed), self.assertRaises(host.WebViewFailure):
                host.validate_payload(payload(**changed))

    def test_bounds_are_utf8_bytes(self):
        data = payload(); data['source']['html'] = '한' * (host.MAX_HTML // 3 + 1)
        with self.assertRaises(host.WebViewFailure): host.validate_payload(data)
        with self.assertRaises(host.WebViewFailure): host.validate_payload(payload(inject='a' * (host.MAX_SCRIPT + 1)))

    def test_public_document_urls_only(self):
        for url in ['http://marumaru105.com/manhwa', 'https://marumaru105.com.evil/manhwa',
                    'https://marumaru105.com:443/manhwa', 'https://marumaru105.com/manhwa#x',
                    'https://marumaru105.com/login', URL + '?page=1', URL + '/../../login',
                    'https://marumaru105.com/manhwa?page=1&page=2', 'https://marumaru105.com/search?q=%xx&kind=manhwa',
                    'https://user@marumaru105.com/manhwa',
                    'https://marumaru105.com/search?q=a%00b&kind=manhwa',
                    'https://marumaru105.com/search?q=a%0Ab&kind=manhwa',
                    'https://marumaru105.com/search?q=a%7Fb&kind=manhwa']:
            with self.subTest(url=url), self.assertRaises((host.WebViewFailure, ValueError)):
                host.assert_document_url(url)
        host.assert_document_url('https://marumaru105.com/search?q=abc&kind=manhwa&page=1')

    def test_strict_json(self):
        for value in ['NaN', 'Infinity', '{"a":1,"a":2}']:
            with self.assertRaises(host.WebViewFailure): host.strict_json(value)


class ProtocolTests(unittest.TestCase):
    def test_fulfills_only_first_exact_document_with_exact_supplied_bytes(self):
        bridge = RecordingHost()
        bridge.request_paused(paused(), 'main')
        method, args, session = bridge.calls[0]
        self.assertEqual(method, 'Fetch.fulfillRequest')
        self.assertEqual(base64.b64decode(args['body']), bridge.payload['source']['html'].encode('utf-8'))
        self.assertEqual(session, 'main')
        self.assertTrue(bridge.injected)
        self.assertNotIn('Content-Security-Policy', [h['name'] for h in args['responseHeaders']])
        with self.assertRaises(host.WebViewFailure): bridge.request_paused(paused(), 'main')

    def test_main_navigation_cannot_escape_or_reload(self):
        for url in [URL + '?x=1', 'https://evil.test/', 'http://marumaru105.com/manhwa/123']:
            bridge = RecordingHost()
            with self.subTest(url=url), self.assertRaises(host.WebViewFailure):
                bridge.request_paused(paused(url), 'main')
            self.assertEqual(bridge.calls, [])
        bridge = RecordingHost()
        with self.assertRaises(host.WebViewFailure):
            bridge.request_paused(paused(responseStatusCode=302), 'main')
        for changed in (URL + '?page=2', URL + '#fragment', URL + '/456', 'https://other.example/'):
            with self.subTest(changed=changed), self.assertRaises(host.WebViewFailure) as caught:
                bridge.event({'method':'Page.navigatedWithinDocument','sessionId':'main','params':{'frameId':'frame','url':changed}})
            self.assertEqual(caught.exception.stage, 'same-document-event')

    def test_exact_same_url_history_event_preserves_identity(self):
        bridge = RecordingHost(); bridge.committed = True; bridge.loader = 'original-loader'
        bridge.event({'method':'Page.navigatedWithinDocument','sessionId':'main',
                      'params':{'frameId':'frame','url':URL,'navigationType':'historyApi'}})
        self.assertEqual(bridge.loader, 'original-loader')
        self.assertTrue(bridge.committed)
        self.assertEqual(bridge.calls, [])

    def test_identity_stage_output_is_fixed_enum_only(self):
        for stage in host.IDENTITY_STAGES:
            result = host.failure_payload(host.WebViewFailure('document-identity-changed', stage=stage))
            self.assertEqual(result, {'error':'Paperback test WebView failed','code':'operation',
                                     'reason':'document-identity-changed','stage':stage})
        for stage in (None, URL, '<html>private</html>', 'unexpected-stage'):
            result = host.failure_payload(host.WebViewFailure('document-identity-changed', stage=stage))
            self.assertNotIn('stage', result)

    def test_unmodified_public_https_resource_methods_and_redirects(self):
        bridge = RecordingHost()
        bridge.request_paused(paused('https://cdn.example.com/own-module.js', 'Script', method='POST'), 'main')
        bridge.request_paused(paused('https://cdn.example.com/redirect', 'Image', responseStatusCode=302), 'main')
        self.assertEqual([call[0] for call in bridge.calls], ['Fetch.continueRequest', 'Fetch.continueRequest'])
        self.assertTrue(all(call[1] == {'requestId':'request'} for call in bridge.calls))

    def test_failed_main_document_still_fails(self):
        bridge = RecordingHost()
        with self.assertRaises(host.WebViewFailure) as caught:
            bridge.request_paused(paused(responseErrorReason='Failed'), 'main')
        self.assertEqual(caught.exception.reason, 'resource-load-failed')
        self.assertEqual(bridge.calls, [])

    def test_ordinary_failed_subresources_retain_browser_failure(self):
        for reason in ('Failed', 'NameNotResolved', 'BlockedByClient'):
            for resource, frame in [('Script', 'frame'), ('Image', 'frame'), ('Document', 'child-frame')]:
                bridge = RecordingHost()
                with self.subTest(reason=reason, resource=resource):
                    bridge.request_paused(paused('https://cdn.example.com/resource', resource,
                                                frame=frame, responseErrorReason=reason), 'main')
                    self.assertEqual(bridge.calls, [('Fetch.continueRequest', {'requestId':'request'}, 'main')])
                    self.assertFalse(bridge.injected)

    def test_tls_after_subresource_response_error_still_fails(self):
        for session in ('main', 'child-frame'):
            for method, params in [
                ('Network.loadingFailed', {'errorText':'net::ERR_CERT_AUTHORITY_INVALID'}),
                ('Network.loadingFailed', {'errorText':'net::ERR_SSL_PROTOCOL_ERROR'}),
                ('Security.certificateError', {'errorType':'net::ERR_CERT_DATE_INVALID'}),
            ]:
                bridge = RecordingHost(); bridge.sessions.add('child-frame')
                with self.subTest(session=session, method=method, params=params):
                    bridge.request_paused(paused('https://cdn.example.com/resource', 'Script',
                                                responseErrorReason='Failed'), session)
                    self.assertEqual(bridge.calls[-1], ('Fetch.continueRequest', {'requestId':'request'}, session))
                    with self.assertRaises(host.WebViewFailure) as caught:
                        bridge.event({'method':method, 'sessionId':session, 'params':params})
                    self.assertEqual(caught.exception.reason, 'tls-resource-error')
                    self.assertEqual(caught.exception.code, 'security')

    def test_private_or_non_https_subresources_stop(self):
        for url in ['http://example.com/a', 'https://127.0.0.1/a', 'https://10.1.2.3/a',
                    'https://localhost/a', 'https://host.internal/a', 'file:///tmp/x']:
            with self.subTest(url=url), self.assertRaises(host.WebViewFailure):
                RecordingHost().request_paused(paused(url, 'Script'), 'main')

    def test_security_and_captcha_events_are_sticky_failures(self):
        for reason, code in [('captcha-visible','captcha'), ('certificate-marker','security'),
                             ('document-identity-changed','operation')]:
            bridge = RecordingHost(); bridge.sessions.add('child-frame')
            with self.assertRaises(host.WebViewFailure) as caught:
                bridge.event({'method':'Runtime.bindingCalled','sessionId':'child-frame',
                              'params':{'name':host.BINDING,'payload':json.dumps({'reason':reason})}})
            self.assertEqual(caught.exception.code, code)
        for session in ['main','child-frame']:
            bridge = RecordingHost(); bridge.sessions.add('child-frame')
            with self.assertRaises(host.WebViewFailure) as caught:
                bridge.event({'method':'Network.loadingFailed','sessionId':session,'params':{'errorText':'net::ERR_CERT_AUTHORITY_INVALID'}})
            self.assertEqual(caught.exception.code, 'security')

    def test_deadline_does_not_depend_on_renderer_or_promise(self):
        bridge = RecordingHost(); bridge.deadline = time.monotonic() - 1
        with self.assertRaises(host.WebViewFailure) as caught: bridge.remaining()
        self.assertEqual(caught.exception.reason, 'operation-timeout')

    def test_disposal_has_own_deadline_and_does_not_process_stale_events(self):
        bridge = RecordingHost(); bridge.deadline = time.monotonic() - 1
        bridge.cleanup()
        self.assertTrue(bridge.closing)
        self.assertGreater(bridge.deadline, time.monotonic())
        self.assertEqual(bridge.calls, [('Target.disposeBrowserContext', {'browserContextId':'context'}, None)])
        self.assertIsNone(bridge.context)

    def test_main_loader_identity_is_never_stubbed(self):
        bridge = RecordingHost()
        event = {'method':'Page.frameNavigated','sessionId':'main','params':{'frame':{'id':'frame','url':URL,'loaderId':'loader'}}}
        bridge.event(event)
        self.assertTrue(bridge.committed); self.assertEqual(bridge.loader, 'loader')
        with self.assertRaises(host.WebViewFailure): bridge.event(event)

    def test_loopback_debugger_only_and_checked_tls_capability(self):
        class Driver: capabilities = {'acceptInsecureCerts':True}
        with self.assertRaises(host.WebViewFailure) as caught: host.debugger_url(Driver(),time.monotonic()+1)
        self.assertEqual(caught.exception.code,'security')
        Driver.capabilities = {'acceptInsecureCerts':False,'goog:chromeOptions':{'debuggerAddress':'evil.example:9222'}}
        with self.assertRaises(host.WebViewFailure): host.debugger_url(Driver(),time.monotonic()+1)


class ProtocolSocket:
    """Minimal deterministic CDP peer, not a web-provider response fixture."""
    def __init__(self, evaluation_error=False, timeout=False, cleanup_error=False, same_url_event=False, final_loader='loader'):
        self.queue, self.sent = [], []
        self.loaded = self.closed = False
        self.evaluation_error, self.timeout, self.cleanup_error = evaluation_error, timeout, cleanup_error
        self.same_url_event, self.final_loader = same_url_event, final_loader

    def __enter__(self): return self
    def __exit__(self, *args): self.closed = True

    def send(self, raw):
        message = json.loads(raw); self.sent.append(message)
        method, result = message['method'], {}
        if method == 'Target.createBrowserContext': result = {'browserContextId':'context'}
        elif method == 'Target.createTarget': result = {'targetId':'target'}
        elif method == 'Target.attachToTarget': result = {'sessionId':'main'}
        elif method == 'Page.getFrameTree':
            result = {'frameTree':{'frame':{'id':'frame','url':URL if self.loaded else 'about:blank','loaderId':self.final_loader if self.loaded else 'loader'}}}
        elif method == 'Page.navigate':
            self.queue.append({'method':'Fetch.requestPaused','sessionId':'main','params':paused()})
            result = {'frameId':'frame','loaderId':'loader'}
        elif method == 'Fetch.fulfillRequest':
            self.loaded = True
            self.queue.extend([
                {'method':'Runtime.executionContextCreated','sessionId':'main','params':{'context':{'id':3,'name':host.WORLD,'auxData':{'frameId':'frame'}}}},
                {'method':'Page.frameNavigated','sessionId':'main','params':{'frame':{'id':'frame','url':URL,'loaderId':'loader'}}},
                {'method':'Page.domContentEventFired','sessionId':'main','params':{}}])
        elif method == 'Runtime.evaluate' and 'contextId' in message['params']:
            result = {'result':{'type':'undefined'}}
        elif method == 'Runtime.evaluate':
            if self.same_url_event:
                self.queue.append({'method':'Page.navigatedWithinDocument','sessionId':'main',
                                   'params':{'frameId':'frame','url':URL,'navigationType':'historyApi'}})
            if self.timeout:
                self.queue.append('timeout'); return
            result = {'exceptionDetails':{'text':'not returned to caller'}} if self.evaluation_error else {
                'result':{'value':{'url':URL,'encoded':'{"protocol":true}'}}}
        elif method == 'Target.disposeBrowserContext' and self.cleanup_error:
            self.queue.append({'id':message['id'],'error':{'message':'not returned'}}); return
        self.queue.append({'id':message['id'],'result':result})

    def recv(self, timeout):
        if not self.queue: raise AssertionError('Unexpected protocol receive')
        value = self.queue.pop(0)
        if value == 'timeout': raise TimeoutError('Synthetic renderer deadline')
        return json.dumps(value)


class LifecycleTests(unittest.TestCase):
    def execute(self, socket):
        client = types.ModuleType('websockets.sync.client')
        client.connect = lambda *args, **kwargs: socket
        modules = {'websockets':types.ModuleType('websockets'),
                   'websockets.sync':types.ModuleType('websockets.sync'),
                   'websockets.sync.client':client}
        with patch.object(host, 'debugger_url', return_value='ws://127.0.0.1:9999/devtools/browser/test'), \
                patch.dict(sys.modules, modules):
            return host.execute(object(), payload())

    def test_protocol_lifecycle_and_disposable_context(self):
        socket = ProtocolSocket()
        self.assertEqual(self.execute(socket), {'url':URL,'value':{'protocol':True}})
        self.assertTrue(socket.closed)
        self.assertEqual(socket.sent[0]['params'], {'disposeOnDetach':True})
        self.assertEqual(socket.sent[-1]['method'], 'Target.disposeBrowserContext')
        fulfilled = [item for item in socket.sent if item['method'] == 'Fetch.fulfillRequest']
        self.assertEqual(len(fulfilled),1)
        self.assertEqual(base64.b64decode(fulfilled[0]['params']['body']).decode(),payload()['source']['html'])
        self.assertFalse(any(item['method'] in ('Network.getCookies','Storage.getCookies','Security.setIgnoreCertificateErrors') for item in socket.sent))
        evaluations=[item for item in socket.sent if item['method']=='Runtime.evaluate' and 'awaitPromise' in item['params']]
        self.assertTrue(evaluations[0]['params']['awaitPromise'])
        self.assertGreater(evaluations[0]['params']['timeout'],0)

    def test_same_url_history_event_does_not_abort_lifecycle(self):
        socket = ProtocolSocket(same_url_event=True)
        self.assertEqual(self.execute(socket), {'url':URL,'value':{'protocol':True}})
        self.assertTrue(socket.closed)

    def test_same_url_history_event_does_not_relax_final_loader_guard(self):
        socket = ProtocolSocket(same_url_event=True, final_loader='different-loader')
        with self.assertRaises(host.WebViewFailure) as caught:
            self.execute(socket)
        self.assertEqual(caught.exception.reason, 'document-identity-changed')
        self.assertEqual(caught.exception.stage, 'final-loader')
        self.assertEqual(socket.sent[-1]['method'], 'Target.disposeBrowserContext')
        self.assertTrue(socket.closed)

    def test_evaluation_failure_still_disposes(self):
        socket=ProtocolSocket(evaluation_error=True)
        with self.assertRaises(host.WebViewFailure) as caught: self.execute(socket)
        self.assertEqual(caught.exception.reason,'evaluation-failed')
        self.assertEqual(socket.sent[-1]['method'],'Target.disposeBrowserContext')
        self.assertTrue(socket.closed)

    def test_external_timeout_still_disposes(self):
        socket=ProtocolSocket(timeout=True)
        with self.assertRaises(TimeoutError): self.execute(socket)
        self.assertEqual(socket.sent[-1]['method'],'Target.disposeBrowserContext')
        self.assertTrue(socket.closed)

    def test_cleanup_failure_never_masquerades_as_success(self):
        socket=ProtocolSocket(cleanup_error=True)
        with self.assertRaises(host.WebViewFailure): self.execute(socket)
        self.assertTrue(socket.closed)

    def test_cleanup_failure_preserves_original_error(self):
        socket=ProtocolSocket(evaluation_error=True,cleanup_error=True)
        with self.assertRaises(host.WebViewFailure) as caught: self.execute(socket)
        self.assertEqual(caught.exception.reason,'evaluation-failed')
        self.assertTrue(socket.closed)


class JavaScriptBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which('node'):
            raise AssertionError('Node is required for isolated JS bridge contract tests; no skip is permitted')

    def evaluate(self, inject, url=URL, actual=None, base=None):
        data = payload(inject=inject); data['source']['baseUrl'] = url
        expression = host.evaluation_expression(data)
        harness = '''const vm=require('node:vm'); const input=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const realm={location:{href:input.actual},document:{URL:input.actual,baseURI:input.base}, TextEncoder, setTimeout};
vm.runInNewContext(input.expression,realm,{timeout:1000}).then(value=>process.stdout.write(JSON.stringify(value))).catch(()=>process.exit(2));'''
        run = subprocess.run(['node','-e',harness], input=json.dumps({'expression':expression,'actual':actual or url,'base':base or url}),
                             text=True,capture_output=True,timeout=3,check=True)
        return json.loads(run.stdout)

    def test_function_body_and_promise_are_real(self):
        result = self.evaluate('return new Promise(resolve => setTimeout(() => resolve({x:42,unicode:"한글"}),5));')
        self.assertEqual(json.loads(result['encoded']), {'x':42,'unicode':'한글'})
        self.assertEqual(result['url'],URL)

    def test_url_and_baseuri_guards_are_not_faked(self):
        for changed in [{'actual':URL+'/456'}, {'base':'https://different.example/'}]:
            self.assertEqual(self.evaluate('return 42;',**changed), {'error':'document-identity-changed'})
        result = self.evaluate('return {href:location.href,url:document.URL,base:document.baseURI};')
        self.assertEqual(json.loads(result['encoded']), {'href':URL,'url':URL,'base':URL})

    def test_template_markers_in_user_data_are_literal(self):
        url='https://marumaru105.com/search?q=INJECT_BODY&kind=manhwa'
        result=self.evaluate('return "EXPECTED_URL and INJECT_BODY";',url=url)
        self.assertEqual(json.loads(result['encoded']),'EXPECTED_URL and INJECT_BODY')
        self.assertEqual(result['url'],url)

    def test_serialization_rejects_lossy_non_json_values(self):
        for value in ['undefined','NaN','Infinity','new Date()','[1,,3]','({get x(){throw Error("secret")}})',
                      '(()=>{const a={};a.a=a;return a})()','({toJSON(){return "secret"}})','1n']:
            with self.subTest(value=value):
                self.assertEqual(self.evaluate('return '+value+';'), {'error':'serialization-error'})

    def test_rejected_promises_do_not_expose_error_text(self):
        self.assertEqual(self.evaluate('return Promise.reject(new Error("secret credential"));'), {'error':'callback-rejected'})

    def test_oversize_results_fail(self):
        self.assertIn(self.evaluate('return "a".repeat(4*1024*1024+1);')['error'],('result-too-large','serialization-error'))


if __name__ == '__main__':
    unittest.main()
