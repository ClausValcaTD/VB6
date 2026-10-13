/** Checked non-gating benchmark of record lookup, allocation and compile costs.
 * Select independent source roots; never compare against altered expected output. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const options={root:path.resolve(import.meta.dirname,'..'),modules:160,iterations:300,warmup:3,samples:7};
try {
 for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i].replace(/^--/,''),value=process.argv[i+1];
  if(!Object.hasOwn(options,key)||value===undefined)throw new Error('Use --root path or --modules/--iterations/--warmup/--samples count');
  if(key==='root')options.root=path.resolve(value);else{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>2000)throw new Error('Benchmark count out of range');options[key]=n;}
 }
 const load=file=>import(pathToFileURL(path.join(options.root,'src',file)).href);
 const {compileProject}=await load('language/compiler.js'),{VirtualMachine}=await load('runtime/vm.js');
 const providers=Array.from({length:options.modules},(_,i)=>({name:'Types'+i,kind:'module',code:`Public Type Record${i}\nValue As Long\nText As String * 4\nEnd Type`}));
 const name='Record'+(options.modules-1),n=options.iterations;
 const cases=[
  {name:'recordDeclarations',body:`Dim r As ${name}\nr.Value = 7\nWork = r.Value + Len(r.Text)`,expected:11*n},
  {name:'recordArrayDeclarations',body:`Dim r(1) As ${name}\nr(0).Value = 7\nWork = r(0).Value + Len(r(1).Text)`,expected:11*n},
  {name:'scalarDeclarations',body:'Dim x As Long, a(1) As Long\nx = 7\na(0) = x\nWork = a(0)',expected:7*n}
 ];
 const results={};
 const stats=samples=>{const a=[...samples].sort((a,b)=>a-b);return {medianMs:a[Math.floor(a.length/2)],minMs:a[0],maxMs:a.at(-1),samplesMs:samples};};
 for(const fixture of cases){
  const source={name:'RecordBenchmark',startup:'Sub Main',modules:[{name:'M',kind:'module',code:`Function Work() As Long\n${fixture.body}\nEnd Function\nSub Main()\nDim i As Long, total As Long\nFor i = 1 To ${n}\ntotal = total + Work()\nNext\nDebug.Print total\nEnd Sub`},...providers]};
  const compile=[],construct=[],execute=[];let instructions;
  for(let i=-options.warmup;i<options.samples;i++){
   let start=performance.now();const p=compileProject(source),ct=performance.now()-start;assert.deepEqual(p.diagnostics,[]);
   const output=[];start=performance.now();const vm=new VirtualMachine(p,{print:s=>output.push(s)},{sliceMilliseconds:Number.MAX_SAFE_INTEGER}),vt=performance.now()-start;
   start=performance.now();await vm.start();const et=performance.now()-start;
   assert.deepEqual(output,[String(fixture.expected)]);assert.equal(vm.lastError,null);
   if(instructions===undefined)instructions=vm.instructionCount;else assert.equal(vm.instructionCount,instructions);
   if(i>=0){compile.push(ct);construct.push(vt);execute.push(et);}
  }
  results[fixture.name]={compile:stats(compile),construct:stats(construct),execute:stats(execute),instructions};
 }
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,options,results},null,2));
}catch(error){console.error(error.stack||error);process.exitCode=1;}
