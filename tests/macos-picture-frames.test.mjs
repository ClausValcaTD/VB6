import test from 'node:test';
import assert from 'node:assert/strict';
import {multiPictureBytes} from '../packages/macos-native/tests/picture-frames.mjs';
import {resolveMacOSPicture,prepareMacOSResources} from '../packages/macos-native/src/resources.js';
import {fromBase64,toBase64} from '../src/project/frx.js';
import {normalizeProject} from '../src/project/model.js';

for (const cursor of [false,true]) test('multi-resolution '+(cursor?'cursor':'icon')+' stays lossless in the shared planner and catalog',()=>{
  const bytes=multiPictureBytes(cursor),uri='data:image/'+(cursor?'x-cursor':'x-icon')+';base64,'+toBase64(bytes);
  const project=normalizeProject({schema:1,name:'PictureFrames',startup:'Form1',modules:[{name:'Form1',kind:'form',code:'',form:{name:'Form1',type:'Form',properties:{[cursor?'MouseIcon':'Icon']:uri},controls:[]}}]});
  const resolved=resolveMacOSPicture(project,uri,project.modules[0]);
  assert.deepEqual(resolved.bytes,bytes); assert.equal(resolved.images.length,4);
  assert.deepEqual(resolved.images.map(image=>image.width),[16,32,64,256]);
  const result=prepareMacOSResources(project),view=new DataView(result.bytes.buffer);
  assert.equal(result.report.pictures,1);
  assert.equal(view.getUint32(16,true),1);
  const offset=view.getUint32(56,true),length=view.getUint32(60,true);
  assert.deepEqual(result.bytes.subarray(offset,offset+length),bytes);
  assert.deepEqual(fromBase64(uri.slice(uri.indexOf(',')+1)),bytes);
});

test('invalid hotspot in a nonselected cursor frame is rejected',()=>{
  const bytes=multiPictureBytes(true),view=new DataView(bytes.buffer);view.setUint16(6+3*16+4,256,true);
  assert.throws(()=>resolveMacOSPicture({},'data:image/x-cursor;base64,'+toBase64(bytes),{name:'Form1'}),/hotspot/i);
});
