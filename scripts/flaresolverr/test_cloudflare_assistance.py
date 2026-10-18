# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Lucifers Circle
"""Offline protocol/JavaScript security tests, not live source fixtures or proof.

Run: python -m unittest discover -s scripts/flaresolverr -p test_cloudflare_assistance.py
"""
import base64
import io
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
import cloudflare_assistance as host

URL = 'https://marumaru105.com/api/works?mediaType=MANHWA&page=0&size=49'


def payload(**updates):
    data = {'session': 'anonymous-test-session', 'source': 'Marumaru', 'url': URL,
            'navigationURL': URL, 'headers': {'x-site': 'marumaru'}}
    data.update(updates)
    return data


def envelope(raw=b'\x00\xff\x80\r\n', **updates):
    data = {'url': URL, 'status': 200, 'headers': {'content-type': 'application/octet-stream'},
            'body': base64.b64encode(raw).decode('ascii'), 'encoding': 'base64', 'byteLength': len(raw)}
    data.update(updates)
    return data


def paused(url=URL, resource='Document', frame='frame', method='GET', **extra):
    return {'requestId': 'request', 'frameId': frame, 'resourceType': resource,
            'request': {'url': url, 'method': method, 'headers': {}}, **extra}


class RecordingBrowser(host.PassiveBrowser):
    def __init__(self):
        super().__init__(None, payload(), time.monotonic() + 1)
        self.session, self.frame, self.target, self.context = 'main', 'frame', 'target', 'context'
        self.sessions = {'main'}
        self.calls = []

    def call(self, method, params=None, session=None):
        self.calls.append((method, params, session))
        return {}


class ValidationTests(unittest.TestCase):
    def test_real_source_contract_is_accepted(self):
        self.assertEqual(host.validate_payload(payload()), payload())

    def test_contract_delegation_and_exact_schema(self):
        # Contract sibling has a separate mirrored route suite. This helper
        # additionally enforces its exact endpoint shape and anonymous session.
        with patch.object(host, 'assistance_request', side_effect=lambda item: item):
            self.assertEqual(host.validate_payload(payload()), payload())
            for fields in ({'session': '../token'}, {'timeout': 999}, {'cookies': []}, {'method': 'GET'},
                           {'navigationURL': URL + '&page=2'}):
                with self.subTest(fields=fields), self.assertRaises(host.AssistanceFailure):
                    host.validate_payload(payload(**fields))

    def test_invalid_contract_is_fixed_error(self):
        with patch.object(host, 'assistance_request', side_effect=ValueError('secret raw body')):
            with self.assertRaises(host.AssistanceFailure) as caught:
                host.validate_payload(payload())
        self.assertEqual(str(caught.exception), 'invalid-request')

    def test_json_rejects_duplicate_keys_and_nonfinite_numbers(self):
        for raw in ('NaN', 'Infinity', '{"session":"a","session":"b"}', '{', b'\xff'):
            with self.subTest(raw=raw), self.assertRaises(host.AssistanceFailure): host.strict_json(raw)

    def test_binary_bytes_status_headers_url_preserved(self):
        data = envelope(bytes(range(256)), status=418, headers={'content-type': 'application/octet-stream', 'x-original': 'value'})
        self.assertEqual(host.validate_response(data, URL), data)
        self.assertEqual(base64.b64decode(data['body']), bytes(range(256)))

    def test_response_envelope_strict_and_bounded(self):
        invalid = [dict(encoding='utf8'), dict(status=True), dict(status=0), dict(status=302), dict(status=600),
                   dict(url=URL+'#x'), dict(byteLength=True), dict(byteLength=host.MAX_BODY+1), dict(byteLength=0),
                   dict(body='AA=\n'), dict(body='AB==', byteLength=1), dict(body='secret not base64'),
                   dict(extra='not allowed'), dict(headers={'Set-Cookie': 'secret'}), dict(headers={'set-cookie': 'secret'}),
                   dict(headers={'x': 'a\nb'}), dict(headers={'x': 7}), dict(headers={'x': 'a'*65537})]
        for changes in invalid:
            with self.subTest(changes=list(changes)), self.assertRaises(host.AssistanceFailure):
                host.validate_response(envelope(**changes), URL)
        data = envelope(b'a' * host.MAX_BODY)
        self.assertEqual(host.validate_response(data, URL)['byteLength'], host.MAX_BODY)
        with self.assertRaises(host.AssistanceFailure):
            host.validate_response(envelope(b'a' * (host.MAX_BODY+1)), URL)

    def test_denial_wins_even_with_challenge_header(self):
        data = envelope(b'<html>Sorry, you have been blocked. Access denied.</html>', status=403,
                        headers={'content-type': 'text/html', 'cf-mitigated': 'challenge'})
        self.assertEqual(host.validate_response(data, URL), {**data, 'terminalReason':'denied'})

    def test_challenge_is_not_fake_success(self):
        for data in [envelope(b'<html><title>Just a moment</title></html>', status=503, headers={'content-type':'text/html'}),
                     envelope(b'{}', status=406, headers={'cf-mitigated':'challenge','content-type':'application/json'})]:
            self.assertEqual(host.validate_response(data, URL), {**data, 'terminalReason':'unresolved'})

    def test_failure_fields_are_fixed_and_metrics_are_separate(self):
        metrics = {'navigationAttempts': 2, 'replayAttempts': 0}
        result = host.failure_payload(host.AssistanceFailure('secret token', 'sensitive'), metrics)
        self.assertEqual(result, {'error':'Passive browser assistance failed', 'reason':'browser-operation-failed',
                                  'code':'operation', 'metrics':metrics})
        self.assertIsNot(result['metrics'], metrics)

    def test_browser_must_have_real_tls_verification(self):
        for insecure in (True, None, 'false', 0):
            driver = types.SimpleNamespace(capabilities={'acceptInsecureCerts':insecure})
            with self.assertRaises(host.AssistanceFailure) as caught: host.debugger_url(driver, time.monotonic()+1)
            self.assertEqual(caught.exception.code, 'security')
        driver = types.SimpleNamespace(capabilities={'acceptInsecureCerts':False,
                                       'goog:chromeOptions':{'debuggerAddress':'remote.example:9222'}})
        with self.assertRaises(host.AssistanceFailure): host.debugger_url(driver, time.monotonic()+1)


class ProtocolTests(unittest.TestCase):
    def test_exact_main_navigation_and_verified_managed_reload_cap(self):
        browser = RecordingBrowser()
        browser.request_paused(paused(), 'main')
        self.assertEqual(browser.metrics, {'navigationAttempts':1,'replayAttempts':0})
        with self.assertRaises(host.AssistanceFailure): browser.request_paused(paused(), 'main')
        browser.challenge_pending = browser.managed_challenge_observed = True
        browser.request_paused(paused(), 'main'); browser.request_paused(paused(), 'main')
        self.assertEqual(browser.metrics['navigationAttempts'], 3)
        with self.assertRaises(host.AssistanceFailure) as caught: browser.request_paused(paused(), 'main')
        self.assertEqual(caught.exception.reason,'navigation-limit')
        self.assertEqual(len(browser.calls),3)
        self.assertTrue(all(call[0]=='Fetch.continueRequest' for call in browser.calls))

    def test_navigation_escape_and_post_blocked_before_dispatch(self):
        for request in [paused(URL+'#x'), paused('https://evil.example/'), paused(method='POST'),
                        paused(resource='Document',frame='child-frame'),
                        paused('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/iframe','Document',frame='child-frame')]:
            browser=RecordingBrowser()
            with self.assertRaises(host.AssistanceFailure): browser.request_paused(request,'main')
            self.assertEqual(browser.calls,[])
            self.assertEqual(browser.metrics,{'navigationAttempts':0,'replayAttempts':0})

    def test_redirects_blocked_before_following_for_every_resource(self):
        for resource in ('Document','Fetch','Script','Image'):
            browser=RecordingBrowser()
            with self.assertRaises(host.AssistanceFailure) as caught:
                browser.request_paused(paused(resource=resource,responseStatusCode=302,
                                      responseHeaders=[{'name':'location','value':'https://evil.example/token'}]),'main')
            self.assertEqual(caught.exception.reason,'redirect-blocked')
            self.assertEqual(browser.calls,[])

    def test_one_exact_replay_with_application_headers(self):
        browser=RecordingBrowser(); browser.fetching=True
        request=paused(resource='Fetch'); request['request']['headers']={'X-Site':'marumaru','User-Agent':'Browser Native'}
        browser.request_paused(request,'main')
        self.assertEqual(browser.metrics,{'navigationAttempts':0,'replayAttempts':1})
        self.assertEqual(browser.calls,[('Fetch.continueRequest',{'requestId':'request'},'main')])
        with self.assertRaises(host.AssistanceFailure): browser.request_paused(request,'main')
        self.assertEqual(browser.metrics['replayAttempts'],1)
        for changes in ({}, {'X-Site':'wrong'}):
            browser=RecordingBrowser();browser.fetching=True
            request=paused(resource='Fetch');request['request']['headers']=changes
            with self.assertRaises(host.AssistanceFailure):browser.request_paused(request,'main')
            self.assertEqual(browser.metrics['replayAttempts'],0)

    def test_only_safe_get_subresources_and_no_app_header_leak(self):
        browser=RecordingBrowser()
        for url,kind in [('https://marumaru105.com/assets/app.js','Script'),
                         ('https://marumaru105.com/cdn-cgi/challenge-platform/h/g/orchestrate/jsch/v1','Script'),
                         ('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/flow','Fetch')]:
            browser.request_paused(paused(url,kind),'main')
        self.assertEqual(browser.metrics,{'navigationAttempts':0,'replayAttempts':0})
        for url,kind,method in [('https://evil.example/app.js','Script','GET'),
                               ('https://marumaru105.com/api/login','Fetch','GET'),
                               ('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/flow','Fetch','POST'),
                               ('http://marumaru105.com/app.js','Script','GET'),
                               ('https://127.0.0.1/app.js','Script','GET')]:
            with self.assertRaises(host.AssistanceFailure):browser.request_paused(paused(url,kind,method=method),'main')
        request=paused('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/a.js','Script')
        request['request']['headers']={'X-Site':'marumaru'}
        with self.assertRaises(host.AssistanceFailure): browser.request_paused(request,'main')

    def test_subresource_raw_traversal_aliases_and_credentials_block_before_dispatch(self):
        prefix = 'https://marumaru105.com/cdn-cgi/challenge-platform/'
        urls = [
            prefix + '..%2f..%2faccount?token=private',
            prefix + '%252e%252e%252faccount',
            prefix + '../account', prefix + './app.js', prefix + 'h//app.js',
            prefix + '%2e%2e/account', prefix + '%2E%2E/account',
            prefix + '%5caccount', prefix + '%255caccount',
            prefix + '%00app.js', prefix + '%0Aapp.js', prefix + '%7fapp.js',
            prefix + 'app.js;', prefix + 'app.js?', prefix + 'app.js#fragment',
            prefix + 'app.js?token=private', prefix + 'app.js?auth=private',
            prefix + 'app.js?access_token=private', prefix + 'app.js?authorization=private',
            prefix + 'app.js?%72ay=0123456789abcdef',
            prefix + 'app.js?ray=0123456789abcdef&ray=0123456789abcdef',
            prefix + 'app.js?ray=0123456789abcdef&token=private',
            prefix + 'app.js?ray=%250a', prefix + 'app.js?ray=0123456789abcdef%0a',
            prefix + 'app.js?v=' + 'a' * 65,
            'HTTPS://marumaru105.com/assets/app.js',
            'https://MARUMARU105.com/assets/app.js',
            'https://marumaru105.com./assets/app.js',
            'https://marumaru105.com:443/assets/app.js',
            'https://marumaru105.com:bad/assets/app.js',
            'https://user:password@marumaru105.com/assets/app.js',
            'https://marumaru105.com/assets/app.js?token=private',
            'https://marumaru105.com/assets/app.js?ver=%252e%252e',
            'https://marumaru105.com/assets/app.js?ver=1&v=2',
            'https://marumaru105.com/assets/app.js\n',
        ]
        for url in urls:
            browser = RecordingBrowser()
            with self.subTest(url=url):
                self.assertFalse(host.safe_subresource(url, URL, 'Script'))
                with self.assertRaises(host.AssistanceFailure):
                    browser.request_paused(paused(url, 'Script'), 'main')
                self.assertEqual(browser.calls, [])
                self.assertEqual(browser.metrics, {'navigationAttempts':0, 'replayAttempts':0})

    def test_subresources_allow_only_bounded_genuine_challenge_and_cache_queries(self):
        urls = [
            'https://marumaru105.com/cdn-cgi/challenge-platform/h/g/orchestrate/jsch/v1?ray=0123456789abcdef',
            'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/script.js?ray=0123456789abcdef&lang=en-US&v=1',
            'https://marumaru105.com/assets/app.js?ver=1.2.3-rc',
            'https://marumaru105.com/assets/main.css?v=abc123',
        ]
        for url in urls:
            browser = RecordingBrowser()
            with self.subTest(url=url):
                self.assertTrue(host.safe_subresource(url, URL, 'Script'))
                browser.request_paused(paused(url, 'Script'), 'main')
                self.assertEqual(browser.calls, [('Fetch.continueRequest', {'requestId':'request'}, 'main')])

    def test_cf_header_is_evidence_for_managed_reload(self):
        browser=RecordingBrowser()
        browser.request_paused(paused(responseStatusCode=403,responseHeaders=[{'name':'Cf-Mitigated','value':'challenge'}]),'main')
        self.assertTrue(browser.managed_challenge_observed)

    def test_security_events_and_unknown_security_state_stop(self):
        events=[('Network.loadingFailed',{'errorText':'net::ERR_CERT_AUTHORITY_INVALID'}),
                ('Network.loadingFailed',{'errorText':'net::ERR_SSL_PROTOCOL_ERROR'}),
                ('Security.certificateError',{}),('Page.interstitialShown',{}),
                ('Security.securityStateChanged',{'securityState':'unknown'}),
                ('Security.visibleSecurityStateChanged',{'visibleSecurityState':{'securityState':'insecure'}})]
        for method,data in events:
            browser=RecordingBrowser();browser.committed=True
            with self.subTest(method=method),self.assertRaises(host.AssistanceFailure) as caught:
                browser.event({'method':method,'sessionId':'main','params':data})
            self.assertEqual(caught.exception.code,'security')

    def test_frame_gate_notices_require_observed_isolated_context(self):
        for reason,code in [('captcha-visible','captcha'),('security-warning','security'),('access-denied','denied')]:
            browser=RecordingBrowser(); browser.sessions.add('child'); browser.safety_contexts[('child',7)]='child-frame'
            with self.assertRaises(host.AssistanceFailure) as caught:
                browser.event({'method':'Runtime.bindingCalled','sessionId':'child','params':{
                    'name':host.BINDING,'executionContextId':7,'payload':json.dumps({'reason':reason})}})
            self.assertEqual(caught.exception.code,code)
        browser=RecordingBrowser()
        with self.assertRaises(host.AssistanceFailure):
            browser.event({'method':'Runtime.bindingCalled','sessionId':'main','params':{
                'name':host.BINDING,'executionContextId':99,'payload':'{"reason":"ready"}'}})

    def test_same_url_reload_forbidden_once_replay_started(self):
        browser=RecordingBrowser();browser.fetching=True
        with self.assertRaises(host.AssistanceFailure):browser.request_paused(paused(),'main')
        with self.assertRaises(host.AssistanceFailure):
            browser.event({'method':'Page.frameNavigated','sessionId':'main','params':{'frame':{'id':'frame','url':URL}}})

    def test_timeout_fixed_and_cleanup_independent(self):
        for pending,code in [(False,'operation'),(True,'unresolved')]:
            browser=RecordingBrowser();browser.challenge_pending=pending;browser.deadline=time.monotonic()-1
            with self.assertRaises(host.AssistanceFailure) as caught:browser.remaining()
            self.assertEqual(caught.exception.code,code)
            browser.cleanup()
            self.assertTrue(browser.closing)
            self.assertGreater(browser.deadline,time.monotonic())
            self.assertEqual(browser.calls,[('Target.disposeBrowserContext',{'browserContextId':'context'},None)])


class ProtocolSocket:
    """Deterministic CDP peer. Never makes a provider or other network request."""
    def __init__(self, error=None, timeout=False, cleanup_error=False):
        self.queue,self.sent=[],[]
        self.loaded=self.closed=False
        self.error,self.timeout,self.cleanup_error=error,timeout,cleanup_error

    def __enter__(self):return self
    def __exit__(self,*args):self.closed=True

    def send(self,raw):
        item=json.loads(raw);self.sent.append(item)
        method,result=item['method'],{}
        if method=='Target.createBrowserContext':result={'browserContextId':'context'}
        elif method=='Target.createTarget':result={'targetId':'target'}
        elif method=='Target.attachToTarget':result={'sessionId':'main'}
        elif method=='Page.getFrameTree':result={'frameTree':{'frame':{
            'id':'frame','url':URL if self.loaded else 'about:blank','loaderId':'loader'}}}
        elif method=='Page.navigate':
            self.queue.extend([
                {'method':'Fetch.requestPaused','sessionId':'main','params':paused()},
                {'method':'Runtime.executionContextCreated','sessionId':'main','params':{
                    'context':{'id':3,'name':host.WORLD,'auxData':{'frameId':'frame'}}}},
                {'method':'Page.frameNavigated','sessionId':'main','params':{'frame':{'id':'frame','url':URL,'loaderId':'loader'}}},
                {'method':'Page.lifecycleEvent','sessionId':'main','params':{'name':'DOMContentLoaded','frameId':'frame','loaderId':'loader'}}])
            self.loaded=True;result={'frameId':'frame','loaderId':'loader'}
        elif method=='Runtime.evaluate' and 'awaitPromise' not in item['params']:
            result={'result':{'value':'ready'}}
        elif method=='Runtime.evaluate':
            if self.timeout:self.queue.append('timeout');return
            request=paused(resource='Fetch');request['request']['headers']={'x-site':'marumaru'}
            self.queue.append({'method':'Fetch.requestPaused','sessionId':'main','params':request})
            result={'result':{'value':{'error':self.error} if self.error else envelope()}}
        elif method=='Target.disposeBrowserContext' and self.cleanup_error:
            self.queue.append({'id':item['id'],'error':{'message':'not leaked'}});return
        self.queue.append({'id':item['id'],'result':result})

    def recv(self,timeout):
        if not self.queue:raise AssertionError('Unexpected protocol receive')
        value=self.queue.pop(0)
        if value=='timeout':raise TimeoutError('Secret internal diagnostic')
        return json.dumps(value)


class ReloadProtocolSocket(ProtocolSocket):
    """A permitted reload destroys a pending scan's realm before its reply."""
    def __init__(self, mode='context-lost'):
        super().__init__()
        self.mode, self.reloaded, self.scan_replied = mode, False, False

    def send(self, raw):
        item = json.loads(raw)
        method, args = item['method'], item['params']
        if method == 'Page.getFrameTree' and self.reloaded:
            self.sent.append(item)
            self.queue.append({'id':item['id'], 'result':{'frameTree':{'frame':{
                'id':'frame', 'url':URL, 'loaderId':'replacement-loader'}}}})
            return
        if method == 'Runtime.evaluate' and 'awaitPromise' in args and self.mode == 'lost-after-replay':
            self.sent.append(item)
            request = paused(resource='Fetch'); request['request']['headers'] = {'x-site':'marumaru'}
            self.queue.extend([
                {'method':'Fetch.requestPaused', 'sessionId':'main', 'params':request},
                {'method':'Runtime.executionContextDestroyed', 'sessionId':'main', 'params':{'executionContextId':3}},
                {'id':item['id'], 'error':{'code':-32000, 'message':'Execution context was destroyed.'}},
            ])
            return
        if method == 'Runtime.evaluate' and 'awaitPromise' not in args and not self.scan_replied:
            self.scan_replied = True
            if self.mode == 'lost-after-replay':
                super().send(raw)
                return
            self.sent.append(item)
            if self.mode == 'no-managed-reload':
                self.queue.append({'id':item['id'], 'error':{
                    'code':-32000, 'message':'Cannot find context with specified id'}})
                return
            request = paused(URL + '&unapproved=1' if self.mode == 'foreign-url' else URL)
            request['requestId'] = 'managed-reload'
            self.queue.extend([
                {'method':'Runtime.bindingCalled', 'sessionId':'main', 'params':{
                    'name':host.BINDING, 'executionContextId':3, 'payload':'{"reason":"managed-challenge"}'}},
                {'method':'Fetch.requestPaused', 'sessionId':'main', 'params':request},
                {'method':'Runtime.executionContextDestroyed', 'sessionId':'main', 'params':{'executionContextId':3}},
                {'method':'Runtime.executionContextsCleared', 'sessionId':'main', 'params':{}},
                {'method':'Page.frameNavigated', 'sessionId':'main', 'params':{
                    'frame':{'id':'frame', 'url':URL, 'loaderId':'replacement-loader'}}},
                {'method':'Runtime.executionContextCreated', 'sessionId':'main', 'params':{
                    'context':{'id':4, 'name':host.WORLD, 'auxData':{'frameId':'frame'}}}},
                # An old load event must not mark the replacement document ready.
                {'method':'Page.lifecycleEvent', 'sessionId':'main', 'params':{
                    'name':'DOMContentLoaded', 'frameId':'frame', 'loaderId':'loader'}},
                {'method':'Page.lifecycleEvent', 'sessionId':'main', 'params':{
                    'name':'DOMContentLoaded', 'frameId':'frame', 'loaderId':'replacement-loader'}},
            ])
            self.reloaded = True
            if self.mode in {'stale-ready', 'captcha-visible', 'security-warning', 'access-denied'}:
                self.queue.append({'id':item['id'], 'result':{'result':{
                    'value':'ready' if self.mode == 'stale-ready' else self.mode}}})
            else:
                message = {'context-lost':'Cannot find context with specified id',
                           'context-destroyed':'Execution context was destroyed.',
                           'unknown-error':'Unexpected browser diagnostic with secret text',
                           'foreign-url':'Cannot find context with specified id'}[self.mode]
                self.queue.append({'id':item['id'], 'error':{'code':-32000, 'message':message}})
            return
        super().send(raw)


class LifecycleTests(unittest.TestCase):
    def execute(self,socket):
        client=types.ModuleType('websockets.sync.client');client.connect=lambda *args,**kwargs:socket
        modules={'websockets':types.ModuleType('websockets'),'websockets.sync':types.ModuleType('websockets.sync'),
                 'websockets.sync.client':client}
        with patch.object(host,'debugger_url',return_value='ws://127.0.0.1:9999/devtools/browser/test'), \
                patch.object(host,'assistance_request',side_effect=lambda item:item),patch.dict(sys.modules,modules):
            return host.execute(object(),payload())

    def test_interception_precedes_navigation_and_byte_response_is_real(self):
        socket=ProtocolSocket(); result=self.execute(socket)
        self.assertEqual(result,{**envelope(),'metrics':{'navigationAttempts':1,'replayAttempts':1}})
        methods=[item['method'] for item in socket.sent]
        self.assertLess(methods.index('Fetch.enable'),methods.index('Page.navigate'))
        self.assertEqual(methods.count('Page.navigate'),1)
        self.assertEqual(methods[-1],'Target.disposeBrowserContext')
        self.assertTrue(socket.closed)
        self.assertIn('Browser.setDownloadBehavior',methods)
        self.assertFalse(set(methods)&{'Network.getCookies','Storage.getCookies','Security.setIgnoreCertificateErrors',
                                      'Fetch.fulfillRequest','Input.dispatchMouseEvent','Input.dispatchKeyEvent'})
        evaluations=[item for item in socket.sent if item['method']=='Runtime.evaluate' and 'awaitPromise' in item['params']]
        self.assertEqual(len(evaluations),1)
        self.assertEqual(evaluations[0]['params']['contextId'],3)
        self.assertEqual(socket.sent[0]['params'],{'disposeOnDetach':True})

    def test_failure_and_timeout_still_dispose(self):
        for socket in [ProtocolSocket(error='replay-failed'),ProtocolSocket(timeout=True)]:
            with self.assertRaises(host.AssistanceFailure):self.execute(socket)
            self.assertEqual(socket.sent[-1]['method'],'Target.disposeBrowserContext')
            self.assertTrue(socket.closed)

    def test_cleanup_failure_never_masquerades_as_success(self):
        with self.assertRaises(host.AssistanceFailure):self.execute(ProtocolSocket(cleanup_error=True))


class ManagedReloadTests(unittest.TestCase):
    execute = LifecycleTests.execute

    def test_old_scan_context_loss_reobserves_replacement_without_new_navigation(self):
        for mode in ('context-lost', 'context-destroyed', 'stale-ready'):
            with self.subTest(mode=mode):
                socket = ReloadProtocolSocket(mode)
                self.assertEqual(self.execute(socket), {**envelope(), 'metrics':{
                    'navigationAttempts':2, 'replayAttempts':1}})
                self.assertEqual(sum(item['method']=='Page.navigate' for item in socket.sent), 1)
                scans = [item['params']['contextId'] for item in socket.sent
                         if item['method']=='Runtime.evaluate' and 'awaitPromise' not in item['params']]
                self.assertEqual(scans, [3, 4, 4])
                replays = [item for item in socket.sent
                           if item['method']=='Runtime.evaluate' and 'awaitPromise' in item['params']]
                self.assertEqual(len(replays), 1)
                self.assertEqual(replays[0]['params']['contextId'], 4)
                self.assertEqual(socket.sent[-1]['method'], 'Target.disposeBrowserContext')

    def test_only_known_context_loss_during_verified_reload_is_recoverable(self):
        for mode, reason in [('no-managed-reload','browser-command-failed'),
                             ('unknown-error','browser-command-failed'),
                             ('foreign-url','document-identity-changed')]:
            with self.subTest(mode=mode):
                socket = ReloadProtocolSocket(mode)
                with self.assertRaises(host.AssistanceFailure) as caught:
                    self.execute(socket)
                self.assertEqual(caught.exception.reason, reason)
                self.assertFalse(any(item['method']=='Runtime.evaluate' and 'awaitPromise' in item['params']
                                     for item in socket.sent))
                self.assertEqual(socket.sent[-1]['method'], 'Target.disposeBrowserContext')

    def test_existing_gate_results_are_never_swallowed_as_reload_races(self):
        for mode, code in [('captcha-visible','captcha'), ('security-warning','security'), ('access-denied','denied')]:
            with self.subTest(mode=mode):
                socket = ReloadProtocolSocket(mode)
                with self.assertRaises(host.AssistanceFailure) as caught:
                    self.execute(socket)
                self.assertEqual(caught.exception.code, code)
                self.assertFalse(any(item['method']=='Runtime.evaluate' and 'awaitPromise' in item['params']
                                     for item in socket.sent))

    def test_context_loss_after_replay_started_never_retries_fetch(self):
        socket = ReloadProtocolSocket('lost-after-replay')
        with self.assertRaises(host.AssistanceFailure) as caught:
            self.execute(socket)
        self.assertEqual(caught.exception.reason, 'document-identity-changed')
        replays = [item for item in socket.sent
                   if item['method']=='Runtime.evaluate' and 'awaitPromise' in item['params']]
        self.assertEqual(len(replays), 1)
        self.assertEqual(sum(item['method']=='Page.navigate' for item in socket.sent), 1)

    def test_context_gap_and_old_lifecycle_cannot_leave_ready_true(self):
        browser = RecordingBrowser()
        browser.committed = browser.ready = browser.challenge_pending = browser.managed_challenge_observed = True
        browser.loader = 'old-loader'
        browser.safety_contexts[('main',3)] = 'frame'
        browser.metrics['navigationAttempts'] = browser.navigation_generation = 1
        browser.committed_generation = 1
        deadline = browser.deadline
        browser.request_paused(paused(), 'main')
        self.assertFalse(browser.ready)
        browser.event({'method':'Runtime.executionContextsCleared', 'sessionId':'main', 'params':{}})
        self.assertFalse(browser.ready_to_scan())
        browser.event({'method':'Page.lifecycleEvent', 'sessionId':'main', 'params':{
            'name':'DOMContentLoaded', 'frameId':'frame', 'loaderId':'old-loader'}})
        self.assertFalse(browser.ready_to_scan())
        browser.event({'method':'Page.frameNavigated', 'sessionId':'main', 'params':{
            'frame':{'id':'frame', 'url':URL, 'loaderId':'new-loader'}}})
        browser.event({'method':'Runtime.executionContextCreated', 'sessionId':'main', 'params':{
            'context':{'id':4,'name':host.WORLD,'auxData':{'frameId':'frame'}}}})
        browser.event({'method':'Page.lifecycleEvent', 'sessionId':'main', 'params':{
            'name':'DOMContentLoaded', 'frameId':'frame', 'loaderId':'old-loader'}})
        self.assertFalse(browser.ready_to_scan())
        browser.event({'method':'Page.lifecycleEvent', 'sessionId':'main', 'params':{
            'name':'DOMContentLoaded', 'frameId':'frame', 'loaderId':'new-loader'}})
        self.assertTrue(browser.ready_to_scan())
        self.assertEqual(browser.deadline, deadline)
        self.assertEqual(browser.metrics, {'navigationAttempts':2,'replayAttempts':0})

    def test_unexpected_context_clear_without_reload_remains_fail_closed(self):
        browser = RecordingBrowser(); browser.committed = browser.ready = True
        browser.safety_contexts[('main',3)] = 'frame'
        with self.assertRaises(host.AssistanceFailure) as caught:
            browser.event({'method':'Runtime.executionContextsCleared','sessionId':'main','params':{}})
        self.assertEqual(caught.exception.reason, 'observer-unavailable')


class JavaScriptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which('node'):raise AssertionError('Node required for offline JavaScript safety tests')

    def run_node(self,harness,inputs):
        result=subprocess.run(['node','-e',harness],input=json.dumps(inputs),text=True,capture_output=True,timeout=5,check=True)
        return json.loads(result.stdout)

    def test_fetch_keeps_native_identity_and_exact_binary_bytes(self):
        harness=r'''const vm=require('node:vm'),i=JSON.parse(require('fs').readFileSync(0,'utf8'));
let options,calls=0,reads=0;const bytes=new Uint8Array([0,255,128,13,10]);
const realm={location:{href:i.url},document:{URL:i.url,baseURI:i.url},AbortSignal,Uint8Array,
 btoa:s=>Buffer.from(s,'binary').toString('base64'),fetch:async(url,opt)=>{calls++;options=opt;return{
 url,status:418,type:'basic',headers:new Map([['content-type','application/octet-stream']]),
 body:{getReader:()=>({read:async()=>reads++?{done:true}:{done:false,value:bytes}})}}}};
vm.runInNewContext(i.expression,realm).then(result=>process.stdout.write(JSON.stringify({result,options,calls})));'''
        actual=self.run_node(harness,{'expression':host.fetch_expression(payload(),2),'url':URL})
        self.assertEqual(actual['result'],envelope(status=418))
        self.assertEqual(actual['calls'],1)
        self.assertEqual(actual['options']['headers'],{'x-site':'marumaru'})
        self.assertEqual(actual['options']['credentials'],'include')
        self.assertEqual(actual['options']['redirect'],'error')
        self.assertEqual(actual['options']['method'],'GET')
        self.assertNotIn('body',actual['options'])

    def test_fetch_streaming_limit_and_generic_errors(self):
        harness=r'''const vm=require('node:vm'),i=JSON.parse(require('fs').readFileSync(0,'utf8'));
let canceled=false;const realm={location:{href:i.url},document:{URL:i.url,baseURI:i.url},AbortSignal,Uint8Array,
 btoa:s=>Buffer.from(s,'binary').toString('base64'),fetch:async()=>{
 if(i.reject)throw Error('secret cookie');return{url:i.url,status:200,type:'basic',headers:new Map(),
 body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(16*1024*1024+1)}),cancel:async()=>{canceled=true}})}}}};
vm.runInNewContext(i.expression,realm).then(result=>process.stdout.write(JSON.stringify({result,canceled})));'''
        for reject,reason in [(False,'response-too-large'),(True,'replay-failed')]:
            actual=self.run_node(harness,{'expression':host.fetch_expression(payload(),2),'url':URL,'reject':reject})
            self.assertEqual(actual['result'],{'error':reason})
            self.assertEqual(actual['canceled'],not reject)

    def scan(self,**updates):
        inputs={'url':URL,'actual':URL,'title':'Source','text':'Ordinary document','marker':False,'controls':[], 'main':True}
        inputs.update(updates)
        inputs['expression']=host.SAFETY_SCRIPT.replace('EXPECTED_URL',json.dumps(URL))
        harness=r'''const vm=require('node:vm'),i=JSON.parse(require('fs').readFileSync(0,'utf8'));const notices=[];
const controls=i.controls.map(c=>({textContent:c.text,value:'',getAttribute:()=>'',
 getBoundingClientRect:()=>({width:c.hidden?0:20,height:20}),matches:()=>!!c.checkbox,closest:()=>!!c.challenge}));
const document={URL:i.actual,baseURI:i.actual,title:i.title,body:{innerText:i.text},readyState:'complete',
 querySelector:s=>s.includes('main-frame-error')?i.securityMarker:(s.includes('challenge-form')?i.marker:false),
 querySelectorAll:s=>s==='*'?[]:controls};
const realm={document,location:{href:i.actual,protocol:i.actual.split(':')[0]+':'},
 window:{},getComputedStyle:()=>({visibility:'visible',display:'block',opacity:'1'}),
 MutationObserver:class{observe(){}},addEventListener(){},setInterval(){},
 __source_test_assistance_notice__:p=>notices.push(JSON.parse(p))};realm.window.top=i.main?realm.window:{};
vm.runInNewContext(i.expression,realm);process.stdout.write(JSON.stringify({state:realm.__source_test_assistance_scan__(),notices}));'''
        return self.run_node(harness,inputs)

    def test_explicit_captcha_controls_in_main_and_frames(self):
        for main in [True,False]:
            actual=self.scan(main=main,controls=[{'checkbox':True,'text':''}])
            self.assertEqual(actual['state'],'captcha-visible')
            self.assertEqual(actual['notices'],[{'reason':'captcha-visible'}])
        self.assertEqual(self.scan(controls=[{'text':'Verify you are human'}])['state'],'captcha-visible')
        self.assertEqual(self.scan(controls=[{'text':'Verify','challenge':True}])['state'],'captcha-visible')
        self.assertEqual(self.scan(main=False,controls=[{'text':'Verify'}])['state'],'captcha-visible')
        self.assertEqual(self.scan(controls=[{'text':'Verify'}])['state'],'ready')
        self.assertEqual(self.scan(controls=[{'text':'Verify you are human','hidden':True}])['state'],'ready')

    def test_managed_spinner_is_observed_not_solved(self):
        actual=self.scan(title='Just a moment...',marker=True)
        self.assertEqual(actual['state'],'pending')
        self.assertEqual(actual['notices'],[{'reason':'managed-challenge'}])

    def test_denial_security_unknown_interstitial_and_url_changes(self):
        for values,state in [({'title':'Access denied'},'access-denied'),
                             ({'title':'Privacy error'},'security-warning'),
                             ({'securityMarker':True},'security-warning'),
                             ({'title':'Security warning'},'security-warning'),
                             ({'actual':'chrome-error://chromewebdata/'},'security-warning'),
                             ({'actual':URL+'#changed'},'document-identity-changed')]:
            with self.subTest(values=values):self.assertEqual(self.scan(**values)['state'],state)


class EndpointTests(unittest.TestCase):
    def invoke(self,data,storage=None,execute=None):
        raw=json.dumps(data).encode();request=types.SimpleNamespace(content_length=len(raw),environ={'wsgi.input':io.BytesIO(raw)},
            get_header=lambda key,default=None:'application/json' if key=='Content-Type' else default)
        response=types.SimpleNamespace(status=200)
        bottle=types.ModuleType('bottle');bottle.request=request;bottle.response=response
        service=types.ModuleType('flaresolverr_service');service.SESSIONS_STORAGE=storage or types.SimpleNamespace(
            session_ids=lambda:['anonymous-test-session'],sessions={'anonymous-test-session':types.SimpleNamespace(driver=object())})
        routes={}
        class App:
            def post(self,path):
                def decorate(callback):routes[path]=callback;return callback
                return decorate
        with patch.dict(sys.modules,{'bottle':bottle,'flaresolverr_service':service}), \
                patch.object(host,'assistance_request',side_effect=lambda item:item), \
                patch.object(host,'execute',side_effect=execute or (lambda *args:envelope())):
            host.register(App());result=routes['/browser/assist']()
        return response.status,result

    def test_missing_session_never_creates_one(self):
        storage=types.SimpleNamespace(session_ids=lambda:[],sessions={})
        status,result=self.invoke(payload(),storage=storage)
        self.assertEqual(status,502);self.assertEqual(result['reason'],'session-not-found')
        self.assertEqual(result['metrics'],{'navigationAttempts':0,'replayAttempts':0})

    def test_errors_never_dump_sensitive_exception(self):
        status,result=self.invoke(payload(),execute=RuntimeError('secret cookie raw token'))
        self.assertEqual(status,502);self.assertNotIn('secret',json.dumps(result))
        self.assertEqual(host.LOCKS,{})

    def test_duplicate_session_fails_without_releasing_owner_lock(self):
        host.LOCKS['anonymous-test-session']=True
        try:
            status,result=self.invoke(payload())
            self.assertEqual(result['reason'],'session-busy')
            self.assertIn('anonymous-test-session',host.LOCKS)
        finally:host.LOCKS.clear()


if __name__=='__main__':unittest.main()
