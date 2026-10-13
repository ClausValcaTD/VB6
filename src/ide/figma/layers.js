import {el} from '../../core/core.js';
import {layerRows} from './model.js';
import {figmaIcon} from './icons.js';
import {layoutContainer,layoutEnabled} from '../../layout/contract.js';
import {reparentControls} from '../../layout/authoring.js';
import {parentIds} from '../../layout/model.js';

/** Windowed tree with roving focus and atomic, revision-guarded layout drops. */
export function createFigmaLayers(workspace){
  const {ide}=workspace,collapsed=new Set(),height=32;
  const panel=el('section',{class:'figma-layers-panel','aria-label':'Layers'}),search=el('input',{type:'search',placeholder:'Search layers…','aria-label':'Search layers',spellcheck:false});
  const title=el('strong',{}),count=el('span',{class:'figma-muted'}),tree=el('div',{class:'figma-layer-tree',role:'tree','aria-label':'VB6 form layers','aria-multiselectable':'true',tabindex:0}),content=el('div',{class:'figma-layer-content'});
  tree.append(content);panel.append(ide.caption('Layers',()=>ide.docking.show('figma-layers',false)),el('div',{class:'figma-search'},figmaIcon('search'),search),el('div',{class:'figma-section-title'},title,count),tree);
  let rows=[],key='',focused='@form',anchor=null,drag=null,frame=0,disposed=false;
  const current=()=>workspace.contextDesigner(),form=()=>current()?.module.form;
  const selected=id=>id==='@form'?!current()?.selection.size:current()?.selection.has(id);
  const focusAt=index=>{
    if(!rows.length)return;index=Math.min(rows.length-1,Math.max(0,index));focused=rows[index].control.id;
    if(index*height<tree.scrollTop)tree.scrollTop=index*height;else if((index+1)*height>tree.scrollTop+tree.clientHeight)tree.scrollTop=(index+1)*height-tree.clientHeight;
    paint();content.querySelector(`[data-layer-index="${index}"]`)?.focus({preventScroll:true});
  };
  const choose=(id,event={})=>{
    const designer=current();if(!designer)return;
    if(!workspace.currentDesigner())ide.openDocument(designer.module.id,'form');
    if(id==='@form'){designer.select([]);anchor=null;}
    else if(event.shiftKey&&anchor){const a=rows.findIndex(r=>r.control.id===anchor),b=rows.findIndex(r=>r.control.id===id);designer.select(rows.slice(Math.max(0,Math.min(a,b)),Math.max(a,b)+1).map(r=>r.control.id).filter(id=>id!=='@form'));}
    else if(event.ctrlKey||event.metaKey){const ids=new Set(designer.selection);ids.has(id)?ids.delete(id):ids.add(id);designer.select([...ids]);anchor=id;}
    else{designer.select([id]);anchor=id;}
    focused=id;paint();
  };
  const toggle=id=>{collapsed.has(id)?collapsed.delete(id):collapsed.add(id);key='';sync();};
  function paint(){
    if(drag)return; // Retain the native drag source until drop/end.
    const active=tree.ownerDocument.activeElement,hadFocus=content.contains(active),selectedId=active?.dataset.layerId;
    const start=Math.max(0,Math.floor(tree.scrollTop/height)-8),end=Math.min(rows.length,start+Math.ceil((tree.clientHeight||500)/height)+16),nodes=[];
    content.style.height=rows.length*height+'px';
    for(let index=start;index<end;index++){
      const r=rows[index],c=r.control,id=c.id;
      const item=el('div',{class:'figma-layer-row',role:'treeitem',tabindex:id===focused?0:-1,'aria-level':r.depth,'aria-selected':String(!!selected(id)),'aria-expanded':r.hasChildren?String(r.expanded):null,'aria-label':c.name+' '+c.type,'data-layer-id':id,'data-layer-index':index,style:{top:index*height+'px',paddingLeft:Math.min(140,8+(r.depth-1)*14)+'px'}});
      const fold=el('button',{class:'figma-layer-fold',tabindex:-1,title:r.expanded?'Collapse':'Expand','aria-label':(r.expanded?'Collapse ':'Expand ')+c.name,disabled:!r.hasChildren,onclick:event=>{event.stopPropagation();toggle(id);}},figmaIcon('chevron'));
      if(r.expanded)fold.classList.add('expanded');
      item.append(fold,figmaIcon(layoutContainer(c)?'frame':c.type==='Label'?'text':c.type==='TextBox'?'input':'button'),el('span',{class:'figma-layer-name'},c.name));
      if(c.properties?.Visible===0)item.classList.add('figma-layer-invisible');
      item.addEventListener('click',event=>{choose(id,event);focusAt(index);});
      item.addEventListener('dblclick',event=>{if(event.target.closest('button'))return;choose(id);if(workspace.writable())ide.command('defaultEvent');});
      if(id!=='@form'&&Object.hasOwn(c.properties||{},'Visible'))item.append(el('button',{class:'figma-layer-visibility',tabindex:-1,title:c.properties.Visible===0?'Show control':'Hide control','aria-label':(c.properties.Visible===0?'Show ':'Hide ')+c.name,disabled:!workspace.writable(),onclick:event=>{event.stopPropagation();if(!workspace.writable())return;choose(id);workspace.safe(()=>ide.setProperty('Visible',c.properties.Visible===0?-1:0));}},figmaIcon('eye')));
      item.draggable=id!=='@form'&&workspace.writable()&&layoutEnabled(ide.project);
      item.addEventListener('dragstart',event=>{if(!item.draggable){event.preventDefault();return;}if(!selected(id)){current().select([id]);anchor=focused=id;}drag={module:ide.activeModule,revision:ide.visualRevision,ids:[...current().selection]};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-vb6-figma-layers',JSON.stringify({module:drag.module.id,ids:drag.ids}));event.stopPropagation();});
      item.addEventListener('dragover',event=>{if(!drag||!workspace.writable())return;event.preventDefault();event.stopPropagation();const box=item.getBoundingClientRect(),fraction=(event.clientY-box.top)/box.height;item.dataset.drop=layoutContainer(c)&&fraction>.25&&fraction<.75?'inside':fraction<.5?'before':'after';event.dataTransfer.dropEffect='move';});
      item.addEventListener('dragleave',()=>delete item.dataset.drop);
      item.addEventListener('drop',event=>{
        if(!drag)return;event.preventDefault();event.stopPropagation();const source=drag;drag=null;const placement=item.dataset.drop;delete item.dataset.drop;
        if(!workspace.writable()||source.module!==ide.activeModule||source.revision!==ide.visualRevision)return;
        workspace.safe(()=>{
          const f=form(),parents=parentIds(f.controls),inside=placement==='inside'||id==='@form',parentId=inside?(id==='@form'?null:id):parents.get(id),siblings=f.controls.filter(c=>parents.get(c.id)===parentId&&!source.ids.includes(c.id)),index=inside?Infinity:Math.max(0,siblings.findIndex(c=>c.id===id))+(placement==='after'?1:0);
          ide.autoLayout.commit('Move layers',draft=>reparentControls(draft,source.ids,parentId,index));
        });
      });
      item.addEventListener('dragend',()=>{drag=null;for(const node of content.querySelectorAll('[data-drop]'))delete node.dataset.drop;paint();});
      nodes.push(item);
    }
    content.replaceChildren(...nodes);
    if(hadFocus){const node=[...content.children].find(n=>n.dataset.layerId===selectedId);(node||tree).focus({preventScroll:true});}
  }
  function sync(){
    const f=form(),query=search.value,next=(current()?.module.id||'')+':'+ide.visualRevision+':'+[...current()?.selection||[]].join(',')+':'+ide.runState+':'+ide.activeDoc?.view+':'+!!current()?.locked+':'+query+':'+[...collapsed].join(',');
    if(next===key)return;key=next;title.textContent=f?.name||'No form selected';count.textContent=f?(f.controls.length+' layers'):'';
    rows=f?[{control:{...f,id:'@form'},depth:1,hasChildren:!!f.controls.length,expanded:!collapsed.has('@form')},...(!collapsed.has('@form')||query?layerRows(f,{collapsed,query}).map(r=>({...r,depth:r.depth+1})):[])]:[];
    if(!rows.some(r=>r.control.id===focused))focused=rows.find(r=>selected(r.control.id))?.control.id||'@form';
    tree.scrollTop=Math.min(tree.scrollTop,Math.max(0,rows.length*height-tree.clientHeight));paint();
  }
  tree.addEventListener('keydown',event=>{
    if(event.target.closest('input,select,textarea'))return;let index=Math.max(0,rows.findIndex(r=>r.control.id===focused)),row=rows[index];if(!row)return;
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();index=event.key==='Home'?0:event.key==='End'?rows.length-1:index+(event.key==='ArrowDown'?1:-1);focusAt(index);}
    else if(event.key==='ArrowRight'&&row.hasChildren){event.preventDefault();event.stopPropagation();if(!row.expanded)toggle(focused);else focusAt(index+1);}
    else if(event.key==='ArrowLeft'){event.preventDefault();event.stopPropagation();if(row.hasChildren&&row.expanded)toggle(focused);else focusAt(Math.max(0,rows.findIndex(r=>r.control.id===(row.parentId||'@form'))));}
    else if(event.key==='Enter'||event.code==='Space'){event.preventDefault();event.stopPropagation();choose(focused,event);}
    else if(event.key==='F2'&&workspace.writable()){event.preventDefault();event.stopPropagation();choose(focused);ide.docking.activate('properties');workspace.ui.inspector.focusName();}
  });
  // Do not replace observed rows/SVGs during ResizeObserver delivery. Moving
  // tool docks changes the tree's height; deferred paint avoids creating more
  // depth-limited resize work inside that same browser delivery loop.
  const schedulePaint=()=>{if(!disposed&&!frame)frame=tree.ownerDocument.defaultView.requestAnimationFrame(()=>{frame=0;if(!disposed)paint();});};
  tree.addEventListener('scroll',schedulePaint);
  search.addEventListener('input',()=>{tree.scrollTop=0;sync();});search.addEventListener('keydown',e=>e.stopPropagation());
  const observer=new ResizeObserver(schedulePaint);observer.observe(tree);
  return {panel,sync,dispose(){disposed=true;observer.disconnect();tree.ownerDocument.defaultView.cancelAnimationFrame(frame);panel.remove();}};
}
