import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {dynamicControlMachine} from './support/native-dynamic-control-machine.mjs';
for(const optimization of [0,1,2])test(`actual linked sparse lookup has bounded instructions and preserves caller state O${optimization}`,t=>{
 const p=newProject('HotControlIndex'),c=createControl('CommandButton','Buttons');c.properties.Index=0;p.modules[0].form.controls=[c];
 p.modules[0].code=`Private result As Long
Private Sub Form_Load()
 Load Buttons(32767)
End Sub
Private Sub Invalid(ByVal index As Long)
 On Error Resume Next
 Load Buttons(index)
 result=Err.Number
 Err.Clear
End Sub`;
 const h=dynamicControlMachine(t,p,optimization);h.create('Form1');const vm=h.vm,m=vm.memory,dir=vm.symbol('dynamic-index:Form1:buttons');
 const pages=[m.read(dir),m.read(dir+508)],nativeErrors=['pending','number','source','description','helpfile','helpcontext','erl','lastdllerror'].map(n=>vm.symbol('native:error:'+n));
 const beforeErrors=nativeErrors.map(a=>m.read(a)),originalRead=m.read.bind(m),originalStep=vm.step.bind(vm);
 let reads=0,steps=0;
 m.read=(address,width=32)=>{if(address>=dir&&address<dir+512||pages.some(p=>address>=p&&address<p+1024))reads++;return originalRead(address,width);};
 vm.step=()=>{steps++;return originalStep();};
 try{
  for(const index of [0,1,255,256,8192,16384,32512,32766,32767]){
   steps=reads=0;const calls=vm.calls.length,value=vm.invoke('proc:NativeDynamicControls:IndexFind',[dir,index]);
   assert.equal(!!value,index===0||index===32767);assert.equal(reads,index<256||index>=32512?2:1);
   assert.ok(steps<=24,`bounded leaf executed ${steps} instructions`);assert.equal(vm.calls.length,calls,'lookup calls no foreign function');
   assert.deepEqual(nativeErrors.map(a=>m.read(a)),beforeErrors);
  }
 }finally{m.read=originalRead;vm.step=originalStep;}
 for(const index of [-1,32768,2147483647,-2147483648]){
  h.invokeForm('Form1','Invalid',[index]);assert.equal(m.read(vm.symbol('global:Form1:result')),340);assert.equal(m.read(dir+512),2);
 }
 h.destroy(h.handle('Form1'));assert.equal(h.owned().length,0);
});
for(const optimization of [0,1,2])test(`linked boundary scan agrees with sparse membership across page edges O${optimization}`,t=>{
 const p=newProject('BoundaryControlIndex'),c=createControl('CommandButton','Buttons');c.properties.Index=0;p.modules[0].form.controls=[c];
 p.modules[0].code='Sub Form_Load()\n Load Buttons(1)\nEnd Sub';
 const h=dynamicControlMachine(t,p,optimization),vm=h.vm,m=vm.memory;
 const directory=m.alloc(528,'test-sparse-directory');m.region(directory).bytes.fill(0);
 const check=indices=>{
  const pages=new Map();
  for(const index of new Set(indices)){
   const pageIndex=index>>>8;let page=pages.get(pageIndex);
   if(!page){page=m.alloc(1028,'test-sparse-page');m.region(page).bytes.fill(0);pages.set(pageIndex,page);m.write(directory+4*pageIndex,page);}
   m.write(page+4*(index&255),index+1);
  }
  m.write(directory+512,new Set(indices).size);
  for(const direction of [1,-1])assert.equal(vm.invoke('proc:NativeDynamicControls:IndexBoundary',[directory,direction])|0,indices.length?(direction===1?Math.min(...indices):Math.max(...indices)):-1);
  for(const [index,page]of pages){m.write(directory+index*4,0);m.free(page);}
 };
 for(const indices of [[],[0],[32767],[255,256],[1,255,8192,32766],[256,257,8191,8192]])check(indices);
 let state=7;for(let round=0;round<64;round++){const indices=[];for(let i=0;i<16;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;indices.push(state&32767);}check(indices);}
 m.free(directory);assert.equal(h.owned().length,0);
});
