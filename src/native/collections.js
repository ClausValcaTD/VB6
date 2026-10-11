/** Native owned Collection references. This is a typed compiler extension, not
 * a Long alias exposed to arithmetic or a substitute scripting engine. Stored
 * entries own Automation values; object/IDispatch entries remain unsupported
 * until the general native object ABI is installed. */
import {COLLECTION_KERNEL} from './collection-kernel.js';
import {nativeCompilerStateMethods as state} from './compiler-state.js';
import {nativeCompilerExpressionMethods as expressions} from './compiler-expressions.js';
import {nativeStorageMethods as storage} from './storage.js';
import {nativeRecordMethods as records} from './records.js';
import {nativeCallMethods as calls} from './calls.js';
import {nativeNumericMethods as numeric} from './numeric.js';
import {nativeFlowMethods as flow} from './control-flow.js';
import {nativeErrorMethods as errors} from './errors.js';
import {nativeControlMethods as controls} from './controls.js';
import {planNativeArguments} from './call-plan.js';
import {mem32} from './x86-operands.js';
const key=v=>String(v).toLowerCase(),isType=t=>['collection','vba.collection'].includes(key(t));
const at=(base,displacement=0)=>mem32({base,displacement}),arg=argument=>({argument});
const isNothing=n=>n?.kind==='nothing'||n?.kind==='group'&&isNothing(n.expr);
const local=v=>v.label?mem32({label:v.label}):at('ebp',v.offset);
export const nativeCollectionMethods={
 scalar(decl){
  if(!isType(decl.type))return state.scalar.call(this,decl);
  if(decl.bounds!=null||decl.withEvents)this.fail('Native Collection storage currently requires a scalar without WithEvents');
  return Object.assign(decl,{type:'Collection',nativeCollectionRef:true,nativeBytes:4,nativeCount:1,nativeElementBytes:4});
 },
 collectionKernel(){
  if(!this.nativeCollectionKernel){
   this.useVariant('copy');
   this.nativeCollectionKernel=this.privateNativeKernel('NativeCollectionService',COLLECTION_KERNEL,{
    word:(c,p)=>{const x=c.x;x.label(p.label).enter().value(arg(8)).mov('edx','eax').value(arg(12)).mov('eax',mem32({base:'edx',index:'eax'})).leave(8);},
    putword:(c,p)=>{const x=c.x;x.label(p.label).enter().value(arg(8)).mov('edx','eax').value(arg(12)).add('edx','eax').value(arg(16)).mov(at('edx'),'eax').leave(12);},
    nodekey:(c,p)=>{const x=c.x;x.label(p.label).enter().value(arg(8)).pushOperand(at('eax',8)).call('native:string:copy').leave(4);},
    nodeput:(c,p)=>{const x=c.x;x.label(p.label).enter().push(arg(12)).value(arg(8)).add('eax',16).push().call('native:variant:copy').leave(8);},
    nodeget:(c,p)=>{const x=c.x;x.label(p.label).enter().value(arg(12)).add('eax',16).push().push(arg(8)).call('native:variant:copy').leave(8);},
    nodeclear:(c,p)=>{const x=c.x;x.label(p.label).enter().value(arg(8)).mov('esi','eax').add('eax',16).push().call('native:variant:clear')
      .pushOperand(at('esi',8)).invoke('oleaut32.dll','SysFreeString').mov(at('esi',8),0).leave(4);}
   });
   // Key publication owns its allocation and never keeps the caller's BSTR.
   this.nativeCollectionKernel.hosts.nodekeyset=(c,p)=>{const x=c.x;x.label(p.label).enter().push(arg(12)).call('native:string:copy').mov('ebx','eax')
    .value(arg(8)).mov(at('eax',8),'ebx').value(0).leave(8);};
  }
  return this.nativeCollectionKernel;
 },
 collectionProcedure(name){return this.privateNativeProcedure(this.collectionKernel(),name).label;},
 ownCollection(blockScoped=false){return this.ownNativePointer(this.collectionProcedure('CollectionRelease'),blockScoped);},
 collectionValue(node){
  if(node.kind==='group')return this.collectionValue(node.expr);
  if(isNothing(node)){this.x.value(0);return;}
  if(!isType(this.type(node)))this.fail('Set Collection requires a Collection reference or Nothing');
  this.expression(node);
 },
 load(variable){
  if(!variable.nativeCollectionRef)return state.load.call(this,variable);
  const x=this.x;this.address(variable);x.mov('ebx','eax').mov('eax',at('ebx'));
  if(variable.autoNew){const exists=x.unique();x.test().branch('ne',exists).call(this.collectionProcedure('CollectionNew'));this.checkNativeError();x.mov(at('ebx'),'eax').label(exists);}
  x.push().call(this.collectionProcedure('CollectionRetain'));this.checkNativeError();this.ownCollection();
 },
 store(variable){
  if(!variable.nativeCollectionRef)return state.store.call(this,variable);
  // Resolve the destination before acquiring an additional owner. A form
  // initializer can raise here; only the statement's existing owner then lives.
  const x=this.x;x.push();this.address(variable);x.mov('ebx','eax').popOperand('eax')
   .push().call(this.collectionProcedure('CollectionRetain'));this.checkNativeError();
  // Publish before releasing the old reference, including self-assignment.
  x.mov('edi',at('ebx')).mov(at('ebx'),'eax').push().pushOperand('edi').call(this.collectionProcedure('CollectionRelease'));
  this.checkNativeError();x.popOperand('eax');
 },
 setProperty(object,property,node){
  if(object?.nativeVBCollection)this.fail('Native Collection members are read-only: '+property);
  return expressions.setProperty.call(this,object,property,node);
 },
 storageExpression(variable,node){if(variable.nativeCollectionRef)return this.collectionValue(node);return storage.storageExpression.call(this,variable,node);},
 numeric(node){if(isType(this.type(node)))this.fail('Collection references cannot be converted to native numbers');return expressions.numeric.call(this,node);},
 textExpression(node){if(isType(this.type(node)))this.fail('Collection default Item requires an index; a reference is not display text');return expressions.textExpression.call(this,node);},
 initializeFixedString(variable){
  if(variable.nativeCollectionRef){
   if(variable.incomingCollectionOffset!==undefined){const x=this.x;x.push(arg(variable.incomingCollectionOffset)).call(this.collectionProcedure('CollectionRetain'));this.checkNativeError();x.mov(local(variable),'eax');}
   return;
  }
  return records.initializeFixedString.call(this,variable);
 },
 clearCollectionStorage(variable){const x=this.x;this.rawStorageAddress(variable);x.pushOperand(at('eax')).mov(at('eax'),0).call(this.collectionProcedure('CollectionRelease'));},
 zeroStorage(variable){
  if(variable.nativeCollectionRef&&variable.owner?.form&&variable.label)return this.clearCollectionStorage(variable);
  return storage.zeroStorage.call(this,variable);
 },
 disposeNativeControls(module){for(const v of module.globals.values())if(v.nativeCollectionRef)this.clearCollectionStorage({...v,owner:null});return controls.disposeNativeControls.call(this,module);},
 shutdownNativePictures(){for(const m of this.modules.values())for(const v of m.globals.values())if(v.nativeCollectionRef)this.clearCollectionStorage({...v,owner:null});return controls.shutdownNativePictures.call(this);},
 anyReferenceArgument(node){
  if(this.variable(node)?.nativeCollectionRef)this.fail('Native Collection storage has no external As Any object ABI; an explicit raw pointer is required for private memory inspection');
  return records.anyReferenceArgument.call(this,node);
 },
 nativeReferenceArgument(parameter,node){
  if(!isType(parameter.type))return calls.nativeReferenceArgument.call(this,parameter,node);
  const variable=this.variable(node),forced=node.kind==='group';
  if(!forced&&variable){if(!variable.nativeCollectionRef)this.fail('ByRef Collection requires exact Collection storage');this.address(variable);return {};}
  this.collectionValue(node);this.x.push().call(this.collectionProcedure('CollectionRetain'));this.checkNativeError();const temporary=this.ownCollection();
  Object.assign(temporary,{type:'Collection',nativeCollectionRef:true});this.rawStorageAddress(temporary);return {temporary};
 },
 nativeTypedCall(target,plan){
  const result=numeric.nativeTypedCall.call(this,target,plan);
  if(isType((target.proc||target).returnType))this.ownCollection();
  return result;
 },
 object(node){
  if(node.kind==='with')return this.nativeWithBinding().object||null;
  const variable=this.variable(node);
  if(variable?.nativeCollectionRef)return {nativeVBCollection:true,expr:node};
  return state.object.call(this,node);
 },
 collectionReceiver(node){
  const object=node.kind==='with'?this.nativeWithBinding().object:null;
  if(object?.nativeVBCollection){this.withGuard(object.nativeWithActive);this.x.mov('eax',local(object.boundCollection)).push().call(this.collectionProcedure('CollectionRetain'));this.checkNativeError();this.ownCollection();return;}
  this.collectionValue(node);
 },
 collectionCallInfo(node){
  let callee=node.kind==='call'?node.callee:node;
  if(callee.kind==='member'&&isType(this.type(callee.object)))return {receiver:callee.object,name:key(callee.name),args:node.kind==='call'?node.args:[]};
  if(node.kind==='call'){
   const value=this.variable(callee);
   if(value?.nativeCollectionRef&&value!==this.context?.returnValue||['call','group','new'].includes(callee.kind)&&isType(this.type(callee)))return {receiver:callee,name:'item',args:node.args};
  }
  return null;
 },
 computeNativeType(node){
  if(node.kind==='new'&&isType(node.name))return 'collection';
  if(node.kind==='with'&&this.nativeWithBinding().object?.nativeVBCollection)return 'collection';
  const call=this.collectionCallInfo(node);if(call)return call.name==='item'?'variant':'long';
  return expressions.computeNativeType.call(this,node);
 },
 collectionOperation(node){
  const x=this.x;
  if(node.kind==='new'&&isType(node.name)){x.call(this.collectionProcedure('CollectionNew'));this.checkNativeError();this.ownCollection();return true;}
  if(node.kind==='with'&&this.nativeWithBinding().object?.nativeVBCollection){this.collectionReceiver(node);return true;}
  if(node.kind==='binary'&&node.op==='is'&&(isType(this.type(node.left))||isType(this.type(node.right)))){
   this.collectionValue(node.left);x.push();this.collectionValue(node.right);x.popOperand('edx').cmp('edx','eax');this.boolean('=');return true;
  }
  if(node.kind==='typeof'&&isType(this.type(node.expr))){this.collectionValue(node.expr);x.test();if(isType(node.name)||key(node.name)==='object')this.boolean('<>');else x.value(0);return true;}
  if(node.kind==='call'&&node.callee.kind==='id'&&!this.resolveProcedure(node.callee)&&['isobject','typename','vartype'].includes(key(node.callee.name))&&node.args.length===1&&isType(this.type(node.args[0]))){
   this.collectionValue(node.args[0]);const name=key(node.callee.name);
   if(name==='typename'){const done=x.unique(),nil=x.unique();x.test().branch('e',nil).value(this.string('Collection')).jump(done).label(nil).value(this.string('Nothing')).label(done);}
   else x.value(name==='isobject'?-1:9);return true;
  }
  const info=this.collectionCallInfo(node);if(!info)return false;
  const names={add:'CollectionAdd',remove:'CollectionRemove',item:'CollectionItem',count:'CollectionCount'},method=names[info.name];
  if(!method)this.fail('Unknown native Collection member: '+info.name);
  const target=this.privateNativeProcedure(this.collectionKernel(),method);
  planNativeArguments({name:info.name,params:target.proc.params.slice(1)},info.args,m=>this.fail(m));
  this.collectionReceiver(info.receiver);const value=this.arrayWorkspace(4,'collection-receiver');x.mov(local(value),'eax');
  this.nativeTypedCall(target,this.nativeCallPlan(target,[this.nativeKernelValue(arg(value.offset)),...info.args]));return true;
 },
 expression(node){if(this.collectionOperation(node))return;return expressions.expression.call(this,node);},
 prepareNativeFlow(context){
  flow.prepareNativeFlow.call(this,context);
  for(const variable of context.locals.values())if(variable.nativeCollectionRef){
   if(variable.parameter){
    if(variable.byRef)continue;
    variable.incomingCollectionOffset=variable.offset;variable.parameter=false;variable.offset=this.arrayWorkspace(4,'collection-parameter').offset;
   }
   if(!variable.label)(context.nativeOwnedTemps ||= []).push({variable,release:this.collectionProcedure('CollectionRelease'),blockScoped:true});
  }
  context.nativeCollectionLoops=new Map();
  for(const [index,ins]of context.proc.code.entries())if(ins.op==='eachInit'&&isType(this.type(ins.expr))){
   const variable=this.arrayWorkspace(4,'collection-cursor'),release=this.collectionProcedure('CursorRelease');
   (context.nativeOwnedTemps ||= []).push({variable,release,blockScoped:true});
   context.nativeCollectionLoops.set(ins.id,{variable,release,begin:index,target:ins.target,name:ins.name});
  }
 },
 errorCheckpoint(context,index,instruction){
  errors.errorCheckpoint.call(this,context,index,instruction);
  if(instruction.op==='eachInit'&&context.nativeCollectionLoops.has(instruction.id)){
   // Resume Next skips a failed collection acquisition, not into an uninitialized body.
   this.x.value(context.label+':'+instruction.target).mov(at('ebp',-28),'eax');
  }
 },
 nativeFlowInstruction(ins,context,index){
  const x=this.x;
  if(ins.op==='assign'&&this.variable(ins.target)?.nativeCollectionRef){
   if(!ins.objectSet)this.fail('Collection reference assignment requires Set');
   this.collectionValue(ins.expr);this.store(this.variable(ins.target));return true;
  }
  if(ins.op==='withPush'&&isType(this.type(ins.expr))){
   const active=this.arrayWorkspace(4,'with-active');context.locals.set(active.name,active);
   this.collectionReceiver(ins.expr);x.push().call(this.collectionProcedure('CollectionRetain'));this.checkNativeError();const variable=this.ownCollection(true),release=this.collectionProcedure('CollectionRelease');
   x.mov(local(active),-1);context.withBindings.push({active,reference:{variable,release},object:{nativeVBCollection:true,boundCollection:variable,nativeWithActive:active}});return true;
  }
  if(ins.op==='jump'){
   for(const loop of context.nativeCollectionLoops.values())if(index>loop.begin&&index<loop.target&&(ins.target<=loop.begin||ins.target>=loop.target))this.clearNativeOwnedPointer(loop);
  }
  const loop=context.nativeCollectionLoops?.get(ins.id);
  if(loop&&(ins.op==='eachInit'||ins.op==='eachNext')){
   const output=this.variable({kind:'id',name:loop.name});
   if(!output||key(output.type)!=='variant')this.fail('For Each Collection requires a Variant control variable');
   if(ins.op==='eachInit'){
    this.clearNativeOwnedPointer(loop);this.collectionValue(ins.expr);x.push().call(this.collectionProcedure('CollectionCursor'));this.checkNativeError();x.mov(local(loop.variable),'eax');
   }
   this.address(output);x.push().pushOperand(local(loop.variable)).call(this.collectionProcedure('CursorNext'));this.checkNativeError();x.test();
   const more=x.unique();
   if(ins.op==='eachInit'){x.branch('ne',more);this.clearNativeOwnedPointer(loop);x.jump(context.label+':'+ins.target).label(more);}
   else{x.branch('ne',context.label+':'+ins.target);this.clearNativeOwnedPointer(loop);}
   return true;
  }
  return flow.nativeFlowInstruction.call(this,ins,context,index);
 }
};
