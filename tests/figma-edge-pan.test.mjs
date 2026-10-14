import test from 'node:test';
import assert from 'node:assert/strict';
import {assetEdgePan} from '../src/ide/figma/edge-pan.js';

test('crossing a canvas edge does not move the drop target before dwell',()=>{
 let state=assetEdgePan(null,1,0,0);
 for(const time of [16,32,48,64,80,96,112,128,144,149]){
   state=assetEdgePan(state,1,0,time);assert.equal(state.dx,0);assert.equal(state.dy,0);
 }
 assert.equal(assetEdgePan(state,0,0,150),null);
});
test('held edge pans at bounded frame speed, without a delayed-frame jump',()=>{
 let state=assetEdgePan(null,-1,.5,0);state=assetEdgePan(state,-1,.5,160);
 assert.equal(state.dx,-14.4);assert.equal(state.dy,7.2);
 state=assetEdgePan(state,-1,.5,10160);assert.equal(state.dx,-14.4);assert.equal(state.dy,7.2);
});
test('changing edges or restarting time requires a fresh dwell',()=>{
 let state=assetEdgePan(null,1,0,0);state=assetEdgePan(state,1,0,200);assert.ok(state.dx>0);
 const opposite=assetEdgePan(state,-1,0,216);assert.equal(opposite.dx,0);assert.equal(opposite.since,216);
 const reset=assetEdgePan(state,1,0,0);assert.equal(reset.dx,0);assert.equal(reset.since,0);
});
test('nonfinite input disarms navigation and edge strengths are clamped',()=>{
 assert.equal(assetEdgePan(null,NaN,0,1),null);assert.equal(assetEdgePan(null,1,0,Infinity),null);
 let state=assetEdgePan(null,100,-100,0);state=assetEdgePan(state,100,-100,160);
 assert.equal(state.dx,14.4);assert.equal(state.dy,-14.4);
});
