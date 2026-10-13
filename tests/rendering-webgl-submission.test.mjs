import test from 'node:test';
import assert from 'node:assert/strict';
import {WebGLPainter} from '../src/rendering/webgl2.js';
import {PaintScene} from '../src/rendering/scene.js';

function fixture() {
  const calls=[];
  const gl={
    NO_ERROR:0, isContextLost:()=>false, getError:()=>0,
    viewport(){}, disable(){}, enable(){}, clearColor(){},
    clear(){calls.push('clear');}, useProgram(){}, uniform4f(){},
    bindVertexArray(){}, bindBuffer(){}, bufferData(){},
    bufferSubData(){calls.push('upload');}, blendFunc(){},
    bindTexture(){}, vertexAttribPointer(){},
    drawArraysInstanced(){calls.push('draw');},
    flush(){calls.push('flush');},
    finish(){assert.fail('Presentation must not block for GPU completion');},
    readPixels(){assert.fail('Presentation must not read back GPU pixels');}
  };
  const painter=Object.assign(Object.create(WebGLPainter.prototype),{
    gl,canvas:{width:0,height:0},maxTextureSize:8192,textures:new Map(),
    stats:{frames:0,drawCalls:0,uploadedBytes:0,bufferAllocations:0,geometryPacks:0,instanceUploads:0}
  });
  return {painter,gl,calls};
}
function scene(color=[1,1,1,1]) {
  const s=new PaintScene(100,80);
  s.add([0,0,100,80],color);
  s.native([2,2,8,8],s.clip);
  s.add([20,20,10,10],color);
  return s.seal();
}
test('WebGL demand frames flush once after all ordered batches',()=>{
  const {painter,calls}=fixture();painter.render(scene());
  assert.deepEqual(calls,['clear','upload','draw','draw','draw','flush']);
  assert.equal(painter.stats.frames,1);assert.equal(painter.stats.flushes,1);
});
test('WebGL retained geometry reuse still submits a requested frame without reuploading',()=>{
  const {painter,calls}=fixture(),s=scene();painter.render(s);calls.length=0;painter.render(s);
  assert.deepEqual(calls,['clear','draw','draw','draw','flush']);
  assert.equal(painter.stats.instanceUploads,1);assert.equal(painter.stats.flushes,2);
});
test('WebGL empty frames flush the clear even when there are no batches',()=>{
  const {painter,calls}=fixture();painter.render(new PaintScene(100,80).seal());
  assert.deepEqual(calls,['clear','flush']);assert.equal(painter.stats.drawCalls,0);
});
test('WebGL workspace color changes upload new colors before flushing',()=>{
  const {painter,calls}=fixture();painter.render(scene());calls.length=0;
  painter.render(scene([44/255,44/255,44/255,1]));
  assert.deepEqual(calls,['clear','upload','draw','draw','draw','flush']);
  assert.ok(Math.abs(painter.data[8]-44/255)<1e-7);assert.equal(painter.stats.instanceUploads,2);
});
test('WebGL lost or disposed contexts never flush or count a completed frame',()=>{
  for(const mode of ['disposed','lost']){
    const {painter,gl,calls}=fixture();if(mode==='disposed')painter.disposed=true;else gl.isContextLost=()=>true;
    assert.throws(()=>painter.render(scene()),/context lost/);assert.deepEqual(calls,[]);assert.equal(painter.stats.frames,0);
  }
});
test('WebGL submission failures propagate to the renderer without claiming a completed frame',()=>{
  const {painter,gl}=fixture();gl.flush=()=>{throw new Error('submission failed');};
  assert.throws(()=>painter.render(scene()),/submission failed/);assert.equal(painter.stats.frames,0);
});
