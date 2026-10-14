import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGate} from '../tools/ci/gate.mjs';
test('CI gate requires the complete successful graph regardless of key order', () => {
  assert.equal(validateGate({browser:{result:'success'},node:{result:'success'}},['node','browser']),2);
});
for (const result of ['failure','cancelled','skipped','neutral','timed_out',null,undefined]) {
  test(`CI gate rejects ${result}`, () => assert.throws(()=>validateGate({node:{result}},['node']),/did not pass/));
}
test('CI gate rejects missing, extra, empty and duplicate dependencies', () => {
  for(const [needs,expected] of [[{},['node']],[{node:{result:'success'}},['browser']],
    [{node:{result:'success'},extra:{result:'success'}},['node']],[{},[]],[{},['node','node']],
    [null,['node']],[[],['node']]]) assert.throws(()=>validateGate(needs,expected));
});
