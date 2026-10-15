"""Real runtime regressions for macOS popup, segment and inactive paint."""
import io
import subprocess
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

class MacOSCompositeChecks:
    def composite_native_layers(self, page, theme, layers):
        # Independent native sRGB/alpha inputs, composited by the host canvas.
        # CSS and AppKit quantize translucent pixels differently; the separate
        # unmasked native comparator continues to report those differences.
        return page.evaluate("""([background,layers])=>{
            const c=document.createElement('canvas').getContext('2d');
            c.fillStyle=background;c.fillRect(0,0,1,1);
            for(const value of layers){c.fillStyle=value;c.fillRect(0,0,1,1);}
            return [...c.getImageData(0,0,1,1).data].slice(0,3);
        }""", ['#1e1e1e' if theme.endswith('-dark') else '#ffffff',layers])

    def macos_reference(self, page=None):
        subprocess.run(['node', 'tools/build-macos-theme-fixture.mjs'], cwd=ROOT, check=True)
        page = page or self.page
        self.load(ROOT / 'reports/macos-theme-browser/fixture.html', page)
        page.wait_for_function('typeof vb6Application === "object"')
        page.evaluate('window.identity = vb6Application.forms[0].controls.map(c => c.node)')
        page.mouse.move(1050, 980)
        return page

    def test_macos_inactive_controls_keep_values_and_restore_accent(self):
        page = self.macos_reference()
        for theme in ('macos26','macos26-dark'):
            self.theme(theme, {'reduceMotion': True})
            values = page.evaluate('JSON.stringify(vb6Application.forms[0].controls.map(c => c.props))')
            page.evaluate('document.activeElement?.blur()')
            active = Image.open(io.BytesIO(page.locator('.vb-form-content').screenshot())).convert('RGB')
            page.evaluate('vb6Application.forms[0].node.classList.add("vb-inactive")')
            # Sample literal native alpha layers in an independent paint oracle.
            # No sampling mask is applied to the full native comparison.
            rgb = '255,255,255' if theme.endswith('-dark') else '0,0,0'
            neutral = f'rgba({rgb},{20/255})'
            samples = [((90,40),[neutral]), ((342,164),[f'rgba({rgb},{36/255})']),
                       ((700,396),[f'rgba({rgb},{58/255})']), ((80,512),['#aaaaaa']),
                       ((350,390),[neutral,f'rgba({rgb},{30/235})'])]
            image = Image.open(io.BytesIO(page.locator('.vb-form-content').screenshot())).convert('RGB')
            for xy, layers in samples:
                self.assertEqual(list(image.getpixel(xy)), self.composite_native_layers(page,theme,layers), (theme, xy))
            self.assertEqual(page.locator('[data-control=specimen5] input').evaluate('e=>getComputedStyle(e).boxShadow'),'none')
            for number in (4, 5, 6):
                glyph = page.locator(f'[data-control="specimen{number}"] input').evaluate('(e)=>getComputedStyle(e,"::after").backgroundColor')
                self.assertEqual(glyph, 'rgb(39, 39, 39)' if theme=='macos26' else 'rgb(221, 221, 221)')
            # Disabled commands retain disabled paint, not the inactive enabled fill.
            self.assertEqual(page.locator('[data-control="specimen2"]').evaluate('e=>getComputedStyle(e).backgroundColor'),
                             'rgba(0, 0, 0, 0.04)' if theme=='macos26' else 'rgba(255, 255, 255, 0.04)')
            self.assertEqual(page.evaluate('JSON.stringify(vb6Application.forms[0].controls.map(c => c.props))'), values)
            page.evaluate('vb6Application.forms[0].node.classList.remove("vb-inactive")')
            restored=Image.open(io.BytesIO(page.locator('.vb-form-content').screenshot())).convert('RGB')
            # Check exactly the solid paint samples driven by activation. Native
            # browser thumb/focus shadows are not part of this state assertion;
            # the separate comparison still retains every pixel, including them.
            for xy, _ in samples:
                self.assertEqual(restored.getpixel(xy),active.getpixel(xy),'restored state paint')
            self.assertTrue(page.evaluate('identity.every((n,i)=>n===vb6Application.forms[0].controls[i].node)'))
            self.record('macOS inactive default, checks, radio, segment, slider, progress and restoration', theme=theme)

    def test_macos_popup_button_inner_paint_and_real_selection(self):
        for scale in (1, 2):
            context = self.browser.new_context(viewport={'width':1100,'height':1000}, device_scale_factor=scale)
            try:
                page = context.new_page()
                page.on('pageerror', lambda e: self.errors.append(str(e)))
                self.macos_reference(page)
                field = page.locator('[data-control="specimen9"] input')
                arrow = page.locator('[data-control="specimen9"] button')
                root = page.locator('[data-control="specimen9"]')
                for theme, background in [('macos26',255), ('macos26-dark',30)]:
                    page.evaluate('t=>vb6Application.setTheme(t,{reduceMotion:true})', theme)
                    page.evaluate('document.activeElement?.blur()')
                    bounds = root.bounding_box(); inside = field.bounding_box()
                    self.assertEqual([bounds['width'], bounds['height']], [280,28])
                    self.assertEqual([inside['width'],inside['height'],inside['y']-bounds['y']], [280,24,2])
                    self.assertEqual(field.evaluate('e=>getComputedStyle(e).boxShadow'), 'none')
                    self.assertEqual(arrow.evaluate('e=>getComputedStyle(e).backgroundColor'), 'rgba(0, 0, 0, 0)')
                    for pseudo in ('::before','::after'):
                        self.assertEqual(arrow.evaluate('(e,p)=>getComputedStyle(e,p).content',pseudo), '""')
                    ink='255,255,255' if theme.endswith('-dark') else '0,0,0'
                    body=self.composite_native_layers(page,theme,[f'rgba({ink},{20/255})'])[0]
                    image = Image.open(io.BytesIO(root.screenshot())).convert('RGB')
                    for y, color in [(0,background),(1,background),(3,body),(24,body),(26,background),(27,background)]:
                        self.assertEqual(image.getpixel((100*scale, y*scale)), (color,)*3, (theme, scale, y))
                    arrow.click()
                    self.assertEqual(field.get_attribute('aria-expanded'), 'true')
                    self.assertEqual(page.locator('.vb-combo-popup').count(),1)
                    field.press('End');field.press('Enter')
                    self.assertEqual(field.input_value(), 'Gamma')
                    self.assertEqual(field.get_attribute('aria-expanded'), 'false')
                    # Style changes restore editable-field chrome on the same input.
                    page.evaluate('()=>{const c=vb6Application.forms[0].controls.find(c=>c.model.name==="specimen9");window.popupInput=c.combo?.input||c.node.querySelector("input");c.set("Style",0);c.refresh()}')
                    self.assertFalse(field.evaluate('e=>e.readOnly'))
                    self.assertEqual(field.bounding_box()['height'],28)
                    self.assertNotEqual(field.evaluate('e=>getComputedStyle(e).boxShadow'), 'none')
                    page.evaluate('()=>{const c=vb6Application.forms[0].controls.find(c=>c.model.name==="specimen9");c.set("Style",2);c.set("Enabled",0);c.refresh()}')
                    self.assertTrue(field.is_disabled())
                    self.assertEqual(field.get_attribute('aria-expanded'), 'false')
                    self.assertEqual(page.locator('.vb-combo-popup').count(),0)
                    page.evaluate('()=>{const c=vb6Application.forms[0].controls.find(c=>c.model.name==="specimen9");c.set("Enabled",-1);c.refresh()}')
                    self.assertTrue(field.evaluate('e=>e===popupInput'))
                    self.assertEqual(root.bounding_box(), bounds)
                    self.record('macOS popup button 24px body, paired chevrons, selection, disabled and style restoration',theme=theme,scale=scale)
            finally:
                context.close()

    def test_macos_segmented_strip_preserves_notebook_and_keyboard_navigation(self):
        page=self.macos_reference()
        strip=page.locator('[data-control="specimen10"]')
        notebook=page.locator('[data-control="specimen18"]')
        bounds=strip.bounding_box(); notebook_bounds=notebook.bounding_box()
        for theme in ('macos26','macos26-dark'):
            self.theme(theme, {'reduceMotion':True})
            page.evaluate('()=>{const c=vb6Application.forms[0].controls.find(c=>c.model.name==="specimen10");c.set("Tab",0);c.refresh()}')
            header=strip.locator('.vb-tab-header').bounding_box()
            self.assertEqual([header['x']-bounds['x'],header['y']-bounds['y'],header['width'],header['height']], [0,2,280,24])
            first=strip.locator('button').nth(0);second=strip.locator('button').nth(1)
            self.assertGreater(second.bounding_box()['width'],first.bounding_box()['width'], 'auto tracks preserve intrinsic label width')
            first.focus();first.press('ArrowRight')
            self.assertEqual(second.get_attribute('aria-selected'),'true')
            self.assertEqual(first.get_attribute('aria-selected'),'false')
            self.assertEqual(strip.bounding_box(),bounds)
            self.assertEqual(notebook.bounding_box(),notebook_bounds)
            # Inactive state must stop at an independent active palette boundary.
            page.evaluate('''() => {
                const f=vb6Application.forms[0]; f.node.classList.add('vb-inactive');
                const source=f.controls.find(c=>c.model.name==='specimen0').node;
                window.nested=document.createElement('div');nested.setAttribute('data-vb-theme',f.host?.theme?.id||'macos26');
                nested.setAttribute('data-vb-theme-family','macos26');nested.append(source.cloneNode(true));f.node.append(nested);
            }''')
            self.assertEqual(page.locator('.vb-inactive > div[data-vb-theme] .default-button').evaluate('e=>getComputedStyle(e).backgroundColor'), 'rgb(0, 122, 255)')
            page.evaluate('nested.remove();vb6Application.forms[0].node.classList.remove("vb-inactive")')
            self.assertTrue(page.evaluate('identity.every((n,i)=>n===vb6Application.forms[0].controls[i].node)'))
            self.record('macOS segmented intrinsic widths, insets, keys and active nested boundary',theme=theme)
