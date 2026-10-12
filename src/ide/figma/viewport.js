import {fitViewport,zoomAt} from './model.js';

const typing=target=>!!target?.closest?.('input,textarea,select,[contenteditable="true"],.code-pane');
/** View-only transform: model coordinates, selection geometry and undo stay in
 * twips. The entire designer plane moves, including the form resize handles. */
export function installFigmaViewport(designer,workspace){
  const root=designer.root,plane=designer.plane,view=root.ownerDocument.defaultView;
  const abort=new AbortController(),signal=abort.signal,render=designer.render,setZoom=designer.setZoom,dispose=designer.dispose;
  const previous=workspace.classicViewportStates?.get(designer)||{zoom:designer.zoom,scrollLeft:root.scrollLeft,scrollTop:root.scrollTop,transform:plane.style.transform};
  let state={x:8,y:8,zoom:designer.zoom},gesture=null,space=false,frame=0,ready=false,width=0,height=0,disposed=false;
  const viewport={designer,hand:false,get state(){return {...state};}};
  const apply=()=>{
    if(disposed)return;
    plane.style.transform=`translate(${state.x-8}px, ${state.y-8}px)`;
    root.dataset.figmaHand=String(viewport.hand||space);root.dataset.figmaPanning=String(!!gesture);
    root.scrollLeft=root.scrollTop=0;workspace.scheduleSync();
  };
  const commit=next=>{
    state=next;
    if(designer.zoom!==state.zoom){designer.zoom=state.zoom;render.call(designer);}
    apply();
  };
  viewport.zoom=(value,point)=>{const rect=root.getBoundingClientRect();commit(zoomAt(state,value,point||{x:rect.width/2,y:rect.height/2}));};
  viewport.fit=(selection=false)=>{
    const rect=root.getBoundingClientRect(),node=designer.formView?.node;if(!node||!rect.width||!rect.height)return;
    let bounds={x:0,y:0,width:node.offsetWidth,height:node.offsetHeight};
    if(selection&&designer.selected().length){
      const origin=node.getBoundingClientRect(),boxes=designer.selected().map(c=>designer.formView?.controls?.find(v=>v.model.id===c.id)?.node?.getBoundingClientRect()).filter(Boolean);
      if(boxes.length){const left=Math.min(...boxes.map(r=>r.left)),top=Math.min(...boxes.map(r=>r.top)),right=Math.max(...boxes.map(r=>r.right)),bottom=Math.max(...boxes.map(r=>r.bottom));bounds={x:(left-origin.left)/designer.zoom,y:(top-origin.top)/designer.zoom,width:(right-left)/designer.zoom,height:(bottom-top)/designer.zoom};}
    }
    commit(fitViewport(rect.width,Math.max(1,rect.height-60),bounds));ready=true;
  };
  viewport.setHand=value=>{viewport.hand=!!value;if(value)designer.setTool('Pointer');apply();};
  const finish=(cancel=false)=>{
    if(!gesture)return;const old=gesture;gesture=null;if(cancel)state={...old.state};
    try{if(root.hasPointerCapture(old.id))root.releasePointerCapture(old.id);}catch{}
    apply();
  };
  viewport.cancel=()=>{finish(true);space=false;apply();};
  designer.render=function(...args){const result=render.apply(this,args);state.zoom=this.zoom;apply();return result;};
  designer.setZoom=function(value){viewport.zoom(value);};
  root.dataset.figmaViewport='true';
  root.addEventListener('wheel',event=>{
    if(typing(event.target))return;event.preventDefault();event.stopImmediatePropagation();finish();
    const factor=event.deltaMode===1?16:event.deltaMode===2?root.clientHeight:1;
    if(event.ctrlKey||event.metaKey){const rect=root.getBoundingClientRect();viewport.zoom(state.zoom*Math.exp(-Math.max(-200,Math.min(200,event.deltaY*factor))*.008),{x:event.clientX-rect.left,y:event.clientY-rect.top});}
    else{state.x-=event.shiftKey?event.deltaY*factor:event.deltaX*factor;state.y-=event.shiftKey?event.deltaX*factor:event.deltaY*factor;apply();}
  },{signal,capture:true,passive:false});
  root.addEventListener('pointerdown',event=>{
    if(!(event.button===1||event.button===0&&(viewport.hand||space))||typing(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();root.focus({preventScroll:true});
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,state:{...state}};root.setPointerCapture(event.pointerId);apply();
  },{signal,capture:true});
  root.addEventListener('pointermove',event=>{if(gesture?.id!==event.pointerId)return;event.preventDefault();event.stopImmediatePropagation();state.x=gesture.state.x+event.clientX-gesture.x;state.y=gesture.state.y+event.clientY-gesture.y;apply();},{signal,capture:true});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(type,event=>{if(gesture?.id!==event.pointerId)return;event.stopImmediatePropagation();finish(type!=='pointerup');},{signal,capture:true});
  root.addEventListener('keydown',event=>{
    if(typing(event.target)||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.code==='Space'){event.preventDefault();event.stopImmediatePropagation();space=true;apply();}
    else if(event.key==='Escape'&&(gesture||viewport.hand)){event.preventDefault();event.stopImmediatePropagation();viewport.cancel();viewport.setHand(false);}
    else if(event.shiftKey&&['Digit1','Digit2','Digit0'].includes(event.code)){event.preventDefault();event.stopImmediatePropagation();if(event.code==='Digit0')viewport.zoom(1);else viewport.fit(event.code==='Digit2');}
    else if(!event.shiftKey&&['v','h','f','t'].includes(event.key.toLowerCase())){event.preventDefault();event.stopImmediatePropagation();const key=event.key.toLowerCase();viewport.setHand(key==='h');if(key!=='h')workspace.chooseTool(({v:'Pointer',f:'Frame',t:'Label'})[key]);}
  },{signal,capture:true});
  view.addEventListener('keyup',event=>{if(event.code==='Space'&&space){space=false;apply();}},{signal,capture:true});
  view.addEventListener('blur',()=>viewport.cancel(),{signal});
  const resize=()=>{
    if(frame||disposed)return;frame=view.requestAnimationFrame(()=>{frame=0;const w=root.clientWidth,h=root.clientHeight;if(!w||!h)return;if(!ready)viewport.fit();else if(width&&height){state.x+=(w-width)/2;state.y+=(h-height)/2;apply();}width=w;height=h;});
  };
  const observer=new view.ResizeObserver(resize);observer.observe(root);resize();
  viewport.dispose=({restore=true}={})=>{
    if(disposed)return;finish();disposed=true;abort.abort();observer.disconnect();view.cancelAnimationFrame(frame);
    designer.render=render;designer.setZoom=setZoom;designer.dispose=dispose;delete root.dataset.figmaViewport;delete root.dataset.figmaHand;delete root.dataset.figmaPanning;plane.style.transform=previous.transform;
    if(restore){designer.zoom=previous.zoom;render.call(designer);root.scrollLeft=previous.scrollLeft;root.scrollTop=previous.scrollTop;
      view.requestAnimationFrame(()=>{if(root.isConnected&&!root.hasAttribute('data-figma-viewport')){root.scrollLeft=previous.scrollLeft;root.scrollTop=previous.scrollTop;}});}
    workspace.viewports.delete(designer);
  };
  designer.dispose=function(...args){viewport.dispose({restore:false});return dispose.apply(this,args);};
  return viewport;
}
