import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {formMachine} from './support/native-form-machine.mjs';
for(const optimization of [0,1,2])test(`original MDI sample creates independent documents and honors close cancellation O${optimization}`,t=>{
 const p=JSON.parse(fs.readFileSync(new URL('../examples/mdi.vb6web',import.meta.url))),before=JSON.stringify(p);
 const h=formMachine(t,p,optimization);h.create('frmWorkspace');assert.equal(JSON.stringify(p),before);
 const frame=h.handle('frmWorkspace'),client=h.children(frame).find(w=>w.classname==='MDICLIENT');assert.ok(client);
 let docs=h.children(client.hwnd);assert.equal(docs.length,2);assert.deepEqual(docs.map(w=>w.text),['Document 1','Document 2']);
 assert.deepEqual(client.arrange,{msg:0x226,flags:0});
 const edit=doc=>h.children(doc.hwnd).find(w=>w.classname==='EDIT'),keep=doc=>h.children(doc.hwnd).find(w=>w.classname==='BUTTON');
 assert.ok(edit(docs[0]).text.includes('document'));assert.equal(edit(docs[0]).text,edit(docs[1]).text);
 h.send(keep(docs[1]).hwnd,0xf1,1);h.invokeForm('frmWorkspace','mnuClose_Click');assert.equal(h.children(client.hwnd).length,2);
 h.send(keep(docs[1]).hwnd,0xf1,0);h.invokeForm('frmWorkspace','mnuClose_Click');assert.equal(h.children(client.hwnd).length,1);
 h.invokeForm('frmWorkspace','mnuNew_Click');docs=h.children(client.hwnd);assert.equal(docs.length,2);assert.equal(docs[1].text,'Document 3');
 h.invokeForm('frmWorkspace','mnuCascade_Click');assert.deepEqual(client.arrange,{msg:0x227,flags:0});
 h.invokeForm('frmWorkspace','mnuTileH_Click');assert.deepEqual(client.arrange,{msg:0x226,flags:1});
 h.invokeForm('frmWorkspace','mnuIcons_Click');assert.deepEqual(client.arrange,{msg:0x228,flags:0});
 h.send(keep(docs[0]).hwnd,0xf1,1);h.invokeForm('frmWorkspace','mnuExit_Click');assert.ok(h.windows.has(frame),'child veto preserves MDI parent');
 h.send(keep(docs[0]).hwnd,0xf1,0);h.invokeForm('frmWorkspace','mnuExit_Click');assert.equal(h.windows.size,0);assert.equal(h.owned().length,0);
});

test('MDI Windows acceptance preserves every original statement/designer object and the existing PE size limit',async()=>{
 const {nativeMdiSampleFixture}=await import('../tools/win32-mdi-sample-fixture.mjs');const {compileWin32}=await import('../src/native/compiler.js');
 const source=JSON.parse(fs.readFileSync(new URL('../examples/mdi.vb6web',import.meta.url))),{project,checks}=nativeMdiSampleFixture();
 for(const m of source.modules){const actual=project.modules.find(x=>x.id===m.id);assert.ok(actual.code.startsWith(m.code));if(m.form)assert.deepEqual(actual.form,m.form);}
 assert.equal(checks.length,14);
 for(const optimization of [0,1,2]){const r=compileWin32(project,{optimization});assert.ok(r.bytes.length<100*1024);assert.deepEqual(r.bytes,compileWin32(project,{optimization}).bytes);}
});
for(const optimization of [0,1,2])test(`complete original MDI Windows verifier also executes against labelled foreign-API doubles O${optimization}`,async t=>{
 const {nativeMdiSampleFixture}=await import('../tools/win32-mdi-sample-fixture.mjs'),{project}=nativeMdiSampleFixture();
 const h=formMachine(t,project,optimization);h.create('frmWorkspace');
 const exit=new Error('Native test process exit');let code;
 h.vm.hook('kernel32.dll','ExitProcess',1,([value])=>{code=value;throw exit;});
 assert.throws(()=>h.invokeForm('frmWorkspace','NativeVerify'),e=>e===exit);
 assert.equal(code,0,'all authoritative assertions executed');assert.equal(h.windows.size,0);assert.equal(h.owned().length,0);
});
