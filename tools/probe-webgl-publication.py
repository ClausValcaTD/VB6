#!/usr/bin/env python3
"""Diagnostic matrix only: never changes the strict Figma acceptance verdict."""
import importlib.util,io,json
from pathlib import Path
from PIL import Image
spec=importlib.util.spec_from_file_location('figma_probe_base',Path(__file__).with_name('figma-browser-tests.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]; report=root/'reports/webgl-publication-probe';report.mkdir(parents=True,exist_ok=True)
variants={
 'control':'',
 'preserved':'''const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,attrs){return get.call(this,type,type==='webgl2'?{...attrs,preserveDrawingBuffer:true}:attrs);};''',
 'finish':'''const flush=WebGL2RenderingContext.prototype.flush;WebGL2RenderingContext.prototype.flush=function(){flush.call(this);this.finish();};''',
 'no-containment':'',
 'promoted':'',
 'fence':'''const flush=WebGL2RenderingContext.prototype.flush;WebGL2RenderingContext.prototype.flush=function(){const s=this.fenceSync(this.SYNC_GPU_COMMANDS_COMPLETE,0);flush.call(this);window.probeGPUReady=new Promise((resolve,reject)=>{let ticks=0;const check=()=>{const state=this.clientWaitSync(s,0,0);if(state===this.TIMEOUT_EXPIRED&&ticks++<120){requestAnimationFrame(check);return;}this.deleteSync(s);if(state===this.WAIT_FAILED||state===this.TIMEOUT_EXPIRED)reject(new Error('Fence did not signal'));else resolve();};requestAnimationFrame(check);});};''',
}
results=[]
with sync_playwright() as pw:
 browser=getattr(pw,base.ENGINE).launch(headless=True)
 for variant,script in variants.items():
  context=browser.new_context(viewport={'width':1600,'height':1050},color_scheme='light');context.add_init_script(script)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto((root/'dist/VB6-Studio-Web.html').as_uri());page.wait_for_function('globalThis.vb6Studio?.figmaMode');page.evaluate(base.FIXTURE,True)
   page.evaluate('vb6Studio.rendering.ready')
   if variant=='no-containment':page.evaluate('vb6Studio.rendering.canvas.style.contain="none"')
   if variant=='promoted':page.evaluate('vb6Studio.rendering.canvas.style.transform="translateZ(0)"')
   page.evaluate('vb6Studio.figmaMode.configure({mode:"figma",scheme:"light"})');page.evaluate('vb6Studio.designer.select(["frame"])');page.evaluate('vb6Studio.figmaMode.presentationReady')
   for index,scheme in enumerate(['light','dark','light','dark','light','dark']):
    page.evaluate('scheme=>vb6Studio.figmaMode.configure({mode:"figma",scheme})',scheme)
    if variant=='fence':page.evaluate('Promise.resolve(window.probeGPUReady).then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))')
    points=page.evaluate('''()=>Object.fromEntries([['header','.figma-header',.5,.5],['layers','.figma-layer-tree',.5,.9],['canvas','.designer-scroll[data-figma-viewport]',.02,.02]].map(([name,selector,x,y])=>{const r=document.querySelector(selector).getBoundingClientRect();return [name,[r.x+x*r.width,r.y+y*r.height]];}))''')
    label=f'{variant}-{index}-{scheme}';png=page.screenshot(path=str(report/(label+'.png')),timeout=10000);image=Image.open(io.BytesIO(png)).convert('RGB')
    actual={name:list(image.getpixel((int(p[0]),int(p[1])))) for name,p in points.items()};panel=[44]*3 if scheme=='dark' else [255]*3;canvas=[30]*3 if scheme=='dark' else [245]*3
    result={'variant':variant,'scheme':scheme,'index':index,'actual':actual,'pass':actual=={'header':panel,'layers':panel,'canvas':canvas},'renderer':page.evaluate('vb6Studio.rendering.getStats()'),'errors':errors[:]};results.append(result);print(json.dumps({k:v for k,v in result.items() if k!='renderer'}),flush=True)
  except Exception as error:results.append({'variant':variant,'failure':str(error),'errors':errors});print(variant,str(error),flush=True)
  finally:context.close();(report/'results.json').write_text(json.dumps(results,indent=2))
 browser.close()
