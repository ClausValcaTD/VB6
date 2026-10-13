/** Non-gating source-runtime assignment benchmark. Compare independent source
 * roots; compile and construct VMs before timing startup/execution. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const options={root:path.resolve(import.meta.dirname,'..'),iterations:1000,warmup:3,samples:7};
try {
 for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i].replace(/^--/,''),value=process.argv[i+1];
  if(!Object.hasOwn(options,key)||value===undefined)throw new Error('Use --root path or --iterations/--warmup/--samples positive-integer');
  if(key==='root')options.root=path.resolve(value);
  else {const n=Number(value),limit=key==='iterations'?20000:1000;if(!Number.isSafeInteger(n)||n<1||n>limit)throw new Error('Benchmark count out of range');options[key]=n;}
 }
 const load=file=>import(pathToFileURL(path.join(options.root,'src',file)).href);
 const {compileProject}=await load('language/compiler.js'),{VirtualMachine}=await load('runtime/vm.js');
 const record='Private Type Item\nNumber As Long\nText As String\nPayload As Variant\nEnd Type\n',n=options.iterations;
 const fixtures=[
  {name:'typedRecordCopy',declarations:'Dim target As Item, source As Item',setup:'source.Number = 7\nsource.Text = "text"\nsource.Payload = CLng(12)',body:'target = source',output:'target.Number, target.Text, TypeName(target.Payload)',expected:'7 text Long'},
  {name:'typedRecordArrayCopy',declarations:'Dim values(1) As Item, source As Item',setup:'source.Number = 7\nsource.Text = "text"\nsource.Payload = CLng(12)',body:'values(0) = source',output:'values(0).Number, values(0).Text, TypeName(values(0).Payload)',expected:'7 text Long'},
  {name:'variantRecordCopy',declarations:'Dim target As Variant, source As Item',setup:'source.Number = 7\nsource.Text = "text"\nsource.Payload = CLng(12)',body:'target = source',output:'target.Number, target.Text, TypeName(target.Payload)',expected:'7 text Long'},
  {name:'scalarArrayWrites',declarations:'Dim values(1) As Long',setup:'',body:'values(0) = i',output:'values(0)',expected:String(n)}
 ];
 const results={};
 for(const fixture of fixtures){
  const code=record+`Sub Main()\nDim i As Long\n${fixture.declarations}\n${fixture.setup}\nFor i = 1 To ${n}\n${fixture.body}\nNext\nDebug.Print ${fixture.output}\nEnd Sub`;
  const program=compileProject({name:'RecordAssignments',startup:'Sub Main',modules:[{name:'M',kind:'module',code}]});assert.deepEqual(program.diagnostics,[]);
  const samples=[];let instructions;
  for(let i=-options.warmup;i<options.samples;i++){
   const output=[],vm=new VirtualMachine(program,{print:s=>output.push(s)},{sliceMilliseconds:1e9});
   try {const start=performance.now();await vm.start();const elapsed=performance.now()-start;
    assert.deepEqual(output,[fixture.expected]);assert.equal(vm.lastError,null);assert.equal(vm.stack.length,0);
    instructions??=vm.instructionCount;assert.equal(vm.instructionCount,instructions);if(i>=0)samples.push(elapsed);
   }finally{vm.stop();await vm.automationClose;await vm.dataClose;}
  }
  const sorted=[...samples].sort((a,b)=>a-b),mid=sorted.length>>1;
  results[fixture.name]={medianMs:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,minMs:sorted[0],maxMs:sorted.at(-1),samplesMs:samples,instructions,output:fixture.expected};
 }
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,options,results},null,2));
}catch(error){console.error(error.stack||error);process.exitCode=1;}
