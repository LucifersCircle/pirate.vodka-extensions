"""Read-only CAPTCHA detection. Never send keyboard, mouse, or challenge input."""

from html.parser import HTMLParser
from urllib.parse import urlparse


class InteractiveVerificationRequired(RuntimeError):
    pass


class VerificationMarkup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.required = False
        self.ignored_depth = 0
        self.visible_text = []

    def handle_starttag(self, tag, attrs):
        attrs = {name: value or '' for name, value in attrs}
        if tag in ('script', 'style'):
            self.ignored_depth += 1
        classes = set(attrs.get('class', '').lower().split())
        if classes.intersection({'cf-turnstile', 'g-recaptcha', 'h-captcha'}):
            self.required = True
        if attrs.get('id', '').lower() in ('turnstile-wrapper', 'captcha', 'captcha-box'):
            self.required = True
        if tag == 'iframe':
            src = urlparse(attrs.get('src', '').lower())
            host = src.hostname or ''
            if (host == 'challenges.cloudflare.com'
                    or host == 'hcaptcha.com' or host.endswith('.hcaptcha.com')
                    or ((host == 'google.com' or host.endswith('.google.com')
                         or host == 'recaptcha.net' or host.endswith('.recaptcha.net'))
                        and '/recaptcha/' in src.path)):
                self.required = True
        if tag == 'input' and 'verify you are human' in attrs.get('value', '').lower():
            self.required = True

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.ignored_depth:
            self.ignored_depth -= 1

    def handle_data(self, data):
        if not self.ignored_depth:
            text = ' '.join(data.lower().split())
            if text:
                self.visible_text.append(text)


def reject_interactive_verification(html):
    markup = VerificationMarkup()
    markup.feed(html)
    markup.close()
    text = ' '.join(markup.visible_text)
    if markup.required or any(phrase in text for phrase in (
            'verify you are human', 'verify that you are human',
            'complete the captcha', 'complete this captcha')):
        raise InteractiveVerificationRequired(
            'Interactive verification required (CAPTCHA); automated interaction is disabled.')
