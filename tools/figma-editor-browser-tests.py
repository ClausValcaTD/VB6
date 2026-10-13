#!/usr/bin/env python3
"""Figma source visibility and canonical property-panel integration regressions."""
import importlib.util
import json
import unittest
from pathlib import Path
from playwright.sync_api import expect
spec = importlib.util.spec_from_file_location('figma_base', Path(__file__).with_name('figma-browser-tests.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
REPORT = base.REPORT / 'editor-properties'
base.REPORT = REPORT

class EditorProperties(base.FigmaWorkspace):
    def test_source_overlay_does_not_cover_highlighted_code(self):
        self.enable()
        self.page.get_by_role('button', name='Code', exact=True).click()
        editor = self.page.locator('.mdi-window.mdi-active .source-editor')
        expect(editor.locator('.syntax-line').first).to_contain_text('Option Explicit')
        data = editor.evaluate("""n => {
          const input = getComputedStyle(n.querySelector('.source-input'));
          const syntax = getComputedStyle(n.querySelector('.syntax-layer'));
          const keys = ['fontFamily','fontSize','lineHeight','letterSpacing','tabSize',
                        'paddingTop','paddingRight','paddingBottom','paddingLeft'];
          return {background: input.backgroundColor,
                  input: Object.fromEntries(keys.map(k=>[k,input[k]])),
                  syntax: Object.fromEntries(keys.map(k=>[k,syntax[k]]))};
        }""")
        (REPORT/'source-overlay.json').write_text(json.dumps(data, indent=2))
        self.page.screenshot(path=str(REPORT/'code-view.png'))
        self.assertEqual(data['background'], 'rgba(0, 0, 0, 0)')
        self.assertEqual(data['input'], data['syntax'])
        self.done()

def load_tests(loader, standard_tests, pattern):
    return loader.loadTestsFromNames(['test_source_overlay_does_not_cover_highlighted_code'], EditorProperties)

if __name__ == '__main__':
    unittest.main(verbosity=2)
