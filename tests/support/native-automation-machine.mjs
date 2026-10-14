/** Native caller/control flow against explicit foreign COM/Automation doubles.
 * This exercises the emitted vtable ABI and lifetime; it is not real Windows,
 * ADO or an alternative executable runtime. Unknown hooks/opcodes fail closed.
 */
import assert from 'node:assert/strict';
import {collectionMachine} from './native-collection-machine.mjs';
import {roundEven} from './native-x86-floating.mjs';
export function automationMachine(t,code,optimization=1,options={}){
 const h=options.machine||collectionMachine(t,code,optimization,options.modules||[],options.project||null),{vm}=h,m=vm.memory;
 const objects=new Map(),classes=new Map(),trace=[],state={thread:101,initialized:0,created:0,pending:null,createFailure:null};
 const original=(dll,name)=>{const at=vm.labels.get('iat:'+dll+'!'+name);return at?vm.hooks.get(m.read(at))?.callback:null;};
 const oldClear=original('oleaut32.dll','VariantClear'),oldCopy=original('oleaut32.dll','VariantCopyInd');
 const retain=p=>{if(!p)return;const object=objects.get(p);assert.ok(object,'foreign interface identity');object.refs++;};
 const release=p=>{if(!p)return 0;const object=objects.get(p);assert.ok(object&&object.refs>0,'balanced foreign Release');return --object.refs;};
 const scalar=(tag,p)=>({tag,value:tag===8?m.bstr(m.read(p)):[4,5,7].includes(tag)?vm.readFP(p,tag===4?32:64):tag===2||tag===11?(m.read(p,16)<<16)>>16:tag===17?m.read(p,8):m.read(p)|0});
 const read=p=>{
  const tag=m.read(p,16),value=m.read(p+8);
  if(tag&0x4000){const type=tag&~0x4000,v=type===12?read(value):scalar(type,value);return {...v,byref:{pointer:value,type},rawTag:tag};}
  if(tag===9||tag===13)return {tag,value};
  if(tag&0x2000)return options.readArray?.(p)||{tag,value};
  return scalar(tag,p+8);
 };
 const clear=p=>{
  const tag=m.read(p,16),value=m.read(p+8);
  if(tag&0x4000){for(let i=0;i<16;i+=4)m.write(p+i,0);return 0;}
  if(tag===9||tag===13){for(let i=0;i<16;i+=4)m.write(p+i,0);release(value);return 0;}
  return oldClear([p]);
 };
 const write=(p,v)=>{
  if(v.tag===9||v.tag===13)retain(v.value);
  clear(p);m.write(p,v.tag,16);
  if(v.tag===8)m.write(p+8,m.string(v.value));else if([4,5,7].includes(v.tag))vm.writeFP(p+8,v.value,v.tag===4?32:64);else m.write(p+8,v.value||0);
  return 0;
 };
 const setReference=(p,value)=>{
  const ref=read(p).byref;assert.ok(ref,'argument is an actual ByRef view');
  if(ref.type===12)return write(ref.pointer,value);
  assert.equal(ref.type,value.tag,'test supplies exact output subtype');
  if(ref.type===8){const old=m.read(ref.pointer);m.write(ref.pointer,m.string(value.value));if(old)m.free(old-4);}
  else if([4,5,7].includes(ref.type))vm.writeFP(ref.pointer,value.value,ref.type===4?32:64);
  else m.write(ref.pointer,value.value,ref.type===17?8:[2,11].includes(ref.type)?16:32);
 };
 vm.hook('oleaut32.dll','VariantClear',1,([p])=>clear(p));
 vm.hook('oleaut32.dll','VariantCopyInd',2,([out,source])=>{
  if(m.read(source,16)&0x2000)return oldCopy([out,source]);
  return write(out,read(source));
 });
 vm.hook('oleaut32.dll','VarAdd',3,([a,b,out])=>{const av=read(a),bv=read(b);assert.ok([2,3].includes(av.tag)&&[2,3].includes(bv.tag));return write(out,{tag:3,value:av.value+bv.value});});
 vm.hook('oleaut32.dll','VariantChangeTypeEx',5,([out,source,lcid,flags,tag])=>{
  assert.equal(lcid,0x400);assert.equal(flags,2);const v=read(source);if(v.tag===1||v.tag===10||v.tag===9||v.tag===13)return 0x80020005;
  let value=v.value;
  if(tag===8)value=v.tag===0?'':v.tag===11?(value?'True':'False'):String(value);
  else if(tag===11)value=v.tag===0?0:Number(value)?-1:0;
  else if([2,3,17].includes(tag)){value=v.tag===0?0:Number(value);if(!Number.isFinite(value))return 0x80020005;value=roundEven(value);const [lo,hi]=tag===2?[-32768,32767]:tag===17?[0,255]:[-2147483648,2147483647];if(value<lo||value>hi)return 0x8002000a;}
  else if([4,5,7].includes(tag)){value=Number(value);if(!Number.isFinite(value))return 0x80020005;}
  else assert.fail('unimplemented foreign conversion '+tag);
  return write(out,{tag,value});
 });
 function define(progid,members,{invoke,identity=null}={}){
  const table=m.alloc(32,'foreign vtable'),pointer=m.alloc(4,'foreign object'),object={pointer,refs:0,progid,identity};m.write(pointer,table);objects.set(pointer,object);
  const ids=new Map(Object.entries(members).map(([name,value])=>[name.toLowerCase(),value])),reverse=new Map([...ids].map(([n,id])=>[id,n]));
  const method=(offset,n,fn)=>m.write(table+offset,vm.function(n,fn,progid+':'+offset));
  method(0,3,([self,iid,out])=>{assert.equal(self,pointer);assert.ok(object.refs>0);const id=m.read(iid);if(id!==0&&id!==0x20400){m.write(out,0);return 0x80004002;}const result=id===0?identity||pointer:pointer;retain(result);m.write(out,result);return 0;});
  method(4,1,([self])=>{assert.equal(self,pointer);retain(self);return object.refs;});
  method(8,1,([self])=>{assert.equal(self,pointer);return release(self);});
  method(20,6,([self,iid,names,count,lcid,out])=>{
   assert.equal(self,pointer);assert.ok(object.refs>0);assert.equal(m.read(iid),0);assert.equal(lcid,0x400);assert.ok(count>=1&&count<=65);
   const list=Array.from({length:count},(_,i)=>m.utf16(m.read(names+4*i)).toLowerCase());trace.push({op:'names',object:progid,names:list});
   for(const [i,name]of list.entries()){const id=ids.get(name);m.write(out+4*i,id??-1);if(id===undefined)return 0x80020006;}
   return 0;
  });
  method(24,9,([self,id,iid,lcid,flags,dp,out,ex,argerr])=>{
   assert.equal(self,pointer);assert.ok(object.refs>0);assert.equal(lcid,0x400);for(let i=0;i<16;i++)assert.equal(m.read(iid+i,8),0);
   const ptr=m.read(dp),count=m.read(dp+8),named=m.read(dp+12),namedPtr=m.read(dp+4),views=Array.from({length:count},(_,i)=>ptr+16*i),values=views.map(read),names=Array.from({length:named},(_,i)=>m.read(namedPtr+4*i)|0);
   assert.ok(named<=count);if(flags&12)assert.equal(names[0],-3,'PROPERTYPUT named value');
   const event={op:'invoke',object:progid,name:reverse.get(id)||'(default)',id,flags,values,names};trace.push(event);
   const result=invoke?.({...event,views,out,ex,argerr,write,read,setReference,objects,state})||{tag:0,value:0};
   if(result.hr){
    if(result.partial)write(out,result.partial);
    const fill=()=>{if(result.code)m.write(ex,result.code,16);if(result.scode)m.write(ex+28,result.scode);for(const [o,n]of [[4,'source'],[8,'description'],[12,'helpfile']])if(result[n])m.write(ex+o,m.string(result[n]));m.write(ex+16,result.context||0);return 0;};
    if(result.deferred)m.write(ex+24,vm.function(1,([p])=>{assert.equal(p,ex);return fill();},'deferred EXCEPINFO'));else fill();
    if(result.errorInfo)state.pending=makeErrorInfo(result.errorInfo);
    return result.hr;
   }
   if(result.byrefResult){m.write(out,0x400c,16);m.write(out+8,result.byrefResult);return 0;}
   write(out,result);return 0;
  });
  classes.set(progid.toLowerCase(),object);return pointer;
 }
 function makeErrorInfo(info){
  const p=define('error-info-'+objects.size,{}),object=objects.get(p);retain(p);const table=m.read(p);
  for(const [offset,key]of [[16,'source'],[20,'description'],[24,'helpfile'],[28,'context']])m.write(table+offset,vm.function(2,([self,out])=>{assert.equal(self,p);m.write(out,key==='context'?info[key]||0:m.string(info[key]||''));return 0;},'IErrorInfo:'+key));
  return p;
 }
 vm.hook('kernel32.dll','GetCurrentThreadId',0,()=>state.thread);
 vm.hook('ole32.dll','CoInitializeEx',2,([reserved,mode])=>{assert.equal(reserved,0);assert.equal(mode,2);state.initialized++;return 0;});
 vm.hook('ole32.dll','CoUninitialize',0,()=>{assert.equal(state.initialized,1);state.initialized--;});
 vm.hook('oleaut32.dll','SetErrorInfo',2,([reserved,p])=>{assert.equal(reserved,0);assert.equal(p,0);if(state.pending)release(state.pending);state.pending=null;return 0;});
 vm.hook('oleaut32.dll','GetErrorInfo',2,([reserved,out])=>{assert.equal(reserved,0);m.write(out,state.pending||0);const hr=state.pending?0:1;state.pending=null;return hr;});
 let requested=null;
 vm.hook('ole32.dll','CLSIDFromProgID',2,([name,out])=>{requested=m.utf16(name).toLowerCase();if(!classes.has(requested))return 0x800401f3;m.write(out,classes.get(requested).pointer);return 0;});
 vm.hook('ole32.dll','CoCreateInstance',5,([clsid,outer,context,iid,out])=>{assert.equal(outer,0);assert.equal(context,5);assert.equal(m.read(iid),0x20400);state.created++;if(state.createFailure)return state.createFailure;const p=m.read(clsid);retain(p);m.write(out,p);return 0;});
 vm.hook('user32.dll','MessageBoxW',4,([_,text])=>{throw new Error('Unhandled native Automation error: '+m.utf16(text));});
 return {...h,objects,state,trace,define,read,write,clear,setReference,retain,release,refs:()=>[...objects.values()].reduce((n,o)=>n+o.refs,0)};
}
