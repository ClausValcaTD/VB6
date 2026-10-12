import {el,clone} from '../core/core.js';
import {uiDocuments} from '../core/window-context.js';
import {showMenu,alertDialog} from './ui.js';
import {layoutEnabled} from '../layout/contract.js';
import {layoutEdit} from '../layout/authoring.js';
import {FIGMA_SETTINGS_KEY,normalizeFigmaSettings,loadFigmaSettings,saveFigmaSettings,figmaDockProfile} from './figma/model.js';
import {figmaIcon} from './figma/icons.js';
import {installFigmaViewport} from './figma/viewport.js';
import {createFigmaLayers} from './figma/layers.js';
import {createFigmaInspector} from './figma/inspector.js';
import {installFigmaOptions} from './figma/options.js';

export function installFigmaMode(ide){
  if(ide.figmaMode)return ide.figmaMode;
  const document=ide.root.ownerDocument,view=document.defaultView,media=view.matchMedia?.('(prefers-color-scheme: dark)'),profileKey=FIGMA_SETTINGS_KEY+'.layouts';
  let storage;try{storage=view.localStorage;}catch{}
  let profiles={};try{const text=storage?.getItem(profileKey);if(text&&text.length<200000){const value=JSON.parse(text);if(value&&typeof value==='object'&&!Array.isArray(value))profiles={classic:value.classic,figma:value.figma};}}catch{}
  const workspace={ide,settings:loadFigmaSettings(storage),enabled:false,switching:false,viewports:new Map(),ui:null,frame:0};ide.figmaMode=workspace;
  workspace.currentDesigner=()=>ide.activeModule?.form&&ide.activeDoc?.view==='form'&&ide.documents.mdi.active===ide.activeDoc.key&&ide.designer?.module===ide.activeModule?ide.designer:null;
  workspace.writable=()=>!!workspace.currentDesigner()&&ide.runState==='design'&&!ide.designer.locked;
  workspace.report=error=>{ide.status('Figma workspace: '+(error.message||error));};
  workspace.safe=fn=>{try{const value=fn();if(value?.catch)value.catch(error=>{workspace.report(error);alertDialog(error.message||String(error),'Figma workspace');});workspace.scheduleSync();return value;}catch(error){workspace.report(error);alertDialog(error.message||String(error),'Figma workspace');workspace.scheduleSync();}};
  workspace.scheduleSync=()=>{if(!workspace.enabled||workspace.switching||workspace.frame)return;workspace.frame=view.requestAnimationFrame(()=>{workspace.frame=0;workspace.sync();});};
  workspace.appearance=()=>{
    const scheme=workspace.settings.scheme==='system'?(media?.matches?'dark':'light'):workspace.settings.scheme;
    for(const doc of uiDocuments()){const root=doc.documentElement;for(const [name,value]of [['data-ide-workspace',workspace.enabled?'figma':null],['data-figma-scheme',workspace.enabled?scheme:null]]){if(value===null){if(root.hasAttribute(name))root.removeAttribute(name);}else if(root.getAttribute(name)!==value)root.setAttribute(name,value);}}
  };
  const saveProfiles=()=>{if(workspace.enabled)profiles.figma=ide.docking.snapshot();try{storage?.setItem(profileKey,JSON.stringify(profiles));}catch{workspace.report(new Error('Workspace layout applies to this session; browser storage is unavailable.'));}};
  const attach=designer=>{
    if(!workspace.viewports.has(designer)){
      const viewport=installFigmaViewport(designer,workspace);workspace.viewports.set(designer,viewport);
      const off=designer.on('tool',()=>{if(designer.tool!=='Pointer')viewport.setHand(false);workspace.scheduleSync();}),dispose=viewport.dispose;
      viewport.dispose=options=>{off();return dispose(options);};
    }
    return workspace.viewports.get(designer);
  };
  workspace.chooseTool=type=>{
    if(ide.runState!=='design'||!ide.activeModule?.form||ide.designer.locked)return;
    if(ide.activeDoc.view!=='form')ide.openDocument(ide.activeModule.id,'form');
    const d=workspace.currentDesigner();if(!d)return;attach(d).setHand(false);d.setTool(type);d.root.focus({preventScroll:true});workspace.scheduleSync();
  };
  workspace.enableLayout=()=>workspace.safe(()=>{
    if(!workspace.writable()||layoutEnabled(ide.project))return;
    // Solve and validate every form before publishing the project-wide opt-in.
    const prepared=ide.project.modules.filter(m=>m.form).map(m=>({module:m,form:layoutEdit(m.form,()=>[]).form}));
    const before=clone(ide.project);for(const {module,form}of prepared)module.form=form;
    ide.project.settings.anchoring=true;ide.record(before,'Enable auto layout and anchoring');workspace.ui.inspector.showLayout();
  });
  function createUI(){
    const header=el('header',{class:'figma-header'}),title=el('span',{class:'figma-project-name'}),file=el('span',{class:'figma-document-name'}),buttons=new Map();
    const action=(label,glyph,fn,className='')=>el('button',{class:'figma-action '+className,title:label,'aria-label':label,onclick:()=>workspace.safe(fn)},...(glyph?[figmaIcon(glyph)]:[]));
    const menu=action('Workspace menu','menu',()=>{const r=menu.getBoundingClientRect();showMenu(['File','Edit','View','Project','Format','Debug','Run','Tools','Window','Help'].map(name=>({label:name,items:ide.menu(name)})),r.left,r.bottom,id=>ide.command(id),{opener:menu,focusFirst:true});});
    const design=action('Design','frame',()=>ide.command('viewForm')),code=action('Code','code',()=>ide.command('viewCode')),run=action('Run VB6 application','play',()=>ide.command('run'),'figma-run'),stop=action('Stop VB6 application','stop',()=>ide.command('stop'));
    design.append('Design');code.append('Code');run.append('Run');
    const undo=action('Undo','undo',()=>ide.command('undo')),redo=action('Redo','redo',()=>ide.command('redo'));
    const left=action('Toggle Layers sidebar','layers',()=>{if(view.innerWidth<=850){ide.root.dataset.figmaSidebar=ide.root.dataset.figmaSidebar==='layers'?'':'layers';ide.docking.show('figma-layers',true);return;}const ids=['figma-layers','toolbox','project'],visible=ids.some(id=>!ide.docking.model.windows.get(id)?.hidden);for(const id of ids)ide.docking.model.show(id,!visible);if(!visible)ide.docking.model.activate('figma-layers');ide.docking.render();ide.docking.changed();});
    const right=action('Toggle Design sidebar','settings',()=>{if(view.innerWidth<=850){ide.root.dataset.figmaSidebar=ide.root.dataset.figmaSidebar==='design'?'':'design';ide.docking.show('properties',true);return;}ide.docking.show('properties',!!ide.docking.model.windows.get('properties')?.hidden);});
    header.append(menu,el('span',{class:'figma-vb-badge'},'VB6'),title,el('span',{class:'figma-breadcrumb-separator'},'/'),file,el('div',{class:'figma-document-mode'},design,code),el('div',{class:'figma-header-actions'},undo,redo,left,right,action('Workspace options','settings',()=>workspace.options()),stop,run));
    const toolbar=el('div',{class:'figma-canvas-toolbar',role:'toolbar','aria-label':'Figma design tools'});
    for(const [type,glyph,label]of [['Pointer','pointer','Move (V)'],['Hand','hand','Hand (H)'],['Frame','frame','VB6 Frame (F)'],['Label','text','VB6 Label (T)'],['CommandButton','button','VB6 CommandButton'],['TextBox','input','VB6 TextBox']]){const button=action(label,glyph,()=>{if(type==='Hand'){const d=workspace.currentDesigner();if(d){const v=attach(d);v.setHand(!v.hand);d.root.focus({preventScroll:true});}}else workspace.chooseTool(type);});button.dataset.figmaTool=type;button.setAttribute('aria-pressed','false');buttons.set(type,button);toolbar.append(button);}
    const addLayout=action('Add auto layout (Shift+A)','plus',()=>{if(layoutEnabled(ide.project))ide.command('autoLayoutAdd');else workspace.enableLayout();});
    toolbar.append(el('span',{class:'figma-toolbar-divider'}),addLayout);
    const zoom=el('button',{class:'figma-zoom','aria-label':'Canvas zoom',onclick:()=>{const d=workspace.currentDesigner();if(!d)return;const v=attach(d),r=zoom.getBoundingClientRect();showMenu([{label:'Zoom to fit',shortcut:'Shift+1',action:()=>v.fit()},{label:'Zoom to selection',shortcut:'Shift+2',action:()=>v.fit(true)},null,...[.1,.25,.5,.75,1,1.5,2,4,8].map(value=>({label:Math.round(value*100)+'%',checked:Math.abs(d.zoom-value)<.001,action:()=>v.zoom(value)}))],r.left,r.top-8,null,{opener:zoom,focusFirst:true});}},'100%');toolbar.append(zoom);
    const layers=createFigmaLayers(workspace);ide.docking.register('figma-layers',layers.panel,{edge:'left',title:'Layers',hidden:true});
    const inspector=createFigmaInspector(workspace),search=el('input',{class:'figma-assets-search',type:'search',placeholder:'Search VB6 controls…','aria-label':'Search VB6 controls'});
    ide.toolboxFilter.before(search);search.addEventListener('input',()=>decorateToolbox());search.addEventListener('keydown',e=>e.stopPropagation());
    ide.root.prepend(header);ide.center.append(toolbar);
    return {header,title,file,design,code,run,stop,undo,redo,toolbar,zoom,buttons,layers,inspector,search,addLayout,left,right};
  }
  function decorateToolbox(){
    if(!workspace.enabled||!workspace.ui)return;const query=workspace.ui.search.value.trim().toLocaleLowerCase();
    for(const button of ide.toolboxGrid.querySelectorAll('button[data-control-type]')){
      if(!button.querySelector('.figma-control-label'))button.append(el('span',{class:'figma-control-label'},button.dataset.controlType));
      button.hidden=!!query&&!button.dataset.controlType.toLocaleLowerCase().includes(query);
      button.disabled=ide.runState!=='design'||!!ide.designer.locked;
    }
  }
  workspace.sync=()=>{
    if(!workspace.enabled||workspace.switching||!workspace.ui)return;const ui=workspace.ui,d=workspace.currentDesigner();
    for(const designer of ide.documents.designers.values())attach(designer);
    ui.title.textContent=ide.project.name;ui.file.textContent=ide.activeModule?.name||'No document';ui.title.title=ide.project.name+(ide.dirty?' — unsaved changes':'');
    ui.design.disabled=!ide.activeModule?.form;ui.code.disabled=!ide.activeModule;
    ui.design.setAttribute('aria-pressed',String(!!d));ui.code.setAttribute('aria-pressed',String(ide.activeDoc?.view==='code'));
    ui.run.disabled=ide.runState==='running';ui.stop.disabled=ide.runState==='design';ui.undo.disabled=ide.runState!=='design'||!ide.history.undoStack.length;ui.redo.disabled=ide.runState!=='design'||!ide.history.redoStack.length;
    ui.toolbar.hidden=!d;ui.addLayout.disabled=!workspace.writable();ui.left.setAttribute('aria-expanded',String(view.innerWidth<=850?ide.root.dataset.figmaSidebar==='layers':['figma-layers','toolbox','project'].some(id=>!ide.docking.model.windows.get(id)?.hidden)));ui.right.setAttribute('aria-expanded',String(view.innerWidth<=850?ide.root.dataset.figmaSidebar==='design':!ide.docking.model.windows.get('properties')?.hidden));ui.zoom.textContent=Math.round((d?.zoom||1)*100)+'%';
    for(const [type,button]of ui.buttons){button.disabled=!d||(type!=='Hand'&&!workspace.writable());button.setAttribute('aria-pressed',String(type==='Hand'?!!workspace.viewports.get(d)?.hand:d?.tool===type&&!workspace.viewports.get(d)?.hand));}
    ui.layers.sync();ui.inspector.sync();decorateToolbox();for(const group of ide.docking.model.groups.values())if(['left','right'].includes(group.edge)&&ide.docking.model.visible(group).length){const tabs=ide.docking.views.get(group.id)?._tabs;if(tabs)tabs.hidden=false;}workspace.appearance();
  };
  workspace.configure=(value,{persist=true}={})=>{
    const settings=normalizeFigmaSettings(value),enabled=settings.mode==='figma';
    if(workspace.switching)return false;workspace.switching=true;
    try{
      if(enabled!==workspace.enabled){
        ide.docking.cancelInteraction?.();
        if(enabled){
          profiles.classic=ide.docking.snapshot();workspace.classicViewportStates=new Map([...ide.documents.designers.values()].map(d=>[d,{zoom:d.zoom,scrollLeft:d.root.scrollLeft,scrollTop:d.root.scrollTop,transform:d.plane.style.transform}]));workspace.classicToolboxMode=ide.toolboxMode;workspace.enabled=true;workspace.settings=settings;workspace.appearance();
          workspace.ui=createUI();workspace.titles=new Map();for(const [id,title]of [['toolbox','Assets'],['project','Files'],['properties','Design']]){const p=ide.docking.panels.get(id);if(p){workspace.titles.set(id,p.title);p.title=title;}}
          try{ide.docking.restore(profiles.figma||figmaDockProfile(ide.docking.snapshot()));}catch{ide.docking.restore(figmaDockProfile(ide.docking.snapshot()));}
          ide.docking.model.activate('figma-layers');ide.docking.render();ide.toolboxMode='all';ide.toolboxFilter.value='all';ide.renderToolbox();
          for(const designer of ide.documents.designers.values())attach(designer);
        }else{
          saveProfiles();workspace.enabled=false;delete ide.root.dataset.figmaSidebar;delete ide.root.dataset.figmaWindowMode;
          for(const viewport of [...workspace.viewports.values()])viewport.dispose();workspace.classicViewportStates=null;
          workspace.ui.inspector.dispose();workspace.ui.layers.dispose();ide.docking.unregister('figma-layers');
          for(const node of [workspace.ui.header,workspace.ui.toolbar,workspace.ui.search])node.remove();workspace.ui=null;
          for(const [id,title]of workspace.titles||[])if(ide.docking.panels.has(id))ide.docking.panels.get(id).title=title;
          if(profiles.classic)ide.docking.restore(profiles.classic);
          ide.zoomSelect.value=String(ide.designer.zoom);ide.toolboxMode=workspace.classicToolboxMode||'standard';ide.toolboxFilter.value=ide.toolboxMode;ide.renderToolbox();
          workspace.appearance();
        }
      }
      workspace.settings=settings;workspace.appearance();
      if(persist){try{saveFigmaSettings(storage,settings);}catch{workspace.report(new Error('Options apply to this session; browser storage is unavailable.'));}saveProfiles();ide.autosave();}
    }finally{workspace.switching=false;}
    workspace.sync();return true;
  };
  const menu=ide.menu.bind(ide),command=ide.command.bind(ide),snapshot=ide.layoutSnapshot.bind(ide),factory=ide.documents.designer.bind(ide.documents);
  ide.menu=name=>{const items=menu(name);if(name==='Window'&&workspace.enabled)items.unshift({id:'figmaSingleCanvas',label:'Single design canvas',checked:ide.root.dataset.figmaWindowMode!=='windows'},null);if(name==='Tools')items.push(null,{id:'figmaWorkspaceOptions',label:'Figma Workspace Options…'});if(name==='View')items.push(null,{id:'figmaWorkspaceToggle',label:'Figma Workspace',checked:workspace.enabled},...(workspace.enabled?[{id:'figmaLayers',label:'Layers'},{id:'figmaFit',label:'Zoom to Fit',shortcut:'Shift+1'}]:[]));return items;};
  ide.command=(id,...args)=>{
    if(id==='figmaWorkspaceOptions')return workspace.options();
    if(id==='figmaWorkspaceToggle')return workspace.configure({...workspace.settings,mode:workspace.enabled?'classic':'figma'});
    if(workspace.enabled){if(['cascade','tileHorizontal','tileVertical','tile'].includes(id))ide.root.dataset.figmaWindowMode='windows';if(id==='figmaSingleCanvas'){delete ide.root.dataset.figmaWindowMode;workspace.scheduleSync();return;}if(id==='autoLayoutPanel')return workspace.ui.inspector.showLayout();if(id==='figmaLayers')return ide.docking.show('figma-layers',true,true);if(id==='figmaFit')return workspace.viewports.get(workspace.currentDesigner())?.fit();if(id==='resetLayout'){delete ide.root.dataset.figmaWindowMode;delete ide.root.dataset.figmaSidebar;profiles.figma=null;ide.docking.restore(figmaDockProfile(ide.docking.snapshot()));workspace.sync();return;}}
    const result=command(id,...args);workspace.scheduleSync();if(result?.then)result.then(workspace.scheduleSync,workspace.scheduleSync);return result;
  };
  // The ordinary workspace persists the classic docking profile, so a missing or
  // reset Figma preference cannot leave the classic IDE in a foreign layout.
  ide.layoutSnapshot=()=>{const value=snapshot();if(workspace.enabled&&profiles.classic)return {...value,docking:structuredClone(profiles.classic)};return value;};
  ide.documents.designer=module=>{const d=factory(module);if(workspace.enabled)attach(d);return d;};
  for(const [owner,name]of [[ide,'updateCommandState'],[ide,'renderProjectTree'],[ide,'renderToolbox'],[ide,'updateTitle'],[ide,'applyAppearance'],[ide.inspector,'render']]){const original=owner[name];owner[name]=function(...args){const result=original.apply(this,args);workspace.scheduleSync();return result;};}
  const dockChanged=ide.docking.changed.bind(ide.docking);ide.docking.changed=()=>{const result=dockChanged();if(workspace.enabled&&!workspace.switching)saveProfiles();workspace.scheduleSync();return result;};
  const uninstallOptions=installFigmaOptions(workspace);
  media?.addEventListener?.('change',workspace.appearance);
  ide.root.addEventListener('keydown',event=>{if(workspace.enabled&&event.key==='Escape'&&ide.root.dataset.figmaSidebar){delete ide.root.dataset.figmaSidebar;workspace.ui?.left.focus({preventScroll:true});workspace.scheduleSync();event.preventDefault();event.stopPropagation();}},{capture:true});
  view.addEventListener('pagehide',event=>{saveProfiles();if(!event.persisted){view.cancelAnimationFrame(workspace.frame);uninstallOptions();media?.removeEventListener?.('change',workspace.appearance);for(const v of [...workspace.viewports.values()])v.dispose({restore:false});workspace.ui?.layers.dispose();}});
  workspace.configure(workspace.settings,{persist:false});return workspace;
}
