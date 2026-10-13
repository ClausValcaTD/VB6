import test from 'node:test';
import assert from 'node:assert/strict';
import {aotSegmentSize,planAOTCapacity,AOT_IMAGE_LIMIT} from '../packages/macos-native/src/aot-capacity.js';
test('project-sized AOT capacity no longer imposes a 2 MiB section ceiling',()=>{
  const small=planAOTCapacity(4,20,1000000),large=planAOTCapacity(3*1024*1024,3*1024*1024,1000000);
  assert.equal(small.codeCapacity,16384);assert.equal(small.metadataCapacity,16384);
  assert.equal(large.codeCapacity,3*1024*1024);assert.equal(large.metadataCapacity,3*1024*1024+16384);
  assert.ok(Object.isFrozen(large));assert.ok(large.unsignedBytes+large.signatureReserve<AOT_IMAGE_LIMIT);
});
test('metadata headers count toward allocation and independent segment alignment',()=>{
  assert.equal(planAOTCapacity(16384,16368,100).metadataCapacity,16384);
  assert.equal(planAOTCapacity(16384,16369,100).metadataCapacity,32768);
  assert.equal(aotSegmentSize(0),16384);assert.equal(aotSegmentSize(16385),32768);
});
for(const [code,metadata,fixed] of [[0,1,1],[5,1,1],[Infinity,1,1],[4,0,1],[4,8388609,1],[4,1,-1],[4,1,NaN],[AOT_IMAGE_LIMIT,1,1],[4,1,AOT_IMAGE_LIMIT]])
 test(`invalid capacity ${code}/${metadata}/${fixed} fails before allocation`,()=>assert.throws(()=>planAOTCapacity(code,metadata,fixed),RangeError));
