import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
test('independently extracted npm package exports a sealed native application offline',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aot-isolated-package-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const packed=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',root],{cwd:path.resolve('packages/macos-native'),encoding:'utf8'}));
  execFileSync('tar',['-xzf',path.join(root,packed[0].filename),'-C',root]);
  const api=await import(pathToFileURL(path.join(root,'package/dist/index.js')).href),node=await import(pathToFileURL(path.join(root,'package/src/node.mjs')).href);
  const project={schema:1,name:'Isolated',startup:'Sub Main',modules:[{name:'MainModule',kind:'module',code:'Public Sub Main()\nDebug.Print "ISOLATED_NATIVE"\nEnd Sub'}]};
  const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('No network in extracted SDK');};
  try {
    assert.equal(typeof node.exportMacOSDistribution,'function');assert.equal(typeof node.distributeMacOSApplication,'function');
    const distribution=await import(pathToFileURL(path.join(root,'package/src/distribution.mjs')).href);assert.equal(typeof distribution.distributeMacOSApplication,'function');
    const result=await api.exportMacOSApplication(project);assert.equal(result.report.compiled,true);assert.equal(result.report.codegen,'arm64-aot');
    const report=await node.exportMacOSProject(project,{out:path.join(root,'output')});assert.deepEqual(new Uint8Array(await fs.readFile(report.archive)),result.bytes);
    assert.equal((await api.verifyMacOSAOTArchive(result.bytes,result.options)).signature.byteHashesVerified,true);
  }finally{globalThis.fetch=original;}
});
