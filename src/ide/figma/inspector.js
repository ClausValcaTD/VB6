import {el} from '../../core/core.js';
import {createFigmaPropertyPanel} from './property-panel.js';
import {layoutEnabled,layoutDefaults,layoutEligible} from '../../layout/contract.js';
import {editLayoutProperties,layoutTargets} from '../../layout/authoring.js';
import {displayLength,modelLength,constraintAxis,setConstraintAxis} from './model.js';
import {figmaIcon} from './icons.js';

/** Compact design controls delegate to the existing property/history services.
 * The complete property inspector and auto-layout editor are moved, not cloned. */
export function createFigmaInspector(workspace){
  const {ide}=workspace,root=el('section',{class:'figma-design-inspector','aria-label':'Design inspector'}),fields=new Map(),axes=new Map();
  const name=el('input',{'aria-label':'Layer name',class:'figma-layer-title',spellcheck:false}),type=el('div',{class:'figma-muted'}),units=el('select',{'aria-label':'Position units'},el('option',{value:'px'},'px'),el('option',{value:'twips'},'twips'));
  const alignment=el('div',{class:'figma-alignment',role:'toolbar','aria-label':'Align selection'});
  for(const [glyph,command,title]of [['left','left','Align left'],['center','centerHorizontal','Align horizontal centers'],['right','right','Align right'],['top','top','Align top'],['middle','centerVertical','Align vertical centers'],['bottom','bottom','Align bottom']])alignment.append(el('button',{title,'aria-label':title,onclick:()=>{if(workspace.writable())workspace.safe(()=>ide.command('align:'+command));}},figmaIcon(glyph)));
  const position=el('div',{class:'figma-properties-grid'}),positionTitle=el('div',{class:'figma-section-title'},el('strong',{},'Position'),units);
  const add=(key,label)=>{
    const input=el('input',{'aria-label':'Design '+label,type:'text',inputmode:'decimal',spellcheck:false,'data-figma-property':key}),row=el('label',{class:'figma-property'},el('span',{},label),input);position.append(row);fields.set(key,{input,row});
    input.addEventListener('change',()=>workspace.safe(()=>{
      if(!workspace.writable()||input.dataset.cancel)return;const targets=getTargets(),formOnly=targets.length===1&&targets[0]===workspace.currentDesigner()?.module.form,property=formOnly&&key==='Width'?'ClientWidth':formOnly&&key==='Height'?'ClientHeight':key;
      ide.setProperty(property,modelLength(input.value,workspace.settings.units,{size:key==='Width'||key==='Height'}));
    }));
    input.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();input.dataset.cancel='true';sync(true);input.blur();delete input.dataset.cancel;}else if(event.key==='Enter'){event.preventDefault();input.dispatchEvent(new Event('change'));}});
  };
  for(const [key,label]of [['Left','X'],['Top','Y'],['Width','W'],['Height','H']])add(key,label);
  const constraint=el('section',{class:'figma-constraint-section'}),pad=el('div',{class:'figma-constraint-pad','aria-label':'Anchor edges',role:'group'}),edgeButtons=[];
  const applyAnchor=operation=>workspace.safe(()=>{
    if(!workspace.writable()||!layoutEnabled(ide.project))return;const ids=[...workspace.currentDesigner().selection];
    ide.autoLayout.commit('Set anchor constraints',form=>{for(const target of layoutTargets(form,ids))editLayoutProperties(form,target===form?[]:[target.id],{Anchor:operation(target.properties.Anchor??5)});return ids;});
  });
  for(const [edge,bit]of [['top',1],['bottom',2],['left',4],['right',8]]){const button=el('button',{class:'figma-anchor-'+edge,'aria-label':'Anchor '+edge,title:'Toggle '+edge+' anchor','aria-pressed':'false',onclick:()=>applyAnchor(a=>a^bit)});edgeButtons.push({button,bit});pad.append(button);}
  pad.append(el('span',{class:'figma-anchor-box','aria-hidden':'true'}));
  const axisFields=el('div',{class:'figma-constraint-fields'});
  for(const [axis,label,labels]of [['x','Horizontal constraint',['Center','Left','Right','Left and right']],['y','Vertical constraint',['Center','Top','Bottom','Top and bottom']]]){
    const select=el('select',{'aria-label':label},el('option',{value:'',hidden:true},'Mixed'),...labels.map((text,i)=>el('option',{value:i},text)));axes.set(axis,select);axisFields.append(el('label',{},el('span',{class:'figma-muted'},label),select));select.addEventListener('change',()=>{if(select.value!=='')applyAnchor(a=>setConstraintAxis(a,axis,Number(select.value)));});
  }
  constraint.append(el('strong',{class:'figma-section-title'},'Constraints'),el('div',{class:'figma-constraints'},pad,axisFields),el('p',{class:'figma-help'},'Anchors resize against the parent. Flow children use auto layout; Ignore auto layout enables absolute constraints.'));
  const enable=el('button',{class:'figma-enable-layout',onclick:()=>workspace.enableLayout()},'Enable auto layout and anchoring');
  const layout=el('details',{class:'figma-inspector-section',open:true}),layoutContent=el('div',{class:'figma-layout-content'});layout.append(el('summary',{},'Auto layout'),el('p',{class:'figma-help'},'Layout dimensions use VB6 twips (15 twips = 1 CSS pixel).'),layoutContent);
  const all=el('section',{class:'figma-all-properties','aria-label':'VB6 property sections'}),allContent=el('div',{class:'figma-all-properties-content'});all.append(allContent);
  const originals=[ide.inspector.object,ide.inspector.tabs,ide.inspector.wrapper,ide.inspector.description],places=originals.map(node=>({node,parent:node.parentNode,next:node.nextSibling}));allContent.append(...originals);
  const events=el('button',{class:'figma-events',onclick:()=>{if(workspace.writable()){const target=getTargets()[0];ide.eventDialog(target===workspace.currentDesigner()?.module.form?'Form':target?.name||'Form');}}},'Edit VB6 events…');
  root.append(el('div',{class:'figma-selection-title'},name,type),alignment,positionTitle,position,all,constraint,enable,layout,events);
  ide.propertiesPanel.append(root);
  const properties=createFigmaPropertyPanel(workspace);
  let mounted=null,selectionKey='';
  const getTargets=()=>{const d=workspace.currentDesigner();return d?(d.selected().length?d.selected():[d.module.form]):[];};
  name.addEventListener('change',()=>workspace.safe(()=>{if(workspace.writable()&&!name.dataset.cancel)ide.setProperty('Name',name.value);}));
  name.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();name.dataset.cancel='true';sync(true);name.blur();delete name.dataset.cancel;}});
  units.addEventListener('change',()=>workspace.configure({...workspace.settings,units:units.value}));
  function sync(force=false){
    root.hidden=ide.activeDoc?.view==='code';
    const targets=getTargets(),selection=ide.activeDoc?.key+':'+targets.map(t=>t.id||t.name).join(','),changed=selection!==selectionKey;selectionKey=selection;
    const writable=workspace.writable(),active=root.ownerDocument.activeElement;
    if(force||changed||active!==name)name.value=targets.length===1?targets[0].name:targets.length?targets.length+' controls':'';
    name.disabled=!writable||targets.length!==1;type.textContent=targets.length===1?targets[0].type:targets.length?'Mixed selection':'Select a form or control';units.value=workspace.settings.units;
    for(const button of alignment.children)button.disabled=!writable||!workspace.currentDesigner()?.selection.size;
    for(const [key,{input,row}]of fields){
      const formOnly=targets.length===1&&targets[0]===workspace.currentDesigner()?.module.form,property=formOnly&&key==='Width'?'ClientWidth':formOnly&&key==='Height'?'ClientHeight':key;
      const supported=targets.length&&targets.every(t=>typeof t.properties?.[property]==='number'),values=targets.map(t=>t.properties?.[property]),mixed=values.some(v=>v!==values[0]);row.hidden=!supported;input.disabled=!writable||!supported;
      if(force||changed||active!==input){input.value=!supported||mixed?'':String(displayLength(values[0],workspace.settings.units));input.placeholder=mixed?'Mixed':'';input.dataset.mixed=String(mixed);}
      input.title=property+' — '+workspace.settings.units+(formOnly&&['Width','Height'].includes(key)?' (client area)':'');
    }
    const anchorable=layoutEnabled(ide.project)&&targets.length&&targets.every(t=>Object.hasOwn(layoutDefaults(t),'Anchor'));
    constraint.hidden=!anchorable;
    for(const [axis,select]of axes){const values=targets.map(t=>constraintAxis(t.properties.Anchor??5,axis)),mixed=values.some(v=>v!==values[0]);select.value=mixed?'':String(values[0]);select.disabled=!writable||!anchorable;}
    for(const {button,bit}of edgeButtons){const values=targets.map(t=>!!((t.properties.Anchor??5)&bit)),mixed=values.some(v=>v!==values[0]);button.setAttribute('aria-pressed',mixed?'mixed':String(!!values[0]));button.disabled=!writable||!anchorable;}
    const enabled=layoutEnabled(ide.project);enable.hidden=enabled;enable.disabled=!writable;layout.hidden=!enabled||!targets.length||!targets.every(layoutEligible);events.disabled=!writable||targets.length!==1;
    const body=ide.autoLayout?.panel?ide.autoLayout.body:null;
    if(body!==mounted){mounted?.remove();mounted=body;if(body)layoutContent.append(body);}
    if(body&&body.parentNode!==layoutContent)layoutContent.append(body);
    if(ide.autoLayout?.panel&&!ide.docking.model.windows.get('auto-layout')?.hidden){ide.docking.model.show('auto-layout',false);ide.docking.render();}
  }
  return {root,sync,focusName(){sync(true);name.focus({preventScroll:true});name.select();},showLayout(){layout.open=true;ide.docking.activate('properties');layout.scrollIntoView({block:'nearest'});},dispose(){
    properties.dispose();
    if(mounted){if(ide.autoLayout?.panel)ide.autoLayout.panel.append(mounted);else mounted.remove();}
    for(let i=places.length-1;i>=0;i--){const {node,parent,next}=places[i];parent.insertBefore(node,next?.parentNode===parent?next:null);}root.remove();
  }};
}
