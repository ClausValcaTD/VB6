import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {dynamicControlMachine} from './support/native-dynamic-control-machine.mjs';
for(const optimization of [0,1,2])test('original Events startup and dynamic/synchronous button routes execute on checked IA-32 O'+optimization,t=>{
 const project=JSON.parse(fs.readFileSync(new URL('../examples/events.vb6web',import.meta.url))),h=dynamicControlMachine(t,project,optimization);
 h.create('frmEvents');
 const form=h.handle('frmEvents'),registry=h.vm.symbol('dynamic-controls:frmEvents'),directory=h.vm.symbol('dynamic-index:frmEvents:cmdaction'),m=h.vm.memory;
 assert.equal(m.read(directory+512),5);assert.equal(m.read(directory+520),4);assert.equal(m.read(registry+8),project.modules[0].form.controls.length+5);
 const label=[...h.windows.values()].find(w=>w.text==='This label was created by Controls.Add.');assert.ok(label);assert.equal(label.left,160);assert.equal(label.top,239);assert.ok(label.style&0x10000000);
 const arrayNode=i=>m.read(m.read(directory+(i>>>8)*4)+(i&255)*4),arrayHwnd=i=>m.read(arrayNode(i)+4);
 assert.equal(h.window(arrayHwnd(3)).text,'+4');
 h.send(arrayHwnd(3),0xf5);assert.equal(h.window(h.handle('frmEvents:lblcount')).text,'Total: 4');
 h.send(arrayHwnd(4),0xf5);assert.equal(h.window(h.handle('frmEvents:lblcount')).text,'Total: 4');assert.match(h.window(h.handle('frmEvents:lblstatus')).text,/cancelled/);
 h.send(h.handle('frmEvents:cmdremove'),0xf5);assert.equal(m.read(directory+512),4);assert.equal(m.read(directory+520),3);
 h.send(h.handle('frmEvents:cmdreset'),0xf5);assert.equal(h.window(h.handle('frmEvents:lblcount')).text,'Total: 0');
 h.send(h.handle('frmEvents:cmdclose'),0xf5);assert.equal(h.windows.size,0);assert.equal(m.read(registry+8),0);
 assert.equal(h.owned().length,0,'no escaped control, class, subscription, page or BSTR owners');
});
