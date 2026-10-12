import test from 'node:test';
import assert from 'node:assert/strict';
import {registerModalContribution,applyModalContributions} from '../src/ide/modal-contributions.js';
test('modal contributions are title scoped, ordered and removable',()=>{
  const calls=[],off=registerModalContribution('Test options',context=>{calls.push('a');context.buttons[0].extra=true;}),off2=registerModalContribution('Test options',()=>calls.push('b'));
  const context={buttons:[{value:true}]};applyModalContributions('Other',context);assert.deepEqual(calls,[]);
  applyModalContributions('Test options',context);assert.deepEqual(calls,['a','b']);assert.equal(context.buttons[0].extra,true);
  off();off();applyModalContributions('Test options',context);assert.deepEqual(calls,['a','b','b']);off2();applyModalContributions('Test options',context);assert.equal(calls.length,3);
});
test('invalid modal contributor is rejected synchronously',()=>assert.throws(()=>registerModalContribution('Test',null),TypeError));
