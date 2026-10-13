import test from 'node:test';
import assert from 'node:assert/strict';
import {propertySection,propertySections,PROPERTY_SECTIONS} from '../src/ide/figma/property-model.js';
import {procedureAtLine,filterProcedures} from '../src/ide/figma/code-model.js';

test('canonical VB6 keys have a deterministic design section',()=>{
  for(const [key,section] of Object.entries({Caption:'content',Text:'content',Tag:'content',
    BackColor:'appearance',ForeColor:'appearance',BorderStyle:'appearance',Font:'typography',
    FontName:'typography',FontBold:'typography',Enabled:'behavior',Interval:'behavior',
    DataField:'data',StartUpPosition:'window',ClientWidth:'geometry',X1:'geometry',
    LayoutMode:'layout',Anchor:'layout',VendorProperty:'other'}))
    assert.equal(propertySection(key),section,key);
  assert.ok(Object.isFrozen(PROPERTY_SECTIONS));
  assert.ok(PROPERTY_SECTIONS.every(Object.isFrozen));
});
test('property projection neither invents nor duplicates supported properties',()=>{
  const keys=Object.freeze(['Caption','FontName','VendorProperty','Caption','Width']);
  const groups=propertySections(keys);
  assert.deepEqual(groups.flatMap(g=>g.keys),['Caption','FontName','Width','VendorProperty']);
  assert.deepEqual([...keys],['Caption','FontName','VendorProperty','Caption','Width']);
  assert.ok(groups.every(g=>g.keys.length));
});
test('property search matches all terms across labels, sections and custom descriptions',()=>{
  const keys=['BackColor','ForeColor','FontName','VendorProperty'];
  assert.deepEqual(propertySections(keys,{query:' APPEARANCE color '}).flatMap(g=>g.keys),['BackColor','ForeColor']);
  assert.deepEqual(propertySections(keys,{query:'custom input',describe:key=>key==='VendorProperty'?'Custom input format':''}).flatMap(g=>g.keys),['VendorProperty']);
  assert.deepEqual(propertySections(keys,{query:'not-a-property'}),[]);
  assert.deepEqual(propertySections([]),[]);
});
test('property search never evaluates descriptions as markup or inspects resource values',()=>{
  const payload='<img src=x onerror=alert(1)>';
  assert.deepEqual(propertySections(['Picture'],{query:payload,describe:()=>payload})[0].keys,['Picture']);
  assert.equal({}.polluted,undefined);
});
test('outline selection uses binary search over existing sorted procedure records',()=>{
  const p=[{name:'One',kind:'Sub',line:2},{name:'Two',kind:'Function',line:8},{name:'Two',kind:'Property Get',line:11}];
  assert.equal(procedureAtLine([],1),-1);assert.equal(procedureAtLine(p,1),-1);
  assert.equal(procedureAtLine(p,2),0);assert.equal(procedureAtLine(p,7),0);
  assert.equal(procedureAtLine(p,8),1);assert.equal(procedureAtLine(p,100),2);
  assert.equal(filterProcedures(p,' TWO function ')[0],p[1]);
  assert.equal(filterProcedures(p,'Property')[0],p[2]);
  assert.deepEqual(filterProcedures(p,'unknown'),[]);
});
test('outline handles large modules without recursion or copying procedure records',()=>{
  const p=Array.from({length:50000},(_,i)=>Object.freeze({name:'P'+i,kind:'Sub',line:i*3+1}));
  assert.equal(procedureAtLine(p,149999),49999);
  const found=filterProcedures(p,'P49999');
  assert.equal(found.length,1);assert.equal(found[0],p[49999]);
});
