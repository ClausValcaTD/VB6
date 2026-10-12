/** Non-gating, deterministic input benchmarks. Run each checkout separately:
 * node tools/bench-language-runtime.mjs --root /path/to/checkout
 * Timing excludes fixture construction but includes the complete public resize
 * operation. Checksums and bounds are validated after every warmup and sample. */
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const options={root:path.resolve(import.meta.dirname,'..'),samples:7,warmup:3,iterations:20000};
try{
 for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i].replace(/^--/,''),value=process.argv[i+1];
  if(!Object.hasOwn(options,key)||value===undefined)throw new Error('Expected --root path, --samples count, --warmup count or --iterations count');
  if(key==='root')options.root=path.resolve(value);else{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>1000000)throw new Error('Invalid benchmark count');options[key]=n;}
 }
 const {VBArray,binary}=await import(pathToFileURL(path.join(options.root,'src/runtime/values.js')).href);
 function measure(setup,action,verify){
  const samples=[];
  for(let i=0;i<options.warmup+options.samples;i++){
   const fixture=setup(),start=performance.now(),result=action(fixture),elapsed=performance.now()-start;
   verify(fixture,result);if(i>=options.warmup)samples.push(elapsed);
  }
  const sorted=[...samples].sort((a,b)=>a-b),mid=sorted.length>>1;
  return {medianMs:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,minMs:sorted[0],maxMs:sorted.at(-1),samplesMs:samples};
 }
 const resize=(bounds,next)=>measure(()=>{
  const a=new VBArray(bounds,'Long');a.dynamic=true;
  for(let i=0;i<a.data.length;i++)a.data[i]=i%32767;
  return a;
 },a=>a.redim(next,true),a=>{
  assert.deepEqual(a.bounds,next);assert.equal(a.get(...next.map(b=>b[0])),0);
  assert.equal(a.data.length,next.reduce((n,[lo,hi])=>n*(hi-lo+1),1));
  const retained=bounds.map(([lo,hi],i)=>Math.min(hi,next[i][1]));
  let oldOffset=0;for(let i=0;i<bounds.length;i++)oldOffset=oldOffset*(bounds[i][1]-bounds[i][0]+1)+retained[i]-bounds[i][0];
  assert.equal(a.get(...retained),oldOffset%32767);
 });
 const results={
  preserve1D100k:resize([[0,99999]],[[0,109999]]),
  preserve2D100k:resize([[-10,89],[3,1002]],[[-10,89],[3,1102]]),
  shrink2D100k:resize([[-10,89],[3,1002]],[[-10,89],[3,502]]),
  likeRepeated:measure(()=>0,()=>{let sum=0;for(let i=0;i<options.iterations;i++)sum+=binary('like','BAT13khg','B?T[0-9]#*');return sum;},(_,sum)=>assert.equal(sum,-options.iterations)),
  likeWildcardMismatch:measure(()=>0,()=>{let sum=0;for(let i=0;i<100;i++)sum+=binary('like','a'.repeat(16),'*a'.repeat(8)+'b');return sum;},(_,sum)=>assert.equal(sum,0))
 };
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,options,results},null,2));
}catch(error){console.error(error.stack||error.message);process.exitCode=1;}
