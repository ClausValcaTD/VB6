"""Test diagnostic/cleanup helpers without importing the browser runner."""
import ast
from contextlib import redirect_stdout
import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest


class AgentLifecycleTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.out = Path(temporary.name)
        path = Path(__file__).with_name('browser-rendering-agent-thread.py')
        tree = ast.parse(path.read_text())
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                     and node.name in {'record_failure', 'close_case'}]
        self.assertEqual(len(functions), 2)
        self.namespace = {'OUT': self.out, 'traceback': SimpleNamespace(print_exc=lambda: None)}
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(path), 'exec'), self.namespace)

    def page(self, screenshot_error=None, cleanup_error=None):
        owner = self
        class Page:
            def __init__(self): self.calls = []
            def screenshot(self, **options):
                self.calls.append(('screenshot', options))
                if screenshot_error: raise screenshot_error
                Path(options['path']).write_bytes(b'failure image')
            def evaluate(self, expression):
                self.calls.append(('dispose', expression))
                owner.assertIn('window.renderer?.dispose()', expression)
                owner.assertIn('window.fixture?.view?.dispose()', expression)
                if cleanup_error: raise cleanup_error
        return Page()

    def record_failure(self, page, result, error):
        with redirect_stdout(io.StringIO()):
            self.namespace['record_failure'](page, result, error)

    def test_original_failure_survives_secondary_screenshot_timeout(self):
        page = self.page(screenshot_error=TimeoutError('screenshot stalled'))
        result = {'name': 'case', 'passed': True}
        self.record_failure(page, result, ValueError('original invariant'))
        self.assertEqual(result, {'name': 'case', 'passed': False, 'error': 'original invariant',
                                  'failureScreenshotError': 'screenshot stalled'})

    def test_successful_failure_capture_never_turns_failure_into_pass(self):
        page = self.page(); result = {'name': 'case', 'passed': True}
        self.record_failure(page, result, AssertionError('pixel mismatch'))
        self.assertFalse(result['passed'])
        self.assertEqual(result['error'], 'pixel mismatch')
        self.assertEqual((self.out / 'case-failure.png').read_bytes(), b'failure image')
        self.assertEqual(page.calls[0][1]['caret'], 'initial')

    def test_primary_error_is_recorded_before_screenshot(self):
        result = {'name': 'case', 'passed': True}
        class Page:
            def screenshot(inner, **options):
                self.assertFalse(result['passed']); self.assertEqual(result['error'], 'original')
        self.record_failure(Page(), result, RuntimeError('original'))

    def test_disposal_precedes_context_close_without_replacing_success(self):
        page = self.page(); result = {'name': 'case', 'passed': True}; closed = []
        context = SimpleNamespace(close=lambda: closed.append(list(page.calls)))
        self.namespace['close_case'](page, context, result)
        self.assertTrue(result['passed']); self.assertEqual(len(closed), 1)
        self.assertEqual(closed[0][0][0], 'dispose')

    def test_cleanup_failure_is_fatal_and_still_closes_context(self):
        page = self.page(cleanup_error=RuntimeError('dispose failed')); closed = []
        result = {'name': 'case', 'passed': True}
        self.namespace['close_case'](page, SimpleNamespace(close=lambda: closed.append(True)), result)
        self.assertFalse(result['passed']); self.assertEqual(result['cleanupError'], 'dispose failed')
        self.assertEqual(closed, [True])

    def test_cleanup_does_not_erase_a_primary_failure(self):
        page = self.page(cleanup_error=RuntimeError('dispose failed'))
        result = {'name': 'case', 'passed': False, 'error': 'pixel mismatch'}
        self.namespace['close_case'](page, SimpleNamespace(close=lambda: None), result)
        self.assertEqual(result['error'], 'pixel mismatch'); self.assertFalse(result['passed'])


if __name__ == '__main__': unittest.main()
