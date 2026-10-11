/** Foreign Automation scalar doubles for whole authored Collection procedures.
 * These enforce counted BSTR ownership and conversion failures; they do not
 * replace any emitted Collection method or provide Windows execution evidence.
 */
import assert from 'node:assert/strict';
import {PE32Image} from '../../src/native/pe32.js';
import {compileWin32} from '../../src/native/compiler.js';
import {newProject} from '../../src/project/model.js';
import {NativeX86FloatingMachine,roundEven} from './native-x86-floating.mjs';
export function collectionMachine(t,code,optimization=1){
 let linked;const finish=PE32Image.prototype.finish;
 const mock=t.mock.method(PE32Image.prototype,'finish',function(...args){return linked=finish.apply(this,args);});
 const result=compileWin32({...newProject('CollectionChecks'),startup:'Sub Main',modules:[{id:'m',name:'M',kind:'module',code}]},{optimization});mock.mock.restore();
 const vm=new NativeX86FloatingMachine(linked),m=vm.memory,failures=new Map();
 vm.hooks.delete(vm.symbol('native:error:raise'));
 const read=p=>{const tag=m.read(p,16),ptr=m.read(p+8);assert.ok([0,1,2,3,4,5,7,8,10,11,17].includes(tag),'supported scalar test tag '+tag);return {tag,value:tag===8?m.bstr(ptr):[5,7].includes(tag)?vm.readFP(p+8):tag===4?vm.readFP(p+8,32):tag===17?ptr&255:tag===2||tag===11?(ptr<<16)>>16:ptr|0};};
 const clear=p=>{if(m.read(p,16)===8){const old=m.read(p+8);if(old)m.free(old-4);}for(let i=0;i<16;i+=4)m.write(p+i,0);return 0;};
 const write=(p,{tag,value})=>{clear(p);m.write(p,tag,16);if(tag===8)m.write(p+8,m.string(value));else if([5,7].includes(tag))vm.writeFP(p+8,value);else if(tag===4)vm.writeFP(p+8,value,32);else m.write(p+8,value);return 0;};
 vm.hook('oleaut32.dll','VariantClear',1,([p])=>clear(p));
 vm.hook('oleaut32.dll','VariantCopyInd',2,([out,source])=>{if(failures.get('copy')){failures.delete('copy');write(out,{tag:8,value:'partial copy'});return 0x8007000e;}return write(out,read(source));});
 vm.hook('oleaut32.dll','VariantChangeTypeEx',5,([out,source,locale,flags,tag])=>{
  assert.equal(locale,0x400);assert.equal(flags,2);const v=read(source);
  if(v.tag===1||v.tag===10)return 0x80020005;
  let value=v.value;if(tag===8)value=v.tag===0?'':v.tag===11?(value?'True':'False'):String(value);
  else if(tag===11)value=v.tag===0?0:Number(value)?-1:0;
  else if([2,3,17].includes(tag)){
   value=v.tag===0?0:typeof value==='string'?Number(value.trim()):value;
   if(!Number.isFinite(value))return 0x80020005;value=roundEven(value);
   const [min,max]=tag===2?[-32768,32767]:tag===17?[0,255]:[-2147483648,2147483647];if(value<min||value>max)return 0x8002000a;
  }else assert.fail('unimplemented test conversion '+tag);
  return write(out,{tag,value});
 });
 vm.hook('oleaut32.dll','VarCmp',4,([a,b,locale,flags])=>{assert.equal(locale,0x400);const av=read(a),bv=read(b);if(av.tag===1||bv.tag===1)return 3;let x=av.value,y=bv.value;if(flags&1){x=String(x).toLowerCase();y=String(y).toLowerCase();}return x===y?1:x<y?0:2;});
 vm.hook('oleaut32.dll','VarCat',3,([a,b,out])=>{const x=read(a),y=read(b);return write(out,{tag:8,value:String(x.value)+String(y.value)});});
 vm.hook('kernel32.dll','HeapAlloc',3,([heap,flags,size])=>{
  assert.equal(heap,1);assert.equal(flags,8);
  if(failures.get('allocate')===size){failures.delete('allocate');return 0;}
  if(size===32&&failures.get('nodeCopy')){failures.delete('nodeCopy');failures.set('copy',true);}
  const p=m.alloc(size,'native-owned-record');m.region(p).bytes.fill(0);return p;
 });
 vm.hook('kernel32.dll','GetLastError',0,()=>0x513);
 vm.hook('kernel32.dll','CompareStringW',6,([lcid,flags,a,an,b,bn])=>{assert.equal(lcid,0x400);assert.equal(flags,1);const get=(p,n)=>Array.from({length:n},(_,i)=>String.fromCharCode(m.read(p+2*i,16))).join('').toLowerCase();const x=get(a,an),y=get(b,bn);return x===y?2:x<y?1:3;});
 const owned=()=>m.regions.filter(r=>r.label==='BSTR'||r.label==='native-owned-record');
 const global=name=>vm.symbol('global:M:'+name);
 return {vm,result,read,clear,write,owned,failures,global,number:name=>m.read(global(name))|0,text:name=>m.bstr(m.read(global(name))),invoke:(name='Main')=>vm.invoke('proc:M:'+name)};
}
