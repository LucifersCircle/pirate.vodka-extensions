"""Build-time, exact-upstream patch. A changed image must be reviewed, not guessed."""

import ast
import hashlib
from pathlib import Path
import sys


# Official FlareSolverr/FlareSolverr v3.4.6 src files, fetched via GitHub.
UPSTREAM_SHA256 = {
    'flaresolverr_service.py': '39bb0f02c7a77f8f06692fe3a8f1aa5256fa8f72dc378fe93ca317f53579ddc1',
    'utils.py': 'c7ab204e32ec4e6ea51d47827073ac4f983a70b6bb790228c8b58626be9a0c87',
    'sessions.py': '2bb7b5cc932df8edef838afa0b0efb8c0226be63665f88664fcc3cafb0c1d3c6',
    'flaresolverr.py': '962c5efdc51743b8b8a9a9723352d0f31ce229ef568650dd1be90acc42b0a898',
}
FORBIDDEN_NAMES = {'ActionChains', 'Keys', 'click_verify'}
FORBIDDEN_METHODS = {
    'click', 'double_click', 'context_click', 'send_keys', 'send_keys_to_element',
    'key_down', 'key_up', 'perform', 'move_to_element', 'move_to_element_with_offset',
    'execute_actions', 'press', 'tap', 'pointer_action', 'key_action',
}


def replace_once(source, before, after):
    if source.count(before) != 1:
        raise RuntimeError(f'Unexpected upstream structure: {before!r}')
    return source.replace(before, after, 1)


def audit_service(source):
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            raise RuntimeError(f'Forbidden verification name: {node.id}')
        if isinstance(node, ast.FunctionDef) and node.name in FORBIDDEN_NAMES:
            raise RuntimeError(f'Forbidden verification function: {node.name}')
        if isinstance(node, ast.ImportFrom):
            if any(alias.name in FORBIDDEN_NAMES for alias in node.names):
                raise RuntimeError('Verification input import remains')
        if isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_METHODS:
            raise RuntimeError(f'Forbidden browser interaction: {node.attr}')
        if isinstance(node, ast.Attribute) and node.attr == 'execute_script':
            raise RuntimeError('Unexpected executable browser script')
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == 'execute_cdp_cmd'
                and (not node.args or not isinstance(node.args[0], ast.Constant)
                     or node.args[0].value not in ('Network.enable', 'Network.setBlockedURLs'))):
            raise RuntimeError('Unexpected CDP command')


def passive_service(source):
    tree = ast.parse(source)
    functions = [node for node in tree.body
                 if isinstance(node, ast.FunctionDef) and node.name == 'click_verify']
    calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
             and isinstance(node.func, ast.Name) and node.func.id == 'click_verify']
    if len(functions) != 1 or len(calls) != 1:
        raise RuntimeError('Unexpected verification function/call count')
    lines = source.splitlines(keepends=True)
    function = functions[0]
    del lines[function.lineno - 1:function.end_lineno]
    source = ''.join(lines)
    source = replace_once(source, 'from selenium.webdriver.common.keys import Keys\n', '')
    source = replace_once(source,
                          'from selenium.webdriver.common.action_chains import ActionChains\n', '')
    source = replace_once(source, 'import utils\n',
                          'import utils\nfrom passive_verification import reject_interactive_verification\n')
    source = replace_once(source,
                          "        raise Exception(f'Error solving the challenge. Timeout after {timeout} seconds.')\n",
                          "        raise Exception(f'Passive browser wait timed out after {timeout} seconds; '\n"
                          "                        'interactive verification may be required. Automated interaction is disabled.')\n")
    source = replace_once(source, '    # wait for the page\n',
                          '    reject_interactive_verification(driver.page_source)\n\n'
                          '    # wait for the page\n')
    source = replace_once(source, '                click_verify(driver)\n',
                          '                reject_interactive_verification(driver.page_source)\n')
    source = replace_once(source, '    challenge_res = ChallengeResolutionResultT({})\n',
                          '    reject_interactive_verification(driver.page_source)\n\n'
                          '    challenge_res = ChallengeResolutionResultT({})\n')
    source = replace_once(source, '        challenge_res.response = driver.page_source\n',
                          '        reject_interactive_verification(driver.page_source)\n'
                          '        challenge_res.response = driver.page_source\n')
    audit_service(source)
    return source


def patch(root):
    root = Path(root)
    originals = {name: (root / name).read_bytes() for name in UPSTREAM_SHA256}
    for name, expected in UPSTREAM_SHA256.items():
        actual = hashlib.sha256(originals[name]).hexdigest()
        if actual != expected:
            raise RuntimeError(f'Unreviewed upstream {name}: expected {expected}, got {actual}')
    service = passive_service(originals['flaresolverr_service.py'].decode())
    utils = originals['utils.py'].decode()
    for flag in ('--ignore-certificate-errors', '--ignore-ssl-errors'):
        utils = replace_once(utils, f"    options.add_argument('{flag}')\n", '')
    if '--ignore-certificate-errors' in utils or '--ignore-ssl-errors' in utils:
        raise RuntimeError('TLS bypass remains')
    # No writes until every pin, source shape, and output audit has passed.
    (root / 'flaresolverr_service.py').write_text(service)
    (root / 'utils.py').write_text(utils)


if __name__ == '__main__':
    patch(sys.argv[1])
