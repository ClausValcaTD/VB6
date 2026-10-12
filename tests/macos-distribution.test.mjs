import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createMacOSDistributor,distributionEntitlements,macOSDistributionOptions,readDistributionSignature,readNotarizationResult} from '../packages/macos-native/src/distribution.mjs';
import {syntheticAOTRuntime} from '../packages/macos-native/tests/aot-fixture.mjs';
import {exportMacOSAOT} from '../packages/macos-native/src/aot-export.js';

// Synthetic native-tool results test local authority and transactions, not Apple
// notarization or Developer ID trust. Real codesign execution has a separate CI gate.
const project={schema:1,name:'DistributionTest',startup:'Sub Main',modules:[{name:'MainModule',kind:'module',code:'Sub Main()\nEnd Sub'}]};
const result=await exportMacOSAOT(project,await syntheticAOTRuntime({growable:true}));
const identity='Developer ID Application: Test (ABCDEFGHIJ)',id='01234567-89ab-cdef-0123-456789abcdef';
const signed='CodeDirectory flags=0x10000(runtime)\nAuthority='+identity+'\nTeamIdentifier=ABCDEFGHIJ\nTimestamp=Oct 12, 2026 at 20:00:00\n';
const adhoc='CodeDirectory flags=0x10002(adhoc,runtime)\nSignature=adhoc\n';
async function directory(t){const out=await fs.mkdtemp(path.join(os.tmpdir(),'vb6-distribution-test-'));t.after(()=>fs.rm(out,{recursive:true,force:true}));return out;}
function fakeTools(configuration={}){
  const {failure,onCall=()=>{},display=signed}=configuration;
  const notary=Object.hasOwn(configuration,'notary')?configuration.notary:'Accepted';
  const calls=[];
  const run=async(exe,args,options)=>{
    calls.push({exe,args,options});await onCall(exe,args,options);options.signal?.throwIfAborted();
    if(failure?.(exe,args))throw new Error('Synthetic native tool failed');
    if(exe==='/usr/bin/codesign'&&args[0]==='--display')return display;
    if(exe==='/usr/bin/ditto'&&args[0]==='-c')await fs.writeFile(args.at(-1),result.bytes,{flag:'wx'});
    if(exe==='/usr/bin/xcrun'&&args[0]==='notarytool')return JSON.stringify({id,status:notary});
    return '';
  };
  return {calls,distribute:createMacOSDistributor({platform:'darwin',run})};
}

test('explicit notarization signs, accepts, staples and assesses before publication',async t=>{
  const out=await directory(t),before=result.bytes.slice(),tools=fakeTools();
  const report=await tools.distribute(result.bytes,result.options,{out,identity,notarizeProfile:'Local profile',entitlements:{'com.apple.security.app-sandbox':true}});
  assert.equal(report.notarized,true);assert.equal(report.developerID,true);assert.equal(report.gatekeeperAccepted,true);assert.equal(report.notarization.submissionId,id);
  assert.equal(report.sha256,createHash('sha256').update(result.bytes).digest('hex'));
  assert.deepEqual(result.bytes,before);assert.deepEqual((await fs.readdir(out)).sort(),['DistributionTest.app.zip','DistributionTest.distribution.json']);
  const submit=tools.calls.find(c=>c.args[0]==='notarytool');assert.deepEqual(submit.args.slice(3),['--keychain-profile','Local profile','--wait','--output-format','json']);
  assert.equal(tools.calls.filter(c=>c.exe==='/usr/sbin/spctl').length,2);assert.equal(tools.calls.filter(c=>c.args[0]==='stapler'&&c.args[1]==='validate').length,2);
  assert.ok(tools.calls.every(c=>c.exe.startsWith('/usr/')&&!c.exe.endsWith('DistributionTest')));
  const sign=tools.calls.find(c=>c.args[0]==='--force');assert.ok(sign.args.includes('--timestamp'));assert.equal(sign.args[2],identity);
  assert.ok(tools.calls.every(c=>c.options.timeout===600000));assert.deepEqual(JSON.parse(await fs.readFile(report.reportFile,'utf8')).sha256,report.sha256);
});
test('sign-only and ad-hoc distribution never upload, staple or claim Gatekeeper trust',async t=>{
  for(const localIdentity of [identity,'-']){
    const out=path.join(await directory(t),'result'),tools=fakeTools({display:localIdentity==='-'?adhoc:signed});
    const report=await tools.distribute(result.bytes,result.options,{out,identity:localIdentity});
    assert.equal(report.notarized,false);assert.equal(report.gatekeeperAccepted,false);assert.equal(report.ticketStapled,false);
    assert.equal(tools.calls.some(c=>c.exe==='/usr/bin/xcrun'||c.exe==='/usr/sbin/spctl'),false);
    assert.equal(report.signing,localIdentity==='-'?'ad-hoc':'developer-id');
  }
});
for(const status of ['Invalid','In Progress','Rejected',undefined])test('notary status '+status+' never becomes a successful release',async t=>{
  const out=await directory(t),tools=fakeTools({notary:status});
  await assert.rejects(()=>tools.distribute(result.bytes,result.options,{out,identity,notarizeProfile:'Local'}),/Notarization was not accepted/);
  assert.deepEqual(await fs.readdir(out),[]);assert.equal(tools.calls.some(c=>c.args[0]==='stapler'),false);
});
for(const [label,failure]of [
 ['signature',(exe,args)=>exe==='/usr/bin/codesign'&&args[0]==='--verify'],
 ['upload',(exe,args)=>args[0]==='notarytool'],
 ['stapling',(exe,args)=>args[0]==='stapler'&&args[1]==='staple'],
 ['ticket validation',(exe,args)=>args[0]==='stapler'&&args[1]==='validate'],
 ['Gatekeeper',(exe)=>exe==='/usr/sbin/spctl'],
 ['final extraction',(exe,args)=>exe==='/usr/bin/ditto'&&args[0]==='-x']
])test(label+' failure leaves no published archive or private staging files',async t=>{
  const out=await directory(t),tools=fakeTools({failure});
  await assert.rejects(()=>tools.distribute(result.bytes,result.options,{out,identity,notarizeProfile:'Local'}),/Synthetic native tool failed/);
  assert.deepEqual(await fs.readdir(out),[]);
});
test('cancelled native operation cleans staging without publishing',async t=>{
  const out=await directory(t),controller=new AbortController(),tools=fakeTools({onCall(){controller.abort();}});
  await assert.rejects(()=>tools.distribute(result.bytes,result.options,{out,identity,signal:controller.signal}),{name:'AbortError'});
  assert.deepEqual(await fs.readdir(out),[]);
});
test('exclusive publication rolls back its archive but preserves a competing report',async t=>{
  const out=await directory(t),report=path.join(out,'DistributionTest.distribution.json');
  const tools=fakeTools({onCall:async(exe,args)=>{if(exe==='/usr/bin/ditto'&&args[0]==='-x')await fs.writeFile(report,'independent writer',{flag:'wx'});}});
  await assert.rejects(()=>tools.distribute(result.bytes,result.options,{out,identity}),{code:'EEXIST'});
  assert.deepEqual(await fs.readdir(out),['DistributionTest.distribution.json']);assert.equal(await fs.readFile(report,'utf8'),'independent writer');
});
test('existing archives and output symlinks are rejected before native commands',async t=>{
  const out=await directory(t),tools=fakeTools();await fs.writeFile(path.join(out,'DistributionTest.app.zip'),'keep');
  await assert.rejects(()=>tools.distribute(result.bytes,result.options,{out,identity}),{code:'EEXIST'});assert.equal(tools.calls.length,0);
  const link=path.join(await directory(t),'output');await fs.symlink(out,link,'dir');
  await assert.rejects(()=>tools.distribute(result.bytes,result.options,{out:link,identity}),/regular directory/);assert.equal(tools.calls.length,0);
});
test('invalid input and host fail without tools, output creation or input mutation',async t=>{
  const out=path.join(await directory(t),'missing'),tools=fakeTools(),corrupt=result.bytes.slice();corrupt[0]^=1;
  await assert.rejects(()=>tools.distribute(corrupt,result.options,{out,identity}));
  await assert.rejects(()=>tools.distribute([],result.options,{out,identity}),/byte array/);
  await assert.rejects(()=>createMacOSDistributor({platform:'linux'})(result.bytes,result.options,{out,identity}),/requires macOS/);
  assert.equal(tools.calls.length,0);await assert.rejects(()=>fs.stat(out),{code:'ENOENT'});
});
test('distribution identity and notary response validation do not infer trust from success text',()=>{
  assert.equal(readDistributionSignature(signed,{identity}).developerID,true);
  for(const display of [signed.replace('0x10000','0x0'),signed.replace('Developer ID Application','Apple Development'),signed.replace(/TeamIdentifier=.*/,'TeamIdentifier=not set'),signed.replace(/Timestamp=.*/,'SignedTime=local'),adhoc])assert.throws(()=>readDistributionSignature(display,{identity}));
  for(const output of ['Accepted','{}',JSON.stringify({id:'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',status:'Accepted'}),JSON.stringify({id,status:'In Progress'})])assert.throws(()=>readNotarizationResult(output));
});
test('explicit local options reject invalid identities, accidental credentials and ad-hoc notarization',()=>{
  for(const options of [{},{identity:'--force'},{identity:'a\n'},{identity:'-',notarizeProfile:'Local'},{identity,notarizeProfile:''},{identity,timeout:999},{identity,timeout:600001},{identity,password:'never accepted'}])assert.throws(()=>macOSDistributionOptions(options));
});
test('entitlement serializer is deterministic, bounded, XML-safe and never evaluates accessors',()=>{
  const value={'z':['<&"',1,false],'a':true};assert.equal(distributionEntitlements(value),distributionEntitlements({a:true,z:['<&"',1,false]}));
  assert.match(distributionEntitlements(value),/&lt;&amp;&quot;/);const circular={};circular.loop=circular;
  let evaluated=false;const getter={get value(){evaluated=true;return 'bad';}};
  for(const input of [null,[],{x:NaN},{x:1.2},{x:'\0'},{x:'\ud800'},{x:'\ufffe'},{x:'x'.repeat(65537)},circular,getter,{x:Array(5000).fill('a')},{x:new Date()}])assert.throws(()=>distributionEntitlements(input));
  assert.equal(evaluated,false);
});
