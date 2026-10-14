/** Deterministic emitted-IA-32 operation counts, NOT native Windows timing.
 * Compiler code is executed by the checked machine; foreign HWND calls are test
 * doubles used only to create the fixture. Lookup itself runs unhooked code.
 * Run this tool at both revisions to compare instruction/table-read counts.
 */
import {mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {newProject,createControl} from '../src/project/model.js';
import {dynamicControlMachine} from '../tests/support/native-dynamic-control-machine.mjs';
const p=newProject('ControlIndexCost'),c=createControl('CommandButton','Buttons');
c.properties.Index=0;p.modules[0].form.controls=[c];p.modules[0].code='Sub Form_Load()\n Load Buttons(1)\n Load Buttons(32767)\nEnd Sub\nSub DropHigh()\n Unload Buttons(32767)\nEnd Sub';
const result={kind:'checked emitted IA-32 instruction and data-read counts; not native throughput',node:process.version,results:[]};
for(const optimization of [0,1,2]){
 const h=dynamicControlMachine({mock},p,optimization);h.create('Form1');const vm=h.vm,m=vm.memory,dir=vm.symbol('dynamic-index:Form1:buttons');
 const page0=m.read(dir),page127=m.read(dir+127*4),read=m.read.bind(m),step=vm.step.bind(vm);
 let instructions=0,tableReads=0;
 m.read=(address,width=32)=>{if(address>=dir&&address<dir+512||address>=page0&&address<page0+1024||address>=page127&&address<page127+1024)tableReads++;return read(address,width);};
 vm.step=()=>{instructions++;return step();};
 for(const index of [0,1,127,256,16384,32767]){
  instructions=tableReads=0;const before=vm.calls.length;
  const value=vm.invoke('proc:NativeDynamicControls:IndexFind',[dir,index]);
  assert.equal(vm.calls.slice(before).filter(c=>c.name?.includes('!HeapAlloc')).length,0);
  assert.equal(Boolean(value),[0,1,32767].includes(index));
  result.results.push({optimization,index,found:!!value,instructions,tableReads});
 }
 h.invokeForm('Form1','DropHigh');instructions=tableReads=0;
 const upper=vm.invoke('proc:NativeDynamicControls:IndexBoundary',[dir,-1]);assert.equal(upper,1);
 (result.bounds ||= []).push({optimization,direction:-1,instructions,tableReads});
 m.read=read;vm.step=step;h.destroy(h.handle('Form1'));assert.equal(h.owned().length,0);
}
const output=JSON.stringify(result,null,2)+'\n';if(process.argv[2])await fs.writeFile(process.argv[2],output);console.log(output);
