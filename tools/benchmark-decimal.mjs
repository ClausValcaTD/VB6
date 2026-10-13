import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {VBDecimal as Current} from '../src/runtime/decimal.js';

const baseline='260a681c2bdcd5d75becd545312293ba34c3d6ec';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vb6-decimal-benchmark-'));
try{
  fs.mkdirSync(path.join(temporary,'runtime'));fs.mkdirSync(path.join(temporary,'language'));
  fs.writeFileSync(path.join(temporary,'package.json'),'{"type":"module"}\n');
  const source=execFileSync('git',['show',baseline+':src/runtime/decimal.js'],{encoding:'utf8'});
  fs.writeFileSync(path.join(temporary,'runtime/decimal.js'),source);
  fs.copyFileSync('src/language/errors.js',path.join(temporary,'language/errors.js'));
  const {VBDecimal:Before}=await import(pathToFileURL(path.join(temporary,'runtime/decimal.js')).href);
  const max=(1n<<96n)-1n;
  const specs=[
    {name:'same-scale 96-bit comparison',operation:'compare',pair:i=>[String(max-BigInt(i)),String(max-31n+BigInt(i))]},
    {name:'mixed-scale addition',operation:'add',pair:i=>['123456789012345.'+String(i).padStart(4,'0'),'0.000000'+String(123456+i)]},
    {name:'scaled multiplication',operation:'multiply',pair:i=>['12345678.'+String(12345678+i),'0.000000'+String(12345678+i)]},
    {name:'large exact integer division',operation:'divide',pair:i=>[String(max-BigInt(i)),'1']},
    {name:'large fractional division',operation:'divide',pair:i=>[String(max-BigInt(i)),'1.1']},
    {name:'small fractional division',operation:'divide',pair:i=>[String(i+1),'37']}
  ];
  const iterations=12000,warmups=3,samples=7,results=[];
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  for(const spec of specs){
    const inputs=Array.from({length:32},(_,i)=>spec.pair(i));
    const before=inputs.map(([a,b])=>[new Before(a),new Before(b)]),after=inputs.map(([a,b])=>[new Current(a),new Current(b)]);
    for(let i=0;i<inputs.length;i++)assert.equal(String(after[i][0][spec.operation](after[i][1])),String(before[i][0][spec.operation](before[i][1])),spec.name+' fixture '+i);
    function run(fixtures){
      let checksum=0;const start=performance.now();
      for(let i=0;i<iterations;i++){
        const [a,b]=fixtures[i%fixtures.length],value=a[spec.operation](b);
        checksum+=typeof value==='number'?value:Number(value.coefficient&65535n);
      }
      return {ms:performance.now()-start,checksum};
    }
    for(let i=0;i<warmups;i++){const a=run(before),b=run(after);assert.equal(a.checksum,b.checksum);}
    const oldTimes=[],newTimes=[];
    for(let i=0;i<samples;i++){
      let a,b;if(i%2){b=run(after);a=run(before);}else{a=run(before);b=run(after);}
      assert.equal(a.checksum,b.checksum);oldTimes.push(a.ms);newTimes.push(b.ms);
    }
    const oldMedian=median(oldTimes),newMedian=median(newTimes);
    const result={workload:spec.name,iterations,baseline_ms:oldTimes,candidate_ms:newTimes,baseline_median_ms:oldMedian,candidate_median_ms:newMedian,speedup:oldMedian/newMedian};
    results.push(result);console.log(spec.name+': '+oldMedian.toFixed(3)+' -> '+newMedian.toFixed(3)+' ms ('+result.speedup.toFixed(2)+'x)');
  }
  const report={scope:'Targeted Decimal runtime microbenchmarks; not compiler-wide or Windows hardware performance',baseline,baseline_source_sha256:createHash('sha256').update(source).digest('hex'),candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model,warmups,samples,fixture_creation_timed:false,output_checks:true,results};
  fs.mkdirSync('reports/decimal',{recursive:true});fs.writeFileSync('reports/decimal/benchmark.json',JSON.stringify(report,null,2)+'\n');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
