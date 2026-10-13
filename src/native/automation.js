import {nativeGridDataType,nativeGridDataGet,nativeGridDataAssignment} from './grid-data-source.js';
/** External Automation values remain owned VARIANTs. Every chain hop executes
 * IDispatch, never a JS object model. Input views borrow statement snapshots;
 * typed ByRef views pin exact caller storage. Results publish only on success.
 */
import {nativeFormInstanceMethods as base} from './form-instances.js';
import {nativeDynamicControlMethods as dynamic} from './dynamic-controls.js';
import {nativeStorageMethods as storage} from './storage.js';
import {NATIVE_VARIANT_TYPES} from './variant-types.js';
import {planNativeArguments} from './call-plan.js';
import {planAutomationArguments} from './automation-plan.js';
import {mem16,mem32} from './x86-operands.js';
const P='native:automation:',key=v=>String(v).toLowerCase(),arg=argument=>({argument});
const at=(base,displacement=0)=>mem32({base,displacement}),slot=v=>at('ebp',v.offset);
const lit=value=>({kind:'literal',value});
export const nativeAutomationMethods={
 automationUse(){
  this.nativeAutomationUsed=true;this.useVariant('copy');
  if(!this.nativeAutomationSlots){this.nativeAutomationSlots=true;this.slot(P+'thread');
   this.nativeAdditionalErrors ||= new Map();
   for(const [n,s]of [[440,'Automation error'],[448,'Named argument not found'],[424,'Object required'],[429,"ActiveX component can't create object"],[438,"Object doesn't support this property or method"],[450,'Wrong number of arguments or invalid property assignment']])this.nativeAdditionalErrors.set(n,s);
  }
 },
 allocateStorage(variable){
  if(!variable.nativeAutomationObject)return storage.allocateStorage.call(this,variable);
  // Object is Nothing, not Empty, even before the application entry point runs.
  this.data.align(4).label(variable.label).u32(9).zero(12);
 },
 prepareNativeFlow(context){
  dynamic.prepareNativeFlow.call(this,context);
  if(context.returnValue&&context.proc.nativeAutomationReturn)context.returnValue.nativeAutomationObject=true;
 },
 initializeFixedString(variable){
  if(!variable.nativeAutomationObject)return dynamic.initializeFixedString.call(this,variable);
  this.automationUse();this.rawStorageAddress(variable);
  if(variable.parameter||variable.ownedParameter)this.x.call(P+'check-object');
  else this.x.mov(at('eax'),9);
 },
 nativeReferenceArgument(parameter,node,omitted=false){
  if(!parameter.nativeAutomationObject)return dynamic.nativeReferenceArgument.call(this,parameter,node,omitted);
  if(node.kind!=='group'&&!omitted){
   const v=this.variable(node);
   if(v){if(!v.nativeAutomationObject)this.fail('ByRef Automation Object requires exact Object storage; group a Variant to pass an isolated value');this.address(v);return {};}
  }
  this.boxVariant(node);this.automationUse();this.x.call(P+'check-object');const temporary=this.temporaryVariant();this.storeVariant(temporary);this.rawStorageAddress(temporary);return {temporary};
 },
 automationCreate(node){return node.kind==='call'&&node.callee.kind==='id'&&key(node.callee.name)==='createobject'&&!this.resolveProcedure(node.callee);},
 automationReceiver(node){return !!this.nativeAutomationMode&&this.type(node)==='variant';},
 automationMember(node){
  if(!this.nativeAutomationMode)return null;
  const member=node.kind==='call'?node.callee:node;
  if(member.kind==='member'&&this.automationReceiver(member.object))return {receiver:member.object,name:lit(member.name),args:node.kind==='call'?node.args:[],flags:node.kind==='call'?3:2};
  return null;
 },
 computeNativeType(node){
  const dataType=nativeGridDataType(this,node);if(dataType)return dataType;
  if(this.nativeAutomationMode){
   if(this.automationCreate(node)||node.kind==='nothing'||this.automationMember(node))return 'variant';
   if(node.kind==='with'&&this.nativeWithBinding().object?.nativeAutomationWith)return 'variant';
   if(node.kind==='binary'&&node.op==='is'&&(this.automationReceiver(node.left)||this.automationReceiver(node.right)))return 'boolean';
  }
  return base.computeNativeType.call(this,node);
 },
 expression(node){
  if(nativeGridDataGet(this,node))return;
  if(!this.nativeAutomationMode)return base.expression.call(this,node);
  if(this.automationCreate(node)){
   this.automationUse();const plan=planNativeArguments({name:'CreateObject',params:[{name:'class'},{name:'servername',optional:true}]},node.args,m=>this.fail(m));
   if(!plan.slots[1].omitted)this.fail('Native CreateObject currently activates local servers only; omit servername');
   this.textExpression(plan.slots[0].node);const x=this.x,out=this.temporaryVariant();x.push();this.rawStorageAddress(out);x.push().call(P+'create');return;
  }
  if(node.kind==='nothing'){this.automationUse();this.variantSeed(9);return;}
  if(node.kind==='with'&&this.nativeWithBinding().object?.nativeAutomationWith){const b=this.nativeWithBinding();this.withGuard(b.active);this.loadVariant(b.object.storage);return;}
  if(node.kind==='binary'&&node.op==='is'&&(this.automationReceiver(node.left)||this.automationReceiver(node.right))){
   this.automationUse();this.boxVariant(node.left);this.x.push();this.boxVariant(node.right);this.x.popOperand('edx').pushOperand('eax').pushOperand('edx').call(P+'identity');return;
  }
  const call=this.automationMember(node);if(call){this.automationInvoke(call.receiver,call.name,call.flags,call.args);return;}
  // A Variant function result may be an Automation collection's default member.
  if(node.kind==='call'&&(['call','group'].includes(node.callee.kind)||this.variable(node.callee)?.nativeAutomationObject)&&this.automationReceiver(node.callee)){this.automationInvoke(node.callee,null,3,node.args);return;}
  return base.expression.call(this,node);
 },
 automationArgument(node,{value=false}={}){
  const x=this.x;
  if(node.kind==='missing'){this.variantSeed(10,0x80020004);return;}
  const v=!value&&node.kind!=='group'?this.variable(node):null;
  if(v){
   if(v.nativeRecord||v.nativeInlineString||v.fixedLength)this.fail('Group fixed String/record Automation arguments to pass a value; direct ByRef ABI is not supported');
   if(!v.nativeArray||v.elementOf){
    const tag=NATIVE_VARIANT_TYPES[key(v.type)];if(tag===undefined)this.fail('Private native object references cannot be passed to external Automation');
    const pin=this.address(v);x.push();const view=this.arrayWorkspace(16,'automation-reference');this.zeroStorage(view);this.rawStorageAddress(view);
    x.popOperand('edx').mov(at('eax'),0x4000|tag).mov(at('eax',8),'edx');return {pin};
   }
  }
  this.boxVariant(node);
 },
 automationInvoke(receiver,name,flags,args,{put=false}={}){
  this.automationUse();const x=this.x,plan=planAutomationArguments(args,{put,fail:m=>this.fail(m)});
  this.boxVariant(receiver);const recv=this.arrayWorkspace(4,'automation-receiver');x.mov(slot(recv),'eax');
  // Name/receiver snapshots precede operands; a named actual cannot replace them.
  const names=this.arrayWorkspace(4*(plan.names.length+1),'automation-names');
  if(name){this.textExpression(name);x.mov(slot(names),'eax');for(const [i,n]of plan.names.entries())x.value(this.string(n)).mov(at('ebp',names.offset+(i+1)*4),'eax');}
  else if(plan.names.length)this.fail('Named arguments require an explicit Automation member name');
  const views=this.arrayWorkspace(Math.max(16,plan.entries.length*16),'automation-arguments'),pins=[];
  for(const e of plan.entries){
   const reference=this.automationArgument(e.node,{value:e.put});if(reference?.pin)pins.push(reference.pin);
   const offset=views.offset+plan.abi.indexOf(e)*16;x.mov('esi','eax').local(offset).mov('edi','eax').mov('ecx',4).cld().repMove(32);
  }
  const out=this.temporaryVariant();
  x.push(plan.entries.length).push({address:views.offset}).push(flags).push(name?plan.names.length+1:0).push(name?{address:names.offset}:0).push(arg(recv.offset));
  this.rawStorageAddress(out);x.push().call(P+'invoke');
  for(const pin of pins)this.releaseArrayPin(pin);
 },
 nativeFlowInstruction(ins,context,index){
  if(nativeGridDataAssignment(this,ins))return true;
  if(!this.nativeAutomationMode)return base.nativeFlowInstruction.call(this,ins,context,index);
  if(ins.op==='assign'){
   const member=this.automationMember(ins.target);if(member){this.automationInvoke(member.receiver,member.name,ins.objectSet?8:4,[...member.args,ins.expr],{put:true});return true;}
   const v=this.variable(ins.target);
   if(v&&key(v.type)==='variant'&&(ins.objectSet||v.nativeAutomationObject)){
    if(v.nativeAutomationObject&&!ins.objectSet)this.fail('Native Automation Object assignment requires Set or an explicit property');
    this.boxVariant(ins.expr);this.automationUse();this.x.call(P+'check-object');this.storeVariant(v);return true;
   }
  }
  if(ins.op==='withPush'&&this.automationReceiver(ins.expr)){
   const x=this.x,v=this.arrayWorkspace(16,'automation-with');v.type='Variant';context.locals.set(v.name,v);
   const active=this.arrayWorkspace(4,'automation-with-active');context.locals.set(active.name,active);
   this.boxVariant(ins.expr);this.automationUse();x.call(P+'check-object');this.storeVariant(v);x.mov(slot(active),-1);
   context.withBindings.push({active,object:{nativeAutomationWith:true,storage:v}});return true;
  }
  if(ins.op==='withPop'&&context.withBindings.at(-1)?.object?.nativeAutomationWith)this.clearVariantStorage(context.withBindings.at(-1).object.storage);
  if(ins.op==='withUnwind')for(const b of ins.count?context.withBindings.slice(-ins.count):[])if(b.object?.nativeAutomationWith)this.clearVariantStorage(b.object.storage);
  return base.nativeFlowInstruction.call(this,ins,context,index);
 },
 shutdownNativePictures(){
  base.shutdownNativePictures.call(this);
  if(!this.nativeAutomationUsed)return;
  const seen=new Set();for(const m of this.modules.values())if(!m.nativeClass){
   for(const v of [...m.globals.values(),...[...m.procedures.values()].flatMap(p=>[...p.locals.values()].filter(v=>v.label))])if(v.label&&key(v.type)==='variant'&&!v.nativeArray&&!seen.has(v.label)){seen.add(v.label);this.clearVariantStorage({...v,owner:null});}
  }
  this.x.call(P+'shutdown');
 }
};
