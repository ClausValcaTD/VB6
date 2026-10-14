import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTROL_INDEX_KERNEL,CONTROL_INDEX_BYTES} from '../src/native/control-index-kernel.js';
import {compileWin32} from '../src/native/compiler.js';
import {PE32Image} from '../src/native/pe32.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
import {newProject} from '../src/project/model.js';
// Only pointer/OS calls are doubled. Every table operation executes emitted x86.
function machine(t,optimization){
 const code=String.raw`Option Explicit
Private Declare Function GetProcessHeap Lib "kernel32" () As Long
Private Declare Function HeapAlloc Lib "kernel32" (ByVal heap As Long,ByVal flags As Long,ByVal bytes As Long) As Long
Private Declare Function HeapFree Lib "kernel32" (ByVal heap As Long,ByVal flags As Long,ByVal value As Long) As Long
Private Declare Function Word Lib "table-test" (ByVal address As Long,ByVal offset As Long) As Long
Private Declare Sub PutWord Lib "table-test" (ByVal address As Long,ByVal offset As Long,ByVal value As Long)
Private Function Allocate(ByVal bytes As Long) As Long
 Allocate=HeapAlloc(GetProcessHeap(),8,bytes)
 If Allocate=0 Then Error 7
End Function
Private Sub Free(ByVal value As Long)
 Dim n As Long
 If value<>0 Then n=HeapFree(GetProcessHeap(),0,value)
End Sub
Private Sub Main()
End Sub
Private Sub TryInsert(ByVal directory As Long,ByVal index As Long,ByVal value As Long)
 On Error Resume Next
 IndexInsert directory,index,value
 failure=Err.Number
 Err.Clear
End Sub
Private failure As Long
`+CONTROL_INDEX_KERNEL;
 let linked;const finish=PE32Image.prototype.finish;
 const mock=t.mock.method(PE32Image.prototype,'finish',function(...args){return linked=finish.apply(this,args);});
 try{compileWin32({...newProject('Index'),startup:'Sub Main',modules:[{name:'M',id:'m',kind:'module',code}]},{optimization});}finally{mock.mock.restore();}
 const vm=new NativeX86Machine(linked),memory=vm.memory;vm.hooks.delete(vm.symbol('native:error:raise'));
 vm.hook('kernel32.dll','GetLastError',0,()=>0);
 let reads=0,allocations=0,fail=false;
 vm.hook('table-test.dll','Word',2,([p,i])=>{reads++;return memory.read(p+i);});
 vm.hook('table-test.dll','PutWord',3,([p,i,v])=>memory.write(p+i,v));
 vm.hook('kernel32.dll','HeapAlloc',3,([heap,flags,bytes])=>{assert.equal(heap,1);assert.equal(flags,8);allocations++;if(fail){fail=false;return 0;}const p=memory.alloc(bytes,'native-owned-record');memory.region(p).bytes.fill(0);return p;});
 const directory=memory.alloc(CONTROL_INDEX_BYTES,'directory');memory.region(directory).bytes.fill(0);
 const call=(name,...args)=>vm.invoke('proc:M:'+name,[directory,...args]);
 return {vm,memory,directory,call,reads:()=>reads,allocations:()=>allocations,fail:()=>fail=true,error:()=>memory.read(vm.symbol('global:M:failure'))};
}
for(const level of [0,1,2]){
 test('compiled sparse control index bounds, lookup cost and reclamation O'+level,t=>{
  const h=machine(t,level),{memory,directory,call}=h,expected=new Map();
  for(const n of [32767,256,255,0,8192,16384,8193]){expected.set(n,n+1);call('IndexInsert',n,n+1);}
  assert.equal(memory.read(directory+512),expected.size);assert.equal(memory.read(directory+516),0);assert.equal(memory.read(directory+520),32767);
  const allocations=h.allocations();
  for(let i=0;i<20;i++)for(const n of [0,17,255,256,8192,16384,32767]){const before=h.reads();assert.equal(call('IndexFind',n),expected.get(n)||0);assert.equal(h.reads()-before,2,'two data reads regardless of index/population');}
  assert.equal(h.allocations(),allocations,'lookup never allocates');
  for(const n of [32767,0,255,8192,8193,16384,256]){
   assert.equal(call('IndexRemove',n),n+1);expected.delete(n);
   assert.equal(memory.read(directory+512),expected.size);
   assert.equal(memory.read(directory+516)|0,expected.size?Math.min(...expected.keys()):-1);
   assert.equal(memory.read(directory+520)|0,expected.size?Math.max(...expected.keys()):-1);
  }
  assert.equal(memory.regions.filter(r=>r.label==='native-owned-record').length,0);
  call('IndexInsert',32767,77);call('IndexClear');assert.equal(memory.read(directory+512),0);assert.equal(memory.regions.filter(r=>r.label==='native-owned-record').length,0);
 });
 test('index insertion failures preserve every published entry and count O'+level,t=>{
  const h=machine(t,level),{call,memory,directory}=h;call('IndexInsert',5,111);const snapshot=()=>[memory.read(directory+512),memory.read(directory+516),memory.read(directory+520),call('IndexFind',5)];
  for(const [index,value,code]of [[5,222,360],[-1,1,340],[32768,1,340],[9,0,5]]){call('TryInsert',index,value);assert.equal(h.error(),code);assert.deepEqual(snapshot(),[1,5,5,111]);}
  h.fail();call('TryInsert',500,9);assert.equal(h.error(),7);assert.deepEqual(snapshot(),[1,5,5,111]);assert.equal(memory.read(directory+4),0);
  call('TryInsert',500,9);assert.equal(h.error(),0);assert.equal(call('IndexFind',500),9);call('IndexClear');
 });
}
