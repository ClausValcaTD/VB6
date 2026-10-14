import test from 'node:test';import assert from 'node:assert/strict';
import {PE32Image} from '../src/native/pe32.js';import {X86} from '../src/native/x86.js';
import {NativeX86Machine} from './support/native-x86-machine.mjs';
function machine(){const image=new PE32Image(),s=image.section('.text',0x60000020),x=new X86(s,image);x.label('entry').jump('entry').api('kernel32.dll','ExitProcess',[0]);return new NativeX86Machine(image.finish('entry'));}
test('checked application execution retains finite instruction limits',()=>{
 for(const maxInstructions of [1,31,1000])assert.throws(()=>machine().invoke('entry',[],{maxInstructions}),/instruction budget/);
 for(const maxInstructions of [0,-1,NaN,Infinity,20000001,1.5])assert.throws(()=>machine().invoke('entry',[],{maxInstructions}),/bounded instruction budget/);
});
