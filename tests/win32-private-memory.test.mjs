import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPrivateMemoryIntrinsics,inlinePrivateMemoryCall,PRIVATE_MEMORY_INTRINSICS} from '../src/native/private-memory.js';
import {privateNeedsCheckpoints,zeroPrivateFrame} from '../src/native/private-frames.js';
import {PE32Image} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
const word={kind:'function',returnType:'Long',params:[{type:'Long'},{type:'Long'}]},put={kind:'sub',params:[...word.params,{type:'Long'}]};
function kernel(){const k={deferredNativeKernel:true,hosts:{word(){},putword(){}},procedures:new Map([['word',{proc:structuredClone(word)}],['putword',{proc:structuredClone(put)}]])};for(const p of k.procedures.values())p.module=k;return k;}
test('only explicitly declared compiler-owned exact pointer hosts receive lowering metadata',()=>{
 const k=kernel();bindPrivateMemoryIntrinsics(k);assert.equal(k.procedures.get('word').nativeMemoryIntrinsic,undefined);
 bindPrivateMemoryIntrinsics(k,PRIVATE_MEMORY_INTRINSICS);assert.equal(k.procedures.get('word').nativeMemoryIntrinsic,'load32');assert.equal(k.procedures.get('putword').nativeMemoryIntrinsic,'store32');
 for(const field of ['byRef','optional','paramArray','bounds']){const bad=kernel();bad.procedures.get('word').proc.params[0][field]=field==='bounds'?[]:true;assert.throws(()=>bindPrivateMemoryIntrinsics(bad,PRIVATE_MEMORY_INTRINSICS));}
 const bad=kernel();bad.hosts={};assert.throws(()=>bindPrivateMemoryIntrinsics(bad,PRIVATE_MEMORY_INTRINSICS));
});
for(const constant of [true,false])test(`inlined read/write execute each operand once in source order (${constant?'constant':'computed'} displacement)`,()=>{
 const image=new PE32Image(),text=image.section('.text',0x60000020),data=image.section('.data',0xc0000040),x=new X86(text,image),k=kernel(),order=[];
 bindPrivateMemoryIntrinsics(k,PRIVATE_MEMORY_INTRINSICS);data.label('words').zero(16);
 const c={x,numeric(n){order.push(n.name||'offset');n.value!==undefined?x.value(n.value):x.value('words');}};
 const plan=(...nodes)=>({order:nodes.map((node,index)=>({index,node}))});
 const offset=constant?{kind:'literal',value:4}:{kind:'computed',name:'offset',value:4};
 x.label('entry').enter();
 assert.equal(inlinePrivateMemoryCall(c,k.procedures.get('putword'),plan({name:'address'},offset,{name:'value',value:-123})),true);
 assert.equal(inlinePrivateMemoryCall(c,k.procedures.get('word'),plan({name:'address'},offset)),true);
 x.leave();x.api('kernel32.dll','ExitProcess',[0]);
 assert.deepEqual(order,constant?['address','value','address']:['address','offset','value','address','offset']);
 const vm=new NativeX86Machine(image.finish('entry'));assert.equal(vm.invoke('entry')|0,-123);assert.equal(vm.memory.read(vm.symbol('words')+4)|0,-123);
 assert.equal(vm.memory.read(vm.symbol('words')),0);assert.equal(vm.memory.read(vm.symbol('words')+8),0);
});
test('unsupported named or call-site ByVal plans stay on the ordinary typed-call ABI',()=>{
 const k=kernel();bindPrivateMemoryIntrinsics(k,PRIVATE_MEMORY_INTRINSICS);
 for(const order of [[{index:1,node:{}},{index:0,node:{}}],[{index:0,node:{kind:'byval'}},{index:1,node:{}}]])assert.equal(inlinePrivateMemoryCall({numeric(){assert.fail('must not evaluate')}},k.procedures.get('word'),{order}),false);
});
test('private checkpoint elision excludes Resume Next, line numbers and extension instructions',()=>{
 const context=ops=>({module:{deferredNativeKernel:true},proc:{code:ops}});
 for(const ins of [{op:'resume'},{op:'onError',mode:'next'},{op:'lineNumber'},{op:'nativeEventDispatch'},{op:'unknown'}])assert.equal(privateNeedsCheckpoints(context([ins])),true);
 assert.equal(privateNeedsCheckpoints(context([{op:'onError',mode:'goto'},{op:'expr'},{op:'raiseError'}])),false);
 assert.equal(privateNeedsCheckpoints({module:{},proc:{code:[]}}),true);
});
test('one private-frame clear preserves arguments and callee saves while zeroing all owned slots',()=>{
 const image=new PE32Image(),text=image.section('.text',0x60000020),x=new X86(text,image);
 x.label('entry').enter(8200);assert.equal(zeroPrivateFrame({x},{module:{deferredNativeKernel:true},size:8200}),true);
 x.value({argument:8}).leave(4);x.api('kernel32.dll','ExitProcess',[0]);
 const vm=new NativeX86Machine(image.finish('entry'));assert.equal(vm.invoke('entry',[0x12345678]),0x12345678);
 assert.equal(zeroPrivateFrame({x},{module:{},size:4}),false);
 assert.throws(()=>zeroPrivateFrame({x},{module:{deferredNativeKernel:true},size:3}));
});
