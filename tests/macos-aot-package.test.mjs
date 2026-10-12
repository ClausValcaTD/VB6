import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {exportMacOSApplication,loadMacOSAOTRuntime,macOSAOTRuntimeInfo,verifyMacOSAOTArchive} from '../packages/macos-native/dist/index.js';
import {exportMacOSProject} from '../packages/macos-native/src/node.mjs';
import {readAOTSourceProvenance,checkAOTRuntimeProvenance} from '../tools/macos-aot-provenance.mjs';
import {compressedRuntimeArchive,encodeAOTRuntimePayload} from '../tools/embed-macos-aot-runtime.mjs';
import {readZip} from '../src/project/zip.js';
const project={schema:1,name:'OfflineNative',startup:'Sub Main',modules:[{name:'MainModule',kind:'module',code:'Public Sub Main()\nDebug.Print "OFFLINE_NATIVE_OK"\nEnd Sub'}]};
test('the shipped runtime matches the current native source and real execution provenance',()=>{
 const manifest=macOSAOTRuntimeInfo();assert.deepEqual(manifest.provenance, {...manifest.provenance,...readAOTSourceProvenance()});
 assert.equal(checkAOTRuntimeProvenance().sha256,manifest.sha256);assert.equal(manifest.verification.arm64ExecutionVerified,true);assert.equal(manifest.verification.nativeSignatureVerified,true);
});
test('concurrent runtime loads return isolated templates and manifests',async()=>{
 const [a,b]=await Promise.all([loadMacOSAOTRuntime(),loadMacOSAOTRuntime()]);assert.notEqual(a.bytes,b.bytes);assert.deepEqual(a.bytes,b.bytes);
 a.bytes[0]=0;a.manifest.helpers._vb6_aot_clear=0;const c=await loadMacOSAOTRuntime();assert.notEqual(c.bytes[0],0);assert.notEqual(c.manifest.helpers._vb6_aot_clear,0);
 const info=macOSAOTRuntimeInfo();info.abi=0;assert.equal(macOSAOTRuntimeInfo().abi,1);
});
test('high-level offline export produces a fully sealed executable without network',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=()=>{++calls;throw new Error('Network forbidden');};
 try{const before=JSON.stringify(project),a=await exportMacOSApplication(project),b=await exportMacOSApplication(project);assert.deepEqual(a.bytes,b.bytes);assert.equal(JSON.stringify(project),before);assert.equal(calls,0);const verified=await verifyMacOSAOTArchive(a.bytes,a.options);assert.equal(verified.signature.byteHashesVerified,true);assert.equal(a.report.codegen,'arm64-aot');}
 finally{globalThis.fetch=original;}
});
test('pre-cancelled runtime and application requests abort before export',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(loadMacOSAOTRuntime({signal:controller.signal}),{name:'AbortError'});await assert.rejects(exportMacOSApplication(project,{}, {signal:controller.signal}),{name:'AbortError'});
});
test('Node writer is cross-platform and refuses output overwrite',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aot-node-test-'));
 try{const report=await exportMacOSProject(project,{out:dir});assert.equal(report.compiled,true);assert.ok((await fs.stat(report.archive)).size>4096);await assert.rejects(exportMacOSProject(project,{out:dir}),e=>e.code==='EEXIST');await verifyMacOSAOTArchive(new Uint8Array(await fs.readFile(report.archive)),{name:project.name});}
 finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('CLI defaults to ready-to-run app ZIP, not a source kit',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aot-cli-test-'));
 try{const input=path.join(dir,'project.vb6web');await fs.writeFile(input,JSON.stringify(project));const stdout=execFileSync(process.execPath,['packages/macos-native/bin/vb6-macos.mjs',input,'--out',path.join(dir,'out')],{encoding:'utf8'}),report=JSON.parse(stdout);assert.equal(report.codegen,'arm64-aot');assert.equal(report.artifact,'native-executable');assert.equal(report.compiled,true);assert.match(report.archive,/\.app\.zip$/);assert.deepEqual(await fs.readdir(path.join(dir,'out')),[project.name+'.app.zip']);
 assert.throws(()=>execFileSync(process.execPath,['packages/macos-native/bin/vb6-macos.mjs',input,'--out',path.join(dir,'bad'),'--identity','Example'],{encoding:'utf8',stdio:'pipe'}),/require explicit --clang/);}
 finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('compressed SDK packaging round-trips empty, repeated and random bytes',async()=>{
 for(const bytes of [new Uint8Array(),new Uint8Array(65536).fill(42),crypto.getRandomValues(new Uint8Array(65536))])assert.deepEqual((await readZip(compressedRuntimeArchive(bytes))).get('runtime-arm64'),bytes);
});
test('runtime embedding refuses source-only or fabricated execution reports',async()=>{
 const runtime=await loadMacOSAOTRuntime();for(const proof of [undefined,{platform:'linux',arch:'x64',arm64ExecutionVerified:false,nativeSignatureVerified:false},{platform:'darwin',arch:'arm64',arm64ExecutionVerified:true,nativeSignatureVerified:true,runtime:{sha256:'wrong'}}])await assert.rejects(encodeAOTRuntimePayload(runtime,{proof}),/native execution/);
});
