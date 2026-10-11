import {nativeNumericMethods as numbers} from './numeric.js';
import {nativeCurrencyMethods as currency} from './currency.js';
import {nativeCallByName,nativeCallByNameType} from './class-dispatch.js';
/** Typed class instances compiled to ordinary x86 with a hidden receiver slot.
 * Instance fields AND procedure Static fields live in the object's allocation,
 * never in shared module globals. References are owned, not numeric aliases.
 * The private header is not an IUnknown/IDispatch ABI.
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/static-statement
 * https://learn.microsoft.com/previous-versions/office/aa211389(v=office.11)
 */
import {nativeCollectionMethods as collections} from './collections.js';
import {nativeCompilerStateMethods as state} from './compiler-state.js';
import {nativeCompilerExpressionMethods as expr} from './compiler-expressions.js';
import {nativeCallMethods as calls} from './calls.js';
import {nativeStorageMethods as storage} from './storage.js';
import {mem32} from './x86-operands.js';
const P='native:class:',key=v=>String(v).toLowerCase(),arg=argument=>({argument});
const at=(base,displacement=0)=>mem32({base,displacement}),slot=v=>v.label?mem32({label:v.label}):at('ebp',v.offset);
const nil=n=>n.kind==='nothing'||n.kind==='group'&&nil(n.expr);
const typedReturn=(c,t)=>c.nativeClassDescriptor(t?.proc?.returnType||t?.returnType);
export const nativeClassMethods={
 prepareNativeClassTypes(){
  this.nativeClassTypes=new Map();
  for(const m of this.program.modules.values())if(m.kind==='class')this.nativeClassTypes.set(key(m.name),{name:m.name,id:this.nativeClassTypes.size+1,bytes:16,fields:[],module:null});
 },
 nativeClassDescriptor(type){return this.nativeClassTypes?.get(key(type));},
 scalar(decl){
  const descriptor=this.nativeClassDescriptor(decl.type);if(!descriptor)return collections.scalar.call(this,decl);
  if(decl.bounds!=null||decl.withEvents)this.fail('Native class reference requires scalar storage without WithEvents');
  return Object.assign(decl,{type:descriptor.name,nativeClassRef:descriptor.name,nativeBytes:4,nativeElementBytes:4,nativeCount:1});
 },
 allocateNativeInstanceField(variable,owner){
  if(variable.nativeArray)this.fail('Native class array fields are not yet lowered');
  const descriptor=owner.nativeClass;
  const offset=(descriptor.bytes+3)&~3;descriptor.bytes=offset+(variable.nativeBytes||4);
  if(descriptor.bytes>512*1024)this.fail('Native class instance exceeds 512 KiB');
  Object.assign(variable,{owner,nativeInstanceField:descriptor,nativeFieldOffset:offset});delete variable.label;
  descriptor.fields.push(variable);return variable;
 },
 nativeClassExpressionType(node){
  if(!node)return null;
  if(node.kind==='group')return this.nativeClassExpressionType(node.expr);
  if(node.kind==='new')return this.nativeClassDescriptor(node.name);
  if(node.kind==='nativeClassValue')return node.descriptor;
  if(node.kind==='with')return this.nativeWithBinding().object?.nativeClassObject||null;
  if(node.kind==='id'){
   if(key(node.name)==='me'&&this.context?.module.nativeClass)return this.context.module.nativeClass;
   const v=state.variable.call(this,node);return this.nativeClassDescriptor(v?.nativeClassRef)||typedReturn(this,this.resolveProcedure(node));
  }
  if(node.kind==='member'){
   const d=this.nativeClassExpressionType(node.object),f=d?.module?.globals.get(key(node.name));
   if(f)return this.nativeClassDescriptor(f.nativeClassRef)||null;
  }
  return typedReturn(this,this.resolveProcedure(node.kind==='call'?node.callee:node));
 },
 variable(node,context=this.context){
  if(node.kind==='nativeClassValue')return null;
  if(node.kind==='member'){
   const d=this.nativeClassExpressionType(node.object),field=d?.module?.globals.get(key(node.name));
   if(field){if(field.scope==='private'&&context?.module!==d.module)this.fail('Private native class field is not accessible: '+node.name);
    return {...field,nativeReceiverNode:node.object};}
  }
  return state.variable.call(this,node,context);
 },
 rawStorageAddress(variable){
  if(!variable.nativeInstanceField)return storage.rawStorageAddress.call(this,variable);
  const x=this.x;
  if(variable.nativeInstancePointer)x.value(variable.nativeInstancePointer);
  else if(variable.nativeReceiverNode)this.nativeClassReceiver(variable.nativeReceiverNode,variable.nativeInstanceField);
  else if(this.context?.instanceOffset)x.value(arg(this.context.instanceOffset));
  else this.fail('Native class field requires an instance: '+variable.name);
  x.test().branch('e','error:91');if(variable.nativeFieldOffset)x.add('eax',variable.nativeFieldOffset);
 },
 resolveProcedure(node){
  if(node.kind==='member'){
   const d=this.nativeClassExpressionType(node.object);
   if(d){
    const target=d.module?.procedures.get(key(node.name))||d.module?.procedures.get(key(node.name)+':get');
    if(!target)return null;
    if(target.proc.scope==='private'&&this.context?.module!==d.module)this.fail('Private native class member is not accessible: '+node.name);
    return {...target,nativeReceiverNode:node.object};
   }
  }
  if(node.kind==='id'&&this.context?.module.nativeClass){
   const target=this.context.module.procedures.get(key(node.name))||this.context.module.procedures.get(key(node.name)+':get');
   if(target)return target;
  }
  const target=state.resolveProcedure.call(this,node);
  // A public instance method is not an unqualified project-global procedure.
  if(target?.module?.nativeClass&&target.module!==this.context?.module)return null;
  return target;
 },
 publicVariable(name){
  if(this.context?.module.nativeInternal)return;
  const matches=[...this.modules.values()].filter(m=>!m.nativeClass).flatMap(m=>[...m.globals.values()].filter(v=>key(v.name)===key(name)&&v.scope==='public'));
  if(matches.length>1)this.fail('Ambiguous global: '+name);return matches[0];
 },
 object(node){
  const d=this.nativeClassExpressionType(node);if(d)return {nativeClassObject:d,expr:node};
  return collections.object.call(this,node);
 },
 computeNativeType(node){
  const dispatch=nativeCallByNameType(this,node);if(dispatch)return dispatch;
  if(node.kind==='nativeClassValue')return key(node.descriptor.name);
  if(node.kind==='new'&&this.nativeClassDescriptor(node.name))return key(node.name);
  if(node.kind==='id'&&key(node.name)==='me'&&this.context?.module.nativeClass)return key(this.context.module.name);
  if(node.kind==='with'&&this.nativeWithBinding().object?.nativeClassObject)return key(this.nativeWithBinding().object.nativeClassObject.name);
  return collections.computeNativeType.call(this,node);
 },
 classKernel(){
  if(this.nativeClassKernel)return this.nativeClassKernel;
  const code='Private Function Retain(ByVal value As Long) As Long\nEnd Function\nPrivate Sub Release(ByVal value As Long)\nEnd Sub\n'+
   [...this.nativeClassTypes.values()].map(d=>'Private Function New'+d.id+'() As '+d.name+'\nEnd Function').join('\n');
  const kernel=this.privateNativeKernel('NativeClassService',code,{retain:(c,p)=>c.emitNativeClassRetain(p)});
  this.nativeClassKernel=kernel;
  const release=kernel.procedures.get('release');release.proc.code.unshift({op:'nativeClassRelease',line:0});
  for(const d of this.nativeClassTypes.values())kernel.procedures.get('new'+d.id).proc.code.unshift({op:'nativeClassConstruct',className:d.name,line:0});
  return kernel;
 },
 classProcedure(name){return this.privateNativeProcedure(this.classKernel(),name).label;},
 ownClass(){return this.ownNativePointer(this.classProcedure('Release'));},
 nativeClassValue(node,expected){
  if(nil(node)){this.x.value(0);return;}
  const d=this.nativeClassExpressionType(node);
  if(!d||expected&&d!==expected)this.fail('Set/typed native class argument requires the exact class or Nothing');
  this.expression(node);
 },
 nativeClassReceiver(node,expected){
  this.nativeClassValue(node,expected);this.x.test().branch('e','error:91');
 },
 load(variable){
  if(!variable.nativeClassRef)return collections.load.call(this,variable);
  const x=this.x;this.address(variable);x.push().mov('eax',at('eax'));
  if(variable.autoNew){const done=x.unique();x.test().branch('ne',done).call(this.classProcedure('New'+this.nativeClassDescriptor(variable.type).id));this.checkNativeError();
   // Construction failure leaves the variable slot null and releases its owners.
   x.mov('edx',at('esp')).mov(at('edx'),'eax').label(done);}
  x.add('esp',4).push().call(this.classProcedure('Retain'));this.ownClass();
 },
 store(variable){
  if(!variable.nativeClassRef)return collections.store.call(this,variable);
  const x=this.x;x.push();this.address(variable);x.mov('ebx','eax').popOperand('eax').push().call(this.classProcedure('Retain'));
  x.mov('edi',at('ebx')).mov(at('ebx'),'eax').push().pushOperand('edi').call(this.classProcedure('Release'));x.popOperand('eax');
 },
 storageExpression(variable,node){if(variable.nativeClassRef)return this.nativeClassValue(node,this.nativeClassDescriptor(variable.type));return collections.storageExpression.call(this,variable,node);},
 truth(node){if(this.nativeClassExpressionType(node))this.fail('Native class reference requires Is Nothing or an explicit Boolean property');return numbers.truth.call(this,node);},
 floatExpression(node,single=false){if(this.nativeClassExpressionType(node))this.fail('Native class references cannot be converted to floating-point numbers');return numbers.floatExpression.call(this,node,single);},
 currencyExpression(node){if(this.nativeClassExpressionType(node))this.fail('Native class references cannot be converted to Currency');return currency.currencyExpression.call(this,node);},
 getProperty(object,property){if(object?.nativeClassObject)this.fail('Unknown native class property: '+property);return expr.getProperty.call(this,object,property);},
 setProperty(object,property,node){if(object?.nativeClassObject)this.fail('Unknown or read-only native class property: '+property);return collections.setProperty.call(this,object,property,node);},
 numeric(node){if(this.nativeClassExpressionType(node))this.fail('Native class reference cannot be used as a number');return collections.numeric.call(this,node);},
 textExpression(node){if(this.nativeClassExpressionType(node))this.fail('Native class reference requires an explicit property before text conversion');return collections.textExpression.call(this,node);},
 zeroStorage(variable){
  if(variable.nativeClassRef&&variable.owner?.form&&variable.label)return this.clearClassStorage(variable);
  return collections.zeroStorage.call(this,variable);
 },
 initializeFixedString(variable){
  if(variable.nativeClassRef){
   if(variable.incomingClassOffset!==undefined){this.x.push(arg(variable.incomingClassOffset)).call(this.classProcedure('Retain')).mov(slot(variable),'eax');}
   return;
  }
  return collections.initializeFixedString.call(this,variable);
 },
 clearClassStorage(variable){const x=this.x;this.rawStorageAddress(variable);x.pushOperand(at('eax')).mov(at('eax'),0).call(this.classProcedure('Release'));},
 nativeReferenceArgument(p,node,omitted=false){
  const d=this.nativeClassDescriptor(p.type);if(!d)return collections.nativeReferenceArgument.call(this,p,node,omitted);
  const variable=this.variable(node);
  if(node.kind!=='group'&&!omitted&&variable){if(this.nativeClassDescriptor(variable.nativeClassRef)!==d)this.fail('ByRef native class argument requires exact class storage');this.address(variable);return {};}
  this.nativeClassValue(node,d);this.x.push().call(this.classProcedure('Retain'));const temporary=this.ownClass();
  Object.assign(temporary,{type:d.name,nativeClassRef:d.name});this.rawStorageAddress(temporary);return {temporary};
 },
 anyReferenceArgument(node){if(this.variable(node)?.nativeClassRef)this.fail('Native class reference does not expose a COM/As Any ABI');return collections.anyReferenceArgument.call(this,node);},
 nativeTypedCall(target,plan){
  if(target.instanceOffset){
   if(target.nativeReceiverNode){this.nativeClassReceiver(target.nativeReceiverNode,target.module.nativeClass);const value=this.arrayWorkspace(4,'class-call-receiver');this.x.mov(slot(value),'eax');target={...target,nativeInstanceArgument:arg(value.offset)};}
   else if(!target.nativeInstanceArgument){
    if(this.context?.module!==target.module||!this.context.instanceOffset)this.fail('Native class method requires an instance: '+target.proc.name);
    target={...target,nativeInstanceArgument:arg(this.context.instanceOffset)};
   }
  }
  const value=collections.nativeTypedCall.call(this,target,plan);
  if(this.nativeClassDescriptor((target.proc||target).returnType))this.ownClass();return value;
 },
 classOperation(node){
  const x=this.x;
  if(node.kind==='nativeClassValue'){x.value(node.value).push().call(this.classProcedure('Retain'));this.ownClass();return true;}
  if(node.kind==='new'&&this.nativeClassDescriptor(node.name)){x.call(this.classProcedure('New'+this.nativeClassDescriptor(node.name).id));this.checkNativeError();this.ownClass();return true;}
  if(node.kind==='id'&&key(node.name)==='me'&&this.context?.instanceOffset){x.push(arg(this.context.instanceOffset)).call(this.classProcedure('Retain'));this.ownClass();return true;}
  if(node.kind==='with'&&this.nativeWithBinding().object?.nativeClassObject){const o=this.nativeWithBinding().object;this.withGuard(o.nativeWithActive);x.mov('eax',slot(o.boundClass)).push().call(this.classProcedure('Retain'));this.ownClass();return true;}
  if(node.kind==='binary'&&node.op==='is'){
   const a=this.nativeClassExpressionType(node.left),b=this.nativeClassExpressionType(node.right);
   if(a||b){this.nativeClassValue(node.left);x.push();this.nativeClassValue(node.right);x.popOperand('edx').cmp('edx','eax');this.boolean('=');return true;}
  }
  if(node.kind==='typeof'){
   const d=this.nativeClassExpressionType(node.expr);if(d){this.nativeClassValue(node.expr);x.test();if(this.nativeClassDescriptor(node.name)===d||key(node.name)==='object')this.boolean('<>');else x.value(0);return true;}
  }
  if(node.kind==='call'&&node.callee.kind==='id'&&!this.resolveProcedure(node.callee)&&['isobject','typename','vartype'].includes(key(node.callee.name))&&node.args.length===1){
   const d=this.nativeClassExpressionType(node.args[0]);if(d){this.nativeClassValue(node.args[0]);const name=key(node.callee.name);
    if(name==='typename'){const nilLabel=x.unique(),done=x.unique();x.test().branch('e',nilLabel).value(this.string(d.name)).jump(done).label(nilLabel).value(this.string('Nothing')).label(done);}else x.value(name==='isobject'?-1:9);return true;}
  }
  return false;
 },
 expression(node){if(nativeCallByName(this,node)||this.classOperation(node))return;return collections.expression.call(this,node);},
 prepareNativeFlow(context){
  collections.prepareNativeFlow.call(this,context);
  for(const v of context.locals.values())if(v.nativeClassRef&&!v.nativeInstanceField){
   if(v.parameter){if(v.byRef)continue;v.incomingClassOffset=v.offset;v.parameter=false;v.offset=this.arrayWorkspace(4,'class-parameter').offset;}
   if(!v.label)context.nativeOwnedTemps.push({variable:v,release:this.classProcedure('Release'),blockScoped:true});
  }
 },
 nativeFlowInstruction(ins,context,index){
  const x=this.x;
  if(ins.op==='nativeClassConstruct'){this.emitNativeClassConstruct(context,this.nativeClassDescriptor(ins.className));return true;}
  if(ins.op==='nativeClassRelease'){this.emitNativeClassRelease(context);return true;}
  if(ins.op==='assign'){
   const variable=this.variable(ins.target);
   if(variable?.nativeInstanceField&&variable.nativeReceiverNode){
    this.address(variable);const address=this.arrayWorkspace(4,'class-field-destination');x.mov(slot(address),'eax');
    const v={...variable,nativeInstanceField:null,nativeEventOwnerOffset:variable.nativeInstanceField?variable.nativeFieldOffset:undefined,nativeReceiverNode:null,owner:variable.owner,nativeKernelPointer:arg(address.offset)};
    if(v.nativeClassRef&&!ins.objectSet)this.fail('Native class reference assignment requires Set');
    if(ins.objectSet&&!v.nativeClassRef&&!v.nativeCollectionRef)this.fail('Set requires object reference storage');
    this.storageExpression(v,ins.expr);this.store(v);return true;
   }
   if(variable?.nativeClassRef){if(!ins.objectSet)this.fail('Native class reference assignment requires Set');this.nativeClassValue(ins.expr,this.nativeClassDescriptor(variable.type));this.store(variable);return true;}
   const target=ins.target.kind==='call'?ins.target.callee:ins.target;
   if(target.kind==='member'){
    const d=this.nativeClassExpressionType(target.object),setter=d?.module.procedures.get(key(target.name)+(ins.objectSet?':set':':let'));
    if(setter){if(setter.proc.scope==='private'&&this.context.module!==d.module)this.fail('Private native property is not accessible');this.nativeTypedCall({...setter,nativeReceiverNode:target.object},this.nativeCallPlan(setter,[...(ins.target.kind==='call'?ins.target.args:[]),ins.expr]));return true;}
   }
  }
  if(ins.op==='withPush'){
   const d=this.nativeClassExpressionType(ins.expr);if(d){
    const active=this.arrayWorkspace(4,'with-active');context.locals.set(active.name,active);
    this.nativeClassValue(ins.expr);x.push().call(this.classProcedure('Retain'));const variable=this.ownNativePointer(this.classProcedure('Release'),true);
    x.mov(slot(active),-1);context.withBindings.push({active,reference:{variable,release:this.classProcedure('Release')},object:{nativeClassObject:d,boundClass:variable,nativeWithActive:active}});return true;
   }
  }
  return collections.nativeFlowInstruction.call(this,ins,context,index);
 },
 ensure(object){
  if(object.nativeCapturedControl){this.x.value(this.controlHandleRef(object)).test().branch('e','error:91').push().invoke('user32.dll','IsWindow').test().branch('e','error:91');return;}
  return state.ensure.call(this,object);
 },
 disposeNativeControls(module){for(const v of module.globals.values())if(v.nativeClassRef)this.clearClassStorage({...v,owner:null});return collections.disposeNativeControls.call(this,module);},
 shutdownNativePictures(){for(const m of this.modules.values())if(!m.nativeClass)for(const v of m.globals.values())if(v.nativeClassRef)this.clearClassStorage({...v,owner:null});return collections.shutdownNativePictures.call(this);},
 emitNativeClassRetain(proc){
  const x=this.x,done=x.unique();x.label(proc.label).enter().value(arg(8)).test().branch('e',done).cmp(at('eax'),1).branch('l','error:91').cmp(at('eax'),0x7fffffff).branch('ae','error:6').inc(at('eax')).label(done).leave(4);
 },
 emitNativeClassConstruct(context,d){
  const x=this.x;
  x.push(d.bytes).push(8).api('kernel32.dll','GetProcessHeap').push().invoke('kernel32.dll','HeapAlloc').test().branch('e','error:7')
   .mov(at('eax'),1).mov(at('eax',4),d.id);
  // The result slot immediately owns the zeroed object, including on an
  // initialization failure. Return moves that owner rather than adding one.
  x.mov(slot(context.returnValue),'eax');
  const previous=context.instanceOffset;context.instanceOffset=null;
  for(const field of d.fields){const v={...field,nativeInstancePointer:arg(context.returnValue.offset)};
   this.initializeFixedString(v);if(v.initial){this.storageExpression(v,v.initial);this.store(v);}
  }
  context.instanceOffset=previous;
  const init=d.module.procedures.get('class_initialize');
  if(init){if(init.proc.params.length||init.proc.kind!=='sub')this.fail('Class_Initialize requires a parameterless Sub');x.push(arg(context.returnValue.offset)).call(init.label);this.checkNativeError();}
  x.mov('eax',slot(context.returnValue)).mov(at('eax',8),1);
 },
 emitNativeClassRelease(context){
  const x=this.x,done=x.unique(),value=context.locals.get('value');
  // Terminate runs at a release boundary. An uncaught error cannot skip field
  // disposal; keep the original caller Err snapshot and finish the release.
  x.value(-1).mov(at('ebp',-16),'eax');
  x.value(arg(value.offset)).test().branch('e',done).cmp(at('eax'),1).branch('l','error:91').dec(at('eax')).branch('ne',done);
  // Root the object while its Terminate handler runs. The postlude always runs,
  // including on an authored error, before the private Err scope is restored.
  x.mov(at('eax'),1);const cleanup=this.arrayWorkspace(4,'class-finalizing');
  context.nativeOwnedTemps.push({variable:cleanup,release:P+'complete-release',blockScoped:true});x.mov(slot(cleanup),'eax');
  const skip=x.unique();x.cmp(at('eax',8),1).branch('ne',skip).mov(at('eax',8),2);
  for(const d of this.nativeClassTypes.values()){
   const term=d.module.procedures.get('class_terminate');if(!term)continue;
   if(term.proc.params.length||term.proc.kind!=='sub')this.fail('Class_Terminate requires a parameterless Sub');
   const next=x.unique();x.cmp(at('eax',4),d.id).branch('ne',next).push().call(term.label);this.checkNativeError();x.jump(skip).label(next);
  }
  x.label(skip).label(done);
 },
 emitNativeClassCleanup(){
  if(!this.nativeClassKernel)return;
  const x=this.x,done=x.unique(),free=x.unique();
  x.label(P+'complete-release').enter().value(arg(8)).test().branch('e',done).mov('esi','eax')
   .dec(at('esi')).branch('e',free).mov(at('esi',8),3).jump(done).label(free);
  for(const d of this.nativeClassTypes.values()){
   const next=x.unique();x.cmp(at('esi',4),d.id).branch('ne',next);
   this.detachNativeEventFields(d);
   for(const f of d.fields){const a=at('esi',f.nativeFieldOffset);
    if(f.nativeClassRef||f.nativeCollectionRef){x.pushOperand(a).mov(a,0).call(f.nativeClassRef?this.classProcedure('Release'):this.collectionProcedure('CollectionRelease'));}
    else if(key(f.type)==='string'){x.pushOperand(a).mov(a,0).invoke('oleaut32.dll','SysFreeString');}
    else if(key(f.type)==='variant'){x.lea('eax',a).push().call('native:variant:clear');}
   }
   x.jump(done+':free').label(next);
  }
  x.label(done+':free');this.disposeNativeEventSource();x.pushOperand('esi').push(0).api('kernel32.dll','GetProcessHeap').push().invoke('kernel32.dll','HeapFree')
   .label(done).value(0).leave(4);
 }
};
