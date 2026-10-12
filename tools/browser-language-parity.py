#!/usr/bin/env python3
"""Exercise compiler changes in the shipped runtime and actual IDE bundles.
No server or external requests. Run npm run build before this test.
"""
from __future__ import annotations
import json, os, shutil, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

def main():
    fixtures=json.loads(subprocess.check_output(['node',str(ROOT/'tools/language-browser-fixtures.mjs')],text=True))
    results=[]
    with sync_playwright() as p:
        executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
        kwargs={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
        if executable: kwargs['executable_path']=executable
        browser=p.chromium.launch(**kwargs)
        for mode in ['runtime','ide']:
            page=browser.new_page(viewport={'width':1280,'height':900})
            page.set_default_timeout(6000)
            errors=[];requests=[]
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.route('**/*',lambda route:(requests.append(route.request.url),route.abort()))
            if mode=='runtime':
                page.set_content('<!doctype html><title>VB6 language validation</title>')
                page.add_script_tag(content=(ROOT/'dist/vb6-runtime.js').read_text())
            else:
                page.set_content((ROOT/'dist/VB6-Studio-Web.html').read_text())
                page.wait_for_function('typeof vb6Studio !== "undefined"')
            for fixture in fixtures:
                start=time.perf_counter()
                try:
                    if mode=='runtime':
                        result=page.evaluate('''async project=>{
                          const api=VB6Runtime.RuntimeAPI,p=api.compileProject(project),output=[];
                          if(p.diagnostics.length)throw new Error(JSON.stringify(p.diagnostics));
                          const vm=new api.VirtualMachine(p,{print:s=>output.push(s)});await vm.start();
                          return {output,error:vm.lastError?.number??null};
                        }''',fixture['project'])
                    else:
                        # Compile/run the actual IDE project, not a second copy
                        # of the VM imported directly by this test harness.
                        page.evaluate('p=>vb6Studio.loadProject(p)',fixture['project'])
                        page.locator('[data-command="run"]').first.click()
                        page.wait_for_function('vb6Studio.runState !== "design"')
                        page.wait_for_function("vb6Studio.statusMessage.textContent.includes('startup instructions')")
                        frame=next((f for f in page.frames[1:] if f.evaluate('typeof vb6Application !== "undefined"')),None)
                        if frame is None: raise AssertionError('IDE runtime frame did not start')
                        result=frame.evaluate('''()=>({error:vb6Application.vm.lastError?.number??null})''')
                        # IDE debug output is forwarded to its Output tool.
                        result['output']=page.evaluate('vb6Studio.output')
                        page.locator('[data-command="stop"]').first.click()
                        page.wait_for_function('vb6Studio.runState === "design"')
                    if result['output']!=fixture['expected']: raise AssertionError(repr(result))
                    if result['error']!=fixture['error']: raise AssertionError(repr(result))
                    if errors or requests: raise AssertionError(repr({'errors':errors,'requests':requests}))
                    results.append({'name':mode+': '+fixture['name'],'passed':True,'milliseconds':round((time.perf_counter()-start)*1000,2)})
                except Exception as error:
                    results.append({'name':mode+': '+fixture['name'],'passed':False,'error':str(error)})
                print(('PASS' if results[-1]['passed'] else 'FAIL')+' '+results[-1]['name'],flush=True)
            page.close()
        version=browser.version;browser.close()
    report={'browser':version,'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'tests':results}
    (ROOT/'reports').mkdir(exist_ok=True);(ROOT/'reports/browser-language-parity.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2));return int(report['failed']!=0)
if __name__=='__main__': sys.exit(main())
