/** Checked whole-source timings; counters are collected in a separate run so
 * instrumentation is not included in measured samples. No timing CI gate. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const options={root:path.resolve(import.meta.dirname,'..'),iterations:3000,warmup:3,samples:7};
try {
 for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i].replace(/^--/,''),value=process.argv[i+1];
  if(!Object.hasOwn(options,key)||value===undefined)throw new Error('Invalid benchmark option');
  if(key==='root')options.root=path.resolve(value);
  else {const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>10000)throw new Error('Benchmark count out of range');options[key]=n;}
 }
 const load=file=>import(pathToFileURL(path.join(options.root,'src',file)).href);
 const {compileProject}=await load('language/compiler.js'),{VirtualMachine}=await load('runtime/vm.js');
 const n=options.iterations,fixtures=[
  {name:'loopDeclarations',code:`Sub Main()\nDim i As Long\nFor i = 1 To ${n}\nDim value As Long\nvalue = value + 1\nNext\nDebug.Print value\nEnd Sub`,expected:String(n)},
  {name:'procedureDeclarations',code:`Sub Main()\nDim i As Long, total As Long\nFor i = 1 To ${n}\ntotal = total + Work()\nNext\nDebug.Print total\nEnd Sub\nFunction Work() As Long\nDim a As Long, b As Long, c As Long, d As Long\na = 1\nb = 2\nc = 3\nd = 4\nWork = a + b + c + d\nEnd Function`,expected:String(n*10)},
  {name:'skippedDeclarationAllocation',code:`Sub Main()\nDim i As Long\nFor i = 1 To ${n}\nWork\nNext\nDebug.Print i\nEnd Sub\nSub Work()\nIf False Then\n${Array.from({length:20},(_,i)=>`Dim a${i} As Long`).join('\n')}\nEnd If\nEnd Sub`,expected:String(n+1)}
 ];
 const results={};
 for(const f of fixtures){
  const program=compileProject({name:'LocalStorageBenchmark',startup:'Sub Main',modules:[{name:'M',kind:'module',code:f.code}]});assert.deepEqual(program.diagnostics,[]);
  const samples=[];let instructions,declareCalls=0;
  for(let sample=-options.warmup-1;sample<options.samples;sample++){
   const output=[],vm=new VirtualMachine(program,{print:s=>output.push(s)},{sliceMilliseconds:1e9}),counting=sample===-options.warmup-1;
   if(counting){const original=vm.declare.bind(vm);vm.declare=(...args)=>{declareCalls++;return original(...args);};}
   try {const start=performance.now();await vm.start();const ms=performance.now()-start;
    assert.deepEqual(output,[f.expected]);assert.equal(vm.lastError,null);assert.equal(vm.stack.length,0);
    instructions??=vm.instructionCount;assert.equal(instructions,vm.instructionCount);if(sample>=0)samples.push(ms);
   }finally{vm.stop();await vm.automationClose;await vm.dataClose;}
  }
  const sorted=[...samples].sort((a,b)=>a-b),mid=sorted.length>>1;
  results[f.name]={medianMs:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,minMs:sorted[0],maxMs:sorted.at(-1),samplesMs:samples,instructions,declareCalls};
 }
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,options,results},null,2));
}catch(error){console.error(error.stack||error);process.exitCode=1;}
