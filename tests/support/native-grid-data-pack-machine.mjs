/** Checked emitted packer with explicit Automation array/string doubles. Array
 * layout and logical element order are authored independently of its emitter.
 * This is not a Windows result; the ADO fixture independently exercises OleAut32.
 */
import assert from 'node:assert/strict';
import {PE32Image} from '../../src/native/pe32.js';
import {X86} from '../../src/native/x86.js';
import {emitNativeGridDataPack} from '../../src/native/grid-data-pack.js';
import {NativeX86FloatingMachine} from './native-x86-floating.mjs';
export function gridDataPackMachine(optimization=1){
 const image=new PE32Image(),x=new X86(image.section('.text',0x60000020),image);
 emitNativeGridDataPack({x,maxArrayBytes:16*1024*1024},{label:'pack'});x.label('entry').api('kernel32.dll','ExitProcess',[0]);
 const linked=image.finish('entry',{optimization}),vm=new NativeX86FloatingMachine(linked),m=vm.memory,arrays=new Map(),failures=new Map();
 const alloc=(n,label)=>{const p=m.alloc(n,label);m.region(p).bytes.fill(0);return p;};
 const clear=p=>{const type=m.read(p,16);assert.ok([0,1,2,3,5,8,10,11].includes(type),'scalar conversion double');if(type===8&&m.read(p+8))m.free(m.read(p+8)-4);for(let i=0;i<16;i+=4)m.write(p+i,0);return 0;};
 const write=(p,{type=8,value=''})=>{clear(p);m.write(p,type,16);if(type===8)m.write(p+8,m.string(value));else if(type===5)vm.writeFP(p+8,value);else m.write(p+8,value);};
 const create=(type,bounds,values=[])=>{assert.ok([8,12].includes(type));const count=bounds.reduce((n,b)=>n*b.count,1),size=type===12?16:4;
  const data=alloc(Math.max(4,count*size),'array-data'),handle=alloc(16+bounds.length*8,'SAFEARRAY');
  m.write(handle,bounds.length,16);m.write(handle+4,size);m.write(handle+12,data);
  bounds.toReversed().forEach((b,i)=>{m.write(handle+16+8*i,b.count);m.write(handle+20+8*i,b.lower);});
  const a={handle,type,bounds,count,size,data};arrays.set(handle,a);
  values.forEach((value,i)=>{assert.ok(i<count);if(type===8)m.write(data+4*i,m.string(value));else write(data+16*i,value);});return handle;
 };
 const hook=(name,n,fn)=>vm.hook('oleaut32.dll',name,n,args=>{if(failures.has(name)){const remaining=failures.get(name)-1;if(remaining===0){failures.delete(name);return name==='SafeArrayCreateVector'||name==='SysAllocStringLen'?0:0x8007000e;}failures.set(name,remaining);}return fn(...args);});
 const destroy=h=>{if(!h)return 0;const a=arrays.get(h);assert.ok(a,'live array');assert.equal(m.read(h+8),0,'no leaked array locks');for(let i=0;i<a.count;i++){if(a.type===12)clear(a.data+i*16);else{const p=m.read(a.data+i*4);if(p)m.free(p-4);}}arrays.delete(h);m.free(a.data);m.free(h);return 0;};
 hook('SafeArrayGetDim',1,h=>arrays.get(h).bounds.length);
 hook('SafeArrayGetElemsize',1,h=>arrays.get(h).size);
 hook('SafeArrayGetVartype',2,(h,p)=>{m.write(p,arrays.get(h).type,16);return 0;});
 for(const [name,upper]of [['SafeArrayGetLBound',false],['SafeArrayGetUBound',true]])hook(name,3,(h,dim,p)=>{const b=arrays.get(h).bounds[dim-1];if(!b)return 0x8002000b;m.write(p,b.lower+(upper?b.count-1:0));return 0;});
 hook('SafeArrayCreateVector',3,(type,lower,count)=>create(type,[{lower:lower|0,count}]));
 hook('SafeArrayAccessData',2,(h,p)=>{m.write(h+8,m.read(h+8)+1);m.write(p,arrays.get(h).data);return 0;});
 hook('SafeArrayUnaccessData',1,h=>{assert.ok(m.read(h+8)>0,'balanced AccessData');m.write(h+8,m.read(h+8)-1);return 0;});
 hook('SafeArrayDestroy',1,destroy);
 hook('SysAllocStringLen',2,(p,n)=>m.string(p?Array.from({length:n},(_,i)=>String.fromCharCode(m.read(p+2*i,16))).join(''):'\0'.repeat(n)));
 hook('VariantClear',1,clear);
 hook('VariantChangeTypeEx',5,(out,p,lcid,flags,type)=>{assert.equal(lcid,0x400);assert.equal(flags,2);assert.equal(type,8);const tag=m.read(p,16),raw=m.read(p+8);
  if(tag===10||![0,2,3,5,8,11].includes(tag))return 0x80020005;
  const value=tag===0?'':tag===8?m.bstr(raw):tag===11?(raw?'True':'False'):tag===5?String(vm.readFP(p+8)):String(tag===2?(raw<<16)>>16:raw|0);
  write(out,{value});return 0;
 });
 const headerSlot=alloc(4,'header-slot'),bodySlot=alloc(16,'body-slot'),out=alloc(4,'output-slot');
 return {vm,m,arrays,failures,create,destroy,headerSlot,bodySlot,out,bytes:linked.bytes.length,
  pack(headers,body,cols,records){m.write(headerSlot,headers);m.write(bodySlot,body?0x200c:0);m.write(bodySlot+8,body);return vm.invoke('pack',[out,headerSlot,bodySlot,cols,records]);},
  result(){const a=arrays.get(m.read(out));return a&&Array.from({length:a.count},(_,i)=>m.bstr(m.read(a.data+i*4)));},
  owners:()=>m.regions.length,
  release(){if(m.read(out)){destroy(m.read(out));m.write(out,0);}}
 };
}
