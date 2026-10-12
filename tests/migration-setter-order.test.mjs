import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVbNetProject} from '../src/migration/index.js';
import {compileProject} from '../src/language/compiler.js';
import {VirtualMachine} from '../src/runtime/vm.js';
import {SETTER_ORDER_FIXTURE,SETTER_ORDER_EXPECTED} from './migration-setter-order-fixtures.mjs';

for(const codeStyle of ['native','compatibility'])test(codeStyle+': reordered setters retain write semantics and capture indexes before RHS',()=>{
 const r=convertVbNetProject(SETTER_ORDER_FIXTURE,{platform:'AnyCPU',codeStyle});
 assert.ok(r.success,JSON.stringify(r.diagnostics));
 const source=r.files['Application/Module1.vb'];
 assert.match(source,/__vbCallOrder\d+\]?\(\[?GetCell\]?\(\), \[?Mark\]?\(2S\), \[?Mark\]?\(1S\), \[?Mark\]?\(3S\)\)/);
 assert.match(source,/__vbReceiver.\[?Item\]?\(__vbArg0, __vbArg1\) = __vbArg2/);
 assert.match(source,/ByRef __vbArg1 As Integer, ByRef __vbArg0 As Integer, ByVal __vbArg2 As Integer/);
 assert.match(source,/__vbReceiver.\[?__vbLet_Mutable\]?\(__vbArg0, __vbArg1, __vbArg2\)/);
 assert.match(source,/__vbReceiver.\[?__vbLet_Link\]?\(__vbArg0, __vbArg1, __vbArg2\)/);
 assert.match(source,/__vbReceiver.\[?__vbSet_Link\]?\(__vbArg0, __vbArg1, __vbArg2\)/);
 assert.doesNotMatch(source,/__vbCallOrder\d+\]?\([^\n]+\) = /);
 assert.equal((source.match(/Private Sub __vbCallOrder/g)||[]).length,4);
 assert.equal((source.match(/Private Function __vbCallOrder/g)||[]).length,0);
});

test('source VM executes the named setter fixture with the SDK conformance expectations',async()=>{
 const compiled=compileProject(SETTER_ORDER_FIXTURE);
 assert.deepEqual(compiled.diagnostics,[]);
 const output=[],vm=new VirtualMachine(compiled,{print:s=>output.push(s)});
 await vm.start();
 assert.deepEqual(output,SETTER_ORDER_EXPECTED);
 assert.equal(vm.lastError.number,5); // The fixture deliberately catches Err.Raise 5.
});
