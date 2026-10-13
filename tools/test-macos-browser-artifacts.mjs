/** Execute the exact HTTP/file-origin browser downloads on Apple Silicon. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {runTool} from '../packages/macos-native/src/build-driver.mjs';
import {verifyMacOSAOTArchive} from '../packages/macos-native/dist/index.js';
const input=path.resolve(process.argv[2]||'browser-input'),out=path.resolve('reports/macos-aot-browser-native');
const work=await fs.mkdtemp(path.join(os.tmpdir(),'vb6-browser-aot-')),results=[];let transcript='';
const run=(file,args)=>runTool(file,args,{cwd:work,timeout:120000,log:s=>{transcript+=s;process.stderr.write(s);}});
try {
  assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
  for(const engine of ['chromium','firefox','webkit']){
    const directory=path.join(input,'macos-direct-browser-'+engine),report=JSON.parse(await fs.readFile(path.join(directory,'validation.json'),'utf8'));
    assert.equal(report.errors.length,0);assert.equal(report.archives.length,8);assert.equal(report.nativeWebCrypto,true);assert.equal(report.realFileOrigin,true);
    for(const archive of report.archives){
      assert.match(archive.name,new RegExp('^'+engine+'-(http|file)(-O[013])?\\.app\\.zip$'));
      const source=path.join(directory,archive.name),bytes=new Uint8Array(await fs.readFile(source)),verified=await verifyMacOSAOTArchive(bytes,archive.options);
      assert.equal(verified.sha256,archive.sha256);
      const expanded=path.join(work,archive.name);await fs.mkdir(expanded);await run('/usr/bin/ditto',['-x','-k',source,expanded]);
      const app=path.join(expanded,archive.options.name+'.app');
      await run('/usr/bin/codesign',['--verify','--strict','--verbose=2',app]);
      const output=await run(path.join(app,'Contents','MacOS',archive.options.name),[]);
      for(const marker of ['NATIVE_CONFORMANCE_OK','NATIVE_INTERFACES_OK','NATIVE_LIFETIMES_OK'])assert.ok(output.includes(marker),marker);
      results.push({optimization:archive.options.optimization??2,archive:archive.name,sha256:verified.sha256,nativeSignatureVerified:true,arm64ExecutionVerified:true});
    }
  }
  assert.equal(results.length,24);
  for(const level of [0,1,2,3]){const group=results.filter(r=>r.optimization===level);assert.equal(group.length,6);assert.equal(new Set(group.map(r=>r.archive)).size,6);assert.equal(new Set(group.map(r=>r.sha256)).size,1);}
  assert.equal(new Set(results.map(r=>r.sha256)).size,4);
} catch(error) {console.error(error.stack);process.exitCode=1;}
finally {await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'validation.json'),JSON.stringify({platform:process.platform,arch:process.arch,results,success:results.length===24&&!process.exitCode},null,2));await fs.writeFile(path.join(out,'execution.log'),transcript);await fs.rm(work,{recursive:true,force:true});}
