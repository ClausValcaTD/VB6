import {BASIC_CONTROL_TYPES,EXTENDED_CONTROL_TYPES,createControl,uniqueName} from '../../project/model.js';
import {layoutContainer,layoutEligible} from '../../layout/contract.js';
import {layoutEdit,worldBounds} from '../../layout/authoring.js';
import {parentIds} from '../../layout/model.js';

const standard=new Set([...BASIC_CONTROL_TYPES,...EXTENDED_CONTROL_TYPES].filter(t=>t!=='Pointer'));
export function isDesignerAsset(type,registry){return typeof type==='string'&&(standard.has(type)||registry?.has?.(type,true)===true);}
/** Build on a detached form. Neither a failed custom default/validator nor the
 * layout solver can publish a partially inserted control. Points are parent-
 * client-local twips, not page pixels or the outer Frame's title/border. */
export function insertDesignerAsset(form,type,{x,y,parentId=null,beforeId=null,ignore=false}={},
  {registry,layout=false,snap=true,gridSize=120}={}){
  if(!isDesignerAsset(type,registry))throw new TypeError('Unknown designer component: '+type);
  if(!form||!Array.isArray(form.controls)||form.controls.length>=10000)throw new RangeError('A form supports at most 10,000 controls.');
  if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>300000||Math.abs(y)>300000)throw new RangeError('Invalid drop position.');
  const step=snap?Number(gridSize):15;
  if(!Number.isFinite(step)||step<=0||step>1200)throw new RangeError('Invalid designer grid.');
  const name=uniqueName(null,registry?.describe?.(type)?.baseName||type,{form});
  const model=createControl(type,name);
  if(registry?.has?.(type,true))model.properties={...model.properties,...structuredClone(registry.defaults(type))};
  Object.assign(model.properties,{Name:name,Left:Math.round(x/step)*step,Top:Math.round(y/step)*step,
    TabIndex:form.controls.reduce((n,c)=>Math.max(n,Number(c.properties.TabIndex)||0),-1)+1});
  // Nonvisual components belong to the form and never take a slot in a flow.
  if(!layoutEligible(model)){parentId=null;beforeId=null;}
  const operation=draft=>{
    const parent=parentId===null?draft:draft.controls.find(c=>c.id===parentId);
    if(!parent||!layoutContainer(parent))throw new Error('The destination container no longer exists.');
    model.parent=parentId===null?null:parent.name;model.nativeParentId=parentId;
    if(layout&&ignore&&layoutEligible(model))model.properties.LayoutIgnore=-1;
    const parents=parentIds(draft.controls);
    let index=draft.controls.length;
    if(beforeId!==null){index=draft.controls.findIndex(c=>c.id===beforeId);if(index<0||parents.get(beforeId)!==parentId)throw new Error('The insertion target changed.');}
    else if(parentId!==null){const siblings=draft.controls.filter(c=>parents.get(c.id)===parentId);index=siblings.length?draft.controls.indexOf(siblings.at(-1))+1:draft.controls.indexOf(parent)+1;}
    for(const [key,value]of Object.entries(model.properties))if(/^(Left|Top|Width|Height)$/.test(key)&&(!Number.isFinite(value)||Math.abs(value)>300000||/Width|Height/.test(key)&&value<0))throw new RangeError('Invalid component geometry: '+key);
    // Read-only values originate in trusted registration metadata, not a
    // property edit. Preserve their defaults while validating editable values.
    const writable=Object.fromEntries(Object.entries(model.properties).filter(([key])=>!registry?.property?.(type,key)?.readOnly));
    registry?.validateProperties?.(type,writable);
    draft.controls.splice(index,0,model);worldBounds(draft);return [model.id];
  };
  if(layout)return layoutEdit(form,operation);
  const draft=structuredClone(form),selection=operation(draft);return {form:draft,selection};
}
