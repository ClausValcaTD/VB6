/** Non-gating source-VM benchmark. Compile/construct outside the timed region;
 * measure actual startup and source execution. Results and instruction counts
 * are checked after every run. Browser scheduling, rendering and native targets
 * are not measured. --root selects an independent source checkout. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const options={root:path.resolve(import.meta.dirname,'..'),samples:7,warmup:3,iterations:5000};
try {
 for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i].replace(/^--/,''),value=process.argv[i+1];
  if(!Object.hasOwn(options,key)||value===undefined)throw new Error('Use --root path, --samples count, --warmup count or --iterations count');
  if(key==='root')options.root=path.resolve(value);else{const n=Number(value),limit=key==='iterations'?30000:1000;if(!Number.isSafeInteger(n)||n<1||n>limit)throw new Error('Benchmark count out of range');options[key]=n;}
 }
 const load=file=>import(pathToFileURL(path.join(options.root,'src',file)).href);
 const {VirtualMachine}=await load('runtime/vm.js'),{compileProject}=await load('language/compiler.js'),n=options.iterations;
 const fixtures=[
  {name:'scalarFor',code:`Sub Main()\nDim i As Long, total As Long\nFor i = 1 To ${n}\ntotal = total + i\nNext\nDebug.Print total\nEnd Sub`,expected:String(n*(n+1)/2)},
  {name:'arrayForEach',code:`Sub Main()\nDim a() As Long, i As Long, total As Long, item As Variant\nReDim a(1 To ${n})\nFor i = 1 To ${n}\na(i) = i\nNext\nFor Each item In a\ntotal = total + item\nNext\nDebug.Print total\nEnd Sub`,expected:String(n*(n+1)/2)},
  {name:'arrayElementByRef',code:`Sub AddOne(ByRef value As Long)\nvalue = value + 1\nEnd Sub\nSub Main()\nDim a() As Long, i As Long\nReDim a(1)\nFor i = 1 To ${n}\nAddOne a(0)\nNext\nDebug.Print a(0)\nEnd Sub`,expected:String(n)},
  {name:'wideRecordWith',code:`Private Type Wide\n${Array.from({length:64},(_,i)=>'Field'+i+' As Long').join('\n')}\nEnd Type\nSub Main()\nDim value As Wide, i As Long\nWith value\nFor i = 1 To ${n}\n.FIELD63 = .field63 + i\nNext\nDebug.Print .Field63\nEnd With\nEnd Sub`,expected:String(n*(n+1)/2)}
 ];
 const results={};
 for(const {name,code,expected}of fixtures){
  const program=compileProject({name:'ExecutionBenchmark',startup:'Sub Main',modules:[{name:'M',kind:'module',code}]});assert.equal(program.valid,true,JSON.stringify(program.diagnostics));
  const samples=[];let instructions;
  for(let sample=-options.warmup;sample<options.samples;sample++){
   const output=[],vm=new VirtualMachine(program,{print:s=>output.push(s)},{sliceMilliseconds:1e9});
   try{const start=performance.now();await vm.start();const elapsed=performance.now()-start;
    assert.deepEqual(output,[expected]);assert.equal(vm.lastError,null);assert.equal(vm.stack.length,0);
    instructions??=vm.instructionCount;assert.equal(vm.instructionCount,instructions);
    if(sample>=0)samples.push(elapsed);
   }finally{vm.stop();await vm.automationClose;await vm.dataClose;}
  }
  const sorted=[...samples].sort((a,b)=>a-b),mid=sorted.length>>1;
  results[name]={output:expected,instructions,medianMs:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,minMs:sorted[0],maxMs:sorted.at(-1),samplesMs:samples};
 }
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,options,results},null,2));
}catch(error){console.error(error.stack||error);process.exitCode=1;}
