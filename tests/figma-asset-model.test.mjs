import test from 'node:test';
import assert from 'node:assert/strict';
import {createForm,createControl} from '../src/project/model.js';
import {insertDesignerAsset,isDesignerAsset} from '../src/ide/figma/asset-model.js';
const fixture=()=>{const f=createForm('Form1').form,p=createControl('Frame','Frame1');p.id='frame';p.properties.Width=6000;p.properties.Height=4000;f.controls=[p];return f;};
test('asset insertion is detached, uniquely named, parent-local and undo-ready',()=>{
 const f=fixture(),before=structuredClone(f),result=insertDesignerAsset(f,'CommandButton',{x:333,y:666,parentId:'frame'});
 assert.deepEqual(f,before);const c=result.form.controls.at(-1);assert.equal(c.name,'CommandButton1');assert.equal(c.parent,'Frame1');assert.equal(c.nativeParentId,'frame');assert.equal(c.properties.Left,360);assert.equal(c.properties.Top,720);assert.equal(c.properties.TabIndex,1);assert.deepEqual(result.selection,[c.id]);
 const second=insertDesignerAsset(result.form,'CommandButton',{x:0,y:0});assert.equal(second.form.controls.at(-1).name,'CommandButton2');
});
test('assets reject external or runtime-only types and invalid geometry without changing source',()=>{
 const f=fixture(),before=structuredClone(f);for(const type of ['Pointer','__proto__','<script>',''])assert.throws(()=>insertDesignerAsset(f,type,{x:0,y:0}));
 for(const point of [{x:NaN,y:0},{x:0,y:Infinity},{x:300001,y:0},{x:1,y:2,parentId:'missing'},{x:0,y:0,beforeId:'missing'}])assert.throws(()=>insertDesignerAsset(f,'TextBox',point));
 assert.equal(isDesignerAsset('RuntimeOnly',{has:()=>false}),false);assert.deepEqual(f,before);
});
test('custom designer defaults, validation, placement and independent value ownership',()=>{
 const f=fixture(),defaults={Width:1234,Height:567,Left:999,Name:'Wrong',List:['a']},registry={has:t=>t==='Gauge',describe:()=>({baseName:'gauge'}),defaults:()=>defaults,validateProperties:(t,p)=>{assert.equal(p.Name,'gauge1');assert.equal(p.Left,45);}};
 const out=insertDesignerAsset(f,'Gauge',{x:44,y:29},{registry,snap:false});const c=out.form.controls.at(-1);assert.equal(c.properties.Width,1234);assert.equal(c.properties.Left,45);assert.equal(c.properties.Top,30);c.properties.List.push('b');assert.deepEqual(defaults.List,['a']);
 registry.validateProperties=()=>{throw new Error('bad default');};assert.throws(()=>insertDesignerAsset(f,'Gauge',{x:0,y:0},{registry}));assert.equal(f.controls.length,1);
});
test('flow insertion is solved in the same transaction and preserves requested sibling order',()=>{
 const f=fixture();Object.assign(f.controls[0].properties,{LayoutMode:1,LayoutGap:120});
 const first=insertDesignerAsset(f,'CommandButton',{x:300,y:0,parentId:'frame'},{layout:true});const id=first.selection[0];
 const next=insertDesignerAsset(first.form,'TextBox',{x:0,y:0,parentId:'frame',beforeId:id},{layout:true});const a=next.form.controls.find(c=>c.id===next.selection[0]),b=next.form.controls.find(c=>c.id===id);
 assert.equal(a.properties.Left,0);assert.equal(b.properties.Left,a.properties.Width+120);assert.ok(next.form.controls.indexOf(a)<next.form.controls.indexOf(b));
});
test('nonvisual components remain outside flows; ignored controls retain coordinates',()=>{
 const f=fixture();f.controls[0].properties.LayoutMode=1;
 const timer=insertDesignerAsset(f,'Timer',{x:240,y:360,parentId:'frame'},{layout:true}).form.controls.at(-1);assert.equal(timer.parent,null);assert.equal(timer.nativeParentId,null);
 const out=insertDesignerAsset(f,'TextBox',{x:240,y:360,parentId:'frame',ignore:true},{layout:true});const c=out.form.controls.find(c=>c.id===out.selection[0]);assert.equal(c.properties.LayoutIgnore,-1);assert.equal(c.properties.Left,240);assert.equal(c.properties.Top,360);
});


test('registered read-only defaults initialize without granting editor writes',async()=>{
 const {ControlAdapterRegistry}=await import('../src/controls/adapters.js');
 const registry=new ControlAdapterRegistry().register('Instrument',{designer:()=>{},metadata:{properties:[
  {name:'Serial',default:'factory',readOnly:true},{name:'Value',default:12}]}});
 const f=fixture(),result=insertDesignerAsset(f,'Instrument',{x:0,y:0},{registry});
 assert.equal(result.form.controls.at(-1).properties.Serial,'factory');
 assert.equal(result.form.controls.at(-1).properties.Value,12);
 assert.throws(()=>registry.validateProperties('Instrument',{Serial:'changed'}),/read-only/);
});
