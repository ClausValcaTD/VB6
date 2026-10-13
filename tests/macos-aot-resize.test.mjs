import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticAOTRuntime} from '../packages/macos-native/tests/aot-fixture.mjs';
import {resizeAOTImage} from '../packages/macos-native/src/aot-resize.js';
import {aotImageLayout,verifyAOTRuntime} from '../packages/macos-native/src/aot-image.js';
import {compileMacOSAOT} from '../packages/macos-native/src/aot-compiler.js';
import {linkMacOSAOT,verifyMacOSAOTArchive} from '../packages/macos-native/src/aot-export.js';
const runtime=await syntheticAOTRuntime({growable:true});
const original=aotImageLayout(runtime.bytes);
const project={schema:1,name:'Growable',startup:'Sub Main',modules:[{kind:'module',name:'MainModule',code:'Sub Main()\nDebug.Print "GROWABLE"\nEnd Sub'}]};
test('growth moves metadata and linkedit, never native runtime addresses or symbols',async()=>{
  const {bytes,layout}=resizeAOTImage(runtime.bytes,3*1024*1024,3*1024*1024);
  assert.equal(layout.code.size,3*1024*1024);assert.equal(layout.metadata.size,3*1024*1024+16384);
  assert.equal(layout.code.address,original.code.address);assert.deepEqual(layout.symbols,original.symbols);
  assert.deepEqual(bytes.subarray(16384,32768),runtime.bytes.subarray(16384,32768));
  const before=runtime.bytes.subarray(original.linkedit.offset),after=bytes.subarray(layout.linkedit.offset);
  assert.deepEqual(after,before);await verifyAOTRuntime(runtime.bytes,runtime.manifest);
  assert.equal(layout.metadata.address,layout.code.address+layout.code.size);
  assert.equal(layout.linkedit.address,layout.metadata.address+layout.metadata.size);
});
test('growable output consumes only aligned used project space',async()=>{
  const result=await linkMacOSAOT(compileMacOSAOT(project),runtime);
  assert.ok(result.executable.length<128*1024);
  assert.equal(result.report.codeCapacity,16384);assert.equal(result.report.metadataCapacity,16384);
  assert.ok((await verifyMacOSAOTArchive(result.bytes,result.options)).signature.byteHashesVerified);
});
test('code and metadata larger than old caps can be signed and independently verified',async()=>{
  const compiled=compileMacOSAOT(project);
  // Structural test: grow with ARM64 NOPs, preserving the compiled entry points.
  while(compiled.section.length<=2*1024*1024)compiled.section.u32(0xd503201f);
  compiled.metadata.literals.push({type:'string',variant:false,value:'x'.repeat(3*1024*1024)});
  const result=await linkMacOSAOT(compiled,runtime),layout=aotImageLayout(result.executable);
  assert.ok(layout.code.size>2097152);assert.ok(layout.metadata.size>2097152);
  assert.ok((await verifyMacOSAOTArchive(result.bytes,result.options)).signature.byteHashesVerified);
  await verifyAOTRuntime(runtime.bytes,runtime.manifest);
});
test('resize rejects unknown offset-bearing commands rather than corrupting native offsets',()=>{
  const bytes=runtime.bytes.slice(),view=new DataView(bytes.buffer),cmd=original.commands.find(c=>c.kind===0x1b);
  view.setUint32(cmd.offset,0x7777,true);
  assert.throws(()=>resizeAOTImage(bytes,4,1),/Unsupported.*command/);
});
test('resize refuses writable code, interleaved native sections and section relocations',()=>{
  for(const edit of [
    v=>v.setUint32(original.segments.find(s=>s.name==='__VB6CODE').command+60,7,true),
    v=>v.setBigUint64(original.metadata.command+32,BigInt(original.metadata.address+16384),true),
    v=>v.setUint32(original.code.command+60,1,true)
  ]){const bytes=runtime.bytes.slice();edit(new DataView(bytes.buffer));assert.throws(()=>resizeAOTImage(bytes,4,1));}
});
test('legacy SDK stays usable and copied defensively even with a Node Buffer',async()=>{
  const legacy=await syntheticAOTRuntime(),bytes=Buffer.from(legacy.bytes),result=resizeAOTImage(bytes,4,1);
  result.bytes[0]^=1;assert.equal(bytes[0],legacy.bytes[0]);
  assert.throws(()=>resizeAOTImage(bytes,2097156,1),/Legacy SDK capacity/);
});
test('manifest cannot disguise loader format',async()=>{
  await assert.rejects(()=>verifyAOTRuntime(runtime.bytes,{...runtime.manifest,layout:'reserved-v1'}),/loader layout/);
});
