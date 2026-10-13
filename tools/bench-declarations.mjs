/** Checked compiler/diagnostic/runtime workloads. Timings are reports, not gates. */
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const options={root:path.resolve(import.meta.dirname,'..'),modules:160,locals:12,iterations:400,warmup:3,samples:7};
try {
 for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i].replace(/^--/,''),value=process.argv[i+1];
  if(!Object.hasOwn(options,key)||value===undefined)throw new Error('Use --root path or --modules/--locals/--iterations/--warmup/--samples positive-integer');
  if(key==='root')options.root=path.resolve(value);
  else {const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>100000)throw new Error('Invalid benchmark count');options[key]=n;}
 }
 const load=file=>import(pathToFileURL(path.join(options.root,'src',file)).href);
 const {compileProject}=await load('language/compiler.js'),{diagnosticSnapshot,ProjectDiagnosticCache}=await load('language/diagnostics.js'),{VirtualMachine}=await load('runtime/vm.js');
 const provider={id:'provider',name:'Provider',kind:'module',code:'Public Const Base = 3'};
 const project={name:'DeclarationBenchmark',modules:[provider,...Array.from({length:options.modules},(_,i)=>({id:'m'+i,name:'M'+i,kind:'module',code:`Private Const Limit = Base + 1\nSub Work()\n${Array.from({length:options.locals},(_,j)=>`Dim a${j}(1 To Limit) As Long`).join('\n')}\nEnd Sub`}))]};
 const valid=result=>{if(result.diagnostics.length)throw new Error(JSON.stringify(result.diagnostics));return result;};
 const cache=new ProjectDiagnosticCache();valid(cache.check(diagnosticSnapshot(project)));
 const measure=async fn=>{
  for(let i=0;i<options.warmup;i++)await fn();
  const samples=[];for(let i=0;i<options.samples;i++){const start=performance.now();await fn();samples.push(performance.now()-start);}
  const sorted=[...samples].sort((a,b)=>a-b);return {medianMs:sorted[Math.floor(sorted.length/2)],minMs:sorted[0],maxMs:sorted.at(-1),samplesMs:samples};
 };
 let value=3;
 const results={
  coldCompile:await measure(()=>valid(compileProject(project))),
  unchangedDiagnostics:await measure(()=>valid(cache.check(diagnosticSnapshot(project)))),
  changedDependencyDiagnostics:await measure(()=>{
   value=value===3?4:3;provider.code='Public Const Base = '+value;
   const result=valid(cache.check(diagnosticSnapshot(project)));if(result.stats.compiledModules!==1)throw new Error('Dependency syntax was not recompiled exactly once');
   for(const entry of cache.entries.values())if(entry.name!=='Provider'&&entry.compiled.constantBindings.get('limit')!==value+1)throw new Error('Stale dependent binding');
  })
 };
 const code=`Private Const Lower = 0\nPrivate Const Upper = 1\nSub Work()\n${Array.from({length:options.locals},(_,j)=>`Dim a${j}(Lower To Upper) As Long`).join('\n')}\nEnd Sub\nSub Main()\nDim i As Long\nFor i = 1 To ${options.iterations}\nWork\nNext\nDebug.Print i\nEnd Sub`;
 const runtime=valid(compileProject({name:'RuntimeDeclarations',startup:'Sub Main',modules:[{name:'M',kind:'module',code}]}));
 results.fixedArrayCalls=await measure(async()=>{const output=[],vm=new VirtualMachine(runtime,{print:s=>output.push(s)});await vm.start();if(output.join()!==String(options.iterations+1)||vm.lastError)throw new Error('Runtime result differs');});
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,options,results},null,2));
}catch(error){console.error(error.stack||error);process.exitCode=1;}
