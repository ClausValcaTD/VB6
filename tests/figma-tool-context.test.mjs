import test from 'node:test';
import assert from 'node:assert/strict';
import {figmaContext,appendAgentDraft} from '../src/ide/figma/tool-context.js';
const project={name:'Public name',settings:{password:'secret'},assets:{key:'secret'}};
const module={name:'Form1',form:{name:'Form1',properties:{ClientWidth:9000,ClientHeight:6000}}};
test('form context includes layout identities, never arbitrary text, assets or credentials',()=>{
 const text=figmaContext({project,module,view:'form',controls:[{id:'one',name:'Text1',type:'TextBox',properties:{Left:15,Text:'secret',PasswordChar:'*',Tag:'secret',Width:1800}}]});
 assert.match(text,/Text1/);assert.match(text,/1800/);assert.doesNotMatch(text,/secret|Password|assets|settings/);
});
test('source context is selection-only, bounded and never implies authority',()=>{
 const text=figmaContext({project,module,view:'code',source:'abcdef',selection:{start:2,end:4}});assert.match(text,/'?source"?: "cd"/);assert.doesNotMatch(text,/abcdef/);
 const long=figmaContext({project,module,view:'code',source:'x'.repeat(20000),selection:{start:0,end:20000}});assert.match(long,/"sourceTruncated": true/);assert.ok(long.length<13000);
});
test('append preserves existing draft and rejects oversized content without mutation',()=>{
 assert.equal(appendAgentDraft('Keep my task','selection'),'Keep my task\n\nselection');assert.equal(appendAgentDraft('','context'),'context');assert.throws(()=>appendAgentDraft('123','456',5));
});
