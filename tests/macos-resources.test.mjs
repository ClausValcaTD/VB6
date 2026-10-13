import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeMacOSResources,prepareMacOSResources,resolveMacOSPicture} from '../packages/macos-native/src/resources.js';
import {newProject,normalizeProject} from '../src/project/model.js';
import {setResourceString} from '../src/project/res.js';
import {toBase64,writeFRXRecord} from '../src/project/frx.js';
function bitmap(){const b=new Uint8Array(58),v=new DataView(b.buffer);b.set([66,77]);v.setUint32(2,58,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,1,true);v.setInt32(22,1,true);v.setUint16(26,1,true);v.setUint16(28,24,true);b.set([0,0,255],54);return b;}
const record=(name=101,type=10,domain=0)=>({name,type,domain,bytes:new Uint8Array([0,1,128,255])});
test('resource catalog preserves ordinal and counted UTF16 identifiers, language and source order',()=>{
 const b=encodeMacOSResources([record(),record('101'),record('日本語🙂','CUSTOM Ω')],1045),v=new DataView(b.buffer);
 assert.equal(new TextDecoder().decode(b.subarray(0,8)),'VB6RES1\0');assert.equal(v.getUint32(12,true),b.length);assert.equal(v.getUint32(16,true),3);assert.equal(v.getUint32(24,true),1045);
 assert.equal(v.getUint32(48,true),0);assert.equal(v.getUint32(52,true),101);
 assert.ok(v.getUint32(80,true)>0);assert.equal(v.getUint32(84,true),3);
 assert.equal(v.getUint32(56,true),v.getUint32(88,true)); // shared immutable payload, not aliasing returned arrays
 assert.deepEqual(b,encodeMacOSResources([record(),record('101'),record('日本語🙂','CUSTOM Ω')],1045));
});
test('empty data and independent designer domain are valid',()=>{
 const b=encodeMacOSResources([{...record(),bytes:new Uint8Array()},record(101,10,1)]);assert.ok(b.length>=96);
});
test('invalid identifiers, duplicate identities and bounds fail before native allocation',()=>{
 for(const input of [[record(),record()],[record(-1)],[record(65536)],[record('')],[record('nul\0')],[{...record(),language:65536}],[{...record(),domain:2}],[{...record(),bytes:[1]}]])assert.throws(()=>encodeMacOSResources(input));
 for(const language of [-1,65536,1.5,NaN])assert.throws(()=>encodeMacOSResources([],language));
 assert.throws(()=>encodeMacOSResources([{...record(),bytes:new Uint8Array(20*1024*1024)}]),/20 MiB/);
});
test('prepare reuses FRX text and picture decoding without touching the input snapshot',()=>{
 const original=newProject('NativeResources'),m=original.modules[0];m.sourcePath='forms/Form1.frm';
 original.assets['forms/Form1.frx']={encoding:'base64',data:toBase64(writeFRXRecord(bitmap(),'picture'))};
 m.form.properties.Picture={resource:'Form1.frx',offset:'0000'};
 original.resources=setResourceString(null,101,'Zażółć\0🙂');const before=JSON.stringify(original);
 const project=normalizeProject(original),plan=prepareMacOSResources(project);
 assert.equal(project.modules[0].form.properties.Picture,1);assert.equal(plan.report.pictures,1);assert.equal(plan.report.entries,1);
 assert.ok(plan.files['resources/vb6-assets.bin'] instanceof Uint8Array);assert.equal(JSON.stringify(original),before);
});
test('missing/remote/opaque pictures and unresolved FRX text are explicit diagnostics',()=>{
 for(const value of ['https://example.com/a.png','missing.png',{resource:'missing.frx',offset:'FFFF'}]){
  const p=newProject();p.modules[0].form.properties.Picture=value;
  assert.throws(()=>prepareMacOSResources(p),e=>e.diagnostics?.[0].code==='MACR101');
 }
 const p=newProject();p.modules[0].form.properties.Text={resource:'missing.frx',offset:'0000'};
 assert.throws(()=>prepareMacOSResources(p),e=>e.diagnostics?.[0].code==='MACR102');
});
test('no resources add no file, and explicit current picture overrides imported binding',()=>{
 const p=newProject();assert.equal(prepareMacOSResources(p).bytes,null);
 p.modules[0].form.properties.Picture='data:image/bmp;base64,'+toBase64(bitmap());
 p.modules[0].form.resourceBindings={Picture:{originalValue:'stale',assetPath:'missing.frx'}};
 assert.equal(prepareMacOSResources(p).report.pictures,1);
});
test('CUR validation retains hotspot bytes while sharing checked ICO image bounds',()=>{
 const b=new Uint8Array(70),v=new DataView(b.buffer);v.setUint16(2,2,true);v.setUint16(4,1,true);b[6]=b[7]=1;v.setUint32(14,48,true);v.setUint32(18,22,true);
 v.setUint32(22,40,true);v.setInt32(26,1,true);v.setInt32(30,2,true);v.setUint16(34,1,true);v.setUint16(36,32,true);
 const p=newProject(),m=p.modules[0];const resolve=()=>resolveMacOSPicture(p,'data:image/x-cursor;base64,'+toBase64(b),m);
 assert.equal(resolve().format,'cur');assert.deepEqual(resolve().bytes,b);
 v.setUint16(10,1,true);assert.throws(resolve,/hotspot/);
});
