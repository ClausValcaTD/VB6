import {parentIds} from '../../layout/model.js';

export const FIGMA_SETTINGS_KEY='vb6-studio-web.figma-workspace.v1';
export const FIGMA_DEFAULTS=Object.freeze({mode:'classic',scheme:'light',units:'px'});
export function normalizeFigmaSettings(value={}){
  return {mode:value?.mode==='figma'?'figma':'classic',scheme:['light','dark','system'].includes(value?.scheme)?value.scheme:'light',units:value?.units==='twips'?'twips':'px'};
}
export function loadFigmaSettings(storage){try{return normalizeFigmaSettings(JSON.parse(storage?.getItem(FIGMA_SETTINGS_KEY)||'{}'));}catch{return {...FIGMA_DEFAULTS};}}
export function saveFigmaSettings(storage,value){storage?.setItem(FIGMA_SETTINGS_KEY,JSON.stringify(normalizeFigmaSettings(value)));}
export function displayLength(value,units){return Math.round(Number(value)/(units==='px'?15:1)*100)/100;}
export function modelLength(text,units,{size=false}={}){
  if(typeof text!=='string'||!text.trim())throw new TypeError('Enter a dimension.');
  const value=Number(text)*(units==='px'?15:1);
  if(!Number.isFinite(value)||Math.abs(value)>300000||size&&value<0)throw new RangeError('Dimensions must be finite, within ±300000 twips, and sizes nonnegative.');
  return Math.round(value*1000)/1000;
}
export function constraintAxis(anchor,axis){return axis==='x'?(anchor>>2)&3:anchor&3;}
export function setConstraintAxis(anchor,axis,value){
  if(!Number.isInteger(value)||value<0||value>3)throw new RangeError('Invalid anchor constraint');
  return axis==='x'?(anchor&3)|(value<<2):(anchor&12)|value;
}
export function zoomAt(state,zoom,point){
  const z=Math.min(8,Math.max(.1,Number(zoom)||1)),ratio=z/state.zoom;
  return {zoom:z,x:point.x-(point.x-state.x)*ratio,y:point.y-(point.y-state.y)*ratio};
}
export function fitViewport(width,height,bounds,{padding=64,maxZoom=2}={}){
  const zoom=Math.min(maxZoom,Math.max(.1,Math.min(Math.max(1,width-padding*2)/Math.max(1,bounds.width),Math.max(1,height-padding*2)/Math.max(1,bounds.height))));
  return {zoom,x:(width-bounds.width*zoom)/2-bounds.x*zoom,y:(height-bounds.height*zoom)/2-bounds.y*zoom};
}
/** Stable, iterative pre-order traversal. Ancestors of search hits remain visible.
 * Corrupt/orphaned imported nodes are surfaced once, never recursively traversed. */
export function layerRows(form,{collapsed=new Set(),query=''}={}){
  if(!form)return [];
  const controls=form.controls||[],parents=parentIds(controls),byId=new Map(controls.map(c=>[c.id,c])),children=new Map(),q=query.trim().toLocaleLowerCase(),visible=new Set();
  for(const c of controls){const parent=byId.has(parents.get(c.id))?parents.get(c.id):null;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(c);}
  if(q)for(const c of controls)if((c.name+' '+c.type).toLocaleLowerCase().includes(q))for(let id=c.id;id!=null&&!visible.has(id);id=parents.get(id))visible.add(id);
  const result=[],seen=new Set(),stack=[...(children.get(null)||[])].reverse().map(c=>({c,depth:1}));
  const visit=()=>{while(stack.length){const {c,depth}=stack.pop();if(seen.has(c.id))continue;seen.add(c.id);if(q&&!visible.has(c.id))continue;
    const list=children.get(c.id)||[];result.push({control:c,depth,hasChildren:!!list.length,expanded:!!list.length&&(!!q||!collapsed.has(c.id)),parentId:parents.get(c.id)??null});
    if(q||!collapsed.has(c.id))for(let i=list.length-1;i>=0;i--)stack.push({c:list[i],depth:depth+1});
  }};
  visit();
  // A collapsed descendant is not an orphan. Only disconnected graph components
  // need the fallback; validate ancestry iteratively with shared reachability.
  const reachable=new Set(),queue=[...(children.get(null)||[])];
  for(let i=0;i<queue.length;i++){const c=queue[i];if(reachable.has(c.id))continue;reachable.add(c.id);queue.push(...children.get(c.id)||[]);}
  for(const c of controls)if(!reachable.has(c.id)&&!seen.has(c.id)){stack.push({c,depth:1});visit();}
  return result;
}
/** Build a mode-specific profile without changing the canonical classic snapshot. */
export function figmaDockProfile(snapshot){
  const value=structuredClone(snapshot),left=['figma-layers','toolbox','project'],right=['properties','auto-layout','figma-tool-agent'];
  const moved=new Set([...left,...right,'layout']);
  for(const group of value.groups){group.tabs=group.tabs.filter(id=>!moved.has(id));if(!group.tabs.includes(group.active))group.active=group.tabs[0]||null;}
  value.groups=value.groups.filter(group=>group.tabs.length);
  const known=new Map(value.windows.map(w=>[w.id,w]));
  for(const [id,edge,tabs,active]of [['figma-left','left',left,'figma-layers'],['figma-right','right',right,'properties']]){
    const found=tabs.filter(t=>known.has(t));if(!found.length)continue;
    value.groups.push({id,edge,tabs:found,active:found.includes(active)?active:found[0],weight:1,bounds:{x:90,y:90,width:300,height:500}});
    for(const name of found){const win=known.get(name);win.group=id;if(name!=='figma-tool-agent')win.hidden=false;win.dockable=true;}
  }
  if(known.has('layout'))known.get('layout').hidden=true;
  value.sizes={...value.sizes,left:256,right:304};return value;
}
