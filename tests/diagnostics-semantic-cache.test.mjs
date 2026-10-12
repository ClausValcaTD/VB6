import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProject} from '../src/language/compiler.js';
import {ProjectDiagnosticCache,diagnosticSnapshot} from '../src/language/diagnostics.js';
import {project,module,main} from './helpers/compiler-runtime.mjs';
const normalize=r=>r.diagnostics.map(({origin,...d})=>d);
const check=(cache,p)=>{
 const result=cache.check(diagnosticSnapshot(p));assert.deepEqual(normalize(result),compileProject(p).diagnostics);return result;
};

test('unchanged source reuses the completed semantic pass without rebinding arrays',()=>{
 const p=project(main('Dim a(Size) As Long'),[module('Other','Public Const Size = 3')]),cache=new ProjectDiagnosticCache();
 assert.equal(check(cache,p).semanticCacheHit,false);
 const d=[...cache.entries.values()].find(e=>e.name==='M').compiled.procedures.get('main').code[0].decls[0],values=d.boundValues;
 const next=check(cache,p);assert.equal(next.semanticCacheHit,true);assert.equal(next.stats.compiledModules,0);assert.equal(d.boundValues,values);
});
test('a changed constant dependency forces semantic rebinding despite consumer syntax hits',()=>{
 const p=project(main('Dim a(Size) As Long'),[module('Other','Public Const Size = 3')]),cache=new ProjectDiagnosticCache();check(cache,p);
 p.modules[1].code='Public Const Size = -2';const r=check(cache,p);assert.equal(r.valid,false);assert.equal(r.semanticCacheHit,false);assert.equal(r.stats.compiledModules,1);
 p.modules[1].code='Public Const Size = 4';assert.equal(check(cache,p).valid,true);
 assert.equal(check(cache,p).semanticCacheHit,true);
});
test('module removal, addition, reordering and duplicate-name resolution invalidate semantic results',()=>{
 const p=project('Const X = N',[module('Other','Public Const N = 3')]),cache=new ProjectDiagnosticCache();check(cache,p);
 const changes=[()=>p.modules.push(module('Dup','Public Const N = 4')),()=>p.modules.reverse(),()=>p.modules.shift(),()=>p.modules.push(module('M','Const Q = 1')),()=>p.modules.pop()];
 for(const change of changes){change();assert.equal(check(cache,p).semanticCacheHit,false);assert.equal(check(cache,p).semanticCacheHit,true);}
});
test('module names, kinds, attributes and conditional settings participate in semantic identity',()=>{
 const p=project(main('')),cache=new ProjectDiagnosticCache();check(cache,p);
 for(const change of [()=>p.modules[0].name='Renamed',()=>p.modules[0].kind='class',()=>p.modules[0].attributes=['Attribute VB_Description = "test"'],()=>p.settings={conditionalConstants:{MODE:1}}]){
  change();assert.equal(check(cache,p).semanticCacheHit,false);assert.equal(check(cache,p).semanticCacheHit,true);
 }
});
test('layout settings and mutable control identities invalidate cached semantic diagnostics',()=>{
 const p=project(main('')),cache=new ProjectDiagnosticCache();p.modules.push({...module('Form1','Sub Work()\nButton1.Dock = 1\nEnd Sub','form'),form:{type:'Form',properties:{},controls:[{name:'Button1',type:'CommandButton'}]}});
 let r=check(cache,p);assert.equal(r.valid,false);assert.equal(check(cache,p).semanticCacheHit,true);
 p.settings={anchoring:true};r=check(cache,p);assert.equal(r.valid,true);assert.equal(r.semanticCacheHit,false);
 p.modules[1].form.controls[0].type='Timer';r=check(cache,p);assert.equal(r.valid,false);assert.equal(r.stats.compiledModules,0);assert.equal(r.semanticCacheHit,false);
 p.modules[1].form.controls[0].name='Other';r=check(cache,p);assert.equal(r.valid,true);assert.equal(r.semanticCacheHit,false);
});
test('returned semantic diagnostic objects cannot poison subsequent results',()=>{
 const p=project(main('Dim a(2 To 1)')),cache=new ProjectDiagnosticCache();const r=check(cache,p);
 r.diagnostics[0].message='mutated';r.diagnostics[0].line=999;r.diagnostics.push({message:'injected'});
 const next=check(cache,p);assert.equal(next.semanticCacheHit,true);assert.notEqual(next.diagnostics[0].message,'mutated');assert.notEqual(next.diagnostics[0].line,999);
});
test('returned parse diagnostics remain isolated on the semantic cache hit path',()=>{
 const p=project('Invalid Syntax'),cache=new ProjectDiagnosticCache();const r=check(cache,p);r.diagnostics[0].message='mutated';
 const next=check(cache,p);assert.equal(next.semanticCacheHit,true);assert.notEqual(next.diagnostics[0].message,'mutated');
});
test('failed semantic results are reusable and repairs invalidate them',()=>{
 const p=project('Const N = Missing'),cache=new ProjectDiagnosticCache();assert.equal(check(cache,p).valid,false);
 assert.equal(check(cache,p).semanticCacheHit,true);p.modules[0].code='Const N = 3';assert.equal(check(cache,p).valid,true);assert.equal(check(cache,p).semanticCacheHit,true);
});
test('cancelling a partly parsed changed snapshot cannot publish a semantic result',()=>{
 const p=project(main(''),[module('Other','Public Const N = 1')]),cache=new ProjectDiagnosticCache();check(cache,p);const prior=cache.validation;
 const changed=structuredClone(p);changed.modules[0].code=main('Dim a(N)');const steps=cache.steps(diagnosticSnapshot(changed));steps.next();steps.return();
 assert.equal(cache.validation,prior);const next=check(cache,p);assert.equal(next.valid,true);assert.equal(next.semanticCacheHit,false);
});
test('clear drops semantic state and an old generator cannot repopulate it',()=>{
 const p=project(main(''),[module('Other','')]),cache=new ProjectDiagnosticCache();check(cache,p);
 const steps=cache.steps(diagnosticSnapshot(p));steps.next();cache.clear();let next;do{next=steps.next();}while(!next.done);
 assert.equal(cache.validation,null);assert.equal(cache.entries.size,0);assert.equal(check(cache,p).semanticCacheHit,false);
});
test('interleaved layout snapshots install only their own final semantic context',()=>{
 const p=project(main(''));p.modules.push({...module('Form1','Sub Work()\nButton1.Dock = 1\nEnd Sub','form'),form:{type:'Form',properties:{},controls:[{name:'Button1',type:'CommandButton'}]}});
 p.settings={anchoring:true};const cache=new ProjectDiagnosticCache(),a=diagnosticSnapshot(p),b=structuredClone(a);b.modules[1].layoutBindings.controls[0].type='Timer';
 const steps=cache.steps(a);steps.next();steps.next();const rb=cache.check(b);assert.equal(rb.valid,false);
 const ra=steps.next();assert.equal(ra.done,true);assert.equal(ra.value.valid,true);
 assert.equal(cache.check(b).valid,false);assert.equal(cache.check(a).valid,true);
});
test('direct cache callers receive fresh MDI form metadata on syntax hits',()=>{
 const p=project(main(''));p.modules.push({...module('Form1','','form'),form:{type:'Form',properties:{MDIChild:0},controls:[]}});
 const cache=new ProjectDiagnosticCache();assert.equal(cache.check(p).valid,true);
 p.modules[1].form.properties.MDIChild=-1;let r=cache.check(p);assert.equal(r.valid,false);assert.equal(r.stats.compiledModules,0);assert.deepEqual(normalize(r),compileProject(p).diagnostics);
 p.modules[1].form.type='MDIForm';p.modules[1].form.properties.MDIChild=0;r=cache.check(p);assert.equal(r.valid,true);
});
test('duplicate or omitted module IDs cannot collide in the semantic cache',()=>{
 const p=project('Const X = N',[module('Other','Public Const N = 2')]);p.modules.forEach(m=>m.id='same');const cache=new ProjectDiagnosticCache();check(cache,p);
 p.modules[1].code='Public Const N = 3';assert.equal(check(cache,p).semanticCacheHit,false);
 p.modules.forEach(m=>delete m.id);assert.equal(check(cache,p).valid,true);assert.equal(check(cache,p).semanticCacheHit,true);
});
test('empty projects can reuse an isolated zero-module semantic result',()=>{
 const cache=new ProjectDiagnosticCache(),p={name:'Empty',modules:[]};assert.equal(check(cache,p).semanticCacheHit,false);assert.equal(check(cache,p).semanticCacheHit,true);
 cache.clear();assert.equal(check(cache,p).semanticCacheHit,false);
});

test('literal null/undefined IDs do not collide with absent IDs in direct callers',()=>{
 const p=project('Const X = 1',[module('Other','Const Y = 2'),module('Third','Const Z = 3'),module('Fourth','Const Q = 4')]);
 p.modules[0].id='undefined';delete p.modules[1].id;p.modules[2].id='null';p.modules[3].id=null;
 const cache=new ProjectDiagnosticCache();assert.deepEqual(normalize(cache.check(p)),compileProject(p).diagnostics);
 assert.equal(cache.entries.size,4);assert.equal(cache.check(p).semanticCacheHit,true);
 p.modules[1].code='Const Y = Unknown';const r=cache.check(p);assert.equal(r.valid,false);assert.equal(r.stats.compiledModules,1);
 assert.deepEqual(normalize(r),compileProject(p).diagnostics);
});
