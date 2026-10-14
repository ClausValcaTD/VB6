/** Native CallByName for statically typed classes and native HWND controls.
 * Names/call types are evaluated at runtime; public member dispatch selects
 * compiled methods, not a source interpreter. Args are value snapshots as in
 * the runtime's CallByName ParamArray contract.
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/callbyname-function
 */
import {planNativeArguments} from './call-plan.js';
import {mem32} from './x86-operands.js';
const key=v=>String(v).toLowerCase(),lit=value=>({kind:'literal',value}),arg=argument=>({argument});
const slot=v=>mem32({base:'ebp',displacement:v.offset});
const props={caption:'string',text:'string',visible:'boolean',enabled:'boolean',left:'long',top:'long',width:'long',height:'long',tag:'string',fontname:'string',fontsize:'double',fontbold:'boolean',fontitalic:'boolean',fontunderline:'boolean',fontstrikethru:'boolean'};
export function nativeCallByNameType(c,node){return node.kind==='call'&&node.callee.kind==='id'&&key(node.callee.name)==='callbyname'&&!c.resolveProcedure(node.callee)?'variant':null;}
export function nativeCallByName(c,node){
 if(!nativeCallByNameType(c,node))return false;
 const args=node.args,x=c.x;
 if(args.length<3||args.some(a=>['missing','named'].includes(a.kind)))c.fail('Native CallByName requires object, name, call type and positional arguments');
 const d=c.nativeClassExpressionType(args[0]);let object,receiver;
 if(d){c.nativeClassReceiver(args[0],d);receiver=c.arrayWorkspace(4,'dispatch-receiver');x.mov(slot(receiver),'eax');}
 else {
  object=c.object(args[0]);
  if(!object||!(object.form||object.model)||object.controlArray)c.fail('Native CallByName requires a typed class or a native form/control receiver');
  c.ensure(object);const handle=c.arrayWorkspace(4,'dispatch-hwnd');x.value(c.controlHandleRef(object)).mov(slot(handle),'eax');
  object={...object,handleSlot:handle,indexed:false,boundIndex:!!object.indexed,nativeCapturedControl:true};
 }
 c.textExpression(args[1]);const name=c.arrayWorkspace(4,'dispatch-name');x.mov(slot(name),'eax');
 c.numeric(args[2]);const mode=c.arrayWorkspace(4,'dispatch-kind');x.mov(slot(mode),'eax');
 const values=args.slice(3).map(a=>{
  const cls=c.nativeClassExpressionType(a);
  if(cls){c.nativeClassValue(a,cls);const v=c.arrayWorkspace(4,'dispatch-reference');x.mov(slot(v),'eax');return {kind:'nativeClassValue',descriptor:cls,value:arg(v.offset)};}
  c.boxVariant(a);const v=c.temporaryVariant();c.storeVariant(v);return {kind:'group',expr:c.nativeKernelStorage(v)};
 });
 const output=c.temporaryVariant(),done=x.unique(),entries=[];
 if(d){
  for(const target of d.module.procedures.values())if(target.proc.scope!=='private')entries.push({name:target.proc.name,mode:target.proc.nativeProperty?{get:2,let:4,set:8}[target.proc.nativeProperty]:1,target});
  for(const f of d.module.globals.values())if(f.scope!=='private'){
   entries.push({name:f.name,mode:2,field:f});entries.push({name:f.name,mode:f.nativeClassRef||f.nativeCollectionRef?8:4,field:f});
  }
 }else for(const [p,type]of Object.entries(props))for(const mode of [2,4])entries.push({name:p,mode,controlProperty:p,type});
 const knownName=args[1].kind==='literal'&&typeof args[1].value==='string'?key(args[1].value):null;
 const knownMode=args[2].kind==='literal'?Number(args[2].value):c.nativeConstant(args[2])?.value;
 const emitError=n=>x.value(n).jump('native:error:raise');
 const publish=type=>{
  const temp=type==='variant'?c.temporaryVariant():type==='string'?c.temporaryString():Object.assign(c.arrayWorkspace(['double','date','currency'].includes(type)?8:4,'dispatch-value'),{type});
  c.store(temp);c.boxVariant(c.nativeKernelStorage(temp));c.storeVariant(output);x.jump(done);
 };
 for(const e of entries){
  if(knownName!==null&&key(e.name)!==knownName||knownMode!==undefined&&knownMode!==e.mode)continue;
  const next=x.unique();x.value(arg(mode.offset)).compare(e.mode).branch('ne',next);
  c.compareNativeStrings(c.nativeKernelValue(arg(name.offset),'string'),lit(e.name),lit(1));x.test().branch('ne',next);
  if(e.target){
   let valid=true;try{planNativeArguments(e.target.proc,values,m=>{throw Error(m);});}catch{valid=false;}
   if(!valid)emitError(450);
   else if(c.nativeClassDescriptor(e.target.proc.returnType)||['collection','vba.collection'].includes(key(e.target.proc.returnType)))emitError(438);
   else {c.nativeTypedCall({...e.target,nativeInstanceArgument:arg(receiver.offset)},c.nativeCallPlan(e.target,values));
    if(e.target.proc.kind==='function')publish(key(e.target.proc.returnType));else {c.clearVariantStorage(output);x.jump(done);}}
  }else if(e.field){
   if(values.length!==(e.mode===2?0:1))emitError(450);
   else {const field={...e.field,nativeInstancePointer:arg(receiver.offset)};
    if(e.mode===2){if(field.nativeClassRef||field.nativeCollectionRef)emitError(438);else{c.load(field);publish(key(field.type));}}
    else {c.storageExpression(field,values[0]);c.store(field);c.clearVariantStorage(output);x.jump(done);}}
  }else{
   if(values.length!==(e.mode===2?0:1))emitError(450);
   else if(e.mode===2){c.getProperty(object,e.controlProperty);publish(e.type);}
   else {c.setProperty(object,e.controlProperty,values[0]);c.clearVariantStorage(output);x.jump(done);}
  }
  x.label(next);
 }
 emitError(438);x.label(done);c.rawStorageAddress(output);return true;
}
