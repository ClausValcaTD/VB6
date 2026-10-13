import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProject} from '../src/language/compiler.js';
import {ProjectDiagnosticCache,diagnosticSnapshot} from '../src/language/diagnostics.js';
import {project,module,main} from './helpers/compiler-runtime.mjs';
const diagnostics=p=>compileProject(p).diagnostics;
const cycles=p=>diagnostics(p).filter(d=>d.code==='VB_RECORD_RECURSION');
const summarize=ds=>ds.map(({source,line,code})=>({source,line,code}));

for(const field of ['Next As Item','Next(2) As Item','Next() As Item','Next As M.Item'])test('unused recursive record is rejected at its field: '+field,()=>{
 const p=project('Private Type Item\n'+field+'\nEnd Type\n'+main('Debug.Print "must not run"'));
 const r=compileProject(p);assert.equal(r.valid,false);assert.deepEqual(summarize(r.diagnostics),[{source:'M',line:2,code:'VB_RECORD_RECURSION'}]);
 assert.equal(r.diagnostics[0].number,1002);assert.match(r.diagnostics[0].message,/Circular user-defined type dependency/);
});
test('mutually recursive records report both participating fields',()=>{
 const p=project('Type A\nChild As B\nEnd Type\nType B\nChild As A\nEnd Type');
 assert.deepEqual(cycles(p).map(d=>d.line),[2,5]);
});
test('qualified cross-module scalar and array dependencies form one cycle',()=>{
 const p=project(main(''),[module('Left','Public Type A\nChildren(1) As Right.B\nEnd Type'),module('Right','Public Type B\nParent As Left.A\nEnd Type')]);
 assert.deepEqual(summarize(cycles(p)),[{source:'Left',line:2,code:'VB_RECORD_RECURSION'},{source:'Right',line:2,code:'VB_RECORD_RECURSION'}]);
});
test('local private records shadow public records during cycle resolution',()=>{
 const p=project('Private Type Item\nChild As Item\nEnd Type',[module('Other','Public Type Item\nValue As Long\nEnd Type')]);
 assert.deepEqual(cycles(p).map(d=>d.source),['M']);
});
test('acyclic consumers and scalar fields do not receive cycle diagnostics',()=>{
 const p=project('Type A\nValue As Long\nChild As B\nEnd Type\nType B\nValue As String\nChild As C\nEnd Type\nType C\nChild As B\nEnd Type');
 assert.deepEqual(cycles(p).map(d=>d.line),[7,10]);
});
test('disconnected self and mutual cycles are all reported deterministically',()=>{
 const p=project('Type A\nFirst As A\nSecond As A\nEnd Type\nType B\nChild As C\nEnd Type\nType C\nChild As B\nEnd Type');
 const expected=cycles(p);assert.deepEqual(expected.map(d=>d.line),[2,3,6,9]);
 for(let i=0;i<5;i++)assert.deepEqual(cycles(p),expected);
});
test('shared acyclic record dependencies are not cycles',()=>{
 const p=project('Type A\nLeft As B\nRight As C\nEnd Type\nType B\nChild As D\nEnd Type\nType C\nChild As D\nEnd Type\nType D\nValue As Long\nEnd Type');
 assert.deepEqual(diagnostics(p),[]);
});
test('Variant and object fields do not imply recursive value layout',()=>{
 const p=project('Type Record\nValue As Variant\nOwner As Object\nLink As Link\nEnd Type',[module('Link','Public Next As Link\nPublic Value As Record','class')]);
 assert.deepEqual(diagnostics(p),[]);
});
test('a project class is not confused with another modules private record',()=>{
 const p=project('Type Record\nValue As Link\nEnd Type',[module('Link','','class'),module('Other','Private Type Link\nChild As Record\nEnd Type')]);
 assert.deepEqual(diagnostics(p),[]);
});
test('inaccessible fields retain visibility diagnostics, not invented cycles',()=>{
 const p=project('Public Type A\nChild As Other.B\nEnd Type',[module('Other','Private Type B\nParent As A\nEnd Type')]);
 const ds=diagnostics(p);assert.equal(ds.length,1);assert.equal(ds[0].code,'VB_RECORD_TYPE');assert.match(ds[0].message,/not accessible/);
});
test('ambiguous fields are not arbitrarily selected to close a cycle',()=>{
 const p=project('Public Type A\nChild As B\nEnd Type',[module('One','Public Type B\nParent As A\nEnd Type'),module('Two','Public Type B\nValue As Long\nEnd Type')]);
 assert.equal(cycles(p).length,0);assert.ok(diagnostics(p).some(d=>/Ambiguous/.test(d.message)));
});
test('conditional compilation includes only the selected record dependencies',()=>{
 const code='Type A\n#If CYCLE Then\nChild As A\n#Else\nValue As Long\n#End If\nEnd Type';
 const p=project(code);p.settings={conditionalConstants:{CYCLE:0}};assert.deepEqual(diagnostics(p),[]);
 p.settings.conditionalConstants.CYCLE=-1;assert.equal(cycles(p).length,1);
});
test('provider edits introduce and repair cycles through cached consumer syntax',()=>{
 const p=project('Public Type A\nChild As Other.B\nEnd Type',[module('Other','Public Type B\nValue As Long\nEnd Type')]),cache=new ProjectDiagnosticCache();
 const check=()=>{const r=cache.check(diagnosticSnapshot(p));assert.deepEqual(r.diagnostics.map(({origin,...d})=>d),diagnostics(p));return r;};
 assert.equal(check().valid,true);assert.equal(check().semanticCacheHit,true);
 p.modules[1].code='Public Type B\nParent As A\nEnd Type';let r=check();assert.equal(r.valid,false);assert.equal(r.stats.compiledModules,1);assert.equal(r.diagnostics.length,2);assert.equal(check().semanticCacheHit,true);
 p.modules[1].code='Public Type B\nValue As Long\nEnd Type';r=check();assert.equal(r.valid,true);assert.equal(r.semanticCacheHit,false);
});
test('field removals and renamed providers cannot retain stale graph edges',()=>{
 const p=project('Type A\nChild As Other.B\nEnd Type',[module('Other','Public Type B\nParent As A\nEnd Type')]),cache=new ProjectDiagnosticCache();
 assert.equal(cache.check(diagnosticSnapshot(p)).valid,false);
 p.modules[1].code='Public Type B\nValue As Long\nEnd Type';assert.equal(cache.check(diagnosticSnapshot(p)).valid,true);
 p.modules[1].name='Renamed';assert.equal(cache.check(diagnosticSnapshot(p)).diagnostics.some(d=>d.code==='VB_RECORD_RECURSION'),false);
});

// Exercise graph structure independently of parsing and compare small graphs
// against a separate transitive-reachability oracle, not another SCC algorithm.
import {RecordTypeIndex} from '../src/language/record-resolution.js';
import {recursiveRecordFields} from '../src/language/record-recursion.js';
const graphIndex=adjacency=>{
 const owner={name:'Graph',kind:'module',types:{},typeScopes:{}};
 adjacency.forEach((targets,i)=>owner.types['T'+i]=targets.map((to,j)=>Object.freeze({name:'F'+j,type:'T'+to,line:i+1,bounds:null})));
 return new RecordTypeIndex(new Map([['graph',owner]]));
};
test('record dependency SCCs agree with an independent reachability oracle',()=>{
 let seed=473;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let sample=0;sample<80;sample++){
  const n=2+random()%31,graph=Array.from({length:n},()=>[]);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(random()%15===0)graph[i].push(j);
  const reachable=graph.map((_,i)=>{const found=new Set(),stack=[i];while(stack.length){for(const to of graph[stack.pop()])if(!found.has(to)){found.add(to);stack.push(to);}}return found;});
  const expected=[];graph.forEach((targets,from)=>targets.forEach((to,j)=>{if(reachable[to].has(from)||to===from)expected.push('T'+from+'.F'+j);}));
  const index=graphIndex(graph),before=JSON.stringify([...index.modules.values()]);
  assert.deepEqual(recursiveRecordFields(index).map(({definition,field})=>definition.name+'.'+field.name),expected);
  assert.equal(JSON.stringify([...index.modules.values()]),before);
 }
});
test('a 25000-record chain avoids JavaScript stack recursion',()=>{
 const graph=Array.from({length:25000},(_,i)=>i===24999?[]:[i+1]);
 assert.deepEqual(recursiveRecordFields(graphIndex(graph)),[]);
});
test('a deep chain entering a 100-record cycle reports only cycle fields',()=>{
 const graph=Array.from({length:25000},(_,i)=>[i===24999?24900:i+1]);
 const result=recursiveRecordFields(graphIndex(graph));assert.equal(result.length,100);assert.equal(result[0].definition.name,'T24900');assert.equal(result.at(-1).definition.name,'T24999');
});
test('empty and scalar-only declaration indexes have no dependency diagnostics',()=>{
 assert.deepEqual(recursiveRecordFields(new RecordTypeIndex(new Map())),[]);
 const owner={name:'M',types:{A:[{name:'Value',type:'Long'}]},kind:'module'};
 assert.deepEqual(recursiveRecordFields(new RecordTypeIndex(new Map([['m',owner]]))),[]);
});
