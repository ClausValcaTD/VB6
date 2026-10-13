/** Non-gating first-subscript-fastest iteration benchmark. Fixture construction
 * is excluded; every warmup and sample checks an order-sensitive checksum and
 * the exact Variant subtype counts. Use --root to compare independent trees. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const options={root:path.resolve(import.meta.dirname,'..'),samples:9,warmup:3};
try {
 for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i].replace(/^--/,''),value=process.argv[i+1];
  if(!Object.hasOwn(options,key)||value===undefined)throw new Error('Use --root path, --samples count or --warmup count');
  if(key==='root')options.root=path.resolve(value);else {const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>1000)throw new Error('Invalid sample count');options[key]=n;}
 }
 const {VBArray,tagScalar}=await import(pathToFileURL(path.join(options.root,'src/runtime/values.js')).href);
 const fixtures=[{name:'long1D100k',bounds:[[0,99999]],tagged:false},{name:'long2D100k',bounds:[[-10,89],[3,1002]],tagged:false},{name:'variant2D100k',bounds:[[-10,89],[3,1002]],tagged:true}];
 const results={};
 for(const {name,bounds,tagged} of fixtures){
  const a=new VBArray(bounds,tagged?'Variant':'Long');let expected=0,ordinal=0,integers=0;
  // Existing independent public coordinate enumerator is the oracle, not the
  // optimized iterator or its stride helper.
  for(const at of a.indices()){const value=(++ordinal)%31749;a.set(at,tagged?tagScalar(value,ordinal%2?'integer':'long',true):value);expected+=ordinal*value;if(ordinal%2)integers++;}
  const samples=[];
  for(let sample=-options.warmup;sample<options.samples;sample++){
   let sum=0,count=0,types=0;const start=performance.now();
   if(tagged)for(const v of a.scalarIterator()){sum+=(++count)*v.value;if(v.type==='integer')types++;}
   else for(const v of a)sum+=(++count)*v;
   const elapsed=performance.now()-start;assert.equal(sum,expected);assert.equal(count,ordinal);if(tagged)assert.equal(types,integers);
   if(sample>=0)samples.push(elapsed);
  }
  const sorted=[...samples].sort((a,b)=>a-b),mid=sorted.length>>1;
  results[name]={count:ordinal,checksum:expected,medianMs:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,minMs:sorted[0],maxMs:sorted.at(-1),samplesMs:samples};
 }
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,options,results},null,2));
}catch(error){console.error(error.stack||error);process.exitCode=1;}
