import {PRIVATE_MEMORY_INTRINSICS} from './private-memory.js';
/** Typed WithEvents cells own a source reference plus a subscription node.
 * Nodes borrow sink owners: they do not introduce source/sink reference cycles.
 * Invocation retains a class sink until its callback returns. Linked tombstones
 * and a captured tail keep reentrant connect/disconnect allocation-free on raise.
 */
import {EVENTS_KERNEL} from './events-kernel.js';
import {nativeClassMethods as classes} from './classes.js';
import {nativeParameterBytes} from './numeric.js';
import {mem32} from './x86-operands.js';
const key=v=>String(v).toLowerCase(),arg=argument=>({argument}),at=(base,displacement=0)=>mem32({base,displacement});
const slot=v=>v.label?mem32({label:v.label}):at('ebp',v.offset);
const actual=(name)=>({kind:'id',name});
function signature(params){return params.map((p,i)=>`${p.byRef?'ByRef':'ByVal'} a${i}${p.bounds!=null?'()':''} As ${p.storageType||p.type}`).join(',');}
function sameParameter(a,b){return key(a.storageType||a.type)===key(b.storageType||b.type)&&!!a.byRef===!!b.byRef&&(a.bounds!=null)===(b.bounds!=null)&&!a.optional&&!a.paramArray;}
export const nativeEventMethods={
 scalar(decl){
  if(!decl.withEvents)return classes.scalar.call(this,decl);
  if(!this.nativeClassDescriptor(decl.type)||decl.autoNew||decl.bounds!=null)this.fail('Native WithEvents requires a scalar typed class without As New');
  Object.assign(decl,classes.scalar.call(this,{...decl,withEvents:false}),{withEvents:true,nativeWithEvents:true,nativeBytes:8});
  return decl;
 },
 eventKernel(){
  if(this.nativeEventsKernel)return this.nativeEventsKernel;
  const events=[],sinks=[];
  for(const d of this.nativeClassTypes.values())for(const [name,e]of d.module.module.events||[]){
   if(e.params.some(p=>p.optional||p.paramArray))this.fail('Native events do not admit Optional or ParamArray parameters',d.module);
   events.push({descriptor:d,event:e,name,method:'Raise'+events.length,index:[...d.module.module.events.keys()].indexOf(name)});
  }
  for(const m of this.modules.values())if(!m.nativeInternal)for(const variable of m.globals.values())if(variable.nativeWithEvents){
   const descriptor=this.nativeClassDescriptor(variable.type),matching=events.filter(e=>e.descriptor===descriptor),entries=[];
   for(const e of matching){const handler=m.procedures.get(key(variable.name+'_'+e.event.name));
    if(handler){if(handler.proc.kind!=='sub'||handler.proc.params.length!==e.event.params.length||handler.proc.params.some((p,i)=>!sameParameter(p,e.event.params[i])))this.fail('Native WithEvents handler signature must match its Event: '+handler.proc.name,m);
     const sink={method:'Sink'+sinks.length,handler,event:e,variable};sinks.push(sink);entries.push(sink);
    }else entries.push(null);
   }
   variable.nativeEventTableEntries=entries;
  }
  const code=EVENTS_KERNEL+'\n'+events.map(e=>`Private Sub ${e.method}(ByVal publisher As Long${e.event.params.length?','+signature(e.event.params):''})\nEnd Sub`).join('\n')+'\n'+
   sinks.map(s=>`Private Sub ${s.method}(ByVal owner As Long${s.event.event.params.length?','+signature(s.event.event.params):''})\nEnd Sub`).join('\n');
  const kernel=this.privateNativeKernel('NativeEventService',code,{
   word:(c,p)=>c.x.label(p.label).enter().value(arg(8)).mov('edx','eax').value(arg(12)).mov('eax',mem32({base:'edx',index:'eax'})).leave(8),
   putword:(c,p)=>c.x.label(p.label).enter().value(arg(8)).mov('edx','eax').value(arg(12)).add('edx','eax').value(arg(16)).mov(at('edx'),'eax').leave(12)
  },PRIVATE_MEMORY_INTRINSICS);
  this.nativeEventsKernel=kernel;kernel.events=events;
  for(const e of events){const p=kernel.procedures.get(key(e.method));p.proc.nativeTransparentErr=true;p.nativeEvent=e;p.proc.code.unshift({op:'nativeEventDispatch',line:0});}
  for(const s of sinks){const p=kernel.procedures.get(key(s.method));p.proc.nativeTransparentErr=true;p.nativeEventSink=s;p.proc.code.unshift({op:'nativeEventSink',line:0});}
  return kernel;
 },
 eventProcedure(name){return this.privateNativeProcedure(this.eventKernel(),name).label;},
 eventTable(variable){
  const kernel=this.eventKernel(),owner=variable.owner||variable.nativeInstanceField?.module;
  const original=owner?.globals.get(key(variable.name));
  if(!original?.nativeWithEvents)this.fail('Native WithEvents cell has no declaring module: '+variable.name);
  if(!original.nativeEventTable){
   const table=this.x.unique('event-table');this.ro.align(4).label(table);
   for(const sink of original.nativeEventTableEntries){if(sink)this.ro.reference(this.privateNativeProcedure(kernel,sink.method).label);else this.ro.u32(0);}
   original.nativeEventTable=table;
  }
  return original.nativeEventTable;
 },
 store(variable){
  if(!variable.nativeWithEvents)return classes.store.call(this,variable);
  const x=this.x,source=this.arrayWorkspace(4,'event-source'),destination=this.arrayWorkspace(4,'event-cell');x.mov(slot(source),'eax');
  this.address(variable);x.mov(slot(destination),'eax');
  const table=this.eventTable(variable);
  // Derive the sink owner from the captured cell address, never re-evaluate a
  // receiver expression after its right-hand side has already run.
  if(variable.nativeInstanceField)x.sub('eax',variable.nativeFieldOffset);
  else if(variable.nativeEventOwnerOffset!==undefined)x.sub('eax',variable.nativeEventOwnerOffset);
  else x.value(0);
  x.mov('edx','eax').push(table).pushOperand('edx').push(arg(source.offset)).call(this.eventProcedure('Connect'));this.checkNativeError();
  const connection=this.ownNativePointer(this.eventProcedure('Disconnect'));
  x.push(arg(source.offset)).call(this.classProcedure('Retain'));
  x.mov('ebx',slot(destination)).mov('edi',at('ebx')).mov('edx',at('ebx',4)).mov(at('ebx'),'eax')
   .mov('eax',slot(connection)).mov(at('ebx',4),'eax').mov(slot(connection),0).pushOperand('edi').pushOperand('edx').call(this.eventProcedure('Disconnect'));
  this.checkNativeError();x.call(this.classProcedure('Release')).value(arg(source.offset));
 },
 clearClassStorage(variable){
  if(!variable.nativeWithEvents)return classes.clearClassStorage.call(this,variable);
  const x=this.x;this.rawStorageAddress(variable);x.mov('ebx','eax').pushOperand(at('ebx')).pushOperand(at('ebx',4)).mov(at('ebx'),0).mov(at('ebx',4),0)
   .call(this.eventProcedure('Disconnect')).call(this.classProcedure('Release'));
 },
 nativeReferenceArgument(parameter,node,omitted=false){
  if(!omitted&&node.kind!=='group'&&this.variable(node)?.nativeWithEvents)this.fail('Pass a parenthesized WithEvents value; raw ByRef subscription-cell replacement is not lowered');
  return classes.nativeReferenceArgument.call(this,parameter,node,omitted);
 },
 detachNativeEventFields(descriptor,base='esi'){
  const x=this.x;for(const f of descriptor.fields)if(f.nativeWithEvents)x.pushOperand(at(base,f.nativeFieldOffset+4)).mov(at(base,f.nativeFieldOffset+4),0).call(this.eventProcedure('Disconnect'));
 },
 disposeNativeEventSource(base='esi'){
  if(!this.nativeEventsKernel)return;
  this.x.pushOperand(base).call(this.eventProcedure('DisposeSource'));
 },
 disposeNativeControls(module){
  for(const v of module.globals.values())if(v.nativeWithEvents){const x=this.x;x.push({memory:v.label,addend:4}).value(0).store(v.label,4).call(this.eventProcedure('Disconnect'));}
  return classes.disposeNativeControls.call(this,module);
 },
 emitNativeEventSink(context,sink){
  const x=this.x,owner=context.locals.get('owner');
  if(sink.handler.instanceOffset){x.push(arg(owner.offset)).call(this.classProcedure('Retain'));this.ownClass();}
  const args=sink.event.event.params.map((p,i)=>actual('a'+i));
  this.nativeTypedCall({...sink.handler,...(sink.handler.instanceOffset?{nativeInstanceArgument:arg(owner.offset)}:{})},this.nativeCallPlan(sink.handler,args));
 },
 emitNativeEventDispatch(context,event){
  const x=this.x,publisher=context.locals.get('publisher'),done=x.unique(),loop=x.unique(),skip=x.unique();
  const state=this.arrayWorkspace(4,'event-active'),current=this.arrayWorkspace(4,'event-current'),next=this.arrayWorkspace(4,'event-next'),tail=this.arrayWorkspace(4,'event-tail');
  context.nativeOwnedTemps.push({variable:state,release:this.eventProcedure('CloseRaise'),blockScoped:true});
  x.push(arg(publisher.offset)).call(this.eventProcedure('OpenRaise'));this.checkNativeError();x.mov(slot(state),'eax').test().branch('e',done)
   .mov('edx',at('eax',4)).mov(slot(tail),'edx').mov('eax',at('eax')).mov(slot(current),'eax');
  x.label(loop).mov('ebx',slot(current)).testOperand('ebx','ebx').branch('e',done).mov('edx',at('ebx',12)).mov(slot(next),'edx')
   .cmp(at('ebx'),0).branch('e',skip).mov('eax',at('ebx',8)).mov('edi',at('eax',event.index*4)).testOperand('edi','edi').branch('e',skip);
  for(let i=event.event.params.length-1;i>=0;i--){
   const p=event.event.params[i],v=context.locals.get('a'+i);
   if(p.byRef||p.bounds!=null){this.rawStorageAddress(v);x.push();}
   else if(key(p.type)==='variant'){this.rawStorageAddress(v);x.push();}
   else {this.rawStorageAddress(v);if(nativeParameterBytes(p)===8)x.pushOperand(at('eax',4));x.pushOperand(at('eax'));}
  }
  x.pushOperand(at('ebx',4)).callIndirect('edi');this.checkNativeError();
  x.label(skip).mov('eax',slot(current)).cmp('eax',slot(tail)).branch('e',done).mov('eax',slot(next)).mov(slot(current),'eax').jump(loop).label(done);
 },
 nativeFlowInstruction(ins,context,index){
  if(ins.op==='nativeEventSink'){this.emitNativeEventSink(context,context.nativeEventSink);return true;}
  if(ins.op==='nativeEventDispatch'){this.emitNativeEventDispatch(context,context.nativeEvent);return true;}
  if(ins.op==='raiseEvent'){
   const d=context.module.nativeClass,event=d?.module.module.events?.get(key(ins.expr.callee.name));
   if(!event)this.fail('Native RaiseEvent requires an Event declared in the current class: '+ins.expr.callee.name);
   const kernel=this.eventKernel(),entry=kernel.events.find(e=>e.descriptor===d&&e.event===event),target=this.privateNativeProcedure(kernel,entry.method);
   this.nativeTypedCall(target,this.nativeCallPlan(target,[this.nativeKernelValue(arg(context.instanceOffset)),...ins.expr.args]));return true;
  }
  return classes.nativeFlowInstruction.call(this,ins,context,index);
 }
};
