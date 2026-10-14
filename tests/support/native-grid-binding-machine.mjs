/** Full emitted binding/Automation/grid pipeline with explicitly foreign-only
 * COM, SAFEARRAY and HWND doubles. No generated binding or grid helper is hooked.
 * Windows acceptance is independent of this checked-IA32 ownership harness. */
import assert from 'node:assert/strict';
import {newProject,createControl} from '../../src/project/model.js';
import {collectionMachine} from './native-collection-machine.mjs';
import {automationMachine} from './native-automation-machine.mjs';
import {NATIVE_GRID_FIELDS as F} from '../../src/native/control-grid-contract.js';
export function gridBindingMachine(t,code,optimization=1,extra=''){
 const p=newProject('GridBinding');p.modules[0].form.controls=[createControl('MSFlexGrid','G')];
 p.modules[0].code=`Private rs As Object,n As Long,result As String
Sub Form_Load()
${code}
End Sub
Sub Drop()
 Set rs=Nothing
 Set G.DataSource=Nothing
End Sub
Private Sub FixtureGridReadback()
 G.TextMatrix(1,1)=G.TextMatrix(1,1)
End Sub
${extra}`;
 const base=collectionMachine(t,'',optimization,[],p),{vm}=base,m=vm.memory,arrays=new Map(),counts={},failures=new Map(),invalidations=[];
 const api=(dll,name,args)=>vm.hooks.get(m.read(vm.symbol('iat:'+dll+'!'+name))).callback(args);
 const hook=(name,argc,fn)=>vm.hook('oleaut32.dll',name,argc,args=>{
  counts[name]=(counts[name]||0)+1;
  if(failures.has(name)){const n=failures.get(name)-1;if(n===0){failures.delete(name);return name.startsWith('SafeArrayCreate')?0:0x8007000e;}failures.set(name,n);}
  return fn(...args);
 });
 function create(kind,bounds){
  assert.ok([3,8,12].includes(kind));const width=kind===12?16:4,count=bounds.reduce((n,b)=>n*b.count,1);
  const data=count?m.alloc(count*width,'binding-array-data'):0,handle=m.alloc(16+bounds.length*8,'binding-array');if(data)m.region(data).bytes.fill(0);m.region(handle).bytes.fill(0);
  const a={kind,bounds,data,count,handle,width};arrays.set(handle,a);m.write(handle,bounds.length,16);m.write(handle+2,kind===8?0x100:kind===12?0x800:0,16);m.write(handle+4,width);m.write(handle+12,data);
  bounds.toReversed().forEach((b,i)=>{m.write(handle+16+i*8,b.count);m.write(handle+20+i*8,b.lower);});return handle;
 }
 const array=h=>{const a=arrays.get(h);assert.ok(a,'live SAFEARRAY '+h);return a;};
 const pointer=(h,indices)=>{const a=array(h);let offset=0,stride=1;for(const b of a.bounds){const i=m.read(indices)|0;indices+=4;if(i<b.lower||i>=b.lower+b.count)return null;offset+=(i-b.lower)*stride;stride*=b.count;}return a.data+offset*a.width;};
 function destroy(h){
  if(!h)return 0;const a=array(h);assert.equal(m.read(h+8),0,'no escaped SAFEARRAY lock');
  if(a.kind===8)for(let i=0;i<a.count;i++){const p=m.read(a.data+i*4);if(p)m.free(p-4);}
  if(a.kind===12)for(let i=0;i<a.count;i++)api('oleaut32.dll','VariantClear',[a.data+i*16]);
  arrays.delete(h);if(a.data)m.free(a.data);m.free(h);return 0;
 }
 function copy(h){
  const a=array(h),out=create(a.kind,a.bounds),b=array(out);
  for(let i=0;i<a.count;i++){
   if(a.kind===12)api('oleaut32.dll','VariantCopyInd',[b.data+i*16,a.data+i*16]);
   else {const value=m.read(a.data+i*4);m.write(b.data+i*4,a.kind===8&&value?m.string(m.bstr(value)):value);}
  }return out;
 }
 const oldClear=vm.hooks.get(m.read(vm.symbol('iat:oleaut32.dll!VariantClear'))).callback;
 const oldCopy=vm.hooks.get(m.read(vm.symbol('iat:oleaut32.dll!VariantCopyInd'))).callback;
 hook('VariantClear',1,p=>{if(m.read(p,16)&0x2000){const h=m.read(p+8);for(let i=0;i<16;i+=4)m.write(p+i,0);return destroy(h);}return oldClear([p]);});
 hook('VariantCopyInd',2,(out,src)=>{if(m.read(src,16)&0x2000){const tag=m.read(src,16),h=copy(m.read(src+8));api('oleaut32.dll','VariantClear',[out]);m.write(out,tag,16);m.write(out+8,h);return 0;}return oldCopy([out,src]);});
 hook('SafeArrayCreateVector',3,(kind,lower,count)=>create(kind,[{lower:lower|0,count}]));
 hook('SafeArrayCreate',3,(kind,rank,bounds)=>create(kind,Array.from({length:rank},(_,i)=>({count:m.read(bounds+i*8),lower:m.read(bounds+i*8+4)|0}))));
 hook('SafeArrayDestroy',1,destroy);hook('SafeArrayCopy',2,(h,out)=>{m.write(out,copy(h));return 0;});
 hook('SafeArrayGetDim',1,h=>array(h).bounds.length);hook('SafeArrayGetElemsize',1,h=>array(h).width);
 hook('SafeArrayGetVartype',2,(h,out)=>{m.write(out,array(h).kind,16);return 0;});
 for(const [name,upper]of [['SafeArrayGetLBound',false],['SafeArrayGetUBound',true]])hook(name,3,(h,dim,out)=>{const b=array(h).bounds[dim-1];if(!b)return 0x8002000b;m.write(out,b.lower+(upper?b.count-1:0));return 0;});
 hook('SafeArrayLock',1,h=>{array(h);m.write(h+8,m.read(h+8)+1);return 0;});
 hook('SafeArrayUnlock',1,h=>{array(h);assert.ok(m.read(h+8));m.write(h+8,m.read(h+8)-1);return 0;});
 hook('SafeArrayAccessData',2,(h,out)=>{m.write(h+8,m.read(h+8)+1);m.write(out,array(h).data);return 0;});
 hook('SafeArrayUnaccessData',1,h=>{array(h);assert.ok(m.read(h+8));m.write(h+8,m.read(h+8)-1);return 0;});
 hook('SafeArrayPtrOfIndex',3,(h,indices,out)=>{const p=pointer(h,indices);if(p===null)return 0x8002000b;m.write(out,p);return 0;});
 hook('SafeArrayGetElement',3,(h,indices,out)=>{const p=pointer(h,indices);if(p===null)return 0x8002000b;const a=array(h);if(a.kind===12)return api('oleaut32.dll','VariantCopyInd',[out,p]);const value=m.read(p);m.write(out,a.kind===8&&value?m.string(m.bstr(value)):value);return 0;});
 hook('SafeArrayPutElement',3,(h,indices,value)=>{const p=pointer(h,indices);if(p===null)return 0x8002000b;const a=array(h);if(a.kind===12)return api('oleaut32.dll','VariantCopyInd',[p,value]);if(a.kind===8){const before=m.read(p),next=value?m.string(m.bstr(value)):0;m.write(p,next);if(before)m.free(before-4);}else m.write(p,m.read(value));return 0;});
 const h=automationMachine(t,'',optimization,{machine:base});
 vm.hook('oleaut32.dll','VarAnd',3,([a,b,out])=>{const av=h.read(a),bv=h.read(b);assert.equal(av.tag,11);assert.equal(bv.tag,11);return h.write(out,{tag:11,value:av.value&bv.value});});
 vm.hook('oleaut32.dll','VarNot',2,([a,out])=>{const av=h.read(a);assert.equal(av.tag,11);return h.write(out,{tag:11,value:~av.value});});
 vm.hook('oleaut32.dll','VarBstrFromI4',4,([value,lcid,flags,out])=>{assert.equal(lcid,0x400);assert.equal(flags,0);m.write(out,m.string(String(value|0)));return 0;});
 const state=vm.symbol('control-state:Form1:g');
 vm.hook('user32.dll','GetWindowLongW',2,([hwnd,index])=>{assert.equal(hwnd,101);assert.equal(index|0,-21);return state;});
 vm.hook('user32.dll','InvalidateRect',3,([hwnd])=>{invalidations.push(hwnd);return 1;});
 vm.hook('user32.dll','SendMessageW',4,()=>0);
 for(const [symbol,value]of [['hwnd:Form1',100],['hwnd:Form1:g',101],['initialized:Form1',1],['loaded:Form1',1]])m.write(vm.symbol(symbol),value);
 const invoke=(name,args)=>vm.invoke('proc:VB6NativeGrid:'+name,args);
 invoke('Initialize',[0,101,3,3]);const epoch=invoke('Stamp',[0]);m.write(state+76,0);m.write(state+80,epoch);m.write(state+140,100);
 for(const key of Object.keys(counts))counts[key]=0;
 const args=[0,101,epoch];
 return {...h,m,arrays,create,array,copy,destroy,counts,invalidations,state,epoch,args,
  fail:(name,n=1)=>failures.set(name,n),run:(name='Form_Load')=>vm.invoke('proc:Form1:'+name),
  number:name=>m.read(vm.symbol('global:Form1:'+name))|0,string:name=>m.bstr(m.read(vm.symbol('global:Form1:'+name))),
  get:name=>invoke('GetField',[...args,F[name]]),put:(r,c,value)=>{const p=m.string(value);try{return invoke('SetText',[...args,r,c,p]);}finally{m.free(p-4);}},
  text:(r,c)=>{const p=invoke('GetText',[...args,r,c]);const value=m.bstr(p);if(p)m.free(p-4);return value;},
  reenter:fn=>{const registers=vm.registers.slice(),flags={...vm.flags},ip=vm.ip;try{return fn();}finally{vm.registers.set(registers);vm.flags=flags;vm.ip=ip;}},
  gridCall:invoke,drop:()=>{vm.invoke('proc:Form1:Drop');invoke('Dispose',[0]);}
 };
}
/** Deliberately independent COM data model. Clone starts without sort/filter,
 * matching the actual ADO observation, and its traversal never advances source.
 */
export function defineRecordset(h,{progid='Fake.Recordset',columns=['ID','Name'],rows=[[2,'Zulu'],[1,'Alpha']],sort='Name ASC',filter=0,cursor=1,onCall=null}={}){
 const records=[],value=v=>v&&typeof v==='object'&&'tag'in v?v:{tag:v===null?1:typeof v==='string'?8:typeof v==='boolean'?11:3,value:v===true?-1:v===false?0:v};
 function make(label,isClone){
  const state={label,sort:isClone?'':sort,filter:isClone?0:filter,cursor:isClone?0:cursor,closed:false};records.push(state);
  const view=()=>{let result=rows.map(row=>row.map(value));if(typeof state.filter==='string'&&state.filter.startsWith('ID='))result=result.filter(r=>r[0].value===Number(state.filter.slice(3)));if(state.sort){const [field,direction]=state.sort.split(' '),index=columns.indexOf(field);assert.ok(index>=0);result.sort((a,b)=>{const x=a[index].value,y=b[index].value;return (x===y?0:x<y?-1:1)*(direction==='DESC'?-1:1);});}return result;};
  const fields=columns.map((name,index)=>h.define(label+'.field'+index,{name:1,value:2},{invoke:e=>e.name==='name'?value(name):view()[state.cursor][index]}));
  const collection=h.define(label+'.fields',{count:1,item:2},{invoke:e=>e.name==='count'?value(columns.length):{tag:9,value:fields[typeof e.values[0].value==='number'?e.values[0].value:columns.indexOf(e.values[0].value)]}});
  const pointer=h.define(label,{clone:1,sort:2,filter:3,fields:4,bof:5,eof:6,movefirst:7,getrows:8,close:9,recordcount:10,bookmark:11},{invoke:e=>{
   const injected=onCall?.(e,state,h);if(injected)return injected;
   if(e.name==='clone'){assert.deepEqual(e.values.map(v=>v.value),[1]);return {tag:9,value:make(progid+'.clone'+records.length,true)};}
   if(e.name==='sort'||e.name==='filter'){if(e.flags&12){state[e.name]=e.values[0].value;return value(0);}return value(state[e.name]);}
   if(e.name==='fields')return {tag:9,value:collection};
   if(e.name==='bof'||e.name==='eof')return value(view().length===0||(e.name==='eof'&&state.cursor>=view().length));
   if(e.name==='movefirst'){state.cursor=0;return value(0);}
   if(e.name==='recordcount')return value(view().length);if(e.name==='bookmark')return value(state.cursor);
   if(e.name==='close'){state.closed=true;return value(0);}
   assert.equal(e.name,'getrows');assert.ok(e.values[0].value>0);const data=view().slice(state.cursor,state.cursor+e.values[0].value);state.cursor+=data.length;
   const array=h.create(12,[{lower:0,count:columns.length},{lower:0,count:data.length}]),a=h.array(array);
   data.flat().forEach((v,i)=>h.write(a.data+i*16,v));return {tag:0x200c,value:array};
  }});state.pointer=pointer;return pointer;
 }
 const pointer=make(progid,false);return {pointer,records,rows,columns};
}
