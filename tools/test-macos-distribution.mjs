/** Actual Apple tools and delivered archive execution; no Developer ID credentials
 * are assumed in CI. Notary-service branches have explicitly synthetic unit tests. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {distributeMacOSApplication} from '../packages/macos-native/src/distribution.mjs';
import {runTool} from '../packages/macos-native/src/build-driver.mjs';
import {aotImageLayout} from '../packages/macos-native/src/aot-image.js';
import {verifyMacOSAppArchive} from '../packages/macos-native/dist/index.js';
const out=path.resolve('artifacts/macos-aot/distribution'),reports=path.resolve('reports/macos-aot-distribution');
const work=await fs.mkdtemp(path.join(os.tmpdir(),'vb6-distribution-native-'));
const report={platform:process.platform,architecture:process.arch,actualAppleTools:false,developerIdServiceExercised:false,notaryServiceExercised:false};let transcript='';
const run=(exe,args)=>runTool(exe,args,{cwd:work,timeout:120000,log:s=>{transcript+=s;process.stderr.write(s);}});
try{
  assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
  const options={name:'NativeConformance'},input=new Uint8Array(await fs.readFile('artifacts/macos-aot/NativeConformance.app.zip'));
  report.result=await distributeMacOSApplication(input,options,{out,identity:'-',entitlements:{'com.apple.security.network.client':true},log:s=>{transcript+=s;process.stderr.write(s);}});
  assert.equal(report.result.notarized,false);assert.equal(report.result.developerID,false);assert.equal(report.result.gatekeeperAccepted,false);assert.equal(report.result.hardenedRuntime,true);
  await verifyMacOSAppArchive(new Uint8Array(await fs.readFile(report.result.archive)),options);
  for(const [name,archive] of [['original',path.resolve('artifacts/macos-aot/NativeConformance.app.zip')],['signed',report.result.archive]]){
    const directory=path.join(work,name);await fs.mkdir(directory);await run('/usr/bin/ditto',['-x','-k',archive,directory]);
  }
  const original=new Uint8Array(await fs.readFile(path.join(work,'original/NativeConformance.app/Contents/MacOS/NativeConformance')));
  const signed=new Uint8Array(await fs.readFile(path.join(work,'signed/NativeConformance.app/Contents/MacOS/NativeConformance')));
  const a=aotImageLayout(original),b=aotImageLayout(signed);
  for(const key of ['code','metadata'])assert.deepEqual(signed.subarray(b[key].offset,b[key].offset+b[key].size),original.subarray(a[key].offset,a[key].offset+a[key].size),'Signing changed project '+key);
  const executable=path.join(work,'signed/NativeConformance.app/Contents/MacOS/NativeConformance');
  const output=await run(executable,[]);
  for(const marker of ['NATIVE_CONFORMANCE_OK','NATIVE_INTERFACES_OK','NATIVE_LIFETIMES_OK'])assert.ok(output.includes(marker),marker);
  report.actualAppleTools=true;report.projectCodeUnchanged=true;report.arm64ExecutionVerified=true;
}catch(error){report.error={message:error.message,output:error.output||''};console.error(error.stack,error.output||'');process.exitCode=1;}
finally{await fs.mkdir(reports,{recursive:true});await fs.writeFile(path.join(reports,'validation.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(reports,'execution.log'),transcript);await fs.rm(work,{recursive:true,force:true});}
