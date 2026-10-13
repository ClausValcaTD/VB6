import {createControl} from '../../project/model.js';
import {el,clone} from '../../core/core.js';
import {layoutEnabled,layoutEligible,layoutContainer} from '../../layout/contract.js';
import {parentIds} from '../../layout/model.js';
import {insertionGuide} from '../../layout/guides.js';
import {insertDesignerAsset,isDesignerAsset} from './asset-model.js';

export const FIGMA_ASSET_MIME='application/x-vb6-studio-asset';
/** One local drag capability, never serialized control data. Native dragover has
 * protected DataTransfer data; authorize via the in-memory session and validate
 * its nonce again at drop. Touch/pen use an explicit grip so Assets can scroll.
 * https://html.spec.whatwg.org/multipage/dnd.html#the-drag-data-store
 * https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property */
export function createFigmaAssets(workspace){
  const {ide}=workspace,doc=ide.root.ownerDocument,view=doc.defaultView;
  const abort=new view.AbortController(),signal=abort.signal,decorated=new WeakSet();
  const ghost=el('div',{class:'figma-asset-ghost',hidden:true,'aria-hidden':'true'});
  const footprint=el('div',{class:'figma-asset-footprint',hidden:true,'aria-hidden':'true'});
  const targetBox=el('div',{class:'figma-asset-target',hidden:true,'aria-hidden':'true'});
  const line=el('div',{class:'figma-asset-insertion',hidden:true,'aria-hidden':'true'});
  const status=el('div',{class:'figma-asset-announcement',role:'status','aria-live':'polite'});
  // Fixed-position overlays are siblings, never children of the translated plane.
  ide.root.append(ghost,targetBox,footprint,line,status);
  let drag=null,frame=0,latest=null,disposed=false;
  const listen=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal});
  const editable=d=>workspace.enabled&&ide.runState==='design'&&d&&!d.disposed&&!d.locked&&d.module?.form&&d.project===ide.project&&!doc.querySelector('.ide-modal-cover');
  function valid(){return drag&&editable(drag.designer)&&ide.activeModule===drag.module&&workspace.currentDesigner()===drag.designer&&ide.project===drag.project&&ide.visualRevision===drag.revision&&drag.module.form===drag.form&&isDesignerAsset(drag.type,ide.controlRegistry);}
  function start(type,kind,opener){
    cancel(false);
    if(!ide.activeModule?.form||ide.runState!=='design'||ide.designer.locked||!isDesignerAsset(type,ide.controlRegistry))return false;
    if(ide.activeDoc?.view!=='form')ide.openDocument(ide.activeModule.id,'form');
    const d=workspace.currentDesigner();if(!editable(d))return false;
    // Capture after any document activation, but before preview work.
    drag={type,kind,opener,designer:d,module:d.module,project:ide.project,form:d.module.form,
      revision:ide.visualRevision,formJSON:JSON.stringify(d.module.form),nonce:Array.from(view.crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),pointerId:null,moved:kind!=='pointer'};
    drag.controls=new Map(d.module.form.controls.map(c=>[c.id,c]));drag.parents=parentIds(d.module.form.controls);
    const defaults={...createControl(type,'Preview').properties,...ide.controlRegistry?.defaults(type)};
    drag.size={width:Math.max(0,Math.min(300000,Number(defaults.Width)||0)),height:Math.max(0,Math.min(300000,Number(defaults.Height)||0))};
    drag.panX=drag.panY=0;
    d.autoLayoutTools?.cancel();workspace.viewports.get(d)?.cancel();
    status.textContent='Place '+type+'. Escape cancels; Alt ignores auto layout. Arrow keys and Enter place from the grip.';
    return true;
  }
  function locate(event){
    if(!valid())return null;const d=drag.designer;
    let top=doc.elementFromPoint(event.clientX,event.clientY);
    if(!top||!d.root.contains(top))return null;
    // Layout padding/selection handles are editing chrome over the form. Do
    // not mistake their overlay parent for the insertion container. Respect
    // unrelated dock/modal occlusion; only these known designer overlays pass.
    if(top.closest('.auto-layout-guides,.designer-overlay'))top=doc.elementsFromPoint(event.clientX,event.clientY)
      .find(n=>d.formView.content.contains(n)&&!n.closest('.auto-layout-guides,.designer-overlay'));
    if(!top||!d.formView.content.contains(top))return null;
    const controls=drag.controls;
    if(drag.view!==d.formView){drag.view=d.formView;drag.views=new Map(d.formView.controls.map(v=>[v.model.id,v]));}
    const views=drag.views;
    let node=top.closest('[data-control-id]'),parent=null;
    while(node&&d.formView.content.contains(node)){
      const c=controls.get(node.dataset.controlId);
      if(layoutContainer(c)){parent=c;break;}
      node=node.parentElement?.closest('[data-control-id]');
    }
    const nonvisual=!layoutEligible({type:drag.type});if(nonvisual)parent=null;
    const host=parent?views.get(parent.id)?.childHost:d.formView.content;
    if(!host)return null;const rect=host.getBoundingClientRect();
    // A tab header / Frame caption is not part of its client insertion surface.
    if(event.clientX<rect.left||event.clientY<rect.top||event.clientX>=rect.right||event.clientY>=rect.bottom)return null;
    const grid=event.altKey||d.settings.snapToGrid===false?15:Number(d.settings.gridSize)||120;
    const point={x:Math.round(((event.clientX-rect.left)/d.zoom*15)/grid)*grid,y:Math.round(((event.clientY-rect.top)/d.zoom*15)/grid)*grid};
    const p=parent?.properties||drag.form.properties;
    const result={...point,parentId:parent?.id??null,beforeId:null,ignore:!!event.altKey,rect,host,parent,grid};
    if(layoutEnabled(ide.project)&&p.LayoutMode&&!event.altKey&&!nonvisual){
      const parents=drag.parents,siblings=drag.form.controls.filter(c=>parents.get(c.id)===result.parentId);
      const flow=siblings.filter(c=>layoutEligible(c)&&c.properties.Visible!==0&&!c.properties.LayoutIgnore&&!c.properties.Dock);
      const rects=flow.map(c=>{const r=views.get(c.id)?.node.getBoundingClientRect();return r&&{x:r.x,y:r.y,width:r.width,height:r.height,id:c.id};}).filter(Boolean);
      const insertion=insertionGuide(rects,{x:event.clientX,y:event.clientY},p.LayoutMode,{x:rect.x,y:rect.y,width:rect.width,height:rect.height});
      result.beforeId=rects[insertion.index]?.id??null;result.guide=insertion.guide;
    }
    return result;
  }
  function renderPreview(event){
    if(!drag)return;if(!valid()){cancel();return;}
    const hit=locate(event);drag.hit=hit;
    ghost.hidden=false;ghost.textContent=drag.type+(hit?' → '+(hit.parent?.name||drag.form.name)+' · '+hit.x+', '+hit.y+' twips':' · No drop target');
    ghost.dataset.valid=String(!!hit);Object.assign(ghost.style,{left:Math.min(event.clientX+16,Math.max(0,view.innerWidth-270))+'px',top:Math.min(event.clientY+20,view.innerHeight-46)+'px'});
    targetBox.hidden=!hit;line.hidden=!hit?.guide;footprint.hidden=!hit||!!hit.guide;
    if(hit&&!hit.guide)Object.assign(footprint.style,{left:hit.rect.left+hit.x/15*drag.designer.zoom+'px',top:hit.rect.top+hit.y/15*drag.designer.zoom+'px',width:drag.size.width/15*drag.designer.zoom+'px',height:drag.size.height/15*drag.designer.zoom+'px'});
    if(hit){Object.assign(targetBox.style,{left:hit.rect.left+'px',top:hit.rect.top+'px',width:hit.rect.width+'px',height:hit.rect.height+'px'});
      if(hit.guide){const g=hit.guide;Object.assign(line.style,{left:Math.min(g.x1,g.x2)+'px',top:Math.min(g.y1,g.y2)+'px',width:Math.max(2,Math.abs(g.x2-g.x1))+'px',height:Math.max(2,Math.abs(g.y2-g.y1))+'px'});}
    }
  }
  function tick(time){
    frame=0;if(!drag||!latest)return;if(!valid()){cancel();return;}
    const d=drag.designer,r=d.root.getBoundingClientRect(),p=latest,top=doc.elementFromPoint(p.clientX,p.clientY);
    const elapsed=Math.min(32,Math.max(0,time-(drag.time??(time-16))));drag.time=time;
    let dx=0,dy=0;
    if(drag.kind!=='keyboard'&&drag.moved&&top&&d.root.contains(top)){
      const speed=(at,min,max)=>at<min+32?Math.max(0,1-(at-min)/32):at>max-32?-Math.max(0,1-(max-at)/32):0;
      dx=speed(p.clientX,r.left,r.right)*elapsed*.45;dy=speed(p.clientY,r.top,r.bottom)*elapsed*.45;
      if(dx||dy){workspace.viewports.get(d)?.pan(dx,dy);drag.panX+=dx;drag.panY+=dy;}
    }
    renderPreview(p);
    // Only an active pointer at the canvas edge needs consecutive frames.
    if(drag&&(dx||dy))frame=view.requestAnimationFrame(tick);
  }
  function move(event){latest={clientX:event.clientX,clientY:event.clientY,altKey:!!event.altKey};if(!frame)frame=view.requestAnimationFrame(tick);}
  function cancel(announce=true){
    if(frame)view.cancelAnimationFrame(frame);frame=0;latest=null;
    const old=drag;drag=null;ghost.hidden=targetBox.hidden=footprint.hidden=line.hidden=true;
    if(old&&announce&&(old.panX||old.panY))workspace.viewports.get(old.designer)?.pan(-old.panX,-old.panY);
    if(old?.pointerId!=null)try{if(ide.root.hasPointerCapture(old.pointerId))ide.root.releasePointerCapture(old.pointerId);}catch{}
    if(old&&announce)status.textContent='Asset placement cancelled. No controls were added.';
    if(old?.kind==='keyboard'&&old.opener?.isConnected)old.opener.focus({preventScroll:true});
  }
  function drop(event){
    if(!valid()){cancel();return;}
    const hit=locate(event),session=drag;if(!hit){cancel();return;}
    if(JSON.stringify(session.module.form)!==session.formJSON){cancel();return;}
    const proposed=insertDesignerAsset(session.form,session.type,hit,{registry:ide.controlRegistry,layout:layoutEnabled(ide.project),snap:!event.altKey&&session.designer.settings.snapToGrid!==false,gridSize:session.designer.settings.gridSize||120});
    const before=clone(ide.project);cancel(false);session.module.form=proposed.form;
    ide.record(before,'Insert '+session.type+' from Assets');
    workspace.viewports.get(session.designer)?.setHand(false);
    session.designer.select(proposed.selection);session.designer.setTool('Pointer');session.designer.root.focus({preventScroll:true});
    status.textContent='Inserted '+session.type+' into '+(hit.parent?.name||session.form.name)+'. Undo removes this insertion.';
    workspace.scheduleSync();
  }
  function decorate(){
    for(const button of ide.toolboxGrid.querySelectorAll('button[data-control-type]')){
      if(decorated.has(button))continue;decorated.add(button);const type=button.dataset.controlType;
      if(!isDesignerAsset(type,ide.controlRegistry))continue;
      button.draggable=true;
      // Firefox before 147 only starts a BUTTON drag on its child content,
      // not the button's own padding/gaps. Keep the semantic button and give
      // its entire client area a noninteractive content surface.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=568313#c23
      const surface=el('span',{class:'figma-asset-drag-surface'});
      surface.append(...button.childNodes);button.append(surface);
      const card=el('div',{class:'figma-asset-card'}),grip=el('button',{class:'figma-asset-grip','aria-label':'Place '+type+' on designer',title:'Drag to place; Enter for keyboard placement','data-asset-grip':type},'⠿');
      button.before(card);card.append(button,grip);
    }
    for(const card of ide.toolboxGrid.querySelectorAll('.figma-asset-card')){const b=card.querySelector('[data-control-type]');card.hidden=b.hidden;card.querySelector('.figma-asset-grip').disabled=b.disabled;}
    if(drag&&!valid())cancel();
  }
  listen(ide.toolboxGrid,'dragstart',event=>{
    const b=event.target.closest('[data-control-type]');if(!b)return;
    if(!event.dataTransfer||!start(b.dataset.controlType,'native',b)){event.preventDefault();return;}
    event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData(FIGMA_ASSET_MIME,drag.nonce);move(event);
  });
  listen(doc,'dragover',event=>{if(drag?.kind!=='native')return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=locate(event)?'copy':'none';move(event);},{capture:true});
  listen(doc,'drop',event=>{
    if(drag?.kind!=='native')return;event.preventDefault();event.stopImmediatePropagation();
    if(event.dataTransfer?.getData(FIGMA_ASSET_MIME)!==drag.nonce){cancel();return;}
    workspace.safe(()=>{try{drop(event);}finally{cancel(false);}});
  },{capture:true});
  // Native Escape may deliver dragend without a key event to the document.
  // A successful drop already released its session; remaining sessions cancel.
  listen(doc,'dragend',()=>cancel(),{capture:true});
  listen(ide.toolboxGrid,'pointerdown',event=>{
    const grip=event.target.closest('[data-asset-grip]');if(!grip||event.button!==0||event.isPrimary===false)return;
    if(!start(grip.dataset.assetGrip,'pointer',grip))return;
    event.preventDefault();event.stopPropagation();drag.pointerId=event.pointerId;drag.start={x:event.clientX,y:event.clientY};
    ide.root.setPointerCapture(event.pointerId);
  });
  listen(doc,'pointermove',event=>{
    if(drag?.kind!=='pointer'||event.pointerId!==drag.pointerId)return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.start.x,event.clientY-drag.start.y)<5)return;
    drag.moved=true;event.preventDefault();event.stopPropagation();
    if(ide.root.dataset.figmaSidebar){delete ide.root.dataset.figmaSidebar;workspace.scheduleSync();}
    move(event);
  },{capture:true});
  listen(doc,'pointerup',event=>{
    if(drag?.kind!=='pointer'||event.pointerId!==drag.pointerId)return;
    event.preventDefault();event.stopPropagation();
    workspace.safe(()=>{try{if(drag.moved)drop(event);else workspace.chooseTool(drag.type);}finally{cancel(false);}});
  },{capture:true});
  listen(doc,'pointercancel',event=>{if(drag?.kind==='pointer'&&event.pointerId===drag.pointerId)cancel();},{capture:true});
  listen(ide.root,'lostpointercapture',event=>{if(drag?.kind==='pointer'&&event.pointerId===drag.pointerId)cancel();});
  listen(ide.toolboxGrid,'click',event=>{if(event.target.closest('[data-asset-grip]')){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  listen(ide.toolboxGrid,'keydown',event=>{
    const grip=event.target.closest('[data-asset-grip]');if(!grip||!['Enter',' '].includes(event.key)||drag)return;
    event.preventDefault();event.stopPropagation();if(!start(grip.dataset.assetGrip,'keyboard',grip))return;
    delete ide.root.dataset.figmaSidebar;
    const r=drag.designer.formView.content.getBoundingClientRect(),s=drag.designer.root.getBoundingClientRect();
    move({clientX:(Math.max(r.left,s.left)+Math.min(r.right,s.right))/2,clientY:(Math.max(r.top,s.top)+Math.min(r.bottom,s.bottom))/2});
    drag.designer.root.focus({preventScroll:true});
  });
  listen(doc,'keydown',event=>{
    if(!drag)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel();return;}
    if(drag.kind!=='keyboard'||event.ctrlKey||event.metaKey||event.isComposing)return;
    if(event.key==='Tab'){cancel();return;}
    if(!['Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Alt'].includes(event.key))return;
    event.preventDefault();event.stopImmediatePropagation();
    const point={...latest,altKey:event.altKey};if(!Number.isFinite(point.clientX))return;
    if(event.key==='Enter'){workspace.safe(()=>{try{drop(point);}finally{cancel(false);}});return;}
    const step=(event.shiftKey?10:1)*(Number(drag.designer.settings.gridSize)||120)/15*drag.designer.zoom;
    point.clientX+=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;
    point.clientY+=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;move(point);
  },{capture:true});
  listen(view,'blur',()=>cancel());listen(view,'pagehide',()=>cancel());
  return {decorate,cancel,get active(){return !!drag;},dispose(){if(disposed)return;disposed=true;cancel(false);abort.abort();
    for(const b of ide.toolboxGrid.querySelectorAll('button[data-control-type]')){
      b.removeAttribute('draggable');
      const surface=b.querySelector(':scope > .figma-asset-drag-surface');
      if(surface)surface.replaceWith(...surface.childNodes);
      const card=b.parentElement;if(card?.classList.contains('figma-asset-card')){card.before(b);card.remove();}
    }
    for(const n of [ghost,targetBox,footprint,line,status])n.remove();}};
}
