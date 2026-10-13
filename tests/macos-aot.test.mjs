import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileMacOSAOT} from '../packages/macos-native/src/aot-compiler.js';
import {linkMacOSAOT,exportMacOSAOT,verifyMacOSAOTArchive,writeMacOSAppZip} from '../packages/macos-native/src/aot-export.js';
import {aotImageLayout,verifyAOTRuntime,createAOTRuntimeManifest} from '../packages/macos-native/src/aot-image.js';
import {AOT_ABI,AOT_HELPERS} from '../packages/macos-native/src/aot-abi.js';
import {syntheticAOTRuntime} from '../packages/macos-native/tests/aot-fixture.mjs';
import {conformanceProject} from '../packages/macos-native/tests/conformance.mjs';
const project={schema:1,name:'DirectTest',startup:'Sub Main',modules:[{name:'MainModule',kind:'module',code:'Public Sub Main()\nDebug.Assert 3 + 4 = 7\nDebug.Print "DIRECT_OK"\nEnd Sub'}]};
const runtime=await syntheticAOTRuntime(),compiled=compileMacOSAOT(project),exported=await linkMacOSAOT(compiled,runtime);
const entry=exported.options.name+'.app/Contents/MacOS/'+exported.options.name;
test('AOT helper declarations agree exactly with the compiler ABI',async()=>{
 const cpp=await readFile(new URL('../packages/macos-native/aot/helpers.cpp',import.meta.url),'utf8');
 const matches=[...cpp.matchAll(/^AOT\((\w+),/gm)].map(m=>m[1]);assert.deepEqual(matches,AOT_HELPERS.filter(n=>n!=='exception'));assert.match(cpp,/extern "C" Word vb6_aot_exception/);
});
test('AOT emits actual aligned ARM64 procedures, not IR in project metadata',()=>{
 const result=compileMacOSAOT(conformanceProject());assert.ok(result.section.length>4096);assert.ok(result.metadata.entries.length>10);
 assert.ok(result.metadata.entries.every(n=>Number.isInteger(n)&&n%16===0));assert.equal(result.report.compiled,false);
 assert.ok(result.section.fixups.every(f=>f.kind.startsWith('arm64-')));assert.ok(!JSON.stringify(result.metadata).includes('"op":'));
 for(const optimization of [0,1,2,3])assert.equal(compileMacOSAOT(project,{optimization}).report.optimization.level,optimization);
});
test('direct ZIP preserves executable permission, seals content and reports no notarization',async()=>{
 const result=await verifyMacOSAOTArchive(exported.bytes,exported.options);assert.equal(result.compiled,true);assert.equal(result.browserSignatureCryptographicallyVerified,true);
 assert.equal(result.signature.byteHashesVerified,true);assert.equal(result.signature.macOSTrustEvaluated,false);assert.equal(result.notarized,false);
 assert.ok(result.signature.codePages>1000);assert.equal(result.image.architecture,'arm64');
});
test('link and app ZIP are byte deterministic and never mutate runtime',async()=>{
 const next=await exportMacOSAOT(project,runtime);assert.deepEqual(next.bytes,exported.bytes);await verifyAOTRuntime(runtime.bytes,runtime.manifest);
});
test('deployment target and escaped resources are reflected in independently verified bytes',async()=>{
 const result=await exportMacOSAOT(project,runtime,{minimumVersion:'12.3.1'},{resources:{'Resources/A&B.txt':'Zażółć gęślą jaźń'}});
 assert.equal(result.report.image.build.minimumVersion,'12.3.1');await verifyMacOSAOTArchive(result.bytes,result.options);
});
for(const [name,path,offset]of [['instruction',entry,32768],['Info.plist','DirectTest.app/Contents/Info.plist',70],['resource','DirectTest.app/Contents/Resources/vb6-build.json',10],['resource envelope','DirectTest.app/Contents/_CodeSignature/CodeResources',150]])
 test('independent archive verification rejects tampered '+name,async()=>{const files={...exported.files};files[path]=files[path].slice();files[path][offset]^=1;await assert.rejects(()=>verifyMacOSAOTArchive(writeMacOSAppZip(files,entry),exported.options));});
test('independent archive verification rejects missing or injected unsealed resources',async()=>{
 for(const remove of [true,false]){const files={...exported.files};if(remove)delete files['DirectTest.app/Contents/Resources/vb6-build.json'];else files['DirectTest.app/Contents/Resources/extra']='unsealed';await assert.rejects(()=>verifyMacOSAOTArchive(writeMacOSAppZip(files,entry),exported.options),/seal/);}
});
test('runtime rejects mismatched hash, ABI, section manifest, helper address',async()=>{
 for(const modify of [m=>m.sha256='0'.repeat(64),m=>m.abi++,m=>m.code.offset++,m=>m.helpers._vb6_aot_clear+=4]){const manifest=structuredClone(runtime.manifest);modify(manifest);await assert.rejects(()=>verifyAOTRuntime(runtime.bytes,manifest));}
});
test('runtime structural parser rejects bad section size, duplicate and invalid helper',async()=>{
 const layout=aotImageLayout(runtime.bytes);
 for(const change of [v=>v.setBigUint64(layout.code.command+40,1n,true),v=>v.setUint32(layout.code.command+48,1,true),v=>v.setUint32(layout.textSegment.command+60,7,true)]){const bytes=runtime.bytes.slice();change(new DataView(bytes.buffer));assert.throws(()=>aotImageLayout(bytes));}
});
test('ARM64 linking refuses over-capacity code before modifying the runtime',async()=>{
 const section={...compiled.section,bytes:[],fixups:[],labels:new Map(),length:2097156};await assert.rejects(()=>linkMacOSAOT({...compiled,section},runtime),/capacity/);await verifyAOTRuntime(runtime.bytes,runtime.manifest);
});
test('app ZIP rejects Unicode-normalized/case-insensitive collisions',()=>{assert.throws(()=>writeMacOSAppZip({'A.app/a':new Uint8Array(),'A.app/A':new Uint8Array()},'A.app/a'),/collision/);});
test('custom resources cannot replace seals, metadata, or escape Resources',async()=>{for(const name of ['Resources/../outside','Resources/vb6-build.json','Resources/a\\b','Resources/a:b'])await assert.rejects(()=>linkMacOSAOT(compiled,runtime,{resources:{[name]:'bad'}}),/resource path/);});
test('invalid template bytes are rejected even with a recomputed hash',async()=>{const bytes=runtime.bytes.slice();new DataView(bytes.buffer).setUint32(4,0x1000007,true);await assert.rejects(()=>createAOTRuntimeManifest(bytes),/Apple Silicon/);});

test('native loader and compiler agree on the array-aware helper ABI',async()=>{
 const header=await readFile(new URL('../packages/macos-native/aot/runtime.hpp',import.meta.url),'utf8');
 assert.match(header,new RegExp('AbiVersion = '+AOT_ABI+';'));
 assert.equal(compileMacOSAOT(conformanceProject()).metadata.abi,AOT_ABI);
 for(const abi of [1,2]){
  const legacy={bytes:runtime.bytes,manifest:{...runtime.manifest,abi}};
  await assert.rejects(exportMacOSAOT(conformanceProject(),legacy),/ABI mismatch/);
 }
 await verifyAOTRuntime(runtime.bytes,runtime.manifest);
});
