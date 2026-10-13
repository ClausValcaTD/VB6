#!/usr/bin/env python3
"""Tool tab selection and Assets navigation state use their real UI owners."""
import importlib.util
import unittest
from pathlib import Path
from playwright.sync_api import expect
spec=importlib.util.spec_from_file_location('services',Path(__file__).with_name('figma-services-browser-tests.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
base.base.REPORT=base.base.REPORT/'state'

class ServiceState(base.ServicesAssets):
    def test_expanded_tool_has_the_only_selected_and_highlighted_document_tab(self):
        self.enable();self.page.get_by_role('button',name='Agent',exact=True).click()
        self.page.get_by_role('button',name='Expand Agent to document',exact=True).click()
        tab=self.page.locator('[data-figma-tool-tab="tool:coding-agents"]')
        expect(tab).to_be_visible();expect(tab).to_have_class('document-tab active')
        expect(self.page.locator('.document-tabs [aria-selected="true"]')).to_have_count(1)
        self.page.locator('.document-tab[data-document$=":form"]').click()
        expect(tab).not_to_have_class('document-tab active')
        expect(self.page.locator('.document-tabs [aria-selected="true"]')).to_have_count(1)
        tab.click();expect(tab).to_have_class('document-tab active')
        self.page.get_by_role('button',name='Agent',exact=True).click()
        expect(tab).to_have_count(0)
        expect(self.page.locator('.document-tab[data-document$=":form"]')).to_have_class('document-tab active')
        self.page.evaluate('vb6Studio.figmaMode.configure({mode:"classic"})')
        expect(self.page.locator('.document-tabs [aria-selected="true"]')).to_have_count(1)
        self.done()

    def test_successful_asset_drop_leaves_hand_mode_and_selects_new_control(self):
        self.enable();self.page.get_by_role('button',name='Hand (H)',exact=True).click()
        self.assertTrue(self.page.evaluate('vb6Studio.figmaMode.viewports.get(vb6Studio.designer).hand'))
        self.drop_asset('Label','.mdi-active .vb-form-content',300,5400)
        self.assertEqual(self.inserted()['type'],'Label')
        self.assertFalse(self.page.evaluate('vb6Studio.figmaMode.viewports.get(vb6Studio.designer).hand'))
        expect(self.page.get_by_role('button',name='Move (V)',exact=True)).to_have_attribute('aria-pressed','true')
        self.done()

    def test_cancelled_native_drag_restores_its_edge_pan(self):
        self.enable();source=self.asset('Label');r=source.bounding_box()
        viewport=self.page.locator('.designer-scroll[data-figma-viewport]').bounding_box()
        before=self.snapshot();state=self.page.evaluate('vb6Studio.figmaMode.viewports.get(vb6Studio.designer).state')
        self.page.mouse.move(r['x']+r['width']/2,r['y']+20);self.page.mouse.down()
        self.page.mouse.move(r['x']+r['width']/2+10,r['y']+30,steps=3)
        self.page.mouse.move(viewport['x']+viewport['width']-8,viewport['y']+viewport['height']/2,steps=10)
        # Native dragover is delivered on movement after dragenter.
        self.page.mouse.move(viewport['x']+viewport['width']-7,viewport['y']+viewport['height']/2)
        self.page.wait_for_function('x=>vb6Studio.figmaMode.viewports.get(vb6Studio.designer).state.x<x-20',arg=state['x'])
        self.assertEqual(self.snapshot(),before)
        self.page.keyboard.press('Escape');self.page.mouse.up()
        self.page.wait_for_function('!vb6Studio.figmaMode.ui.assets.active')
        restored=self.page.evaluate('vb6Studio.figmaMode.viewports.get(vb6Studio.designer).state')
        self.assertAlmostEqual(restored['x'],state['x'],places=4)
        self.assertAlmostEqual(restored['y'],state['y'],places=4)
        self.assertEqual(self.snapshot(),before);self.done()


def load_tests(loader,standard,pattern):
    return unittest.TestSuite(ServiceState(name) for name in sorted(ServiceState.__dict__) if name.startswith('test_'))
if __name__=='__main__':unittest.main(verbosity=2)
