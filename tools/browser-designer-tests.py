#!/usr/bin/env python3
"""Real browser regression of issue #116 and built-in designer editing.

The inline mode runs the actual generated IDE without network access. HTTP mode
loads the normal split-script IDE from a local server. No policy, CSP, or browser
security settings are relaxed. Native Microsoft VB6 pixel parity is not asserted.
"""
from __future__ import annotations
import argparse, functools, http.server, json, os, shutil, subprocess, threading, time, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--browser', choices=['chromium', 'firefox', 'webkit'], default=os.environ.get('VB6_BROWSER', 'chromium'))
parser.add_argument('--case', default='', help='Run only case names containing this text (local diagnosis).')
parser.add_argument('--origin', choices=['inline', 'http'], default='inline')
args = parser.parse_args()
OUT = ROOT / 'reports/designer' / args.browser / args.origin
OUT.mkdir(parents=True, exist_ok=True)
HTML = (ROOT / 'dist/VB6-Studio-Web.html').read_text()
ENTRIES = [[name, (ROOT / 'tests/fixtures/designer-tabs' / name).read_text()] for name in ['DesignerTabs.vbp', 'Main.frm']]
RESULTS, ERRORS = [], []
server = None
if args.origin == 'http':
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_): pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    URL = f'http://127.0.0.1:{server.server_port}/dist/index.html'

def check(value, message='Assertion failed'):
    if not value: raise AssertionError(message)

def case(name, fn):
    if args.case and args.case.lower() not in name.lower(): return
    start = time.perf_counter()
    try:
        detail = fn(); RESULTS.append({'name': name, 'passed': True, 'detail': detail, 'ms': round((time.perf_counter()-start)*1000, 2)})
        print('PASS', name, flush=True)
    except Exception as e:
        RESULTS.append({'name': name, 'passed': False, 'error': str(e), 'traceback': traceback.format_exc()})
        print('FAIL', name, str(e), flush=True); traceback.print_exc(limit=3)
    finally:
        for context in list(browser.contexts): context.close()

def studio():
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.set_default_timeout(12000)
    page.on('pageerror', lambda e: ERRORS.append(str(e)))
    if args.origin == 'http': page.goto(URL)
    else: page.set_content(HTML)
    page.wait_for_function('globalThis.vb6Studio')
    page.evaluate('async()=>{await vb6Studio.setRenderingPolicy({backend:"html"});}')
    return page

def load_fixture(page):
    return page.evaluate('''async entries=>{const p=(await VB6StudioAPI.importFiles(new Map(entries))).project;p.settings.renderer='canvas2d';vb6Studio.loadProject(p);return vb6Studio.activeModule.form.controls.map(c=>({id:c.id,name:c.name,index:c.properties.Index}))}''', ENTRIES)

def tab(page, n): return page.locator(f'.designer-form [data-designer-tab="{n}"]')
def model(page): return page.evaluate('JSON.stringify(vb6Studio.activeModule.form)')
def history(page): return page.evaluate('vb6Studio.history.undoStack.length')
def select_type(page, kind):
    page.evaluate('type=>{const c=vb6Studio.activeModule.form.controls.find(c=>c.type===type);vb6Studio.designer.select([c.id])}', kind)

def collection_project(page, kind):
    page.evaluate('''type=>{const a=VB6StudioAPI,p=a.newProject('Collections');p.settings.renderer='canvas2d';const c=a.createControl(type,'Control1',450,450);p.modules[0].form.controls=[c];vb6Studio.loadProject(p);vb6Studio.designer.select([c.id]);}''', kind)

def open_collection(page, name):
    page.locator(f'.property-row[data-property="{name}"] .property-name').click()
    page.get_by_role('button', name='Edit '+name, exact=True).click()

def ok_dialog(page): page.get_by_role('dialog').last.get_by_role('button', name='OK', exact=True).click()
def cancel_dialog(page): page.get_by_role('dialog').last.get_by_role('button', name='Cancel', exact=True).click()

try:
    with sync_playwright() as pw:
        engine = getattr(pw, args.browser)
        options = {'headless': True}
        if args.browser == 'chromium': options.update(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or engine.executable_path, args=['--no-sandbox'])
        browser = engine.launch(**options)
        version = browser.version

        def initial():
            page=studio();load_fixture(page);before=model(page)
            tab(page,0).click();select_type(page,'SSTab');page.evaluate('vb6Studio.inspector.render()')
            check(model(page)==before, 'Opening/selecting/rendering modified the form');check(history(page)==0)
            expect(tab(page,0).locator('span')).to_have_text('General');expect(tab(page,0)).to_have_attribute('aria-label','General')
            return {'tabs':page.locator('[data-designer-tab]').count(), 'noOpHistory':history(page)}
        case('Read-only import, selection and inspector preserve native page records', initial)

        def page_switch():
            page=studio();load_fixture(page);tab(page,1).click()
            result=page.evaluate('''()=>{const d=vb6Studio.designer;return {page:d.module.form.controls[0].properties.Tab,caption:vb6Studio.inspector.fields.get('Caption').value,selection:d.selected()[0].name,children:d.formView.controls.filter(c=>!c.node.closest('[hidden]')).map(c=>c.model.name)}}''')
            check(result=={'page':1,'caption':'Details','selection':'Pages','children':['Pages','Text1','Group1','Check1']},result)
            check(history(page)==1);page.evaluate("vb6Studio.command('undo')");check(page.evaluate('vb6Studio.activeModule.form.controls[0].properties.Tab')==0)
            page.evaluate("vb6Studio.command('redo')");check(page.evaluate('vb6Studio.activeModule.form.controls[0].properties.Tab')==1)
            check(page.locator('.selection-outline').count()==1)
            page.screenshot(path=str(OUT/'sstab-details.png'));return result
        case('Real tab click persists, masks nested pages, and undoes/redoes once', page_switch)

        def reveal():
            page=studio();controls=load_fixture(page);child=next(c for c in controls if c['name']=='Text1' and c.get('index')==1)
            page.get_by_role('combobox',name='Selected object',exact=True).select_option(child['id'])
            check(page.evaluate('vb6Studio.activeModule.form.controls[0].properties.Tab')==1)
            expect(page.locator('input[data-property="Left"]')).to_have_value('300')
            page.locator('input[data-property="Left"]').fill('750');page.locator('input[data-property="Left"]').press('Enter')
            result=page.evaluate('''async()=>{const files=VB6StudioAPI.sourceFiles(vb6Studio.project),p=(await VB6StudioAPI.importFiles(new Map(Object.entries(files)))).project;const f=p.modules[0].form,c=f.controls.find(c=>c.name==='Text1'&&c.properties.Index===1);return {tab:f.controls[0].properties.Tab,left:c.properties.Left,other:f.controls.find(c=>c.name==='Text1'&&c.properties.Index===0).properties.Left}}''')
            check(result=={'tab':1,'left':750,'other':-74700},result);return result
        case('Object selector reveals an inactive array child and edits round-trip through FRM', reveal)

        def keyboard_tabs():
            page=studio();load_fixture(page);tab(page,0).click();page.locator('.designer-scroll').press('Control+PageDown')
            check(page.evaluate('vb6Studio.activeModule.form.controls[0].properties.Tab')==1)
            page.keyboard.press('End');check(page.evaluate('vb6Studio.activeModule.form.controls[0].properties.Tab')==2)
            page.keyboard.press('Home');check(page.evaluate('vb6Studio.activeModule.form.controls[0].properties.Tab')==0)
            page.locator('.designer-scroll').press('Control+a')
            names=page.evaluate('vb6Studio.designer.selected().map(c=>c.name)');check(names==['Pages','Text1'],names)
        case('Designer keyboard page navigation and Select All exclude inactive pages', keyboard_tabs)

        def draw_page():
            page=studio();load_fixture(page);tab(page,1).click();page.evaluate("vb6Studio.designer.setTool('CommandButton')")
            box=page.locator('.designer-form [data-type="SSTab"]').bounding_box();x,y=box['x']+320,box['y']+230
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+115,y+35,steps=4);page.mouse.up()
            result=page.evaluate('''()=>{const c=vb6Studio.designer.selected()[0];return {type:c.type,parent:c.parent,page:c.properties.TabPage,hasParent:!!c.nativeParentId,objects:[...vb6Studio.inspector.object.options].some(o=>o.value===c.id)}}''')
            check(result=={'type':'CommandButton','parent':'Pages','page':1,'hasParent':True,'objects':True},result)
            check(history(page)==2);page.evaluate("vb6Studio.command('undo')");check(page.evaluate('vb6Studio.activeModule.form.controls.length')==6)
            page.evaluate("vb6Studio.command('redo')");check(page.evaluate('vb6Studio.activeModule.form.controls.length')==7)
            tab(page,0).click();check(page.locator('.designer-form [data-type="CommandButton"]').is_hidden());return result
        case('Drawing inside a page records exact container/page ownership with one undo', draw_page)

        def disabled_and_timer():
            page=studio();load_fixture(page);tab(page,1).click();node=page.locator('.designer-form [data-control="Check1"]');node.click()
            check(page.evaluate('vb6Studio.designer.selected()[0].name')=='Check1');check(page.evaluate('vb6Studio.designer.selected()[0].properties.Value')==0)
            page.keyboard.press('Space');check(page.evaluate('vb6Studio.designer.selected()[0].properties.Value')==0)
            tab(page,2).click();page.locator('.designer-form [data-type="Timer"]').click()
            check(page.evaluate('vb6Studio.designer.selected()[0].type')=='Timer');check(page.locator('.selection-handle').count()==0)
            check(page.locator('input[data-property="Width"]').is_disabled());check(page.locator('[data-property="TabIndex"]').count()==0)
        case('Disabled widgets and Timer select without runtime side effects or invalid resize handles', disabled_and_timer)

        def pointer_cancel():
            page=studio();load_fixture(page);tab(page,1).click();node=page.locator('.designer-form [data-control="Group1"]');node.click(position={'x':10,'y':8})
            page.evaluate("vb6Studio.designer.select(vb6Studio.activeModule.form.controls.filter(c=>['Group1','Check1'].includes(c.name)).map(c=>c.id))")
            before=model(page);undo=history(page);box=node.bounding_box();x,y=box['x']+10,box['y']+8
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+34,y+24,steps=4);check(model(page)!=before)
            page.keyboard.press('Escape');page.mouse.up();check(model(page)==before);check(history(page)==undo)
            page.locator('.designer-scroll').press('ArrowRight');result=page.evaluate('''()=>vb6Studio.activeModule.form.controls.filter(c=>['Group1','Check1'].includes(c.name)).map(c=>({name:c.name,left:c.properties.Left}))''')
            check(result==[{'name':'Group1','left':720},{'name':'Check1','left':300}],result);return result
        case('Escape cancels live drag; parent-plus-child selection moves only the parent', pointer_cancel)

        def copy_container():
            page=studio();load_fixture(page);tab(page,1).click();select_type(page,'Frame')
            page.locator('.designer-scroll').press('Control+c');page.locator('.designer-scroll').press('Control+v')
            result=page.evaluate('''()=>{const f=vb6Studio.activeModule.form,g=vb6Studio.designer.selected()[0],c=f.controls.find(c=>c.nativeParentId===g.id);return {root:g.name,parent:g.parent,page:g.properties.TabPage,child:c.name,childParent:c.parent,left:c.properties.Left,count:f.controls.length}}''')
            check(result['parent']=='Pages' and result['page']==1 and result['childParent']==result['root'] and result['left']==300 and result['count']==8,result)
            page.keyboard.press('Delete');check(page.evaluate('vb6Studio.activeModule.form.controls.length')==6)
            page.evaluate("vb6Studio.command('undo')");check(page.evaluate('vb6Studio.activeModule.form.controls.length')==8);return result
        case('Nested container clipboard remaps identities and deletion keeps one undo', copy_container)

        def all_controls():
            page=studio();types=page.evaluate("Object.keys(VB6StudioAPI.EXAMPLES).length") # ensure real API initialized
            # Authoritative toolbox inventory, excluding only its Pointer tool.
            types=page.evaluate("()=>{vb6Studio.toolboxMode='all';vb6Studio.renderToolbox();return [...vb6Studio.toolboxGrid.querySelectorAll('[data-control-type]')].map(n=>n.dataset.controlType).filter(t=>t!=='Pointer')}")
            checked=[]
            for kind in types:
                collection_project(page,kind)
                page.evaluate('vb6Studio.designer.select([])')
                node=page.locator('.designer-form [data-control="Control1"]');box=node.bounding_box();node.click(position={'x':min(6,box['width']/2),'y':min(6,box['height']/2)})
                result=page.evaluate('''()=>({type:vb6Studio.designer.selected()[0]?.type,readonly:vb6Studio.inspector.fields.get('Height')?.disabled,handles:document.querySelectorAll('.selection-handle').length})''')
                check(result['type']==kind,{'expected':kind,**result});checked.append(kind)
                before=page.evaluate('vb6Studio.designer.selected()[0].properties.Left');page.locator('.designer-scroll').press('Control+ArrowRight')
                check(page.evaluate('vb6Studio.designer.selected()[0].properties.Left')==before+15,kind)
            check(len(checked)>=40,len(checked));return {'count':len(checked),'controls':checked,'scope':'Selection and keyboard geometry, not complete runtime or third-party OCX equivalence.'}
        case('Every built-in toolbox control supports real click selection and keyboard positioning', all_controls)

        def pages_dialog():
            page=studio();load_fixture(page);tab(page,1).click();page.get_by_role('button',name='Property Pages…',exact=True).click()
            before=model(page);page.get_by_label('Page caption',exact=True).fill('Not applied');cancel_dialog(page);check(model(page)==before)
            page.get_by_role('button',name='Property Pages…',exact=True).click();page.get_by_label('Page caption',exact=True).fill('Customer details')
            page.get_by_label('Number of tabs',exact=True).fill('4');page.get_by_role('button',name='Apply tab count to preview').click()
            page.get_by_label('SSTab pages',exact=True).select_option('3');page.get_by_label('Page caption',exact=True).fill('New page')
            page.get_by_label('Page enabled',exact=True).uncheck();page.get_by_label('Page visible',exact=True).uncheck();ok_dialog(page)
            check(page.evaluate('vb6Studio.activeModule.form.controls[0].properties.Tab')==3);expect(tab(page,3).locator('span')).to_have_text('New page');expect(tab(page,3)).to_have_attribute('aria-label','New page');check(not tab(page,3).is_disabled())
            check(page.locator('input[data-property="Tabs"]').input_value()=='4');check(history(page)==2)
            page.screenshot(path=str(OUT/'sstab-page-properties.png'))
        case('Built-in property pages edit count/captions/flags atomically and Cancel is inert', pages_dialog)

        def reject_remove():
            page=studio();load_fixture(page);tab(page,0).click();before=model(page)
            page.get_by_role('button',name='Property Pages…',exact=True).click();page.get_by_label('Number of tabs').fill('1');ok_dialog(page)
            expect(page.get_by_role('dialog').last).to_contain_text('Remove or move controls');check(model(page)==before)
            ok_dialog(page);cancel_dialog(page);check(history(page)==0)
        case('Removing nonempty tab pages is rejected without data loss or history', reject_remove)

        def orientations():
            page=studio();load_fixture(page);tab(page,0).click();out=[]
            for direction in range(4):
                page.evaluate('n=>vb6Studio.setProperty("TabOrientation",n)',direction)
                for zoom in [0.5,1,1.5,2]:
                    page.evaluate('n=>vb6Studio.designer.setZoom(n)',zoom)
                    for n in [1,2,0]: tab(page,n).click();check(page.evaluate('vb6Studio.activeModule.form.controls[0].properties.Tab')==n)
                out.append(direction)
            return {'orientations':out,'zooms':[0.5,1,1.5,2]}
        case('Tab hit targets stay correct across four orientations and four zoom levels', orientations)

        def tree_dialog():
            page=studio();collection_project(page,'TreeView');open_collection(page,'Nodes')
            page.get_by_role('button',name='Add Nodes item').click();page.get_by_label('Key',exact=True).fill('root');page.get_by_label('Text',exact=True).fill('Root')
            page.get_by_role('button',name='Add Nodes item').click();page.get_by_label('Key',exact=True).fill('child');page.get_by_label('Text',exact=True).fill('Child');page.get_by_label('Parent',exact=True).fill('root')
            page.get_by_role('button',name='Move Up Nodes item').click();ok_dialog(page)
            values=page.evaluate('vb6Studio.designer.selected()[0].properties.Nodes');check([n['Key'] for n in values]==['child','root'],values)
            rows=page.locator('.designer-form .vb-tree-row').all_text_contents();check(any('Root' in t for t in rows) and any('Child' in t for t in rows),rows)
            before=model(page);open_collection(page,'Nodes');page.get_by_role('button',name='Remove Nodes item').click();cancel_dialog(page);check(model(page)==before)
            page.screenshot(path=str(OUT/'treeview-collection.png'));return values
        case('TreeView collection editor handles forward parent references, reorder and Cancel', tree_dialog)

        def collections():
            page=studio();out=[]
            for kind,name,field in [('ListView','Columns','Text'),('ListView','Items','Text'),('Toolbar','Buttons','Caption'),('StatusBar','Panels','Text'),('TabStrip','Tabs','Caption'),('ImageList','ListImages','Key')]:
                collection_project(page,kind);open_collection(page,name);page.get_by_role('button',name='Add '+name+' item').click();page.get_by_label(field,exact=True).fill('Designed '+name);ok_dialog(page)
                value=page.evaluate('name=>vb6Studio.designer.selected()[0].properties[name]',name);check(isinstance(value,list),{'kind':kind,'property':name,'value':value,'dialogs':page.get_by_role('dialog').all_text_contents()});check(any(item[field]=='Designed '+name for item in value),value);out.append(kind+'.'+name)
            for kind in ['MSFlexGrid','MSHFlexGrid','DataGrid','MSChart']:
                collection_project(page,kind);open_collection(page,'GridData');page.get_by_label('Grid data',exact=True).fill('10\t20\n30\t40');ok_dialog(page)
                value=page.evaluate('vb6Studio.designer.selected()[0].properties.GridData');check(value==([[10,20],[30,40]] if kind=='MSChart' else [['10','20'],['30','40']]),value);out.append(kind+'.GridData')
            return out
        case('ListView, toolbar, status, tab, image and grid/chart collection editors apply typed data', collections)

        def stale_dialog():
            page=studio();collection_project(page,'Toolbar');before=model(page);open_collection(page,'Buttons');page.get_by_role('button',name='Add Buttons item').click();page.get_by_label('Caption',exact=True).fill('Stale')
            page.evaluate('vb6Studio.activeModule.form.properties.Tag="Concurrent edit"');ok_dialog(page)
            expect(page.get_by_role('dialog').last).to_contain_text('changed while the editor was open');ok_dialog(page)
            check(page.evaluate('vb6Studio.activeModule.form.properties.Tag')=='Concurrent edit');check(page.evaluate('vb6Studio.designer.selected()[0].properties.Buttons??null') is None)
        case('A stale collection dialog cannot overwrite concurrent designer edits', stale_dialog)

        def runtime():
            page=studio();load_fixture(page);tab(page,1).click();source=page.evaluate('VB6StudioAPI.exportApplication(vb6Studio.project)')
            app=browser.new_page(viewport={'width':1100,'height':850});app.on('pageerror',lambda e:ERRORS.append(str(e)));app.set_content(source);app.wait_for_function('globalThis.vb6Application?.forms[0]')
            header=app.locator('[data-type="SSTab"] [role="tab"]')
            expect(app.locator('[data-control="Text1"] input').nth(1)).to_be_visible();expect(app.locator('[data-control="Text1"] input').nth(0)).to_be_hidden()
            header.nth(0).click();expect(app.locator('[data-control="Text1"] input').nth(0)).to_be_visible();expect(app.locator('[data-control="Text1"] input').nth(1)).to_be_hidden()
            result=app.evaluate('''()=>{const f=vb6Application.forms[0],t=f.controls.find(c=>c.type==='SSTab'),children=f.controls.filter(c=>c.model.name==='Text1');t.setIndexed('TabCaption',[1],'Runtime details');t.set('Tab',1);children[1].Visible=0;children[1].refresh();t.Tab=0;t.Tab=1;return {tab:t.Tab,caption:t.TabCaption(1),hidden:children[1].node.hidden,left:children[1].Left,tabs:t.Tabs}}''')
            check(result=={'tab':1,'caption':'Runtime details','hidden':True,'left':300,'tabs':3},result)
            check(app.evaluate("vb6Application.vm.state!=='error'"));app.screenshot(path=str(OUT/'sstab-exported-runtime.png'));return result
        case('Exported runtime preserves pages, indexed captions, Visible and logical coordinates', runtime)

        def runtime_app(page):
            source=page.evaluate('VB6StudioAPI.exportApplication(vb6Studio.project)')
            app=browser.new_page(viewport={'width':1100,'height':850});app.on('pageerror',lambda e:ERRORS.append(str(e)))
            app.set_content(source);app.wait_for_function('globalThis.vb6Application?.forms[0]')
            return app

        def dynamic_pages():
            page=studio();load_fixture(page);tab(page,1).click();app=runtime_app(page)
            result=app.evaluate('''()=>{
                const f=vb6Application.forms[0],t=f.controls.find(c=>c.type==='SSTab');
                const c=f.Controls.Add('VB.TextBox','DynamicText',t);c.Visible=-1;c.refresh();
                const attached=c.node.parentNode===t.childHost&&c.props.TabPage===1&&c._tabOwner===t;
                t.Tab=0;const hidden=c.node.hidden;t.Tab=1;const shown=!c.node.hidden;
                f.Controls.Remove(c);const detached=!(t._pageChildren||[]).includes(c)&&c.disposed;
                const newTab=f.Controls.Add('SSTab','DynamicTab');newTab.Visible=-1;newTab.Tab=2;
                const added=f.Controls.Add('VB.TextBox','ChildOnLastPage',newTab);added.Visible=-1;added.refresh();
                let rejected=false;try{newTab.Tabs=2;}catch(e){rejected=e.number===380;}
                const unchanged=newTab.Tabs===3&&added._tabPage===2;
                f.Controls.Remove(added);newTab.Tabs=2;
                return {attached,hidden,shown,detached,rejected,unchanged,count:newTab.Tabs};
            }''')
            check(result=={'attached':True,'hidden':True,'shown':True,'detached':True,'rejected':True,'unchanged':True,'count':2},result)
            return result
        case('Runtime dynamic SSTab children follow pages and prevent destructive page removal', dynamic_pages)

        def indexed_containers():
            page=studio()
            page.evaluate('''()=>{
                const a=VB6StudioAPI,p=a.newProject('IndexedContainers'),f=p.modules[0].form;
                p.settings.renderer='canvas2d';p.settings.anchoring=true;
                const first=a.createControl('Frame','Frame1'),second=a.createControl('Frame','Frame1'),child=a.createControl('Label','SiblingLabel');
                first.properties.Index=0;second.properties.Index=1;second.properties.Left=3900;
                child.parent=second.name;child.nativeParentId=second.id;f.controls=[first,second,child];vb6Studio.loadProject(p);
            }''')
            app=runtime_app(page)
            result=app.evaluate('''()=>{
                const f=vb6Application.forms[0],arr=f.controlMap.get('frame1'),second=arr.Item(1),sibling=f.controlMap.get('siblinglabel');
                const added=f.Controls.Add('VB.TextBox','SecondChild',second);
                const explicit=added.model.nativeParentId===second.model.id&&added.node.parentNode===second.childHost;
                const loaded=arr.Load(2),own=f.Controls.Add('VB.TextBox','LoadedChild',loaded);
                const loadedParent=own.node.parentNode===loaded.childHost&&own.model.nativeParentId===loaded.model.id;
                let removalError=null;try{arr.Unload(2);}catch(e){removalError=e.message;}
                return {explicit,loadedParent,removalError,count:arr.Count,originalSafe:!sibling.disposed&&sibling.node.parentNode===second.childHost,
                    ownDisposed:own.disposed,otherSafe:!added.disposed};
            }''')
            check(result=={'explicit':True,'loadedParent':True,'removalError':None,'count':2,'originalSafe':True,'ownDisposed':True,'otherSafe':True},result)
            return result
        case('Runtime indexed containers attach and unload only the exact array element', indexed_containers)

        def atomic_container_removal():
            page=studio()
            page.evaluate('''()=>{const a=VB6StudioAPI,p=a.newProject('AtomicRemove');p.settings.renderer='canvas2d';p.settings.anchoring=true;p.modules[0].form.controls=[a.createControl('TextBox','DesignTimeText')];vb6Studio.loadProject(p);}''')
            app=runtime_app(page)
            result=app.evaluate('''()=>{
                const f=vb6Application.forms[0],original=f.controlMap.get('designtimetext');
                const outer=f.Controls.Add('VB.Frame','DynamicOuter'),first=f.Controls.Add('VB.TextBox','DynamicFirst',outer),inner=f.Controls.Add('VB.Frame','DynamicInner',outer);
                original.Container=inner;const before=f.Controls.Count;let error=null;
                try{f.Controls.Remove(outer);}catch(e){error=e.number;}
                return {error,countStable:f.Controls.Count===before,allAlive:[outer,first,inner,original].every(c=>!c.disposed&&f.controls.includes(c)),
                    firstConnected:first.node.parentNode===outer.childHost,originalConnected:original.node.parentNode===inner.childHost};
            }''')
            check(result=={'error':365,'countStable':True,'allAlive':True,'firstConnected':True,'originalConnected':True},result)
            return result
        case('Runtime nested removal validates every descendant before disposing any control', atomic_container_removal)

        def reparent_imported_page():
            page=studio();load_fixture(page)
            page.evaluate('vb6Studio.project.settings.anchoring=true')
            before=model(page);app=runtime_app(page)
            result=app.evaluate('''()=>{
                const f=vb6Application.forms[0],t=f.controls.find(c=>c.type==='SSTab'),child=f.controlMap.get('text1').Item(1);
                const destination=f.Controls.Add('VB.Frame','Destination');destination.Visible=-1;
                child.Container=destination;let error=null;try{t.Tabs=4;}catch(e){error=e.message;}
                t.Tab=1;child.refresh();
                return {error,count:t.Tabs,parent:child.model.nativeParentId===destination.model.id,detached:!t._pageChildren.includes(child),
                    noPage:child.props.TabPage===undefined,logicalLeft:child.Left};
            }''')
            check(result=={'error':None,'count':4,'parent':True,'detached':True,'noPage':True,'logicalLeft':300},result)
            check(model(page)==before,'Runtime reparenting changed the designer source')
            return result
        case('Runtime reparenting removes stale imported page records without changing designer source', reparent_imported_page)

        def loaded_array_pages():
            page=studio();load_fixture(page)
            page.evaluate('''()=>{
                const m=vb6Studio.activeModule,f=m.form,t=f.controls.find(c=>c.type==='SSTab');
                t.properties.Index=0;m.code='Option Explicit\\n';
                const first=f.controls.find(c=>c.name==='Text1'&&c.properties.Index===1);
                f.controls=[first,...f.controls.filter(c=>c!==first)];
            }''')
            before=model(page);app=runtime_app(page)
            result=app.evaluate('''()=>{
                const f=vb6Application.forms[0],tabs=f.controlMap.get('pages'),original=tabs.Item(0),texts=f.controlMap.get('text1');
                const loaded=texts.Load(7);loaded.Visible=-1;loaded.refresh();
                const correct=loaded.Left===300&&loaded.props.TabPage===1&&loaded.node.parentNode===original.childHost,hidden=loaded.node.hidden;
                original.Tab=1;const shown=!loaded.node.hidden;
                const copy=tabs.Load(1);copy.Tabs=4;copy.Visible=-1;
                const added=f.Controls.Add('VB.TextBox','CopiedTabChild',copy);added.Visible=-1;added.refresh();
                const independent=copy._pageChildren.length===1&&copy._pageChildren[0]===added&&original._pageChildren.includes(loaded);
                tabs.Unload(1);texts.Unload(7);
                return {correct,hidden,shown,independent,originalSafe:!original.disposed&&original._pageChildren.every(c=>!c.disposed),tabs:tabs.Count,texts:texts.Count,childDisposed:added.disposed};
            }''')
            check(result=={'correct':True,'hidden':True,'shown':True,'independent':True,'originalSafe':True,'tabs':1,'texts':2,'childDisposed':True},result)
            check(model(page)==before,'Array loads changed designer source');return result
        case('Runtime loaded arrays normalize imported offsets and do not copy container child ownership', loaded_array_pages)

        def page_shortcuts():
            page=studio();load_fixture(page);tab(page,1).click()
            page.evaluate('''()=>{
                const a=VB6StudioAPI,m=vb6Studio.activeModule,t=m.form.controls.find(c=>c.type==='SSTab');m.code='Option Explicit\\n';
                for(const [name,n] of [['HiddenCommand',0],['VisibleCommand',1]]){
                    const c=a.createControl('CommandButton',name,300,3300);c.parent=t.name;c.nativeParentId=t.id;
                    Object.assign(c.properties,{TabPage:n,Caption:'&Go',Default:n===0?-1:0,Cancel:n===0?-1:0});m.form.controls.push(c);
                }
            }''')
            app=runtime_app(page)
            app.evaluate('''()=>{
                const f=vb6Application.forms[0];globalThis.shortcutCalls=[];
                for(const c of f.controls.filter(c=>c.type==='CommandButton'))c.event=name=>{if(name==='Click')shortcutCalls.push([c.model.name,name]);return Promise.resolve();};
                f.node.focus();
            }''')
            app.keyboard.press('Enter');app.keyboard.press('Escape')
            check(app.evaluate('shortcutCalls')==[],'Inactive page Default/Cancel received a shortcut: '+str(app.evaluate('shortcutCalls')))
            app.keyboard.press('Alt+g')
            check(app.evaluate('shortcutCalls')==[['VisibleCommand','Click']],app.evaluate('shortcutCalls'))
            check(app.evaluate("document.activeElement.closest('[data-control]')?.dataset.control")=='VisibleCommand','Mnemonic did not focus the active page control')
            app.evaluate('''()=>{shortcutCalls.length=0;const f=vb6Application.forms[0],c=f.controlMap.get('visiblecommand');c.Default=-1;c.Cancel=-1;f.node.focus();}''')
            app.keyboard.press('Enter');app.keyboard.press('Escape')
            check(app.evaluate('shortcutCalls')==[['VisibleCommand','Click'],['VisibleCommand','Click']],app.evaluate('shortcutCalls'))
            return {'hiddenDefaultCancelIgnored':True,'activeMnemonicSelected':True,'visibleDefaultCancel':2}
        case('Runtime shortcuts cannot activate default, cancel or mnemonic controls on hidden pages', page_shortcuts)

        def retained_tabs():
            page=studio();load_fixture(page)
            result=page.evaluate('''async()=>{
                const t=vb6Studio.designer.formView.controls.find(c=>c.type==='SSTab');
                await new Promise(requestAnimationFrame);t.refresh();
                const nodes=[...t.tabHeader.children],observer=new MutationObserver(()=>{});
                observer.observe(t.tabHeader,{subtree:true,attributes:true,childList:true,characterData:true});
                observer.observe(t.childHost,{attributes:true});
                for(let i=0;i<200;i++)t.refresh();
                const records=observer.takeRecords(),counts={};for(const record of records){const key=record.attributeName||record.type;counts[key]=(counts[key]||0)+1;}
                const stable=nodes.every((node,i)=>node===t.tabHeader.children[i]);observer.disconnect();
                t.set('Tab',1);const switched=t.tabHeader.children[1].getAttribute('aria-selected')==='true'&&nodes.every((node,i)=>node===t.tabHeader.children[i]);
                t.setIndexed('TabCaption',[1],'Changed caption');
                return {mutations:records.length,counts,stable,switched,caption:t.tabHeader.children[1].textContent,refreshes:200};
            }''')
            check(result['mutations']==0,result);check(result['stable'] and result['switched'] and result['caption']=='Changed caption',result)
            return result
        case('Tab presentation retains headers and performs zero unchanged subtree mutations', retained_tabs)

        def handler():
            page=studio();collection_project(page,'SSTab');page.evaluate("async()=>{await vb6Studio.ensureEvent('Control1','Click');}")
            check('Control1_Click(PreviousTab As Integer)' in page.evaluate('vb6Studio.activeModule.code'))
        case('Default-event creation uses the SSTab PreviousTab argument', handler)
        case('No uncaught browser script errors',lambda:check(not ERRORS,ERRORS))
        browser.close()
finally:
    if server: server.shutdown();server.server_close()
report={'browser':args.browser,'version':globals().get('version'),'origin':args.origin,'caseFilter':args.case or None,'completeSuite':not bool(args.case),'results':RESULTS,'errors':ERRORS,'summary':{'passed':sum(r['passed'] for r in RESULTS),'failed':sum(not r['passed'] for r in RESULTS)},'scope':'Actual generated IDE/runtime integration and built-in design-time selection/collection editing; not licensed VB6 differential or arbitrary OCX property-page certification.'}
(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report['summary']))
raise SystemExit(0 if RESULTS and all(r['passed'] for r in RESULTS) else 1)
