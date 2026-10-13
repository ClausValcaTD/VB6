import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProject} from '../src/language/compiler.js';
import {ProjectDiagnosticCache,diagnosticSnapshot} from '../src/language/diagnostics.js';
import {RecordTypeIndex} from '../src/language/record-resolution.js';
import {run,main,module,project,invalid} from './helpers/compiler-runtime.mjs';
const hidden=(name,type='Long')=>module('Types','Private Type '+name+'\nValue As '+type+'\nEnd Type');
const publicRecord=name=>module('Types','Public Type '+name+'\nValue As Long\nEnd Type');

for(const kind of ['class','form'])test(kind+' namespace wins over unrelated private record names',()=>{
 const p=compileProject(project('Sub Work(ByVal value As View)\nEnd Sub',[module('View','',kind),hidden('View')]));
 assert.deepEqual(p.diagnostics,[]);
 const index=new RecordTypeIndex(p.modules);assert.equal(index.resolve('View',p.modules.get('m')),null);assert.equal(index.problem('View',p.modules.get('m')),null);
});
test('enclosing module private record still shadows a class module',async()=>{
 const r=await run('Private Type Item\nValue As Long\nEnd Type\n'+main('Dim value As Item\nvalue.Value = 7\nDebug.Print value.Value'),[module('Item','','class')]);assert.deepEqual(r.output,['7']);
});
for(const scope of ['Private','Public'])test('enclosing enum shadows '+scope+' record imported from another module',async()=>{
 const r=await run('Private Enum State\nReady = 7\nEnd Enum\nSub Work(ByVal value As State)\nDebug.Print value, TypeName(value)\nEnd Sub\n'+main('Dim value As State\nvalue = Ready\nWork value'),[module('Types',scope+' Type State\nValue As Long\nEnd Type')]);assert.deepEqual(r.output,['7 Long']);
});
for(const scope of ['Private','Public'])test('standard module names cannot silently bind '+scope+' imported records',()=>{
 const p=invalid(main('Dim value As Util'),/module.*type|type.*module/i,[module('Util',''),module('Types',scope+' Type Util\nValue As Long\nEnd Type')]);
 assert.equal(p.diagnostics[0].source,'M');assert.equal(p.diagnostics[0].line,3);
});
test('qualified source-module record lookup rejects missing type members',()=>{
 const p=invalid(main('Dim value As Types.Missing'),/not defined/,[module('Types','Public Const Present = 1')]);assert.equal(p.diagnostics[0].source,'M');assert.equal(p.diagnostics[0].line,3);
});
test('qualified enum names are not misdiagnosed as missing records',async()=>{
 const r=await run(main('Dim value As Types.State\nvalue = 7\nDebug.Print TypeName(value)'),[module('Types','Public Enum State\nReady = 7\nEnd Enum')]);assert.deepEqual(r.output,['Long']);
});
test('external-library names remain owned by their existing type adapters',()=>{
 const p=compileProject(project('Private obj As Scripting.Dictionary'));assert.deepEqual(p.diagnostics,[]);
});
test('background type resolution notices form removal and restores correctly',()=>{
 const p=project('Sub Work(ByVal value As View)\nEnd Sub',[module('View','','form'),hidden('View')]),cache=new ProjectDiagnosticCache();
 const check=()=>{const a=cache.check(diagnosticSnapshot(p));assert.deepEqual(a.diagnostics.map(({origin,...d})=>d),compileProject(p).diagnostics);return a;};
 assert.equal(check().valid,true);assert.equal(check().semanticCacheHit,true);
 p.modules.splice(1,1);assert.equal(check().valid,false);p.modules.splice(1,0,module('View','','form'));assert.equal(check().valid,true);
});
test('a qualified private record remains usable within its declaring module',async()=>{
 const r=await run('Private Type Util\nValue As Long\nEnd Type\n'+main('Dim value As M.Util\nvalue.Value = 7\nDebug.Print value.Value'),[module('Util','')]);assert.deepEqual(r.output,['7']);
});
