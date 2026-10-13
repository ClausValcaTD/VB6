#!/usr/bin/env python3
"""Genuine HTTP/file-origin direct export. No compiler bridge or hash adapter."""
from __future__ import annotations
import hashlib
import json
import os
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ENGINE = os.environ.get('VB6_BROWSER', 'chromium')
OUT = ROOT / 'reports' / 'macos-aot-browser'
OUT.mkdir(parents=True, exist_ok=True)
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', '''
import {conformanceProject} from './packages/macos-native/tests/conformance.mjs';
import {exportMacOSApplication} from './packages/macos-native/dist/index.js';
const project=conformanceProject(),options={name:project.name,bundleIdentifier:'org.vb6studio.application',minimumVersion:'11.0',optimization:2};
const variants={};for(const optimization of [0,1,2,3]){const result=await exportMacOSApplication(project,{...options,optimization});variants[optimization]={sha256:result.report.sha256,codeBytes:result.report.codeBytes};}
console.log(JSON.stringify({project,options,variants,sha256:variants[2].sha256}));
'''], cwd=ROOT))
checks, errors, archives, automatic = [], [], [], {}

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)
    print('PASS', name, flush=True)

def verify(path, optimization=2):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    check(path.name + ': every byte equals Node export', digest == fixture['variants'][str(optimization)]['sha256'])
    subprocess.run(['node', '--input-type=module', '-e', '''
import fs from 'node:fs/promises';
import {verifyMacOSAOTArchive} from './packages/macos-native/dist/index.js';
const report=await verifyMacOSAOTArchive(new Uint8Array(await fs.readFile(process.argv[1])),JSON.parse(process.argv[2]));
if(!report.compiled||!report.signature.byteHashesVerified)throw new Error('Invalid browser archive');
''', str(path), json.dumps({**fixture['options'], 'optimization':optimization})], cwd=ROOT, check=True)
    archives.append({'name':path.name, 'sha256':digest, 'options':{**fixture['options'], 'optimization':optimization}})

try:
    with sync_playwright() as pw:
        browser = getattr(pw, ENGINE).launch(headless=True)
        for origin in ['http', 'file']:
            context = browser.new_context(accept_downloads=True, viewport={'width':1440,'height':1050})
            page = context.new_page()
            page.set_default_timeout(60000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            downloads, requests = [], []
            page.on('download', lambda item: downloads.append(item))
            url = 'http://127.0.0.1:8080/' if origin == 'http' else (ROOT/'dist/VB6-Studio-Web.html').as_uri()
            if origin == 'http':
                page.route(url, lambda route: route.fulfill(content_type='text/html', body=(ROOT/'dist/VB6-Studio-Web.html').read_text()))
            page.goto(url)
            page.wait_for_function('!!globalThis.vb6Studio?.macOSExportInstalled')
            check(origin+': native Web Crypto and secure origin', page.evaluate('isSecureContext && !!crypto.subtle'))
            page.evaluate('p=>vb6Studio.loadProject(VB6StudioAPI.normalizeProject(p))', fixture['project'])
            before = page.evaluate('JSON.stringify(vb6Studio.project)')
            context.set_offline(True)
            page.on('request', lambda request: requests.append(request.url) if request.url.startswith(('http:', 'https:')) else None)

            def dialog():
                page.evaluate('void vb6Studio.command("exportMacOS")')
                page.get_by_role('dialog', name='Make macOS Apple Silicon Application').wait_for()
                check(origin+': export uses the native top layer', page.get_by_role('dialog').evaluate('node=>node.matches(":modal")'))

            def check_dialog_pixels():
                # A high-z-index retained canvas must never obscure export
                # status, trust warnings or buttons. Compare the same native
                # modal with and without that overlay; do not switch backends.
                node = page.get_by_role('dialog')
                page.evaluate('document.fonts.ready')
                page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
                backend = page.evaluate('vb6Studio.rendering.backend')
                check(origin+': canvas renderer is still active', backend in ['webgpu','webgl2','canvas2d'])
                overlay = node.screenshot(caret='hide', animations='disabled')
                try:
                    page.evaluate('''() => {
                      const layer=vb6Studio.rendering.canvas;
                      globalThis.__restoreExportCanvasStyle=layer.style.cssText;
                      layer.style.setProperty('visibility','hidden','important');
                    }''')
                    native = node.screenshot(caret='hide', animations='disabled')
                finally:
                    page.evaluate('vb6Studio.rendering.canvas.style.cssText=__restoreExportCanvasStyle')
                (OUT/(ENGINE+'-'+origin+'-dialog.png')).write_bytes(overlay)
                (OUT/(ENGINE+'-'+origin+'-dialog-native.png')).write_bytes(native)
                check(origin+': export dialog pixels are not obscured by the canvas', overlay == native)
                check(origin+': pixel capture preserved the rendering backend', page.evaluate('vb6Studio.rendering.backend') == backend)

            def close():
                page.get_by_role('button', name='Close', exact=True).click()
                page.get_by_role('dialog', name='Make macOS Apple Silicon Application').wait_for(state='detached')

            def pause_hash():
                # Delay one REAL Web Crypto operation to expose cancellation races.
                # The native SHA implementation remains the oracle; no substitute.
                page.evaluate('''() => {
                  const native=crypto.subtle.digest.bind(crypto.subtle);let held=false;
                  globalThis.__nativeHashPaused=false;
                  crypto.subtle.digest=async(...args)=>{
                    if(!held){held=true;globalThis.__nativeHashPaused=true;await new Promise(resolve=>globalThis.__releaseNativeHash=resolve);}
                    return native(...args);
                  };
                  globalThis.__restoreNativeHash=()=>crypto.subtle.digest=native;
                }''')

            dialog()
            check(origin+': bridge configuration is optional and collapsed', not page.get_by_label('macOS compiler bridge token',exact=True).is_visible())
            page.get_by_role('button', name='Export .app ZIP', exact=True).click()
            # Browser user-activation rules may suppress automatic downloads after
            # asynchronous signing. Exercise the visible, real manual-save fallback.
            try:
                page.wait_for_function('''() => {
                  const report=globalThis.vb6Studio.lastMacOSBuild;
                  return report?.codegen==='arm64-aot' || report?.success===false;
                }''', timeout=90000)
                state=page.evaluate('({report:vb6Studio.lastMacOSBuild,status:document.querySelector("[role=dialog] [role=status]")?.textContent})')
                (OUT/(ENGINE+'-'+origin+'-state.json')).write_text(json.dumps(state,indent=2))
                check(origin+': direct build succeeded', state['report'].get('success') is not False and state['report'].get('compiled') is True)
                page.get_by_role('dialog').get_by_role('status').filter(has_text='Direct native ARM64 .app ZIP ready').wait_for()
                for _ in range(50):
                    if downloads:
                        break
                    page.wait_for_timeout(20)
                automatic[origin]=bool(downloads)
                if downloads:
                    downloaded=downloads[-1]
                else:
                    with page.expect_download(timeout=30000) as item:
                        page.get_by_role('link',name='Save ZIP: NativeConformance.app.zip').click()
                    downloaded=item.value
            except Exception:
                (OUT/(ENGINE+'-'+origin+'-failure.txt')).write_text(page.locator('body').inner_text())
                page.screenshot(path=str(OUT/(ENGINE+'-'+origin+'-failure.png')))
                raise
            output = OUT/(ENGINE+'-'+origin+'.app.zip')
            downloaded.save_as(output)
            check(origin+': actual application filename, not source kit', downloaded.suggested_filename == 'NativeConformance.app.zip')
            verify(output)
            check(origin+': project is unchanged and no network used', not requests and page.evaluate('JSON.stringify(vb6Studio.project)') == before)
            check(origin+': native report verifies pages without claiming notarization', page.evaluate('vb6Studio.lastMacOSBuild.codegen==="arm64-aot" && vb6Studio.lastMacOSBuild.signature.byteHashesVerified && !vb6Studio.lastMacOSBuild.notarized'))
            check_dialog_pixels()
            page.screenshot(path=str(OUT/(ENGINE+'-'+origin+'.png')))
            for level in [0,1,3]:
                page.get_by_label('Native optimization',exact=True).select_option(str(level))
                count = len(downloads)
                page.get_by_role('button', name='Export .app ZIP', exact=True).click()
                page.wait_for_function('(level)=>vb6Studio.lastMacOSBuild?.success===false || vb6Studio.lastMacOSBuild?.projectOptimization?.level===level',arg=level)
                state = page.evaluate('vb6Studio.lastMacOSBuild')
                check(origin+f': O{level} direct build succeeds with selected optimization', state.get('compiled') is True and state.get('projectOptimization',{}).get('level')==level)
                page.get_by_role('dialog').get_by_role('status').filter(has_text='Direct native ARM64 .app ZIP ready').wait_for()
                for _ in range(50):
                    if len(downloads)>count:
                        break
                    page.wait_for_timeout(20)
                if len(downloads)>count:
                    variant=downloads[-1]
                else:
                    with page.expect_download() as item:
                        page.get_by_role('link',name='Save ZIP: NativeConformance.app.zip').click()
                    variant=item.value
                variant_file=OUT/(ENGINE+'-'+origin+f'-O{level}.app.zip')
                variant.save_as(variant_file)
                verify(variant_file,level)
                check(origin+f': O{level} native code size agrees with independent compiler', state['codeBytes']==fixture['variants'][str(level)]['codeBytes'])
            page.get_by_label('Native optimization',exact=True).select_option('2')
            page.evaluate('''() => {
              const native=HTMLAnchorElement.prototype.click;
              globalThis.__restoreDownloadClick=()=>HTMLAnchorElement.prototype.click=native;
              HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.app.zip'))return;return native.call(this);};
            }''')
            count = len(downloads)
            page.get_by_role('button', name='Export .app ZIP', exact=True).click()
            page.get_by_role('dialog').get_by_role('status').filter(has_text='Direct native ARM64 .app ZIP ready').wait_for()
            check(origin+': manual download remains available after blocked automatic click', len(downloads)==count and page.get_by_role('link',name='Save ZIP: NativeConformance.app.zip').is_visible())
            with page.expect_download() as item:
                page.get_by_role('link',name='Save ZIP: NativeConformance.app.zip').click()
            retry = OUT/(ENGINE+'-'+origin+'-retry.zip')
            item.value.save_as(retry)
            check(origin+': manual retry preserves every byte', retry.read_bytes()==output.read_bytes())
            retry.unlink()
            page.evaluate('void __restoreDownloadClick()')
            close()

            dialog()
            pause_hash()
            count = len(downloads)
            page.get_by_role('button', name='Export .app ZIP', exact=True).click()
            page.wait_for_function('__nativeHashPaused')
            close()
            page.evaluate('() => {__releaseNativeHash(); __restoreNativeHash();}')
            page.wait_for_timeout(1500)
            check(origin+': closing an in-flight export prevents a late download', len(downloads)==count)
            dialog()
            pause_hash()
            page.get_by_role('button', name='Export .app ZIP', exact=True).click()
            page.wait_for_function('__nativeHashPaused')
            page.evaluate('() => {vb6Studio.project.description="changed during direct build"; __releaseNativeHash(); __restoreNativeHash();}')
            page.get_by_role('dialog').get_by_role('status').filter(has_text='Project changed during export').wait_for()
            check(origin+': stale direct output is rejected', len(downloads)==count)
            close()
            check(origin+': all direct-export cases stayed offline', not requests)
            context.close()
        browser.close()
    check('no browser script errors', not errors)
finally:
    (OUT/'validation.json').write_text(json.dumps({'browser':ENGINE,'checks':checks,'errors':errors,'archives':archives,'nativeWebCrypto':True,'realFileOrigin':True,'automaticDownload':automatic},indent=2))
