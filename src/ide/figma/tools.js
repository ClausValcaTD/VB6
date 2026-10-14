import {el} from '../../core/core.js';
import {modal,showMenu} from '../ui.js';
import {figmaIcon} from './icons.js';
import {figmaContext,appendAgentDraft} from './tool-context.js';

const TOOLS=Object.freeze([
  {key:'tool:coding-agents',id:'figma-tool-agent',title:'Agent',edge:'right',open:ide=>ide.codingAgents.open()},
  {key:'tool:mcp',id:'figma-tool-mcp',title:'MCP',edge:'bottom',open:ide=>ide.openMcp()},
  {key:'tool:project-search',id:'figma-tool-search',title:'Search',edge:'bottom',open:ide=>ide.projectSearch()},
  {key:'tool:object-browser',id:'figma-tool-objects',title:'Object Browser',edge:'bottom',open:ide=>ide.objectBrowser()},
  {key:'tool:resources',id:'figma-tool-resources',title:'Resources',edge:'bottom',open:ide=>ide.openResourceEditor()},
  {key:'tool:dataEnvironment',id:'figma-tool-data',title:'Data',edge:'bottom',open:ide=>ide.openDataEnvironment()}
]);
const AGENT_PAGES=[['task','Task'],['connection','Connection'],['changes','Changes'],['queue','Queue'],['permissions','Permissions'],['tools','Tools'],['plan','Plan'],['tasks','Tasks'],['activity','Activity']];
const MCP_PAGES=[['access','Agent access'],['agent','Agent permissions'],['capabilities','Capabilities'],['activity','Activity'],['operations','Operations']];
/** Rehost the SAME tool objects and DOM roots. Open/close/reset remain owned by
 * IdeDocuments; workspace switching changes presentation, never agent authority.
 * All method wrappers below are scoped to this workspace lifetime and restored.
 */
export function createFigmaTools(workspace){
  const {ide}=workspace,docs=ide.documents,dock=ide.docking,doc=ide.root.ownerDocument;
  const previous={open:docs.openTool,close:docs.closeTool,reset:docs.reset,activate:docs.mdi.onActivate};
  const records=new Map(),disposers=[];let disposed=false,reviewing=false,tabSignature='';
  const action=(label,fn,glyph)=>el('button',{class:'figma-tool-action','aria-label':label,title:label,onclick:()=>workspace.safe(fn)},...(glyph?[figmaIcon(glyph)]:[]),label);
  const nav=el('div',{class:'figma-service-actions',role:'group','aria-label':'Workspace services'});
  const agent=action('Agent',()=>open('tool:coding-agents'),'code');
  const mcp=action('MCP',()=>open('tool:mcp'),'settings');
  const tools=action('Tools',()=>{
    const r=tools.getBoundingClientRect();showMenu(menu(),r.left,r.bottom,null,{opener:tools,focusFirst:true});
  },'menu');
  nav.append(agent,mcp,tools);
  ide.root.querySelector('.figma-header-actions').prepend(nav);
  for(const definition of TOOLS){
    const content=el('div',{class:'figma-host-content'}),bar=el('div',{class:'figma-host-actions'});
    const shell=el('section',{class:'figma-hosted-tool','aria-label':definition.title+' workspace'},
      ide.caption(definition.title,()=>dock.show(definition.id,false)),bar,content);
    const launch=action('Open '+definition.title,()=>open(definition.key));
    content.append(launch);
    const record={...definition,shell,content,launch,tool:null};records.set(definition.key,record);
    if(definition.key==='tool:coding-agents')bar.append(action('Review selection for agent',reviewContext));
    if(definition.key==='tool:mcp')bar.append(action('Stop MCP sharing',()=>ide.mcp.setSharing(false)));
    bar.append(action('Expand '+definition.title+' to document',()=>expand(record)),
      action('Hide '+definition.title,()=>dock.show(definition.id,false)));
    dock.register(definition.id,shell,{title:definition.title,edge:definition.edge,group:definition.edge==='right'?'figma-right':'figma-tools',hidden:true});
  }
  function restoreDocument(active){if(active&&docs.mdi.windows.has(active))docs.mdi.activate(active);else if(ide.activeDoc&&docs.mdi.windows.has(ide.activeDoc.key))docs.activate(ide.activeDoc);}
  function present(tool,{focus=true}={}){
    const record=records.get(tool.key);if(!record)return previous.open.call(docs,tool);
    const active=docs.mdi.active;
    docs.tools.set(tool.key,tool);record.tool=tool;
    // Return a detached browser document through its owner before moving its DOM.
    docs.mdi.browserWindows?.attach('document:'+tool.key,'layout');
    tool.root.classList.add('figma-tool-surface');record.content.replaceChildren(tool.root);
    if(docs.mdi.windows.has(tool.key))docs.mdi.remove(tool.key);
    if(record.edge==='right')dock.model.sizes.right=Math.max(400,dock.model.sizes.right);
    else dock.model.sizes.bottom=Math.max(340,dock.model.sizes.bottom);
    dock.show(record.id,true);restoreDocument(active);
    if(doc.defaultView.innerWidth<=850&&dock.group(record.id)?.edge==='right')ide.root.dataset.figmaSidebar='design';
    tool.refresh?.();if(focus)dock.focus(record.id);ide.autosave();workspace.scheduleSync();return tool;
  }
  function release(record){
    if(record.tool){record.tool.root.classList.remove('figma-tool-surface');record.tool.root.remove();record.tool=null;}
    record.content.replaceChildren(record.launch);dock.show(record.id,false);
  }
  function expand(record){
    const tool=record.tool;if(!tool)return open(record.key);
    release(record);tool.root.classList.add('figma-tool-surface');docs.tools.delete(tool.key);previous.open.call(docs,tool);workspace.scheduleSync();
  }
  function open(key,page){
    const record=records.get(key);if(!record)return;
    const tool=record.open(ide);if(page)(tool.pages||tool.tabs)?.select(page);
    workspace.scheduleSync();return tool;
  }
  docs.openTool=function(tool){return records.has(tool.key)?present(tool):previous.open.call(this,tool);};
  docs.closeTool=function(key){const record=records.get(key);if(record?.tool)release(record);const result=previous.close.call(this,key);workspace.scheduleSync();return result;};
  docs.reset=function(...args){
    // Existing MCP/Agent reset wrappers retain their own instances and revoke
    // old-project authority. Release presentation before those wrappers run.
    for(const record of records.values())if(record.tool)release(record);
    const result=previous.reset.apply(this,args);workspace.scheduleSync();return result;
  };
  docs.mdi.onActivate=key=>{previous.activate?.(key);workspace.scheduleSync();};
  function menu(){
    return [
      {label:'Coding agent',items:AGENT_PAGES.map(([id,label])=>({label,action:()=>open('tool:coding-agents',id)}))},
      {label:'MCP',items:MCP_PAGES.map(([id,label])=>({label,action:()=>open('tool:mcp',id)}))},
      {label:'Review selection for agent…',enabled:!!(workspace.currentDesigner()||workspace.currentCodeEditor()),action:reviewContext},null,
      ...TOOLS.slice(2).map(r=>({label:r.title,action:()=>open(r.key)})),null,
      {label:'Docked views',items:[...dock.panels].filter(([id])=>!id.startsWith('figma-tool-')).map(([id,p])=>({label:p.title,checked:!dock.model.windows.get(id)?.hidden,action:()=>{dock.show(id,true,true);if(doc.defaultView.innerWidth<=850&&dock.group(id)?.edge==='right')ide.root.dataset.figmaSidebar='design';}}))},
      ...[...docs.tools.values()].filter(t=>!records.has(t.key)).map(t=>({label:t.title,action:()=>docs.openTool(t)}))
    ];
  }
  async function reviewContext(){
    if(reviewing)return;const designer=workspace.currentDesigner(),editor=workspace.currentCodeEditor(),module=ide.activeModule,project=ide.project;
    if(!module||!designer&&!editor)return;
    const captured=figmaContext({project,module,view:designer?'form':'code',controls:designer?.selected(),source:editor?.text,selection:editor?.selectionBounds()});
    const text=el('textarea',{'aria-label':'Reviewed authoring context',class:'figma-context-preview',rows:15,maxLength:30000},captured);
    const task=ide.codingAgents.conversations.active;reviewing=true;
    try{
      const accepted=await modal('Review authoring context',{width:650,content:el('div',{},
        el('p',{},'This text will be appended to your agent draft, not sent. Source can contain confidential information; review it before adding. Connections, secrets, assets and runtime values are excluded.'),text),
        buttons:[{label:'Cancel',value:false,primary:true},{label:'Append to draft',value:true}]});
      if(!accepted||disposed)return;
      if(ide.project!==project||ide.activeModule!==module||ide.codingAgents.conversations.active!==task)throw new Error('Project, module or agent task changed while reviewing context. Review again.');
      // Preserve concurrent edits to the draft. Opening the panel never starts it.
      const existing=docs.tools.get('tool:coding-agents'),draft=existing?.prompt.value??task.draft??'';
      const next=appendAgentDraft(draft,text.value);const panel=open('tool:coding-agents','task');
      panel.prompt.value=next;task.draft=next;panel.prompt.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));panel.prompt.focus();
      ide.status('Authoring context appended to the agent draft. No request sent.');
    }finally{reviewing=false;}
  }
  function sync(){
    if(disposed)return;
    const busy=!!ide.codingAgents?.agent.busy,sharing=!!ide.mcp?.adapter.enabled;
    agent.dataset.state=busy?'running':'idle';agent.title=busy?'Agent is working — open task':'Open coding agent';
    mcp.dataset.state=sharing?'sharing':'disabled';mcp.title=sharing?'MCP sharing enabled — review permissions':'MCP sharing disabled';
    for(const [button,key]of [[agent,'tool:coding-agents'],[mcp,'tool:mcp']]){const r=records.get(key),g=dock.group(r.id);button.setAttribute('aria-pressed',String(!dock.model.windows.get(r.id)?.hidden&&g?.active===r.id));}
    // Modeless documents such as XAML keep their own editor semantics. They now
    // receive genuine Figma document tabs instead of an invisible title bar.
    const list=[...docs.tools.values()].filter(t=>docs.mdi.windows.has(t.key));
    const signature=list.map(t=>t.key+':'+t.title).join('|')+'|'+docs.mdi.active;
    if(signature!==tabSignature||ide.documentTabs.querySelectorAll('[data-figma-tool-tab]').length!==list.length){
      tabSignature=signature;for(const n of ide.documentTabs.querySelectorAll('[data-figma-tool-tab]'))n.remove();
      for(const t of list){const tab=el('button',{class:'document-tab',role:'tab','data-figma-tool-tab':t.key,'aria-selected':String(docs.mdi.active===t.key),onclick:()=>{previous.open.call(docs,t);workspace.scheduleSync();}},t.title);
        const close=el('span',{class:'tab-close',role:'button',tabindex:0,'aria-label':'Close '+t.title},'×');
        const closeTool=e=>{e.preventDefault();e.stopPropagation();ide.closeDocument(t.key);};close.onclick=closeTool;close.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')closeTool(e);};tab.append(close);ide.documentTabs.append(tab);}
    }
    // A tool document can be active while activeDoc retains the last VB6
    // document. Both visual and accessible selection follow the actual MDI owner.
    for(const tab of ide.documentTabs.querySelectorAll('.document-tab')){
      const selected=(tab.dataset.figmaToolTab||tab.dataset.document)===docs.mdi.active;
      if(tab.classList.contains('active')!==selected)tab.classList.toggle('active',selected);
      if(tab.getAttribute('aria-selected')!==String(selected))tab.setAttribute('aria-selected',String(selected));
    }
    for(const [id,{panel}]of dock.panels)if(!['toolbox','properties','project','figma-layers','auto-layout','layout'].includes(id))panel.classList.add('figma-utility-panel');
  }
  for(const subscribe of [ide.codingAgents?.onChange,ide.mcp?.onChange,ide.mcp?.adapter.onChange?.bind(ide.mcp.adapter)])if(subscribe)disposers.push(subscribe(workspace.scheduleSync));
  const active=docs.mdi.active;for(const tool of [...docs.tools.values()])if(records.has(tool.key))present(tool,{focus:false});restoreDocument(active);
  return {nav,open,reviewContext,sync,menu,dispose(){
    if(disposed)return;disposed=true;for(const off of disposers)off();
    docs.openTool=previous.open;docs.closeTool=previous.close;docs.reset=previous.reset;docs.mdi.onActivate=previous.activate;
    const active=docs.mdi.active;
    for(const record of records.values()){
      const tool=record.tool;if(tool){tool.root.classList.remove('figma-tool-surface');tool.root.remove();record.tool=null;
        if(docs.tools.get(tool.key)===tool){docs.tools.delete(tool.key);previous.open.call(docs,tool);}}
      dock.unregister(record.id);
    }
    restoreDocument(active);for(const tool of docs.tools.values())tool.root.classList.remove('figma-tool-surface');for(const n of ide.documentTabs.querySelectorAll('[data-figma-tool-tab]'))n.remove();
    docs.tabs(); // Restore the Classic document-tab owner's presentation.
    for(const {panel}of dock.panels.values())panel.classList.remove('figma-utility-panel');nav.remove();
  }};
}
