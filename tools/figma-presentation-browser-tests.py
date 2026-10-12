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
    def painted_theme(self,scheme,label,backend="canvas2d"):
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
        # Evidence only: never repaint or replace a backend to satisfy a probe.
        evidence=self.page.evaluate(r'''points=>{
          const r=vb6Studio.rendering,scene=r.retained.scene;
          const contains=(b,p)=>b&&p.x>=b[0]&&p.y>=b[1]&&p.x<b[0]+b[2]&&p.y<b[1]+b[3];
          const selectors={header:'.figma-header',layers:'.figma-layer-tree',canvas:'.designer-scroll[data-figma-viewport]',design:'.figma-design-inspector'};
          return {hidden:document.hidden,canvases:[...document.querySelectorAll('[data-vb-render-layer]')].map(n=>({width:n.width,height:n.height,style:n.style.cssText,current:n===r.canvas})),
            probes:Object.fromEntries(Object.entries(points).map(([name,p])=>{
              const n=document.querySelector(selectors[name]),cs=getComputedStyle(n),box=n.getBoundingClientRect();
              return [name,{dom:{rect:[box.x,box.y,box.width,box.height],background:cs.backgroundColor,display:cs.display},snapshot:r.adapter.styles.get(n),
                covering:scene.commands.filter(c=>contains(c.rect,p)&&contains(c.clip,p)).map(c=>({rect:c.rect,clip:c.clip,color:c.color,hole:c.hole,page:!!c.page}))}];
            }))};
        }''',probes)
        (REPORT/(label+'.json')).write_text(json.dumps({'expected':expected,'actual':actual,'points':probes,'renderer':stats,'evidence':evidence},indent=2))
        self.assertEqual(stats['active'],backend,'The visual guard must retain the qualified backend')
        self.assertEqual(actual,expected,'Native DOM and retained paint must publish the same workspace scheme')
    def test_presentation_default_backend_theme_pixels(self):
        # Qualify the actual shipped policy rather than assuming the project's
        # legacy renderer preference selects the IDE-global canvas backend.
        self.page.evaluate('vb6Studio.rendering.ready')
        initial=self.page.evaluate('vb6Studio.rendering.getStats()')
        (REPORT/'default-startup.json').write_text(json.dumps(initial,indent=2))
        backend=initial['active']
        self.assertIn(backend,['webgpu','webgl2','canvas2d'],'Default policy must select a working canvas in this matrix')
        self.enable(True);self.select(['frame']);before=self.snapshot()
        for index,scheme in enumerate(['light','dark','light','dark']):
            self.page.evaluate('scheme=>vb6Studio.figmaMode.configure({mode:"figma",scheme,units:"px"})',scheme)
            self.painted_theme(scheme,'default-'+str(index)+'-'+scheme,backend)
            self.assertEqual(self.snapshot(),before)
        self.done()

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
