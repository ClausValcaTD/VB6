#!/usr/bin/env python3
"""Composited workspace paint acceptance; never qualify stale canvas as new DOM.
Shares the real IDE fixture/lifecycle with figma-browser-tests.py. Reports are
separate so the visual pass cannot overwrite the 22 authoring case results.
"""
import importlib.util
import io
import json
import unittest
from pathlib import Path
from PIL import Image

spec=importlib.util.spec_from_file_location('figma_authoring',Path(__file__).with_name('figma-browser-tests.py'))
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
REPORT=base.REPORT/'presentation'
base.REPORT=REPORT

class FigmaPresentation(base.FigmaWorkspace):
    def painted_theme(self,scheme,label):
        """Read actual composited screenshot pixels, not just computed DOM styles.
        No forced renderer paint, backend replacement or sleep occurs here.
        """
        probes=self.page.evaluate(r'''()=>{
          const point=(selector,x,y)=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x+x*r.width,y:r.y+y*r.height};};
          return {header:point('.figma-header',.5,.5),layers:point('.figma-layer-tree',.5,.9),
            canvas:point('.designer-scroll[data-figma-viewport]',.02,.02),
            design:point('.figma-design-inspector',.015,.05)};
        }''')
        png=self.page.screenshot(path=str(REPORT/(label+'.png')),caret='hide',timeout=10000)
        image=Image.open(io.BytesIO(png)).convert('RGB')
        expected={'header':(44,44,44) if scheme=='dark' else (255,255,255),
                  'layers':(44,44,44) if scheme=='dark' else (255,255,255),
                  'design':(44,44,44) if scheme=='dark' else (255,255,255),
                  'canvas':(30,30,30) if scheme=='dark' else (245,245,245)}
        actual={name:image.getpixel((int(p['x']),int(p['y']))) for name,p in probes.items()}
        stats=self.page.evaluate('vb6Studio.rendering.getStats()')
        (REPORT/(label+'.json')).write_text(json.dumps({'expected':expected,'actual':actual,'points':probes,'renderer':stats},indent=2))
        self.assertEqual(stats['active'],'canvas2d','The visual guard must not silently qualify HTML fallback')
        self.assertEqual(actual,expected,'Native DOM and retained paint must publish the same workspace scheme')
    def test_presentation_composited_theme_pixels(self):
        self.page.evaluate('vb6Studio.setRenderingPolicy({backend:"canvas2d",fallbacks:["html"],text:"native"})')
        self.enable(True);before=self.snapshot()
        for index,scheme in enumerate(['dark','light','dark','light']):
            self.page.evaluate('scheme=>vb6Studio.figmaMode.configure({mode:"figma",scheme,units:"px"})',scheme)
            self.painted_theme(scheme,'published-'+str(index)+'-'+scheme)
            self.assertEqual(self.snapshot(),before)
        self.done()
    def test_presentation_system_idle_restore(self):
        self.page.evaluate('vb6Studio.setRenderingPolicy({backend:"canvas2d",fallbacks:["html"],text:"native"})')
        self.enable();self.page.evaluate('vb6Studio.figmaMode.configure({mode:"figma",scheme:"system",units:"px"})')
        self.page.emulate_media(color_scheme='dark')
        self.page.wait_for_function('document.documentElement.dataset.figmaScheme==="dark"')
        self.painted_theme('dark','system-dark-publication')
        self.page.emulate_media(color_scheme='light')
        self.page.wait_for_function('document.documentElement.dataset.figmaScheme==="light"')
        self.painted_theme('light','system-light-publication')
        self.page.wait_for_timeout(350)
        before=self.page.evaluate('vb6Studio.rendering.metrics.frames')
        self.page.wait_for_timeout(300)
        self.assertEqual(self.page.evaluate('vb6Studio.rendering.metrics.frames'),before,'No perpetual workspace paint loop at idle')
        self.page.evaluate('vb6Studio.figmaMode.configure({mode:"classic"})')
        self.assertIsNone(self.page.locator('html').get_attribute('data-ide-workspace'))
        self.assertEqual(self.page.evaluate('vb6Studio.rendering.getStats().active'),'canvas2d')
        self.assertEqual(self.page.locator('.figma-header').count(),0);self.done()


def load_tests(loader,standard_tests,pattern):
    return unittest.TestSuite(FigmaPresentation(name) for name in sorted(FigmaPresentation.__dict__) if name.startswith('test_presentation_'))

if __name__=='__main__':unittest.main(verbosity=2)
