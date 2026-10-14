/** Reproducible local compiler timing, not EXE execution or runtime frame rate.
 * Timings are observations, never a pass/fail gate. Byte determinism IS checked.
 * The linker changes a width/prefix plan per relaxation pass, then materializes
 * bytes, labels and relocations once. Seeded differential tests preserve the
 * prior fixed point, interior addresses and target addends byte for byte.
 * Run on each revision with the same Node/host and compare emitted SHA-256s.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {compileWin32} from '../src/native/compiler.js';
const names=['calculator','graphics','language','compatibility','win32'];
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(p*sorted.length)-1];};
export async function benchmarkWin32Compiler({rounds=9,warmups=2,optimization=2}={}){
 if(!Number.isInteger(rounds)||rounds<3||rounds>100||!Number.isInteger(warmups)||warmups<1||warmups>20)throw new TypeError('Use 3..100 measured rounds and 1..20 warmups');
 const sources=await Promise.all(names.map(async name=>({name,source:await fs.readFile(new URL('../examples/'+name+'.vb6web',import.meta.url),'utf8'),times:[]})));
 for(let round=0;round<rounds+warmups;round++)for(const entry of sources){
  const project=JSON.parse(entry.source),before=JSON.stringify(project),start=performance.now(),result=compileWin32(project,{optimization}),ms=performance.now()-start;
  const sha256=createHash('sha256').update(result.bytes).digest('hex');
  if(entry.sha256&&entry.sha256!==sha256||JSON.stringify(project)!==before)throw new Error('Nondeterministic compilation or source mutation: '+entry.name);
  entry.sha256=sha256;entry.bytes=result.bytes.length;
  if(round>=warmups)entry.times.push(ms);
 }
 return {kind:'host-side Win32 x86 compiler timing; not native execution',node:process.version,platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model,rounds,warmups,optimization,
  results:sources.map(({name,times,bytes,sha256})=>({name,bytes,sha256,medianMs:percentile(times,.5),p95Ms:percentile(times,.95),samplesMs:times}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{if(process.argv.length>3)throw new Error('Usage: node tools/bench-win32-compiler.mjs [report.json]');
  const result=await benchmarkWin32Compiler(),text=JSON.stringify(result,null,2)+'\n';
  if(process.argv[2])await fs.writeFile(process.argv[2],text);console.log(text);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
