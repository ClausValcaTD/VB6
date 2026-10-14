/** Demand-gated independent native Form instances. All field addresses remain
 * object-relative across calls and reentry; no global bank of state is swapped.
 * Windows callbacks carry a retained owner through the canonical HWND property.
 */
import {nativeDynamicControlMethods as dynamic,DYNAMIC_CONTROL_TYPES} from './dynamic-controls.js';
import {nativeClassMethods as classes} from './classes.js';
import {nativeCompilerProcedureMethods as procedures} from './compiler-procedures.js';
import {nativeCompilerStateMethods as state} from './compiler-state.js';
import {nativeVariantMethods as variants} from './variants.js';
import {nativeSurfaceMethods as surfaces} from './surfaces.js';
import {FORM_INSTANCE,FORM_HWND_PROPERTY} from './form-instance-layout.js';
import {declareFormInterface} from './form-instance-abi.js';
import {boxNativeForm,unboxNativeForm} from './form-variant.js';
import {formInstanceEmission} from './form-instance-emission.js';
import {mem32,mem16} from './x86-operands.js';
export const F=Object.freeze({...FORM_INSTANCE,loaded:FORM_INSTANCE.phase,creating:FORM_INSTANCE.bytes,bytes:FORM_INSTANCE.bytes+4});
const key=v=>String(v).toLowerCase(),arg=argument=>({argument}),at=(base,displacement=0)=>mem32({base,displacement}),slot=v=>v.label?mem32({label:v.label}):at('ebp',v.offset);
const nil=n=>n?.kind==='nothing'||n?.kind==='group'&&nil(n.expr);
export const nativeFormInstanceMethods={
 ...formInstanceEmission,
 prepareNativeFormTypes(){
  this.nativeFormTypes=new Map();const forms=[...this.program.modules.values()].filter(m=>m.form?.type==='Form'),names=new Set(forms.map(m=>key(m.name)));let needed=false;
  const visit=n=>{if(!n||typeof n!=='object')return;if(n.kind==='new'&&names.has(key(n.name))||['type','returnType','storageType','storageReturnType'].some(p=>n[p]&&(names.has(key(n[p]))||key(n[p])==='form')))needed=true;
   if(Array.isArray(n)){for(const v of n)visit(v);}else for(const [k,v]of Object.entries(n))if(!['form','module','owner'].includes(k))visit(v);};
  for(const m of this.program.modules.values()){visit(m.declarations);for(const p of m.procedures.values()){visit(p.params);visit({returnType:p.returnType});visit(p.code);}}
  if(!needed)return;
  this.nativeAbstractForm={name:'Form',formUnion:true,nativeForm:true};
  for(const m of forms){const d={name:m.name,id:this.nativeClassTypes.size+1,bytes:F.bytes,fields:[],module:null,nativeForm:true};this.nativeClassTypes.set(key(m.name),d);this.nativeFormTypes.set(key(m.name),d);}
 },
 nativeClassDescriptor(type){return key(type)==='form'&&this.nativeAbstractForm||classes.nativeClassDescriptor.call(this,type);},
 prepareInstanceForm(module){
  const p=module.form.properties;
  if(![1,3].includes(Number(p.ScaleMode??1)))this.fail('Independent native Form supports Twips or Pixels',module);
  if(p.KeyPreview||p.Picture||p.Icon||module.form.menu?.length||module.form.menus?.length)this.fail('Independent native Form menus, images and KeyPreview are not yet lowered',module);
  module.handle=this.slot('hwnd:'+module.name);module.defaultForm=this.slot('default-form:'+module.name);module.create='create:'+module.name;module.initialize=module.create;
  module.className=this.string('VB6.Native.Instance.'+module.name);module.instanceWindow='wndproc:'+module.name;module.instanceSubclass='instance-subclass:'+module.name;
  let id=100;
  const field=(name,bytes=4)=>this.allocateNativeInstanceField({name,type:'Long',nativeBytes:bytes},module);
  for(const model of module.form.controls){
   if(!DYNAMIC_CONTROL_TYPES.includes(model.type)||model.properties.Index!==undefined)this.fail('Independent native Form currently requires scalar intrinsic controls: '+model.type,module);
   this.nativeControlDescriptor(model,module);
   const c={model,module,id:id++,key:key(model.name),nativeInstanceControl:true,kind:DYNAMIC_CONTROL_TYPES.indexOf(model.type)+1};
   c.hwndField=field('control:'+model.name+':hwnd');c.stateField=field('control:'+model.name+':state',76);c.fontField=field('control:'+model.name+':font',48);module.controls.set(c.key,c);
  }
  for(const c of module.controls.values())if(c.model.parent){c.nativeParent=module.controls.get(key(c.model.parent));if(!c.nativeParent||c.nativeParent.model.type!=='Frame')this.fail('Independent control container must be a scalar Frame',module);}
  for(const c of module.controls.values()){let n=c;const seen=new Set();while(n){if(seen.has(n))this.fail('Cyclic native Form control containment',module);seen.add(n);n=n.nativeParent;}}
  const admitted=new Set(['initialize','terminate','load','resize','activate','deactivate','queryunload','unload']);
  for(const proc of module.procedures.values()){
   const name=key(proc.proc.name),event=name.match(/^form_(.+)$/);if(event&&!admitted.has(event[1]))this.fail('Independent Form event not yet routed: '+proc.proc.name,module);
   for(const c of module.controls.values())if(name.startsWith(c.key+'_')&&!this.nativeControlEvents(c.model.type).includes(name.slice(c.key.length+1)))this.fail('Independent control event not yet routed: '+proc.proc.name,module);
  }
 },
 initializeNativeFormHeader(context,d){
  const x=this.x;declareFormInterface(this);x.mov('edx',slot(context.returnValue)).value('native:form:iunknown').mov(at('edx',F.unknown),'eax').mov(at('edx',F.scaleMode),Number(d.module.form.properties.ScaleMode??1));
 },
 nativeClassExpressionType(node){
  if(!this.nativeFormTypes?.size)return classes.nativeClassExpressionType.call(this,node);
  if(node?.kind==='group')return this.nativeClassExpressionType(node.expr);
  if(node?.kind==='nativeKernelStorage')return this.nativeClassDescriptor(node.storage.nativeClassRef);
  if(node?.kind==='member'&&key(node.name)==='activeform'){
   const o=classes.object.call(this,node.object);if(o?.form?.type==='MDIForm')return this.nativeAbstractForm;
  }
  if(node?.kind==='id'){
   const variable=state.variable.call(this,node);if(variable)return this.nativeClassDescriptor(variable.nativeClassRef);
   const d=this.nativeFormTypes.get(key(node.name));if(d)return d;
  }
  return classes.nativeClassExpressionType.call(this,node);
 },
 nativeFormType(node){if(!this.nativeFormTypes?.size)return null;const d=this.nativeClassExpressionType(node);return d?.nativeForm?d:null;},
 nativeClassValue(node,expected){
  if(!this.nativeFormTypes?.size)return classes.nativeClassValue.call(this,node,expected);
  if(expected?.nativeForm&&this.type(node)==='variant'){unboxNativeForm(this,node,expected);return;}
  if(nil(node)){this.x.value(0);return;}
  const d=this.nativeFormType(node);
  if(!d)return classes.nativeClassValue.call(this,node,expected);
  if(expected&&!expected.nativeForm)this.fail('A native Form is not the expected class');
  if(expected&&!expected.formUnion&&!d.formUnion&&expected!==d)this.fail('Set/typed native Form requires the declared form type');
  this.expression(node);
  if(expected&&!expected.formUnion&&d.formUnion){const done=this.x.unique();this.x.test().branch('e',done).cmp(at('eax',4),expected.id).branch('ne','error:13').label(done);}
 },
 nativeInstanceReceiver(node,descriptor){
  this.nativeClassValue(node,descriptor);this.x.test().branch('e','error:91');const v=this.arrayWorkspace(4,'form-receiver');this.x.mov(slot(v),'eax');return arg(v.offset);
 },
 formRuntime(){
  if(this.nativeFormsRuntime)return this.nativeFormsRuntime;
  const code=[...this.nativeFormTypes.values()].map(d=>`Private Sub Create${d.id}(ByVal owner As ${d.name})\nEnd Sub\nPrivate Sub Rollback${d.id}(ByVal owner As Long)\nEnd Sub`).join('\n');
  const k=this.privateNativeKernel('NativeFormService',code);this.nativeFormsRuntime=k;
  for(const d of this.nativeFormTypes.values())for(const [name,op]of [['Create','nativeInstanceCreate'],['Rollback','nativeInstanceRollback']]){const p=k.procedures.get(key(name+d.id));p.formDescriptor=d;p.proc.code.unshift({op,line:0});}
  return k;
 },
 instanceProcedure(d,operation){return this.privateNativeProcedure(this.formRuntime(),operation+d.id).label;},
 createNativeForm(d,receiver){
  const x=this.x;if(!d.formUnion){x.push(receiver).call(this.instanceProcedure(d,'Create'));this.checkNativeError();return;}
  const done=x.unique();x.value(receiver);
  for(const candidate of this.nativeFormTypes.values()){const next=x.unique();x.cmp(at('eax',4),candidate.id).branch('ne',next).push().call(this.instanceProcedure(candidate,'Create'));this.checkNativeError();x.jump(done).label(next);}
  x.jump('error:13').label(done);
 },
 prepareNativeSurface(object){
  // Existing surface discovery also sees supported ScaleMode/Refresh reads.
  // Independent HWND state must never be wired to a shared prototype backing.
  if(object?.nativeForm||object?.nativeInstanceForm)return;
  return surfaces.prepareNativeSurface.call(this,object);
 },
 surfaceAccess(object){
  if(object?.nativeForm||object?.nativeInstanceForm)this.fail('Independent native Form drawing surfaces are not yet lowered');
  return surfaces.surfaceAccess.call(this,object);
 },
 dynamicCollection(node){
  if(this.nativeFormTypes?.size){
   if(node.kind==='id'&&key(node.name)==='controls'&&this.context?.module.nativeForm||node.kind==='member'&&key(node.name)==='controls'&&this.nativeFormType(node.object))
    this.fail('Independent native Form Controls collection mutation/lookup is not yet lowered; use declared scalar controls');
  }
  return dynamic.dynamicCollection.call(this,node);
 },
 object(node){
  if(!this.nativeFormTypes?.size)return dynamic.object.call(this,node);
  if(node.kind==='member'){
   const d=this.nativeFormType(node.object),control=d?.module?.controls.get(key(node.name));if(control)return {...control,nativeFormReceiver:node.object};
  }
  if(node.kind==='id'&&this.context?.module.nativeForm){const c=this.context.module.controls.get(key(node.name));if(c)return {...c,nativeFormReceiver:{kind:'id',name:'Me'}};}
  const d=this.nativeFormType(node);if(d)return {nativeInstanceForm:true,descriptor:d,expr:node,module:d.module,form:d.module?.form};
  return dynamic.object.call(this,node);
 },
 captureDynamicControl(object){
  if(!object?.nativeInstanceControl)return dynamic.captureDynamicControl.call(this,object);
  if(object.nativeDynamicBound)return object;
  const receiver=this.nativeInstanceReceiver(object.nativeFormReceiver||{kind:'id',name:'Me'},object.module.nativeForm),x=this.x;
  this.createNativeForm(object.module.nativeForm,receiver);x.value(receiver).mov('eax',at('eax',object.hwndField.nativeFieldOffset)).test().branch('e','error:91').push().call(this.controlProcedure('Reference'));this.checkNativeError();this.ownControl();
  const node=this.arrayWorkspace(4,'form-control-node'),hwnd=this.arrayWorkspace(4,'form-control-hwnd');x.mov(slot(node),'eax').push().call(this.controlProcedure('Require'));this.checkNativeError();x.mov(slot(hwnd),'eax');
  return {...object,nativeInstanceControl:false,nativeDynamicBound:true,nativeControlNode:node,handleSlot:hwnd};
 },
 ensure(object){
  if(object.nativeInstanceForm){const r=this.nativeInstanceReceiver(object.expr,object.descriptor);this.createNativeForm(object.descriptor,r);return;}
  if(object.nativeInstanceControl){Object.assign(object,this.captureDynamicControl(object));return;}
  return dynamic.ensure.call(this,object);
 },
 nativeControlValue(node){const object=this.object(node);if(object?.nativeInstanceControl){const captured=this.captureDynamicControl(object);this.x.mov('eax',slot(captured.nativeControlNode));return;}return dynamic.nativeControlValue.call(this,node);},
 getProperty(object,property){
  if(object?.nativeForm)object={nativeInstanceForm:true,descriptor:object.nativeForm,expr:{kind:'id',name:'Me'},module:object,form:object.form};
  if(object?.nativeInstanceForm)return this.instanceFormProperty(object,property);
  if(object?.nativeInstanceControl)object=this.captureDynamicControl(object);
  return dynamic.getProperty.call(this,object,property);
 },
 setProperty(object,property,node){
  if(object?.nativeForm)object={nativeInstanceForm:true,descriptor:object.nativeForm,expr:{kind:'id',name:'Me'},module:object,form:object.form};
  if(object?.nativeInstanceForm)return this.instanceFormProperty(object,property,node);
  if(object?.nativeInstanceControl)object=this.captureDynamicControl(object);
  return dynamic.setProperty.call(this,object,property,node);
 },
 nativeControlState(object){if(object.nativeInstanceControl)object=this.captureDynamicControl(object);return dynamic.nativeControlState.call(this,object);},
 prepareNativeFontAccess(object){if(object.nativeInstanceControl)return;return dynamic.prepareNativeFontAccess.call(this,object);},
 nativeControlMethod(object,method,args){if(object?.nativeInstanceControl)object=this.captureDynamicControl(object);return dynamic.nativeControlMethod.call(this,object,method,args);},
 computeNativeType(node){
  if(this.nativeFormTypes?.size){const descriptor=this.nativeFormType(node);if(descriptor)return key(descriptor.name);}
  if(this.nativeFormTypes?.size&&node.kind==='member'&&this.nativeFormType(node.object)){
   const p=key(node.name);if(['caption','name'].includes(p))return 'string';if(['enabled','visible'].includes(p))return 'boolean';if(['scalewidth','scaleheight'].includes(p))return 'single';
  }
  return dynamic.computeNativeType.call(this,node);
 },
 expression(node){
  if(!this.nativeFormTypes?.size)return dynamic.expression.call(this,node);
  if(this.formPredicate(node))return;
  if(node.kind==='new'&&key(node.name)==='form')this.fail('New Form requires a concrete form prototype');
  if(node.kind==='id'&&!state.variable.call(this,node)&&this.nativeFormTypes.has(key(node.name))){
   const d=this.nativeFormTypes.get(key(node.name)),m=d.module,x=this.x,ready=x.unique();x.value({memory:m.defaultForm}).test().branch('ne',ready).call(this.classProcedure('New'+d.id));this.checkNativeError();x.store(m.defaultForm).label(ready).push().call(this.classProcedure('Retain'));this.ownClass();return;
  }
  if(node.kind==='member'&&key(node.name)==='activeform'){
   const m=classes.object.call(this,node.object);if(m?.form?.type==='MDIForm'){
    const x=this.x,none=x.unique(),done=x.unique();x.call(m.create).api('user32.dll','SendMessageW',[{memory:m.client},0x229,0,0]).test().branch('e',none).mov('ebx','eax').push(this.string(FORM_HWND_PROPERTY)).pushOperand('ebx').invoke('user32.dll','GetPropW').push().call(this.classProcedure('Retain'));this.ownClass();x.jump(done).label(none).value(0).label(done);return;
   }
  }
  if(node.kind==='call'&&node.callee.kind==='member'){
   const object=this.object(node.callee.object),method=key(node.callee.name);
   if(method==='arrange'&&object?.form?.type==='MDIForm'){this.arrangeNativeMdi(object,node.args);return;}
   if(object?.nativeInstanceForm&&['show','hide','setfocus','refresh'].includes(method)){this.instanceFormMethod(object,method,node.args);return;}
  }
  return dynamic.expression.call(this,node);
 },
 formPredicate(node){
  const x=this.x;if(node.kind==='typeof'){
   const d=this.nativeFormType(node.expr);if(!d)return false;this.nativeClassValue(node.expr);const no=x.unique(),done=x.unique(),wanted=this.nativeClassDescriptor(node.name);x.test().branch('e',no);
   if(key(node.name)==='object'||wanted?.formUnion)x.value(-1);else if(wanted?.nativeForm){x.cmp(at('eax',4),wanted.id);this.boolean('=');}else x.value(0);
   x.jump(done).label(no).value(0).label(done);return true;
  }
  if(node.kind==='call'&&node.callee.kind==='id'&&key(node.callee.name)==='typename'&&!this.resolveProcedure(node.callee)&&node.args.length===1&&this.nativeFormType(node.args[0])){this.nativeClassValue(node.args[0]);this.formTypeName();return true;}
  return false;
 },
 formTypeName(){
  const x=this.x,nilLabel=x.unique(),done=x.unique();x.test().branch('e',nilLabel).mov('edx',at('eax',4));
  for(const d of this.nativeFormTypes.values()){const next=x.unique();x.cmp('edx',d.id).branch('ne',next).value(this.string(d.name)).jump(done).label(next);}
  x.value(this.string('Unknown')).jump(done).label(nilLabel).value(this.string('Nothing')).label(done);
 },
 boxVariant(node){if(this.nativeFormType(node)){boxNativeForm(this,node);return;}return variants.boxVariant.call(this,node);},
 variantBuiltin(node,name){
  if(this.nativeFormTypes?.size&&['typename','vartype'].includes(name)&&node.args.length===1&&this.type(node.args[0])==='variant'&&!this.resolveProcedure(node.callee)){
   this.expression(node.args[0]);const v=this.temporaryVariant();this.storeVariant(v);this.rawStorageAddress(v);const x=this.x,ordinary=x.unique(),done=x.unique(),nilLabel=x.unique();
   declareFormInterface(this);x.cmp(mem16({base:'eax'}),13).branch('ne',ordinary).mov('edx',at('eax',8)).testOperand('edx','edx').branch('e',nilLabel).value('native:form:iunknown').cmp(at('edx'),'eax').branch('ne',ordinary);
   if(name==='vartype')x.value(9);else{x.mov('eax','edx').sub('eax',F.unknown);this.formTypeName();}x.jump(done).label(nilLabel).value(name==='vartype'?9:this.string('Nothing')).jump(done).label(ordinary);
   variants.variantBuiltin.call(this,{...node,args:[this.nativeKernelStorage(v)]},name);x.label(done);return true;
  }
  return variants.variantBuiltin.call(this,node,name);
 },
 nativeFlowInstruction(ins,context,index){
  if(ins.op==='nativeInstanceCreate'){this.emitInstanceCreate(context,context.formDescriptor);return true;}
  if(ins.op==='nativeInstanceRollback'){this.emitInstanceRollback(context,context.formDescriptor);return true;}
  if(this.nativeFormTypes?.size&&ins.op==='assign'&&key(this.variable(ins.target)?.type)==='variant'&&(this.nativeFormType(ins.expr)||nil(ins.expr))){if(!ins.objectSet)this.fail('Native Form reference assignment to Variant requires Set');boxNativeForm(this,ins.expr);this.storeVariant(this.variable(ins.target));return true;}
  if(this.nativeFormTypes?.size&&ins.op==='form'){
   const d=this.nativeFormType(ins.expr);if(d){const r=this.nativeInstanceReceiver(ins.expr,d);if(ins.action==='load')this.createNativeForm(d,r);else{const x=this.x,done=x.unique();x.value(r).mov('eax',at('eax',F.hwnd)).test().branch('e',done).mov('ebx','eax').push(0).push(1).push(0x10).pushOperand('ebx').invoke('user32.dll','SendMessageW').label(done);}return true;}
  }
  return dynamic.nativeFlowInstruction.call(this,ins,context,index);
 },
 handler(module,name,args=[]){
  if(!module.nativeForm)return procedures.handler.call(this,module,name,args);
  const p=module.procedures.get(key(name));if(!p)return;
  if(p.proc.kind!=='sub'||p.proc.params.length!==args.length||p.proc.params.some(p=>p.optional||p.paramArray))this.fail('Native event signature mismatch: '+name,module);
  for(const [i,a]of args.entries())if((a.ref||a.indirectRef)&&(!p.proc.params[i].byRef||!(a.types||[a.type||'integer']).includes(key(p.proc.params[i].type))))this.fail('Native event ByRef type mismatch: '+name,module);
  for(const a of [...args].reverse()){if(a.ref)this.x.local(a.ref).push();else if(a.indirectRef)this.x.value(arg(a.indirectRef)).push();else this.x.push(a);}
  this.x.push(arg(this.context.instanceOffset)).call(p.label);this.checkNativeError(this.context.label?this.context.label+':error-dispatch':'native:error:fatal');
 },
 shutdownNativePictures(){
  if(this.nativeFormTypes?.size)for(const d of this.nativeFormTypes.values()){const m=d.module;this.x.push({memory:m.defaultForm}).value(0).store(m.defaultForm).call(this.classProcedure('Release'));}
  return dynamic.shutdownNativePictures.call(this);
 }
};
