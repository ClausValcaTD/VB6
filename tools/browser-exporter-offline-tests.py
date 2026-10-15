#!/usr/bin/env python3
"""Real-origin service worker installation, offline input, updates and exact IDE ZIPs.
No request routing, inline page substitute, browser-policy overrides or retries.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit, quote
import zipfile
from playwright.sync_api import sync_playwright
from exporter_browser_wait import wait_for_export

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'reports/exporter-offline'
ENGINE = os.environ.get('VB6_BROWSER', 'chromium')
if os.environ.get('VB6_OFFLINE') == '1':
    raise RuntimeError('Offline deployment acceptance requires real HTTP origins and service workers')
# A test run owns this dedicated output directory; never reuse an earlier ZIP.
shutil.rmtree(REPORT, ignore_errors=True)
subprocess.run(['node', 'tools/build-offline-export-fixtures.mjs'], cwd=ROOT, check=True)
metadata = json.loads((REPORT / 'fixture-builds.json').read_text())
state = {'a': 'one', 'b': 'one', 'broken': 'one', 'failed': 'failed', 'corrupt': True}
results, errors = [], []

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.webmanifest': 'application/manifest+json'}
    def log_message(self, *args):
        pass
    def translate_path(self, value):
        route = urlsplit(value).path
        for app in ('a', 'b', 'broken', 'failed'):
            prefix = '/apps/' + app + '/'
            if route.startswith(prefix):
                return str(REPORT / 'fixtures' / state[app] / (route[len(prefix):] or 'index.html'))
        if route.startswith('/download/'):
            return str(REPORT / 'download' / (route[len('/download/'):] or 'index.html'))
        return super().translate_path(value)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        if self.path.startswith(('/apps/', '/download/')):
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'")
        super().end_headers()
    def do_GET(self):
        if self.path == '/apps/broken/assets/raw.bin' and state['corrupt']:
            body = b'corrupted-upload'
            self.send_response(200); self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        if self.path.endswith('/api/data'):
            body = b'{"networkOnly":true}'
            self.send_response(200); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        super().do_GET()

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
def check(value, message):
    if not value:
        raise AssertionError(message)
def passed(name, **evidence):
    results.append({'case': name, 'passed': True, **evidence})
    print('PASS ' + name, flush=True)
def cache_key(app, release):
    scope = base + '/apps/' + app + '/'
    return 'vb6-export:' + quote(scope, safe="-_.!~*'()") + ':' + metadata[release]['cacheVersion']
def new_page(context):
    page = context.new_page(); page.set_default_timeout(25000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script("globalThis.policyViolations=[];addEventListener('securitypolicyviolation',e=>policyViolations.push(e.violatedDirective));")
    return page
def ready(page, phase='ready'):
    wait_for_export(page, '(phase)=>globalThis.vb6ApplicationStatus?.phase===phase', arg=phase)
    if phase == 'ready':
        check(page.evaluate('vb6Application.vm.state !== "error"'), 'VM failed despite ready status')
        check(page.locator('#vb6-startup').is_hidden(), 'Startup banner did not hide')
def installed(page):
    wait_for_export(page, 'globalThis.vb6OfflineStatus?.phase === "ready"')
    wait_for_export(page, 'navigator.serviceWorker.getRegistration().then(r=>r?.active?.state === "activated")')
    check(not page.evaluate('policyViolations'), 'Generated export violated external-script CSP')
def binary(page):
    return page.evaluate('fetch("./assets/raw.bin").then(r=>r.arrayBuffer()).then(b=>Array.from(new Uint8Array(b)))')
def calculator(page):
    page.get_by_role('button', name='Clear', exact=True).click()
    page.get_by_role('button', name='7', exact=True).click()
    page.get_by_role('button', name='+', exact=True).click()
    page.get_by_role('button', name='8', exact=True).click()
    page.get_by_role('button', name='=', exact=True).click()
    wait_for_export(page, 'document.querySelector("[data-control=txtDisplay] input")?.value === "15"')

try:
    with sync_playwright() as p:
        launch = {'headless': True}
        if ENGINE == 'chromium':
            launch['args'] = ['--no-sandbox']
            if os.environ.get('CHROMIUM_PATH'):
                launch['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = getattr(p, ENGINE).launch(**launch)
        context = browser.new_context(viewport={'width': 1100, 'height': 850}, accept_downloads=True)
        a = new_page(context); a.goto(base + '/apps/a/index.html'); ready(a); installed(a)
        check(a.evaluate('releaseMarker') == 'one', 'Wrong first release')
        check(cache_key('a', 'one') in a.evaluate('caches.keys()'), 'Missing scope-owned verified cache')
        check(a.evaluate('navigator.serviceWorker.controller === null'), 'First install force-claimed an existing client')
        passed('complete-install-under-subpath-with-external-script-CSP')
        a.reload(); ready(a)
        check(a.evaluate('Boolean(navigator.serviceWorker.controller)'), 'Reload is not controlled')
        check(binary(a) == [0,255,128], 'Cached binary bytes changed')
        check(a.evaluate('fetch("./api/data").then(r=>r.json()).then(v=>v.networkOnly)'), 'Network fixture did not run')
        passed('controlled-reload-and-binary-assets')
        context.set_offline(True)
        a.reload(); ready(a); calculator(a)
        check(binary(a) == [0,255,128], 'Binary asset unavailable offline')
        check(a.evaluate('fetch("./api/data").then(()=>false,()=>true)'), 'Dynamic API was improperly cached')
        passed('real-network-offline-reload-and-VB-control-input')
        a.goto(base + '/apps/a/?launch=fixture'); ready(a)
        check(a.evaluate('releaseMarker') == 'one', 'Launch query lost the entry fallback')
        passed('offline-entry-navigation-with-launch-query')
        context.set_offline(False)
        b = new_page(context); b.goto(base + '/apps/b/index.html'); ready(b); installed(b)
        check(cache_key('a', 'one') in b.evaluate('caches.keys()'), 'Sibling install deleted first application cache')
        check(cache_key('b', 'one') in b.evaluate('caches.keys()'), 'Sibling cache missing')
        passed('same-origin-sibling-cache-isolation')
        state['a'] = 'two'
        a.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
        wait_for_export(a, 'navigator.serviceWorker.getRegistration().then(r=>r?.waiting?.state === "installed")')
        check(a.evaluate('releaseMarker') == 'one', 'Update replaced live application code')
        check(a.evaluate('fetch("./assets/version.txt").then(r=>r.text())') == 'one', 'Live release mixed new assets')
        check(cache_key('a', 'one') in a.evaluate('caches.keys()'), 'Waiting update removed active cache')
        calculator(a)
        passed('update-waits-without-reloading-or-mixing-live-release')
        a.close()
        wait_for_export(b, '(url)=>navigator.serviceWorker.getRegistration(url).then(r=>r?.active?.state === "activated" && !r.waiting)', arg=base + '/apps/a/')
        keys = b.evaluate('caches.keys()')
        check(cache_key('a', 'one') not in keys and cache_key('a', 'two') in keys, 'Update did not retire only the old release')
        check(cache_key('b', 'one') in keys, 'Update deleted sibling cache')
        a = new_page(context); a.goto(base + '/apps/a/index.html'); ready(a); installed(a)
        check(a.evaluate('releaseMarker') == 'two', 'Updated code not loaded')
        context.set_offline(True); a.reload(); ready(a)
        check(a.evaluate('releaseMarker') == 'two', 'Updated release unavailable offline')
        context.set_offline(False)
        passed('natural-activation-and-offline-updated-release')
        a.evaluate('(key)=>caches.open(key).then(c=>c.delete(new URL("./assets/raw.bin",location.href).href))', cache_key('a', 'two'))
        check(binary(a) == [0,255,128], 'Evicted exact-version asset did not recover')
        passed('evicted-entry-recovers-verified-network-bytes')
        state['a'] = 'one'
        a.evaluate('(key)=>caches.open(key).then(c=>c.delete(new URL("./adapter.js",location.href).href))', cache_key('a', 'two'))
        check(a.evaluate('fetch("./adapter.js").then(r=>r.status)') == 503, 'Eviction silently mixed a mismatched server code')
        passed('evicted-code-rejects-mismatched-server-release')
        broken = new_page(context); broken.goto(base + '/apps/broken/index.html'); ready(broken)
        wait_for_export(broken, 'globalThis.vb6OfflineStatus?.phase === "error"')
        check(broken.evaluate('vb6OfflineReady.then(()=>false,()=>true)'), 'Failed installation promise falsely resolved')
        check(cache_key('broken', 'one') not in broken.evaluate('caches.keys()'), 'Partial release was left cached')
        passed('corrupt-upload-fails-install-with-no-partial-cache')
        state['corrupt'] = False; broken.reload(); ready(broken); installed(broken)
        passed('repaired-upload-installs-on-explicit-page-reload')
        failed = new_page(context); failed.goto(base + '/apps/failed/index.html'); ready(failed, 'error')
        wait_for_export(failed, 'globalThis.vb6OfflineStatus?.phase === "error"')
        check(failed.evaluate('navigator.serviceWorker.getRegistration().then(r=>!r)'), 'Failed application installed an offline worker')
        passed('failed-startup-never-registers-broken-application')
        local = new_page(context); local.goto((REPORT / 'fixtures/one/index.html').as_uri()); ready(local)
        wait_for_export(local, 'globalThis.vb6OfflineStatus?.phase === "unavailable"')
        passed('file-origin-runs-normally-without-offline-registration')
        local.close()
        # Independent menu download, ZIP metadata/byte verification and Node parity.
        ide = new_page(context); ide.goto(base + '/dist/index.html')
        wait_for_export(ide, 'Boolean(globalThis.vb6Studio?.applicationExportInstalled)')
        source = json.loads((ROOT / 'examples/calculator.vb6web').read_text())
        ide.evaluate('project=>vb6Studio.loadProject(project)', source)
        expected = ide.evaluate('vb6Studio.project')
        large = ide.evaluate('''async()=>{
          const result = await VB6StudioAPI.exportApplicationBundle(vb6Studio.project, {}, {}, {assets:{'large.bin':{base64:btoa('x'.repeat(4000000))}}});
          return {length:result.files['large.bin'].length, verified:(await VB6StudioAPI.verifyApplicationBundle(result.files)).valid};
        }''')
        check(large == {'length': 4000000, 'verified': True}, 'Large binary asset packaging/verification failed')
        passed('four-megabyte-browser-asset-packaging-and-verification')
        ide.locator('[data-menu="File"]').click()
        with ide.expect_download() as download_event:
            ide.get_by_role('menuitem', name='Make Offline Application (.zip)…', exact=True).click()
        download = download_event.value; check(download.failure() is None, 'Offline ZIP download failed')
        archive = REPORT / 'offline-download.zip'; download.save_as(archive)
        destination = REPORT / 'download'; destination.mkdir(exist_ok=True)
        with zipfile.ZipFile(archive) as z:
            check(z.testzip() is None, 'Downloaded ZIP CRC mismatch')
            check(all(i.date_time == (1980,1,1,0,0,0) for i in z.infolist()), 'ZIP contains nondeterministic dates')
            check(z.namelist() == sorted(z.namelist()), 'ZIP file order is not deterministic')
            manifest = json.loads(z.read('manifest.json'))
            for item in manifest['files']:
                data = z.read(item['path'])
                check(len(data) == item['bytes'] and hashlib.sha256(data).hexdigest() == item['sha256'], 'Actual downloaded file fingerprint mismatch')
            check(hashlib.sha256(json.dumps(manifest['files'], separators=(',', ':'), ensure_ascii=False).encode()).hexdigest() == manifest['buildId'], 'Independent build identifier differs')
            z.extractall(destination)
        expected_file = REPORT / 'download-project.vb6web'; expected_file.write_text(json.dumps(expected))
        comparison = REPORT / 'node-comparison.zip'
        subprocess.run(['node', 'tools/export-application.mjs', str(expected_file), '--format', 'zip', '--offline', '--out', str(comparison)], cwd=ROOT, check=True)
        check(archive.read_bytes() == comparison.read_bytes(), 'Node and actual browser exporter bytes differ')
        check(ide.evaluate('vb6Studio.lastApplicationExport.buildId') == manifest['buildId'], 'IDE did not retain release identity')
        passed('actual-IDE-offline-download-byte-identical-to-Node', buildId=manifest['buildId'], zipSha256=hashlib.sha256(archive.read_bytes()).hexdigest())
        deployed = new_page(context); deployed.goto(base + '/download/index.html'); ready(deployed); installed(deployed)
        deployed.reload(); ready(deployed)
        context.set_offline(True); deployed.reload(); ready(deployed); calculator(deployed)
        deployed.screenshot(path=str(REPORT / 'offline-calculator.png'))
        passed('exact-IDE-download-reopened-and-used-offline')
        check(not errors, 'Uncaught browser errors: ' + repr(errors))
        passed('zero-uncaught-page-errors')
        context.close(); browser.close()
except Exception as error:
    results.append({'case': 'execution', 'passed': False, 'error': str(error)})
    raise
finally:
    server.shutdown()
    (REPORT / 'results.json').write_text(json.dumps({'browser': ENGINE, 'realOrigins': True, 'pageErrors': errors, 'results': results}, indent=2) + '\n')
    if os.environ.get('GITHUB_ACTIONS'):
        shutil.rmtree(REPORT / 'fixtures', ignore_errors=True)
        shutil.rmtree(REPORT / 'download', ignore_errors=True)
        (REPORT / 'node-comparison.zip').unlink(missing_ok=True)
print(json.dumps({'browser': ENGINE, 'passed': len(results)}))
