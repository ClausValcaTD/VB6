import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCall} from '../src/language/expression.js';
import {logicalLines} from '../src/language/lexer.js';
import {VirtualMachine} from '../src/runtime/vm.js';
const withMember=name=>({kind:'member',object:{kind:'with'},name});
for(const [source,name]of [['Bump .Value','Bump'],['[Bump] .[Value]','Bump'],['Bump\t.Value','Bump']])test('Whitespace starts a With argument: '+source,()=>{
 const call=parseCall(source);assert.deepEqual(call.callee,{kind:'id',name});assert.deepEqual(call.args,[withMember('Value')]);
});
for(const prefix of ['object.Bump','.Bump'])test('A qualified call can take a With first argument: '+prefix,()=>{
 const call=parseCall(prefix+' .Value, .Other');assert.equal(call.callee.name,'Bump');assert.equal(call.args.length,2);assert.deepEqual(call.args,[withMember('Value'),withMember('Other')]);
});
test('No whitespace keeps the dot inside the procedure name',()=>{
 assert.deepEqual(parseCall('Bump.Value'),{kind:'call',callee:{kind:'member',object:{kind:'id',name:'Bump'},name:'Value'},args:[]});
});
test('Named and omitted arguments retain their source forms',()=>{
 const call=parseCall('Bump .Value, , last:=.Other');assert.deepEqual(call.args.map(a=>a.kind),['member','missing','named']);assert.deepEqual(call.args[2].expr,withMember('Other'));
});
test('Explicit Call preserves a ByRef With argument; implicit parentheses force a temporary',()=>{
 assert.deepEqual(parseCall('Bump(.Value)',{explicit:true}).args,[withMember('Value')]);
 assert.deepEqual(parseCall('Bump(.Value)').args,[{kind:'group',expr:withMember('Value')}]);
});
test('Logical-line API preserves default text and optional continuation offsets',()=>{
 const source='again: object _\n .Bump .Value: Bump .Other';
 const plain=logicalLines(source),retained=logicalLines(source,{preserveContinuations:true});
 assert.deepEqual(retained.map(({continuations,...entry})=>entry),plain);
 const call=parseCall(retained[1].text,{continuations:retained[1].continuations});
 assert.equal(call.callee.name,'Bump');assert.equal(call.callee.object.name,'object');assert.deepEqual(call.args,[withMember('Value')]);
 assert.equal(retained[2].continuations,undefined);assert.deepEqual(parseCall(retained[2].text).args,[withMember('Other')]);
});
async function run(body,{classCode=null}={}){
 const output=[],modules=[{name:'M',kind:'module',code:`Private Type R\nValue As Long\nEnd Type\nSub Bump(ByRef value As Long)\nvalue = value + 1\nEnd Sub\nSub Main()\nDim r As R, c As New C\nWith r\n${body}\nDebug.Print .Value\nEnd With\nEnd Sub`}];
 modules.push({name:'C',kind:'class',code:classCode||'Public Sub Bump(ByRef value As Long)\nvalue = value + 1\nEnd Sub'});
 const vm=new VirtualMachine({name:'WithCalls',startup:'Sub Main',modules},{print:s=>output.push(s)});
 try{assert.deepEqual(vm.program.diagnostics,[]);await vm.start();assert.equal(vm.lastError,null);return output;}finally{vm.stop();}
}
test('Source implicit, explicit, named and grouped calls retain ByRef semantics',async()=>{
 assert.deepEqual(await run('Bump .Value\nCall Bump(.Value)\nBump value:=.Value\nBump(.Value)\nc.Bump .Value'),['4']);
});
test('Continued callee plus With argument executes once and stays ByRef',async()=>{
 assert.deepEqual(await run('c _\n .Bump .Value\n100 c _\n .Bump .Value\nagain: c _\n .Bump .Value'),['3']);
});
test('Continued qualified calls retain offsets through inline If and colon statements',async()=>{
 assert.deepEqual(await run('If True Then c _\n .Bump .Value: Bump .Value Else Bump .Value\nBump .Value: c _\n .Bump .Value'),['4']);
});
test('A continuation inside an argument does not reclassify the callee',async()=>{
 assert.deepEqual(await run('Bump . _\n Value\nBump value:= _\n .Value'),['2']);
});
test('Continuation metadata remains correct after conditional preprocessing',async()=>{
 assert.deepEqual(await run('#Const ENABLED = True\n#If ENABLED Then\nc _\n .Bump .Value\n#Else\nBump .Value\n#End If'),['1']);
});
