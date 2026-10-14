/** Checked, non-gating reference-binding benchmarks. Accept independent source
 * roots; report accessor/schema counts separately from timing. Source execution
 * excludes compilation/VM setup and includes module initialization. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const options={root:path.resolve(import.meta.dirname,'..'),iterations:30000,calls:2000,warmup:3,samples:7};
try {
 for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i].replace(/^--/,''),value=process.argv[i+1];
  if(!Object.hasOwn(options,key)||value===undefined)throw new Error('Invalid benchmark option');
  if(key==='root')options.root=path.resolve(value);
  else {const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>100000)throw new Error('Benchmark count out of range');options[key]=n;}
 }
 const load=file=>import(pathToFileURL(path.join(options.root,'src',file)).href);
 const {bindReferenceParameter}=await load('runtime/parameter-binding.js'),{Cell}=await load('runtime/values.js');
 const {compileProject}=await load('language/compiler.js'),{VirtualMachine}=await load('runtime/vm.js');
 const summarize=samples=>{const sorted=[...samples].sort((a,b)=>a-b),mid=sorted.length>>1;return {medianMs:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,minMs:sorted[0],maxMs:sorted.at(-1),samplesMs:samples};};
 const bindingSamples=[];let counts;
 for(let sample=-options.warmup;sample<options.samples;sample++){
  let reads=0,resolutions=0;const ref=new Cell('Long',7),get=ref.get.bind(ref);ref.get=()=>{reads++;return get();};
  const vm={recordDefinition(){resolutions++;return null;}},param={type:'Long',bounds:null,byRef:true};let binding;
  const start=performance.now();for(let i=0;i<options.iterations;i++)binding=await bindReferenceParameter(vm,param,ref,{});const ms=performance.now()-start;
  assert.equal(binding.cell,ref);assert.equal(binding.copyBack,undefined);assert.equal(get(),7);
  const current={reads,resolutions};if(counts)assert.deepEqual(current,counts);else counts=current;
  if(sample>=0)bindingSamples.push(ms);
 }
 const code=`Sub Work(ByRef first As Long, ByRef second As Long, ByRef third As Long)\nfirst = first + 1\nsecond = second + 2\nthird = third + 3\nEnd Sub\nSub Main()\nDim i As Long, a As Long, b As Long, c As Long\nFor i = 1 To ${options.calls}\nWork a, b, c\nNext\nDebug.Print a, b, c\nEnd Sub`;
 const program=compileProject({name:'ParameterBenchmark',startup:'Sub Main',modules:[{name:'M',kind:'module',code}]});assert.deepEqual(program.diagnostics,[]);
 const executionSamples=[];let instructions;
 for(let sample=-options.warmup;sample<options.samples;sample++){
  const output=[],vm=new VirtualMachine(program,{print:s=>output.push(s)},{sliceMilliseconds:1e9});
  try {const start=performance.now();await vm.start();const ms=performance.now()-start;
   assert.deepEqual(output,[`${options.calls} ${options.calls*2} ${options.calls*3}`]);assert.equal(vm.lastError,null);assert.equal(vm.stack.length,0);
   instructions??=vm.instructionCount;assert.equal(instructions,vm.instructionCount);if(sample>=0)executionSamples.push(ms);
  }finally{vm.stop();await vm.automationClose;await vm.dataClose;}
 }
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,options,results:{scalarBindings:{...summarize(bindingSamples),...counts},sourceCalls:{...summarize(executionSamples),instructions}}},null,2));
}catch(error){console.error(error.stack||error);process.exitCode=1;}
