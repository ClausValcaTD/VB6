import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {readZip, writeZip} from '../src/project/zip.js';

// Native zlib is an independent compression oracle. Preserve the ZIP writer's
// filename/CRC, replacing only the payload and its method/size/offset fields.
function deflatedZip(data, compressed = deflateRawSync(data)) {
  const stored = writeZip({'payload.bin':data}), before = new DataView(stored.buffer);
  const start = 30 + before.getUint16(26,true) + before.getUint16(28,true);
  const central = before.getUint32(stored.length-6,true), directory = start + compressed.length;
  const bytes = new Uint8Array(directory + stored.length - central), view = new DataView(bytes.buffer);
  bytes.set(stored.subarray(0,start)); bytes.set(compressed,start); bytes.set(stored.subarray(central),directory);
  view.setUint16(8,8,true); view.setUint32(18,compressed.length,true);
  view.setUint16(directory+10,8,true); view.setUint32(directory+20,compressed.length,true);
  view.setUint32(bytes.length-6,directory,true);
  return bytes;
}
function payload(size) {
  const bytes = new Uint8Array(size); let state = 0x31415926;
  for(let i=0;i<size;i++){state^=state<<13;state^=state>>>17;state^=state<<5;bytes[i]=state&255;}
  return bytes;
}

test('DEFLATE is memory-only even when Blob reads and network are unavailable', async t => {
  const data = payload(256*1024+17), zip = deflatedZip(data);
  t.mock.method(globalThis,'Blob',function(){throw new Error('Blob I/O unavailable offline');});
  t.mock.method(globalThis,'fetch',function(){throw new Error('Network unavailable offline');});
  const framed = new Uint8Array(zip.length+16); framed.set(zip,7);
  const files = await readZip(new DataView(framed.buffer,7,zip.length));
  assert.deepEqual(files.get('payload.bin'),data);
});

test('compressed input is supplied in bounded pulls to the native decompressor', async t => {
  const Original = globalThis.DecompressionStream, lengths = [];
  t.mock.method(globalThis,'DecompressionStream',class {
    constructor(format) {
      const native = new Original(format), input = new TransformStream({transform(chunk,controller){lengths.push(chunk.byteLength);controller.enqueue(chunk);}});
      return {writable:input.writable,readable:input.readable.pipeThrough(native)};
    }
  });
  const data = payload(256*1024+17), compressed = deflateRawSync(data);
  assert.deepEqual((await readZip(deflatedZip(data,compressed))).get('payload.bin'),data);
  assert.ok(lengths.length>1); assert.ok(lengths.every(n=>n>0&&n<=65536));
  assert.equal(lengths.reduce((sum,n)=>sum+n,0),compressed.length);
});

test('an empty DEFLATE entry finishes without an empty input chunk', async () => {
  assert.deepEqual((await readZip(deflatedZip(new Uint8Array()))).get('payload.bin'),new Uint8Array());
});

test('a dishonest expanded length is rejected while streaming, not after allocation', async () => {
  const zip = deflatedZip(new Uint8Array(1024*1024)), view = new DataView(zip.buffer), central = view.getUint32(zip.length-6,true);
  view.setUint32(22,8,true); view.setUint32(central+24,8,true);
  await assert.rejects(readZip(zip),/ZIP expansion exceeds declared size/);
});

test('memory-only DEFLATE retains independent checksum validation', async () => {
  const zip = deflatedZip(payload(1024)), view = new DataView(zip.buffer), central = view.getUint32(zip.length-6,true);
  view.setUint32(14,0,true); view.setUint32(central+16,0,true);
  await assert.rejects(readZip(zip),/ZIP checksum mismatch/);
});

for(const kind of ['truncated','invalid block'])test('memory-only DEFLATE rejects '+kind,async()=>{
  const data = payload(1024), good = deflateRawSync(data);
  const compressed = kind==='truncated'?good.subarray(0,good.length-1):Uint8Array.of(7);
  await assert.rejects(readZip(deflatedZip(data,compressed)));
});
