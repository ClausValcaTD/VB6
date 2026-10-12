import test from 'node:test';
import assert from 'node:assert/strict';
import {ARM64,linkARM64} from '../src/native/arm64.js';
import {BinarySection as Shared} from '../src/native/binary-section.js';
import {BinarySection as Win32} from '../src/native/pe32.js';
const words=a=>{const b=Uint8Array.from(a.s.bytes),v=new DataView(b.buffer);return Array.from({length:b.length/4},(_,i)=>v.getUint32(i*4,true));};
test('Win32 and ARM64 share the same byte-section type',()=>{assert.equal(Win32,Shared);assert.ok(new ARM64().s instanceof Win32);});
test('ARM64 ABI instruction encodings',()=>{
 const a=new ARM64();a.enter(16).ldr(0,31,8).str(0,31,8).movImm(1,0x12345678).cmp(0,7).cmn(0,1).leave(16);
 assert.deepEqual(words(a),[0xa9bf7bfd,0x910003fd,0xa9bf53f3,0xaa0003f3,0xd10043ff,0xf90003ff,0xf94007e0,0xf90007e0,0xd28acf01,0xf2a24681,0xf1001c1f,0xb100041f,0x910043ff,0xa8c153f3,0xa8c17bfd,0xd65f03c0]);
});
test('ARM64 branch fixups preserve inputs and resolve backward/forward calls',()=>{
 const a=new ARM64();a.label('start').b('end').bl('start').branch('ne','start').label('end').ret();
 const prior=words(a),out=linkARM64(a.s,0x100000000n);
 assert.deepEqual([...new Uint32Array(out.buffer)],[0x14000003,0x97ffffff,0x54ffffc1,0xd65f03c0]);assert.deepEqual(words(a),prior);
});
test('ARM64 ADRP accounts for image address, page crossing, and addends',()=>{
 const a=new ARM64();a.address(3,'symbol',16);const b=linkARM64(a.s,0x100000ffcn,new Map([['symbol',0x100003ab0n]]));
 assert.deepEqual([...new Uint32Array(b.buffer)],[0xf0000003,0x912b0063]);
});
for(const [name,fn] of [
 ['register',a=>a.mov(32,0)],['unsafe immediate',a=>a.movImm(0,Number.MAX_SAFE_INTEGER+1)],['wide immediate',a=>a.movImm(0,1n<<64n)],
 ['stack alignment',a=>a.enter(17)],['memory alignment',a=>a.ldr(0,31,3)],['large memory',a=>a.str(0,31,32768)],
 ['condition',a=>a.branch('wat','x')],['SP immediate',a=>a.movImm(31,1)],['load pair',a=>a.ldpPost(0,0,31)]])
 test('ARM64 rejects '+name+' before emission',()=>{const a=new ARM64();assert.throws(()=>fn(a));assert.equal(a.s.length,0);});
for(const [name,emit,target]of [
 ['missing',a=>a.bl('x'),null],['unaligned',a=>a.bl('x'),0x100000002n],['far branch',a=>a.bl('x'),0x108000000n],
 ['far conditional',a=>a.branch('eq','x'),0x100100000n],['far page',a=>a.address(0,'x'),0x200000000n]])
 test('ARM64 rejects '+name+' relocation without patching input',()=>{const a=new ARM64();emit(a);const before=words(a);assert.throws(()=>linkARM64(a.s,0x100000000n,target===null?new Map():new Map([['x',target]])));assert.deepEqual(words(a),before);});
test('ARM64 rejects overlapping relocation records',()=>{const a=new ARM64();a.bl('x');a.s.fixups.push({...a.s.fixups[0]});assert.throws(()=>linkARM64(a.s,4096,new Map([['x',4096]])),/Overlapping/);});
test('ARM64 handles full-width unsigned and negative constants',()=>{const a=new ARM64();a.movImm(0,-1n);assert.equal(words(a).length,4);assert.equal(words(a)[0],0xd29fffe0);});
