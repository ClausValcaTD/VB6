import test from 'node:test';import assert from 'node:assert/strict';
import {gridDataPackMachine} from './support/native-grid-data-pack-machine.mjs';
for(const optimization of [0,1,2]){
 test(`bulk Recordset snapshot packs field-first arrays into one owned row-major String vector O${optimization}`,()=>{
  const h=gridDataPackMachine(optimization),headers=h.create(8,[{lower:-3,count:2}],['ID','A\0Ω']),body=h.create(12,[{lower:4,count:2},{lower:-2,count:3}],[
   {type:3,value:1},{value:'Zażółć Ω 中'},{type:3,value:2},{type:1},{type:11,value:-1},{type:5,value:12.25}]);
  assert.equal(h.pack(headers,body,2,3),0);assert.deepEqual(h.result(),['ID','A\0Ω','1','Zażółć Ω 中','2','','True','12.25']);
  const access=h.vm.calls.filter(c=>c.name?.endsWith('!SafeArrayAccessData'));assert.equal(access.length,3,'one lock per input/output array, not per cell');
  assert.equal(h.vm.calls.filter(c=>c.name?.endsWith('!SafeArrayUnaccessData')).length,3);
  for(const a of h.arrays.values())assert.equal(h.m.read(a.handle+8),0);
  h.release();h.destroy(headers);h.destroy(body);assert.equal(h.arrays.size,0);
 });
 test(`empty Recordset still publishes its header and never reads an absent body O${optimization}`,()=>{
  const h=gridDataPackMachine(optimization),heads=h.create(8,[{lower:0,count:2}],['One','Two']);
  assert.equal(h.pack(heads,0,2,0),0);assert.deepEqual(h.result(),['One','Two']);h.release();h.destroy(heads);
 });
 test(`conversion failure cannot publish a partial row or leak converted strings/locks O${optimization}`,()=>{
  const h=gridDataPackMachine(optimization),heads=h.create(8,[{lower:0,count:2}],['One','Two']),body=h.create(12,[{lower:0,count:2},{lower:0,count:1}],[{value:'converted'},{type:10,value:13}]);
  const before=h.owners();assert.equal(h.pack(heads,body,2,1),0x80020005);assert.equal(h.m.read(h.out),0);assert.equal(h.owners(),before);
  for(const a of h.arrays.values())assert.equal(h.m.read(a.handle+8),0);h.destroy(heads);h.destroy(body);
 });
 for(const [api,nth]of [['SafeArrayCreateVector',1],['SafeArrayAccessData',1],['SafeArrayAccessData',2],['SafeArrayAccessData',3],['SysAllocStringLen',1],['SysAllocStringLen',2],['VariantChangeTypeEx',2],['SafeArrayGetVartype',1],['SafeArrayGetUBound',3]])test(`bulk snapshot rolls back injected ${api} #${nth} O${optimization}`,()=>{
  const h=gridDataPackMachine(optimization),heads=h.create(8,[{lower:0,count:2}],['One','Two']),body=h.create(12,[{lower:0,count:2},{lower:0,count:1}],[{value:'before'},{value:'after'}]),before=h.owners();
  h.failures.set(api,nth);assert.equal(h.pack(heads,body,2,1),0x8007000e);assert.equal(h.m.read(h.out),0);assert.equal(h.owners(),before);
  for(const a of h.arrays.values())assert.equal(h.m.read(a.handle+8),0);h.destroy(heads);h.destroy(body);
 });
 test(`bulk snapshot rejects rank, extent and configured budget mismatches before allocation O${optimization}`,()=>{
  const h=gridDataPackMachine(optimization),heads=h.create(8,[{lower:0,count:2}],['One','Two']),body=h.create(12,[{lower:0,count:1},{lower:0,count:2}],[{value:'a'},{value:'b'}]),before=h.owners();
  assert.equal(h.pack(heads,body,2,1),0x80070057);assert.equal(h.pack(heads,body,10000,100000),0x8007000e);assert.equal(h.owners(),before);assert.equal(h.m.read(h.out),0);
  h.destroy(heads);h.destroy(body);
 });
}
