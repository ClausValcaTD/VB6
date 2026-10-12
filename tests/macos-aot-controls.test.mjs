import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES} from '../src/project/examples.js';
import {compileMacOSAOT,aotScalar} from '../packages/macos-native/src/aot-compiler.js';

// These are code-generation tests, not proof of native control execution.
const sample=id=>EXAMPLES.find(example=>example.id===id).create();
const propertyValue=value=>Array.isArray(value)?value.map(propertyValue):value&&typeof value==='object'?JSON.stringify(value):value;

test('direct AOT preserves structured designer collection properties recursively',()=>{
  const project=sample('controls'),before=JSON.stringify(project),compiled=compileMacOSAOT(project);
  let structuredArrays=0;
  for(const module of project.modules)if(module.form){
    const emitted=compiled.metadata.modules.find(m=>m.name===module.name);
    for(const control of module.form.controls){
      const spec=emitted.controls.find(c=>c.name===control.name);
      for(const [name,value]of Object.entries(control.properties||{}))if(Array.isArray(value)){
        const property=spec.properties.find(([key])=>key===name.toLowerCase());assert.ok(property,control.name+'.'+name);
        const actual=compiled.metadata.literals[property[1]],expected=aotScalar(propertyValue(value));
        assert.deepEqual(actual,expected,control.name+'.'+name);structuredArrays++;
      }
    }
  }
  assert.ok(structuredArrays>=4,'TreeView nodes, ListView columns/items and TabStrip tabs');
  assert.equal(JSON.stringify(project),before);assert.ok(compiled.section.length>0);
});

test('nested designer arrays retain empty arrays, scalars and escaped JSON objects',()=>{
  const project=sample('controls'),control=project.modules.find(m=>m.form).form.controls[0];
  const value=[[],[1,'text',null],{Caption:'Zażółć "line"\n\u0000',Items:['A','B']}];
  control.properties.Tag=value;
  const result=compileMacOSAOT(project),spec=result.metadata.modules.find(m=>m.controls).controls.find(c=>c.name===control.name);
  const [,id]=spec.properties.find(([key])=>key==='tag');
  assert.deepEqual(result.metadata.literals[id],aotScalar(propertyValue(value)));
});

for(const id of ['orders','calculator','clock','graphics','data','controls','language','events','richtext','compatibility','mdi']){
  test('portable sample '+id+' produces actual ARM64 procedure code',()=>{
    const result=compileMacOSAOT(sample(id));assert.equal(result.report.codegen,'arm64-aot');
    assert.equal(result.report.artifact,'native-object-code');assert.ok(result.section.length>0);
    assert.ok(result.metadata.entries.every(offset=>offset%16===0));
  });
}
