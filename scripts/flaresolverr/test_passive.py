"""Offline guard tests; --source also exercises the real patched upstream loop."""

import ast
import hashlib
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest

from passive_verification import InteractiveVerificationRequired, reject_interactive_verification
from patch_passive import UPSTREAM_SHA256, audit_service, patch, replace_once


SOURCE = None
if '--source' in sys.argv:
    index = sys.argv.index('--source')
    SOURCE = Path(sys.argv[index + 1])
    del sys.argv[index:index + 2]


class GuardTests(unittest.TestCase):
    def test_ordinary_pages_and_passive_js_are_not_captcha(self):
        for html in (
                '<title>Catalog</title><p>Normal content</p>',
                '<title>Just a moment...</title><div id="cf-challenge-running">Please wait</div>',
                '<script>const sample = "Verify you are human";</script>',
                '<div class>Normal</div><iframe src>Ordinary</iframe>',
                '<input type="checkbox" name="remember-me">'):
            with self.subTest(html=html):
                reject_interactive_verification(html)

    def test_captcha_widgets_and_human_controls_are_rejected(self):
        for html in (
                '<div class="cf-turnstile"></div>', '<div id="turnstile-wrapper"></div>',
                '<div class="g-recaptcha"></div>', '<div class="h-captcha"></div>',
                '<iframe src="https://challenges.cloudflare.com/turnstile/v0/widget"></iframe>',
                '<iframe src="https://newassets.hcaptcha.com/captcha/v1"></iframe>',
                '<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>',
                '<iframe src="https://www.recaptcha.net/recaptcha/api2/anchor"></iframe>',
                '<input type="button" value="Verify you are human">',
                '<button>Verify that you are human</button>',
                '<button><span>Verify</span> you are human</button>',
                '<p>Complete this CAPTCHA</p>'):
            with self.subTest(html=html):
                with self.assertRaisesRegex(InteractiveVerificationRequired,
                                            'Interactive verification required.*disabled'):
                    reject_interactive_verification(html)

    def test_structure_and_input_audit_fail_closed(self):
        with self.assertRaises(RuntimeError):
            replace_once('changed upstream', 'expected', '')
        for source in (
                'driver.click()', 'driver.send_keys("x")', 'ActionChains(driver)',
                'def click_verify(driver): pass', 'from x import Keys',
                'driver.execute_cdp_cmd("Input.dispatchKeyEvent", {})',
                'driver.execute_script("arguments[0].click()")'):
            with self.subTest(source=source), self.assertRaises(RuntimeError):
                audit_service(source)

    def test_upstream_drift_makes_no_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in UPSTREAM_SHA256:
                (root / name).write_text('unreviewed upstream\n')
            before = {name: (root / name).read_bytes() for name in UPSTREAM_SHA256}
            with self.assertRaisesRegex(RuntimeError, 'Unreviewed upstream'):
                patch(root)
            self.assertEqual(before,
                             {name: (root / name).read_bytes() for name in UPSTREAM_SHA256})

    def test_bridge_has_no_verification_input(self):
        source = Path(__file__).with_name('browser_request.py').read_text()
        audit_service(source)
        self.assertNotIn('.click(', source)
        self.assertNotIn('.send_keys(', source)
        self.assertIn('reject_interactive_verification(driver.page_source)', source)
        self.assertIn("reject_interactive_verification(result.get('body', ''))", source)
        self.assertIn("fetch(payload.url, {", source)

    def test_bridge_executes_only_the_reviewed_request_script(self):
        tree = ast.parse(Path(__file__).with_name('browser_request.py').read_text())
        scripts = [ast.literal_eval(node.value) for node in tree.body
                   if isinstance(node, ast.Assign)
                   and any(isinstance(target, ast.Name) and target.id == 'FETCH_SCRIPT'
                           for target in node.targets)]
        self.assertEqual(len(scripts), 1)
        self.assertEqual(hashlib.sha256(scripts[0].encode()).hexdigest(),
                         'd0821dbfa74095264d253a3cbd68c8f67eca2ff0ff470fcaf7ee0d41087b3c31')
        calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Attribute)
                 and node.func.attr == 'execute_async_script']
        self.assertEqual(len(calls), 1)
        self.assertEqual([arg.id if isinstance(arg, ast.Name) else None for arg in calls[0].args],
                         ['FETCH_SCRIPT', 'payload'])
        self.assertEqual(calls[0].keywords, [])


if SOURCE:
    class PatchedUpstreamTests(unittest.TestCase):
        @classmethod
        def setUpClass(cls):
            cls.source = (SOURCE / 'flaresolverr_service.py').read_text()
            cls.tree = ast.parse(cls.source)

        def test_application_input_paths_removed(self):
            audit_service(self.source)
            self.assertNotIn('click_verify', self.source)
            self.assertNotIn('ActionChains', self.source)
            self.assertNotIn('Keys.', self.source)
            self.assertNotIn('--ignore-certificate-errors', (SOURCE / 'utils.py').read_text())
            self.assertNotIn('--ignore-ssl-errors', (SOURCE / 'utils.py').read_text())

        def run_loop(self, html, title='Catalog', timeout_count=0, after_wait=None,
                     cookies_only=False, captcha_on_timeout=False):
            class Timeout(Exception):
                pass

            driver = SimpleNamespace(
                page_source=html, title=title, current_url='https://fixture.invalid/',
                get_cookies=lambda: [],
                find_element=lambda *args: object(),
                find_elements=lambda *args: [],
                get=lambda url: None,
            )
            # No click/key/action/script input methods exist on this fake driver.
            waits = []

            class Wait:
                def __init__(self, driver, timeout):
                    pass

                def until_not(self, condition):
                    waits.append(condition)
                    if len(waits) <= timeout_count:
                        if captcha_on_timeout:
                            driver.page_source = '<button>Verify you are human</button>'
                        raise Timeout()
                    driver.title = 'Catalog'
                    driver.page_source = '<title>Catalog</title><p>Loaded passively</p>'

                def until(self, condition):
                    return True

            req = SimpleNamespace(url=driver.current_url, disableMedia=None, cookies=None,
                                  returnOnlyCookies=cookies_only, waitInSeconds=1 if after_wait else 0,
                                  returnScreenshot=False)
            namespace = {
                'WebDriver': object, 'V1RequestBase': object,
                'ChallengeResolutionT': lambda data: SimpleNamespace(),
                'ChallengeResolutionResultT': lambda data: SimpleNamespace(),
                'STATUS_OK': 'ok', 'SHORT_TIMEOUT': 1,
                'ACCESS_DENIED_TITLES': [], 'ACCESS_DENIED_SELECTORS': [],
                'CHALLENGE_TITLES': ['Just a moment...'],
                'CHALLENGE_SELECTORS': ['#cf-challenge-running'],
                'TimeoutException': Timeout, 'WebDriverWait': Wait,
                'title_is': lambda title: title,
                'presence_of_element_located': lambda locator: locator,
                'staleness_of': lambda element: element,
                'By': SimpleNamespace(TAG_NAME='tag', CSS_SELECTOR='css'),
                'logging': SimpleNamespace(debug=lambda *args: None, info=lambda *args: None),
                'time': SimpleNamespace(sleep=lambda seconds: after_wait(driver)),
                'utils': SimpleNamespace(get_config_disable_media=lambda: False,
                                         get_config_log_html=lambda: False,
                                         get_user_agent=lambda driver: 'fixture'),
                'reject_interactive_verification': reject_interactive_verification,
            }
            function = next(node for node in self.tree.body
                            if isinstance(node, ast.FunctionDef) and node.name == '_evil_logic')
            exec(compile(ast.Module(body=[function], type_ignores=[]), '<patched upstream>', 'exec'),
                 namespace)
            result = namespace['_evil_logic'](req, driver, 'GET')
            return result, waits

        def test_normal_page_works_without_browser_input(self):
            result, waits = self.run_loop('<title>Catalog</title>')
            self.assertEqual(result.status, 'ok')
            self.assertEqual(waits, [])

        def test_multiple_passive_timeouts_can_complete_without_input(self):
            result, waits = self.run_loop(
                '<title>Just a moment...</title><div id="cf-challenge-running">Please wait</div>',
                title='Just a moment...', timeout_count=3)
            self.assertEqual(result.status, 'ok')
            self.assertEqual(len(waits), 5)
            self.assertIn('Loaded passively', result.result.response)

        def test_initial_captcha_errors_including_cookie_only_requests(self):
            for cookies_only in (False, True):
                with self.subTest(cookies_only=cookies_only), self.assertRaises(
                        InteractiveVerificationRequired):
                    self.run_loop('<div class="cf-turnstile"></div>',
                                  cookies_only=cookies_only)

        def test_captcha_appearing_after_return_delay_errors(self):
            def challenge(driver):
                driver.page_source = '<button>Verify you are human</button>'

            with self.assertRaises(InteractiveVerificationRequired):
                self.run_loop('<title>Catalog</title>', after_wait=challenge)

        def test_captcha_appearing_during_passive_wait_errors_without_input(self):
            with self.assertRaises(InteractiveVerificationRequired):
                self.run_loop('<title>Just a moment...</title>', title='Just a moment...',
                              timeout_count=1, captcha_on_timeout=True)

        def test_api_controller_returns_explicit_verification_error(self):
            def handler(req):
                reject_interactive_verification('<div class="h-captcha"></div>')

            namespace = {
                'V1RequestBase': object, 'V1ResponseBase': lambda data: SimpleNamespace(),
                '_controller_v1_handler': handler, 'STATUS_ERROR': 'error',
                'time': SimpleNamespace(time=lambda: 1),
                'utils': SimpleNamespace(object_to_dict=lambda obj: {},
                                         get_flaresolverr_version=lambda: '3.4.6'),
                'logging': SimpleNamespace(info=lambda *args: None, debug=lambda *args: None,
                                           error=lambda *args: None),
            }
            function = next(node for node in self.tree.body if isinstance(node, ast.FunctionDef)
                            and node.name == 'controller_v1_endpoint')
            exec(compile(ast.Module(body=[function], type_ignores=[]), '<patched controller>',
                         'exec'), namespace)
            result = namespace['controller_v1_endpoint'](SimpleNamespace())
            self.assertEqual(result.status, 'error')
            self.assertTrue(result.__error_500__)
            self.assertIn('Interactive verification required (CAPTCHA)', result.message)

        def test_timeout_explains_passive_only_limit(self):
            self.assertIn('Passive browser wait timed out', self.source)
            self.assertIn('interactive verification may be required. Automated interaction is disabled.',
                          self.source)


if __name__ == '__main__':
    unittest.main()
