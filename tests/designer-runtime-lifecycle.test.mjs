import test from 'node:test';
import assert from 'node:assert/strict';
import {createControl} from '../src/project/model.js';
import {resolveRuntimeParent, validateRuntimeContainer, runtimeRemovalPlan} from '../src/controls/container-lifecycle.js';
function view(type,name,id,parent=null,index=undefined,dynamic=true) {
  const model=createControl(type,name);model.id=id;model.parent=parent?.model.name??null;model.nativeParentId=parent?.model.id??null;
  if(index!==undefined)model.properties.Index=index;
  return {type,model,dynamic,disposed:false};
}
test('runtime parents distinguish two elements with the same name including index zero',()=>{
  const a=view('Frame','Frame1','a',null,0),b=view('Frame','Frame1','b',null,1),c=view('TextBox','Text1','c',b),form={controls:[a,b,c]};
  assert.equal(resolveRuntimeParent(form,c.model),b);c.model.nativeParentId=a.model.id;assert.equal(resolveRuntimeParent(form,c.model),a);
  c.model.nativeParentId=null;assert.throws(()=>resolveRuntimeParent(form,c.model),e=>e.number===380);
});
test('name-only unique parents remain supported but missing and noncontainer parents fail',()=>{
  const parent=view('Frame','Container','p'),child=view('TextBox','Text1','c',parent),form={controls:[parent,child]};
  child.model.nativeParentId=null;child.model.parent='cOnTaInEr';assert.equal(resolveRuntimeParent(form,child.model),parent);
  parent.type='TextBox';assert.throws(()=>resolveRuntimeParent(form,child.model),e=>e.number===380);
  assert.throws(()=>resolveRuntimeParent({controls:[]},child.model),e=>e.number===380);
  child.model.parent=null;assert.equal(resolveRuntimeParent(form,child.model),null);
});
test('container validation rejects foreign, disposed, self and descendant containers',()=>{
  const a=view('Frame','A','a'),b=view('Frame','B','b',a),form={controls:[a,b]},before=JSON.stringify(form);
  assert.equal(validateRuntimeContainer(form,b,a),a);
  assert.throws(()=>validateRuntimeContainer(form,a,a),e=>e.number===380);
  assert.throws(()=>validateRuntimeContainer(form,a,b),e=>e.number===380);
  assert.throws(()=>validateRuntimeContainer(form,a,view('Frame','Foreign','foreign')),e=>e.number===380);
  assert.equal(JSON.stringify(form),before);b.disposed=true;assert.throws(()=>validateRuntimeContainer(form,a,b),e=>e.number===380);
});
test('a design-time grandchild rejects a complete removal plan before any mutation',()=>{
  const a=view('Frame','Outer','a'),b=view('TextBox','First','b',a),c=view('Frame','Inner','c',a),d=view('TextBox','Original','d',c,undefined,false),form={controls:[a,b,c,d]},before=JSON.stringify(form);
  assert.throws(()=>runtimeRemovalPlan(form,a),e=>e.number===365);assert.equal(JSON.stringify(form),before);
});
test('removal plan is child-first and excludes siblings with shared array names',()=>{
  const a=view('Frame','Frame1','a',null,0),b=view('Frame','Frame1','b',null,1),c=view('TextBox','C','c',a),d=view('TextBox','D','d',b,undefined,false),form={controls:[d,c,b,a]};
  assert.deepEqual(runtimeRemovalPlan(form,a),[c,a]);assert.equal(resolveRuntimeParent(form,d.model),b);
});
test('removal rejects unloaded and design-time objects and cyclic trees',()=>{
  const a=view('Frame','A','a'),b=view('Frame','B','b',a),form={controls:[a,b]};
  assert.throws(()=>runtimeRemovalPlan(form,null),e=>e.number===35601);
  a.dynamic=false;assert.throws(()=>runtimeRemovalPlan(form,a),e=>e.number===365);a.dynamic=true;
  a.model.parent='B';a.model.nativeParentId='b';assert.throws(()=>runtimeRemovalPlan(form,a),e=>e.number===380);
});
