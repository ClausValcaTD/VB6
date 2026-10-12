/** IUnknown ABI tests execute emitted instructions. Integration/Windows tests
 * separately exercise the actual Form finalizer and OleAut32 Variant ownership.
 */
import test from 'node:test';import assert from 'node:assert/strict';
import {PE32Image} from '../src/native/pe32.js';import {X86} from '../src/native/x86.js';import {mem32} from '../src/native/x86-operands.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
import {FORM_INTERFACE as I} from '../src/native/form-instance-layout.js';
import {declareFormInterface,emitFormInterface} from '../src/native/form-instance-abi.js';
function machine(){
 const image=new PE32Image(),text=image.section('.text',0x60000020),ro=image.section('.rdata',0x40000040),data=image.section('.data',0xc0000040),x=new X86(text,image);
 const c={x,ro,classProcedure:()=> 'release-owner'};assert.equal(declareFormInterface(c),I);assert.equal(declareFormInterface(c),I);
 data.align(4).label('owner').u32(2).zero(12).reference(I);data.label('iid').u32(0).u32(0).u32(0xc0).u32(0x46000000).label('result').u32(0x12345678);
 x.label('release-owner').enter().value({argument:8}).dec(mem32({base:'eax'})).value(0).leave(4);
 emitFormInterface(c);x.label('entry').api('kernel32.dll','ExitProcess',[0]);
 return new NativeX86Machine(image.finish('entry'));
}
test('embedded IUnknown QueryInterface retains a stable identity and clears failed outputs',()=>{
 const vm=machine(),m=vm.memory,owner=vm.symbol('owner'),pointer=owner+16,out=vm.symbol('result'),iid=vm.symbol('iid');
 assert.equal(vm.invoke(I+':query',[pointer,iid,out]),0);assert.equal(m.read(out),pointer);assert.equal(m.read(owner),3);
 assert.equal(vm.invoke(I+':addref',[pointer]),4);assert.equal(vm.invoke(I+':release',[pointer]),3);assert.equal(m.read(owner),3);
 m.write(iid,1);assert.equal(vm.invoke(I+':query',[pointer,iid,out]),0x80004002);assert.equal(m.read(out),0);assert.equal(m.read(owner),3);
 m.write(out,0x1234);assert.equal(vm.invoke(I+':query',[pointer,0,out]),0x80004003);assert.equal(m.read(out),0);
 assert.equal(vm.invoke(I+':query',[pointer,iid,0]),0x80004003);assert.equal(m.read(owner),3);
});
test('foreign AddRef/Release never wrap or transfer a VB error at a saturated count',()=>{
 const vm=machine(),m=vm.memory,owner=vm.symbol('owner');m.write(owner,0x7fffffff);
 assert.equal(vm.invoke(I+':addref',[owner+16]),0x7fffffff);assert.equal(vm.invoke(I+':release',[owner+16]),0x7fffffff);assert.equal(m.read(owner),0x7fffffff);
});
test('nullable interface cleanup ignores Nothing and forwards an owned canonical interface once',()=>{
 const vm=machine(),m=vm.memory,owner=vm.symbol('owner');
 assert.equal(vm.invoke(I+':release-nullable',[0]),0);assert.equal(m.read(owner),2);
 assert.equal(vm.invoke(I+':release-nullable',[owner+16]),1);assert.equal(m.read(owner),1);
});
