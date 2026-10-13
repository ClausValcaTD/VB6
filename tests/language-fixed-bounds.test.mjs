import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProject,validateCompiledModules} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';
import {ProjectDiagnosticCache,diagnosticSnapshot} from '../src/language/diagnostics.js';
import {run,main,invalid,module,project} from './helpers/compiler-runtime.mjs';

for(const [declaration,pattern] of [
 ['Dim a(n) As Long',/Constant expression required/],
 ['Static a(n) As Long',/Constant expression required/],
 ['Dim a(UnknownSize) As Long',/not defined/],
 ['Dim a(3 To 1) As Long',/lower bound/],
 ['Dim a(2147483648#) As Byte',/Overflow/],
 ['Dim a(-2147483649# To 0) As Byte',/Overflow/],
 ['Dim a(1 / 0) As Byte',/Division by zero/],
 ['Dim a("not a number") As Byte',/Type mismatch/],
 ['Dim a(Null) As Byte',/Null/],
 ['Dim a(SideEffect()) As Byte',/cannot invoke/]
])test('fixed declaration rejects invalid bounds: '+declaration,()=>{
 const result=invalid(main('Dim n As Long\n'+declaration),pattern);
 assert.equal(result.diagnostics[0].source,'M');assert.equal(result.diagnostics[0].line,4);
});
for(const [scope,code,line] of [
 ['module','Private n As Long\nPrivate a(n) As Long',2],
 ['record','Type R\na(UnknownSize) As Long\nEnd Type',2],
 ['parameter','Sub Work(ByVal n As Long)\nDim a(n) As Long\nEnd Sub',2]
])test('fixed-bound diagnostics use declaration scope: '+scope,()=>{
 const result=invalid(code,/Constant|not defined/);assert.equal(result.diagnostics[0].line,line);
});

test('fixed dimensions use Long half-even coercion and preserve syntax',async()=>{
 const code=main('Dim a(-2.5 To "3.5", Empty To True + 3) As Long\nDebug.Print LBound(a), UBound(a), UBound(a, 2)');
 const c=compileProject(project(code));assert.deepEqual(c.diagnostics,[]);
 const d=c.modules.get('m').procedures.get('main').code.find(i=>i.op==='dim').decls[0];
 assert.deepEqual(d.boundValues,[[-2,4],[0,2]]);assert.equal(d.bounds[0][0].kind,'unary');
 assert.ok(Object.isFrozen(d.boundValues)&&Object.isFrozen(d.boundValues[0]));
 assert.deepEqual((await run(code)).output,['-2 4 2']);
});
test('Long extreme singleton dimensions bind without allocating a huge array',async()=>{
 assert.deepEqual((await run(main('Dim a(-2147483648# To -2147483648#) As Long, b(2147483647 To 2147483647) As Byte\nDebug.Print LBound(a), UBound(b)'))).output,['-2147483648 2147483647']);
});
test('fixed-array compilation does not allocate browser backing storage',()=>{
 const c=compileProject(project(main('Dim a(2147483647) As Byte')));assert.deepEqual(c.diagnostics,[]);
 assert.deepEqual(c.modules.get('m').procedures.get('main').code[0].decls[0].boundValues,[[0,2147483647]]);
});
test('forward local constants are resolved before fixed-array declarations execute',async()=>{
 assert.deepEqual((await run(main('Dim a(1 To Size) As Long\nConst Size = Later + 1\nConst Later = 3\nDebug.Print UBound(a)'))).output,['4']);
});
test('local variables shadow module constants in fixed bounds',()=>invalid('Const Size = 5\nSub Main()\nDim Size As Long\nDim a(Size) As Long\nEnd Sub',/Constant expression required/));
test('qualified fixed bounds respect module privacy and public ambiguity',()=>{
 invalid(main('Dim a(Other.Hidden)'),/not accessible/,[module('Other','Private Const Hidden = 3')]);
 invalid(main('Dim a(Size)'),/Ambiguous/,[module('A','Public Const Size = 3'),module('B','Public Const Size = 4')]);
});
test('imported UDT bounds use declaring module constants and Option Base',async()=>{
 const result=await run('Option Base 0\nPrivate Const Size = 20\nSub Main()\nConst Size = 30\nDim r As RecordType\nDebug.Print LBound(r.Values), UBound(r.Values)\nEnd Sub',[module('Types','Option Base 1\nPrivate Const Size = 4\nPublic Type RecordType\nValues(Size) As Long\nEnd Type')]);
 assert.deepEqual(result.output,['1 4']);
});
test('nested UDT array members retain each declaring module bound context',async()=>{
 const result=await run(main('Dim r As OuterRecord\nDebug.Print LBound(r.Nested.Values), UBound(r.Nested.Values)\nDebug.Print UBound(r.Items), UBound(r.Items(0).Values)'),[
 module('Outer','Private Const Size = 2\nType OuterRecord\nNested As InnerRecord\nItems(0 To Size) As InnerRecord\nEnd Type'),
 module('Inner','Option Base 1\nPrivate Const Size = 3\nType InnerRecord\nValues(Size) As Long\nEnd Type')]);
 assert.deepEqual(result.output,['1 3','2 3']);
});
test('ReDim expressions still evaluate once at runtime and may use variables',async()=>{
 const result=await run('Dim calls As Long\nFunction Size() As Long\ncalls = calls + 1\nSize = 3\nEnd Function\nSub Main()\nDim n As Long, a() As Long\nn = 1\nReDim a(n To Size())\nDebug.Print LBound(a), UBound(a), calls\nEnd Sub');assert.deepEqual(result.output,['1 3 1']);
});
test('fixed bound evaluation does not execute any user code during compilation',()=>{
 const p=project('Dim a(GetSize()) As Byte\nFunction GetSize() As Long\nErr.Raise 5\nEnd Function');
 const c=compileProject(p);assert.equal(c.valid,false);assert.match(c.diagnostics[0].message,/cannot invoke/);
});
test('each invocation and Static arrays preserve their existing storage lifetimes',async()=>{
 assert.deepEqual((await run('Sub Main()\nWork\nWork\nEnd Sub\nSub Work()\nConst Size = 2\nDim a(Size) As Long\nStatic b(Size) As Long\na(0) = a(0) + 1\nb(0) = b(0) + 1\nDebug.Print a(0), b(0)\nEnd Sub')).output,['1 1','1 2']);
});
test('background rebinding refreshes unchanged array declarations and clears failed metadata',()=>{
 const p=project('Dim a(Size) As Long\nSub Main()\nEnd Sub',[module('Other','Public Const Size = 2')]),cache=new ProjectDiagnosticCache();
 assert.equal(cache.check(diagnosticSnapshot(p)).valid,true);
 const m=[...cache.entries.values()].find(e=>e.name==='M').compiled,d=m.declarations[0],syntax=d.bounds;
 assert.deepEqual(d.boundValues,[[0,2]]);
 p.modules[1].code='Public Const Size = 5';assert.equal(cache.check(diagnosticSnapshot(p)).valid,true);
 assert.deepEqual(d.boundValues,[[0,5]]);assert.equal(d.bounds,syntax);
 p.modules[1].code='Public Const Size = -1';assert.equal(cache.check(diagnosticSnapshot(p)).valid,false);assert.equal(d.boundValues,undefined);
 p.modules[1].code='Public Const Size = 6';assert.equal(cache.check(diagnosticSnapshot(p)).valid,true);assert.deepEqual(d.boundValues,[[0,6]]);
});
test('structured-cloned compiled syntax can be rebound after dependency changes',()=>{
 const c=compileProject(project('Dim a(Size) As Long',[module('Other','Public Const Size = 2')]));
 const modules=structuredClone(c.modules);modules.get('other').declarations[0].initial.value=4;
 assert.deepEqual(validateCompiledModules(modules),[]);assert.deepEqual(modules.get('m').declarations[0].boundValues,[[0,4]]);
});
test('runtime consumes bound dimensions without reevaluating source expressions',async()=>{
 const c=compileProject(project(main('Dim a(2) As Long\nDebug.Print UBound(a)'))),output=[];
 const vm=new VirtualMachine(c,{print:s=>output.push(s)});vm.evalBounds=()=>{throw new Error('fixed source expression re-evaluated');};
 await vm.start();assert.deepEqual(output,['2']);
});
test('fixed array diagnostics agree between Check Project and the background cache',()=>{
 const p=project('Option Base 1\nDim a(0) As Byte',[module('Types','Type R\na(NoSuchConstant) As Long\nEnd Type')]);
 const c=compileProject(p),cached=new ProjectDiagnosticCache().check(diagnosticSnapshot(p));
 assert.deepEqual(cached.diagnostics.map(({origin,...d})=>d),c.diagnostics);
});

test('repeated numeric literals retain subtype and authored overflow checks',()=>{
 const p=project('Const A = 32768&\nConst B = 32768#\nConst C = 32768%');
 const c=compileProject(p);assert.equal(c.valid,false);assert.equal(c.diagnostics[0].number,6);
 assert.equal(c.modules.get('m').constantScalars.get('a').type,'long');
 assert.equal(c.modules.get('m').constantScalars.get('b').type,'double');
});
test('bounded literal interning never prevents evaluation after its capacity',()=>{
 const source=Array.from({length:300},(_,i)=>`Const C${i} = ${i}`).join('\n')+'\nDim a(259 To 300) As Byte';
 const c=compileProject(project(source));assert.deepEqual(c.diagnostics,[]);
 assert.equal(c.modules.get('m').constantBindings.get('c299'),299);
 assert.deepEqual(c.modules.get('m').declarations.at(-1).boundValues,[[259,300]]);
});
test('edited same-type numeric literal values never reuse prior-pass values',()=>{
 const c=compileProject(project('Const Size = 4\nDim a(Size) As Long'));
 c.modules.get('m').declarations[0].initial.value=8;
 assert.deepEqual(validateCompiledModules(c.modules),[]);
 assert.deepEqual(c.modules.get('m').declarations[1].boundValues,[[0,8]]);
});
