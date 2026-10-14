import {PRIVATE_MEMORY_INTRINSICS} from './private-memory.js';
/** Native intrinsic-control references and runtime Load/Unload/Controls.Add.
 * Demand-gated: unrelated static exports retain their existing binary output.
 * References are not numeric HWND aliases; snapshots stay alive across reentry
 * and become invalid when WM_NCDESTROY detaches their original HWND.
 */
import {nativeEventItemStorage} from './control-items.js';
import {DYNAMIC_CONTROL_KERNEL} from './dynamic-control-kernel.js';
import {emitNativeControlIndexFind,emitNativeControlIndexBoundary} from './control-index.js';
import {CONTROL_INDEX_BYTES} from './control-index-kernel.js';
import {nativeEventMethods as events} from './events.js';
import {nativeClassMethods as classes} from './classes.js';
import {nativeControlArrayMethods as arrays} from './control-arrays.js';
import {nativeControlMethods as controls} from './controls.js';
import {NATIVE_CONTROL_CATALOG} from './control-catalog.js';
import {nativeControlStyle} from './control-plan.js';
import {createControl} from '../project/model.js';
import {mem32} from './x86-operands.js';
const key=v=>String(v).toLowerCase(),arg=argument=>({argument}),mem=memory=>({memory}),lit=value=>({kind:'literal',value});
const at=(base,displacement=0)=>mem32({base,displacement}),slot=v=>v.label?mem32({label:v.label}):at('ebp',v.offset);
export const DYNAMIC_CONTROL_TYPES=['Label','CommandButton','TextBox','CheckBox','OptionButton','Frame'];
const kinds=new Map(DYNAMIC_CONTROL_TYPES.map((n,i)=>[key(n),i+1])),kindFor=type=>kinds.get(key(type).replace(/^vb\./,''))||0;
const isNil=n=>n?.kind==='nothing'||n?.kind==='group'&&isNil(n.expr);
const common=new Set(['caption','text','name','tag','hwnd','visible','enabled','left','top','width','height','backcolor','forecolor','backstyle','fontname','fontsize','fontbold','fontitalic','fontunderline','fontstrikethru','fontstrikethrough','index']);
export const nativeDynamicControlMethods={
 nativeControlKind(type){return kindFor(type);},
 nativeObjectType(type){return !this.nativeClassDescriptor(type)&&(['object','control'].includes(key(type))||kindFor(type)!==0);},
 scalar(decl){
  // Borrowed common-control event descriptors have their own non-owning ABI.
  const item=nativeEventItemStorage(this,decl,this.preparingModule,this.preparingProcedure);
  if(item)return item;
  if(!this.nativeObjectType(decl.type))return events.scalar.call(this,decl);
  if(decl.autoNew||decl.bounds!=null||decl.withEvents)this.fail('Native intrinsic-control reference requires scalar storage without New or WithEvents');
  this.nativeControlReferences=true;
  return Object.assign(decl,{nativeControlRef:true,nativeControlKind:kindFor(decl.type),type:kindFor(decl.type)?DYNAMIC_CONTROL_TYPES[kindFor(decl.type)-1]:key(decl.type)==='control'?'Control':'Object',nativeBytes:4,nativeCount:1,nativeElementBytes:4});
 },
 dynamicKernel(){
  if(this.nativeDynamicKernel)return this.nativeDynamicKernel;
  this.nativeAdditionalErrors ||= new Map();
  this.nativeAdditionalErrors.set(438,"Object doesn't support this property or method");
  this.nativeAdditionalErrors.set(360,'Object already loaded');
  this.nativeAdditionalErrors.set(361,"Can't load or unload this object");
  this.nativeAdditionalErrors.set(362,"Can't unload controls created at design time");
  const host=(c,p,body)=>{c.x.label(p.label).enter();body(c.x);};
  const kernel=this.privateNativeKernel('NativeDynamicControls',DYNAMIC_CONTROL_KERNEL,{
   indexfind:emitNativeControlIndexFind,
   indexboundary:emitNativeControlIndexBoundary,
   word:(c,p)=>host(c,p,x=>x.value(arg(8)).mov('edx','eax').value(arg(12)).mov('eax',mem32({base:'edx',index:'eax'})).leave(8)),
   putword:(c,p)=>host(c,p,x=>x.value(arg(8)).mov('edx','eax').value(arg(12)).add('edx','eax').value(arg(16)).mov(at('edx'),'eax').leave(12)),
   copybytes:(c,p)=>host(c,p,x=>x.value(arg(8)).mov('edi','eax').value(arg(12)).mov('esi','eax').value(arg(16)).mov('ecx','eax').cld().repMove(8).leave(12)),
   setstring:(c,p)=>host(c,p,x=>x.push(arg(12)).push(arg(8)).call('native:string:assign').leave(8)),
   readstring:(c,p)=>host(c,p,x=>x.value(arg(8)).pushOperand(at('eax')).call('native:string:copy').leave(4)),
   clearstring:(c,p)=>host(c,p,x=>x.value(arg(8)).pushOperand(at('eax')).mov(at('eax'),0).invoke('oleaut32.dll','SysFreeString').leave(4)),
   nameequals:(c,p)=>{
    const x=c.x,done=x.unique();x.label(p.label).enter().value(arg(8)).mov('esi',at('eax',36)).api('oleaut32.dll','SysStringLen',[arg(12)]).mov('ebx','eax').pushOperand('esi').invoke('oleaut32.dll','SysStringLen').cmp('eax','ebx').value(0).branch('ne',done);
    x.push(1).pushOperand('ebx').push(arg(12)).pushOperand('ebx').pushOperand('esi').invoke('kernel32.dll','CompareStringOrdinal').compare(2);c.boolean('=');x.label(done).leave(8);
   },
   windowtext:(c,p)=>{
    const x=c.x,valid=x.unique();x.label(p.label).enter(4).api('user32.dll','GetWindowTextLengthW',[arg(8)]).compare(1048576).branch('a','error:7').mov('ebx','eax').push().push(0).invoke('oleaut32.dll','SysAllocStringLen').test().branch('e','error:7').mov('esi','eax');
    x.mov('eax','ebx').inc('eax').push().pushOperand('esi').push(arg(8)).invoke('user32.dll','GetWindowTextW').mov(at('ebp',-4),'eax');
    x.api('user32.dll','GetWindowTextLengthW',[arg(8)]).cmp('eax','ebx').branch('be',valid).pushOperand('esi').invoke('oleaut32.dll','SysFreeString').jump('error:5').label(valid);
    x.mov('eax',at('ebp',-4)).shift('shl','eax',1).mov(at('esi',-4),'eax').mov('eax','esi').leave(4);
   }
  },PRIVATE_MEMORY_INTRINSICS);
  this.nativeDynamicKernel=kernel;
  for(const name of ['ClassName','KindName','DefaultStyle','DefaultEx','DefaultWidth','DefaultHeight'])kernel.hosts[key(name)]=(c,p)=>{
   const x=c.x;x.label(p.label).enter().value(arg(8));
   for(const [i,type]of DYNAMIC_CONTROL_TYPES.entries()){
    const next=x.unique(),defaults={Visible:0,Enabled:-1,TabStop:['Label','Frame'].includes(type)?0:-1,...createControl(type,'NativeTemplate').properties},styles=nativeControlStyle(type,defaults);
    x.compare(i+1).branch('ne',next);
    if(name==='ClassName'||name==='KindName')x.push(c.string(name==='ClassName'?NATIVE_CONTROL_CATALOG[type].className:type)).call('native:string:copy');
    else x.value(name==='DefaultStyle'?styles.style:name==='DefaultEx'?styles.ex:Math.round(defaults[name==='DefaultWidth'?'Width':'Height']/15));
    x.leave(4).label(next);
   }
   x.value(438).jump('native:error:raise');
  };
  return kernel;
 },
 controlProcedure(name){return this.privateNativeProcedure(this.dynamicKernel(),name).label;},
 ownControl(blockScoped=false){return this.ownNativePointer(this.controlProcedure('Release'),blockScoped);},
 prepareDynamicForm(module){
  if(module.dynamicRegistry)return;
  if(!module.form)this.fail('Native Controls collection requires a form');
  module.dynamicRegistry='dynamic-controls:'+module.name;this.data.align(4).label(module.dynamicRegistry).zero(28);
  module.dynamicSubclass='dynamic-subclass:'+module.name;
  for(const group of module.controlArrays.values()){
   group.dynamicDirectory='dynamic-index:'+module.name+':'+key(group.name);this.data.align(4).label(group.dynamicDirectory).zero(CONTROL_INDEX_BYTES);
  }
  for(const c of module.controls.values())if(kindFor(c.model.type))this.prepareNativeFontAccess(c);
 },
 dynamicCollection(node){
  if(node.kind==='group')return this.dynamicCollection(node.expr);
  if(node.kind==='id'&&key(node.name)==='controls'&&this.context?.module.form)return this.context.module;
  if(node.kind==='member'&&key(node.name)==='controls'){const form=classes.object.call(this,node.object);if(form?.form)return form;}
  return null;
 },
 dynamicCallInfo(node){
  const callee=node.kind==='call'?node.callee:node;
  if(callee.kind==='member'){const form=this.dynamicCollection(callee.object);if(form)return {form,name:key(callee.name),args:node.kind==='call'?node.args:[]};}
  if(node.kind==='call'){const form=this.dynamicCollection(callee);if(form)return {form,name:'item',args:node.args};}
  return null;
 },
 prepareNativeDynamics(){
  for(const module of this.modules.values())for(const p of module.procedures.values())for(const ins of p.proc.code){
   if(ins.op==='form'&&ins.expr.kind==='call'){
    const callee=ins.expr.callee,owner=callee.kind==='id'?module:callee.kind==='member'&&callee.object.kind==='id'?this.modules.get(key(callee.object.name)):null;
    const group=owner?.controlArrays.get(key(callee.name));if(group){if(!kindFor(group.type))this.fail('Native runtime Load/Unload is not lowered for '+group.type,module);this.prepareDynamicForm(owner);}
   }
  }
  if(this.nativeControlReferences)this.controlProcedure('Release');
 },
 initializeDynamicControls(module){
  if(!module.dynamicRegistry)return;
  const x=this.x;x.value({memory:module.dynamicRegistry,addend:24}).compare(0x7fffffff).branch('e','error:6').inc('eax').store(module.dynamicRegistry,24);
  x.value(0).store(module.dynamicRegistry,16).value(module.handle).store(module.dynamicRegistry,12);
  for(const c of module.controls.values()){
   const group=module.controlArrays.get(key(c.model.name));
   x.push(c.model.type==='Timer'?0:c.handle).push(module.dynamicSubclass).push(c.state||0).push(mem(c.handle)).push(kindFor(c.model.type)).push(this.string(c.model.name)).push(c.model.properties.Index??-1).push(group?.dynamicDirectory||0).push(module.dynamicRegistry).call(this.controlProcedure('Register'));this.checkNativeError();
  }
 },
 disposeDynamicControls(module){
  if(!module.dynamicRegistry)return;
  this.x.value(0).store(module.loaded).push(module.dynamicRegistry).call(this.controlProcedure('CloseRegistry'));
  this.checkNativeError('native:error:fatal');
  for(const group of module.controlArrays.values())this.x.push(group.dynamicDirectory).call(this.controlProcedure('IndexClear'));
 },
 dynamicRefType(node){
  if(node.kind==='group')return this.dynamicRefType(node.expr);
  if(node.kind==='with')return !!this.nativeWithBinding().object?.nativeDynamicBound;
  if(node.kind==='nativeDynamicValue')return true;
  if(this.variable(node)?.nativeControlRef)return true;
  const info=this.dynamicCallInfo(node);if(info&&['add','item'].includes(info.name))return true;
  const target=this.resolveProcedure(node.kind==='call'?node.callee:node);return !!target&&this.nativeObjectType((target.proc||target).returnType);
 },
 nativeControlValue(node){
  if(isNil(node)){this.x.value(0);return;}
  if(this.dynamicRefType(node)){this.expression(node);return;}
  const object=classes.object.call(this,node);
  if(!object?.model||object.controlArray)this.fail('Native Object requires an intrinsic HWND control reference or Nothing; COM/Object dispatch is not lowered');
  this.prepareDynamicForm(object.module);
  const captured=this.captureDynamicControl(object);
  if(captured.nativeDynamicBound){this.x.mov('eax',slot(captured.nativeControlNode));return;}
  this.ensure(object);this.x.push(this.controlHandleRef(object)).call(this.controlProcedure('Reference'));this.checkNativeError();this.ownControl();
 },
 load(variable){
  if(!variable.nativeControlRef)return classes.load.call(this,variable);
  this.address(variable);this.x.pushOperand(at('eax')).call(this.controlProcedure('Retain'));this.checkNativeError();this.ownControl();
 },
 checkNativeControlKind(kind){
  if(!kind)return;const x=this.x,done=x.unique();x.test().branch('e',done).cmp(at('eax',40),kind).branch('ne','error:13').label(done);
 },
 store(variable){
  if(!variable.nativeControlRef)return events.store.call(this,variable);
  const x=this.x;
  this.checkNativeControlKind(variable.nativeControlKind);
  x.push();this.address(variable);x.mov('ebx','eax').popOperand('eax').push().call(this.controlProcedure('Retain'));this.checkNativeError();
  x.mov('edi',at('ebx')).mov(at('ebx'),'eax').push().pushOperand('edi').call(this.controlProcedure('Release')).popOperand('eax');
 },
 storageExpression(variable,node){if(variable.nativeControlRef)return this.nativeControlValue(node);return classes.storageExpression.call(this,variable,node);},
 clearControlStorage(variable){this.rawStorageAddress(variable);this.x.pushOperand(at('eax')).mov(at('eax'),0).call(this.controlProcedure('Release'));},
 initializeFixedString(variable){if(!variable.nativeControlRef)return classes.initializeFixedString.call(this,variable);if(variable.incomingControlOffset!==undefined)this.x.push(arg(variable.incomingControlOffset)).call(this.controlProcedure('Retain')).mov(slot(variable),'eax');},
 zeroStorage(variable){if(variable.nativeControlRef&&variable.owner?.form&&variable.label)return this.clearControlStorage(variable);return classes.zeroStorage.call(this,variable);},
 prepareNativeFlow(context){
  classes.prepareNativeFlow.call(this,context);
  for(const v of context.locals.values())if(v.nativeControlRef&&!v.nativeInstanceField){
   if(v.parameter){if(v.byRef)continue;v.incomingControlOffset=v.offset;v.parameter=false;v.offset=this.arrayWorkspace(4,'control-parameter').offset;}
   if(!v.label)context.nativeOwnedTemps.push({variable:v,release:this.controlProcedure('Release'),blockScoped:true});
  }
 },
 nativeReferenceArgument(parameter,node,omitted=false){
  if(!this.nativeObjectType(parameter.type))return events.nativeReferenceArgument.call(this,parameter,node,omitted);
  const variable=this.variable(node);
  if(node.kind!=='group'&&!omitted&&variable){if(!variable.nativeControlRef||key(variable.type)!==key(parameter.type).replace(/^vb\./,''))this.fail('ByRef control requires exactly matching Object/Control/typed storage');this.address(variable);return {};}
  this.nativeControlValue(node);this.checkNativeControlKind(kindFor(parameter.type));this.x.push().call(this.controlProcedure('Retain'));const temporary=this.ownControl();Object.assign(temporary,{type:'Object',nativeControlRef:true});this.rawStorageAddress(temporary);return {temporary};
 },
 nativeTypedCall(target,plan){const value=classes.nativeTypedCall.call(this,target,plan);if(this.nativeObjectType((target.proc||target).returnType))this.ownControl();return value;},
 anyReferenceArgument(node){if(this.variable(node)?.nativeControlRef)this.fail('Native control references do not expose an external COM/As Any ABI');return classes.anyReferenceArgument.call(this,node);},
 numeric(node){if(this.dynamicRefType(node))this.fail('Native control references cannot convert to numbers');return classes.numeric.call(this,node);},
 textExpression(node){if(this.dynamicRefType(node))this.fail('Native control reference requires an explicit text property');return classes.textExpression.call(this,node);},
 truth(node){if(this.dynamicRefType(node))this.fail('Native control reference requires Is Nothing or a Boolean property');return classes.truth.call(this,node);},
 floatExpression(node,single=false){if(this.dynamicRefType(node))this.fail('Native control references cannot convert to floating-point');return classes.floatExpression.call(this,node,single);},
 currencyExpression(node){if(this.dynamicRefType(node))this.fail('Native control references cannot convert to Currency');return classes.currencyExpression.call(this,node);},
 object(node){
  if(!this.dynamicRefType(node))return classes.object.call(this,node);
  if(node.kind==='with')return this.nativeWithBinding().object;
  const variable=this.variable(node),target=this.resolveProcedure(node.kind==='call'?node.callee:node),kind=variable?.nativeControlKind||kindFor((target?.proc||target)?.returnType);
  return {nativeDynamicExpr:node,model:{type:kind?DYNAMIC_CONTROL_TYPES[kind-1]:'NativeControlObject',name:'',properties:{}},module:this.context.module};
 },
 captureDynamicControl(object){
  if(object.nativeDynamicBound||!object.nativeDynamicExpr&&!object.group?.dynamicDirectory)return object;
  const x=this.x;
  if(object.nativeDynamicExpr)this.nativeControlValue(object.nativeDynamicExpr);
  else{x.call(object.module.create);this.numeric(object.indexExpression);x.push().push(object.group.dynamicDirectory).call(this.controlProcedure('ArrayItem'));this.checkNativeError();this.ownControl();}
  const node=this.arrayWorkspace(4,'captured-control');x.mov(slot(node),'eax').push().call(this.controlProcedure('Require'));this.checkNativeError();
  const handle=this.arrayWorkspace(4,'captured-hwnd');x.mov(slot(handle),'eax');
  return {...object,nativeDynamicBound:true,nativeDynamicExpr:null,indexed:false,boundIndex:false,nativeControlNode:node,handleSlot:handle};
 },
 controlHandleRef(object){
  if(object.nativeDynamicBound){const x=this.x;x.push().mov('eax',slot(object.nativeControlNode)).mov('eax',at('eax',4)).test().branch('e','error:91').cmp('eax',slot(object.handleSlot)).branch('ne','error:91').popOperand('eax');}
  return arrays.controlHandleRef.call(this,object);
 },
 ensure(object){
  if(object.nativeDynamicBound){this.withGuard(object.nativeWithActive);this.controlHandleRef(object);return;}
  if(object.nativeDynamicExpr||object.group?.dynamicDirectory){Object.assign(object,this.captureDynamicControl(object));return;}
  return classes.ensure.call(this,object);
 },
 resolveControlHandle(object){if(!object.group?.dynamicDirectory)return arrays.resolveControlHandle.call(this,object);Object.assign(object,this.captureDynamicControl(object));},
 nativeControlState(object){if(!object.nativeDynamicBound)return controls.nativeControlState.call(this,object);this.controlHandleRef(object);this.x.mov('eax',slot(object.nativeControlNode)).mov('eax',at('eax',8)).test().branch('e','error:91');},
 controlArrayProperty(object,property){
  if(object.controlArray&&object.dynamicDirectory){
   if(!['count','lbound','ubound'].includes(property))this.fail('Control array requires an Index: '+object.name);
   this.x.call(object.module.create);if(property!=='count')this.x.value({memory:object.dynamicDirectory,addend:512}).test().branch('e','error:9');
   this.x.value({memory:object.dynamicDirectory,addend:{count:512,lbound:516,ubound:520}[property]});return true;
  }
  if(object.nativeDynamicBound&&property==='index'){this.ensure(object);this.x.mov('eax',slot(object.nativeControlNode)).cmp(at('eax',12),0).branch('e','error:438').mov('eax',at('eax',16));return true;}
  return arrays.controlArrayProperty.call(this,object,property);
 },
 prepareNativeFontAccess(object){if(object.nativeDynamicBound)return;return controls.prepareNativeFontAccess.call(this,object);},
 getProperty(object,property){
  if(object&&(object.nativeDynamicExpr||object.group?.dynamicDirectory||object.nativeDynamicBound)){
   object=this.captureDynamicControl(object);this.ensure(object);this.validateDynamicProperty(object,property);
   if(property==='name'){this.x.mov('eax',slot(object.nativeControlNode)).add('eax',36).push().call(this.controlProcedure('ReadString'));this.ownString();return;}
   if(['caption','text'].includes(property)){this.x.push(this.controlHandleRef(object)).call(this.controlProcedure('WindowText'));this.checkNativeError();this.ownString();return;}
  }
  return classes.getProperty.call(this,object,property);
 },
 setProperty(object,property,node){
  if(object&&(object.nativeDynamicExpr||object.group?.dynamicDirectory||object.nativeDynamicBound)){
   object=this.captureDynamicControl(object);this.ensure(object);if(['name','index'].includes(property))this.fail('Native '+property+' is read-only');this.validateDynamicProperty(object,property);
  }
  return classes.setProperty.call(this,object,property,node);
 },
 validateDynamicProperty(object,property){
  if(object.model.type!=='NativeControlObject')return;
  if(!common.has(property))this.fail('Native Object control property is not lowered: '+property);
  if(property==='text'||property==='caption'){
   const x=this.x;x.mov('eax',slot(object.nativeControlNode)).mov('eax',at('eax',40));
   if(property==='text')x.compare(3).branch('ne','error:438');else x.compare(3).branch('e','error:438').compare(1).branch('l','error:438').compare(6).branch('g','error:438');
  }
 },
 nativeControlMethod(object,method,args){
  if(object&&(object.nativeDynamicExpr||object.group?.dynamicDirectory||object.nativeDynamicBound)){
   object=this.captureDynamicControl(object);
   if(method==='setfocus'&&!args.length){this.x.api('user32.dll','SetFocus',[this.controlHandleRef(object)]);return true;}
  }
  return controls.nativeControlMethod.call(this,object,method,args);
 },
 computeNativeType(node){
  if(node.kind==='nativeDynamicValue'||this.dynamicRefType(node))return 'object';
  if(node.kind==='typeof'&&this.dynamicRefType(node.expr)||node.kind==='binary'&&node.op==='is'&&(this.dynamicRefType(node.left)||this.dynamicRefType(node.right)))return 'boolean';
  if(node.kind==='member'&&this.dynamicRefType(node.object)){
   const property=key(node.name);if(['caption','text','tag','name','fontname'].includes(property))return 'string';
   if(['enabled','visible','fontbold','fontitalic','fontunderline','fontstrikethru','fontstrikethrough'].includes(property))return 'boolean';if(property==='fontsize')return 'double';
  }
  return classes.computeNativeType.call(this,node);
 },
 expression(node){if(node.kind==='nativeDynamicValue'){this.x.value(node.value);return;}if(this.dynamicOperation(node))return;return classes.expression.call(this,node);},
 dynamicOperation(node){
  const x=this.x,info=this.dynamicCallInfo(node);if(info){this.dynamicCollectionOperation(info);return true;}
  if(node.kind==='binary'&&node.op==='is'&&(this.dynamicRefType(node.left)||this.dynamicRefType(node.right))){this.nativeControlValue(node.left);x.push();this.nativeControlValue(node.right);x.popOperand('edx').cmp('edx','eax');this.boolean('=');return true;}
  if(node.kind==='typeof'&&this.dynamicRefType(node.expr)){
   this.nativeControlValue(node.expr);const nil=x.unique(),done=x.unique();x.test().branch('e',nil);
   if(['control','object'].includes(key(node.name)))x.value(-1);else{x.mov('eax',at('eax',40)).compare(kindFor(node.name)||-1);this.boolean('=');}x.jump(done).label(nil).value(0).label(done);return true;
  }
  if(node.kind==='with'&&this.nativeWithBinding().object?.nativeDynamicBound){const object=this.nativeWithBinding().object;this.withGuard(object.nativeWithActive);x.pushOperand(slot(object.nativeControlNode)).call(this.controlProcedure('Retain'));this.ownControl();return true;}
  if(node.kind==='call'&&node.callee.kind==='id'&&!this.resolveProcedure(node.callee)&&['typename','vartype','isobject'].includes(key(node.callee.name))&&node.args.length===1&&this.dynamicRefType(node.args[0])){
   this.nativeControlValue(node.args[0]);const name=key(node.callee.name);
   if(name==='typename'){const nil=x.unique(),done=x.unique();x.test().branch('e',nil).pushOperand(at('eax',40)).call(this.controlProcedure('KindName'));this.checkNativeError();this.ownString();x.jump(done).label(nil).value(this.string('Nothing')).label(done);}else x.value(name==='vartype'?9:-1);return true;
  }
  return false;
 },
 dynamicCollectionOperation({form,name,args}){
  this.prepareDynamicForm(form);const x=this.x;
  if(name==='count'){if(args.length)this.fail('Controls.Count takes no arguments');x.call(form.create).value({memory:form.dynamicRegistry,addend:8});return;}
  if(!['add','item','remove'].includes(name))this.fail('Native Controls member is not lowered: '+name);
  if(name!=='add'){
   if(args.length!==1||['missing','named'].includes(args[0].kind))this.fail('Controls.'+name+' requires one positional index');
   x.call(form.create);this.boxVariant(args[0]);x.push().push(form.dynamicRegistry).call(this.controlProcedure('Item'));this.checkNativeError();this.ownControl();
   if(name==='remove'){x.mov('ebx','eax').push(0).pushOperand('ebx').call(this.controlProcedure('Remove'));this.checkNativeError();}return;
  }
  if(args.length<2||args.length>3||args.some(a=>['missing','named'].includes(a.kind)))this.fail('Controls.Add requires ProgID, name and optional container');
  x.call(form.create).value(mem(form.handle));const owner=this.arrayWorkspace(4,'add-owner'),generation=this.arrayWorkspace(4,'add-owner-generation');x.mov(slot(owner),'eax').value({memory:form.dynamicRegistry,addend:24}).mov(slot(generation),'eax');
  this.textExpression(args[0]);const progid=this.temporaryString();this.store(progid);
  this.textExpression(args[1]);const nameSlot=this.temporaryString();this.store(nameSlot);
  if(args[2]&&!isNil(args[2])){
   let container=this.object(args[2]);
   if(container?.form){if(container!==form)this.fail('Controls.Add container must belong to its form');this.ensure(container);x.value(this.controlHandleRef(container));}
   else if(container?.model){container=this.captureDynamicControl(container);this.ensure(container);if(container.nativeDynamicBound)x.mov('eax',slot(container.nativeControlNode)).cmp(at('eax',40),6).branch('ne','error:5');else if(container.model.type!=='Frame')this.fail('Native dynamic container requires Form or Frame');x.value(this.controlHandleRef(container));}
   else this.fail('Controls.Add requires a native Form/Frame container');
  }else x.value(arg(owner.offset));
  const parent=this.arrayWorkspace(4,'add-parent');x.mov(slot(parent),'eax');
  const type=this.arrayWorkspace(4,'add-kind'),matched=x.unique();
  for(const [kind,typeName]of DYNAMIC_CONTROL_TYPES.entries()){
   this.compareNativeStrings(this.nativeKernelStorage(progid),lit('VB.'+typeName),lit(1));const next=x.unique();x.test().branch('ne',next).value(kind+1).mov(slot(type),'eax').jump(matched).label(next);
  }
  x.jump('error:438').label(matched).value(mem(form.handle)).cmp('eax',slot(owner)).branch('ne','error:91').value({memory:form.dynamicRegistry,addend:24}).cmp('eax',slot(generation)).branch('ne','error:91');
  x.push(form.dynamicSubclass).push(0).push(arg(parent.offset)).push(arg(type.offset)).push(arg(nameSlot.offset)).push(-1).push(0).push(form.dynamicRegistry).call(this.controlProcedure('Make'));this.checkNativeError();this.ownControl();
 },
 nativeFlowInstruction(ins,context,index){
  const x=this.x;
  if(ins.op==='assign'&&this.variable(ins.target)?.nativeControlRef){if(!ins.objectSet)this.fail('Native control reference assignment requires Set');this.nativeControlValue(ins.expr);this.store(this.variable(ins.target));return true;}
  if(ins.op==='form'){
   const object=this.object(ins.expr);if(object?.group?.dynamicDirectory){
    if(ins.action==='load'){x.call(object.module.create);this.numeric(object.indexExpression);const idx=this.arrayWorkspace(4,'loaded-index');x.mov(slot(idx),'eax').push(object.module.dynamicSubclass).push(arg(idx.offset)).push(object.group.dynamicDirectory).push(object.module.dynamicRegistry).call(this.controlProcedure('LoadElement'));this.checkNativeError();this.ownControl();}
    else {const bound=this.captureDynamicControl(object);x.push(1).pushOperand(slot(bound.nativeControlNode)).call(this.controlProcedure('Remove'));this.checkNativeError();}return true;
   }
  }
  if(ins.op==='withPush'){
   const o=this.object(ins.expr);if(o&&(o.nativeDynamicExpr||o.group?.dynamicDirectory)){
    const object=this.captureDynamicControl(o),active=this.arrayWorkspace(4,'with-active');context.locals.set(active.name,active);
    x.pushOperand(slot(object.nativeControlNode)).call(this.controlProcedure('Retain'));const v=this.ownControl(true);object.nativeControlNode=v;object.nativeWithActive=active;
    x.mov(slot(active),-1);context.withBindings.push({active,object,reference:{variable:v,release:this.controlProcedure('Release')}});return true;
   }
  }
  return events.nativeFlowInstruction.call(this,ins,context,index);
 },
 disposeNativeControls(module){for(const v of module.globals.values())if(v.nativeControlRef)this.clearControlStorage({...v,owner:null});return events.disposeNativeControls.call(this,module);},
 shutdownNativePictures(){for(const m of this.modules.values())if(!m.nativeClass)for(const v of m.globals.values())if(v.nativeControlRef)this.clearControlStorage({...v,owner:null});return classes.shutdownNativePictures.call(this);}
};
