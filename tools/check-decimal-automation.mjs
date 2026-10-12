import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {VBDecimal as D} from '../src/runtime/decimal.js';

const directory=path.resolve('reports/decimal'),input=path.join(directory,'automation-input.json'),output=path.join(directory,'automation-output.json');
const MAX=(1n<<96n)-1n,operations=['add','subtract','multiply','divide','compare'];
fs.mkdirSync(directory,{recursive:true});
if(process.argv[2]==='--generate'){
  const cases=[];
  const add=(a,b)=>{for(const operation of operations)cases.push({id:'decimal-'+String(cases.length).padStart(5,'0'),operation,left:a.toString(),right:b.toString()});};
  const fixed=['0','1','-1','2','-3','0.1','0.5','1e-28','3e-28','7e-28',String(MAX),String(MAX-1n),String(-MAX),'7.9228162514264337593543950335','7922816251426433759354395033.5'].map(value=>new D(value));
  for(const left of fixed)for(const right of fixed)add(left,right);
  let state=0x6dec2026;
  const word=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
  const decimal=()=>{const raw=(BigInt(word())<<64n)|(BigInt(word())<<32n)|BigInt(word());return D.fromParts(word()&1?-raw:raw,word()%29);};
  for(let i=0;i<256;i++)add(decimal(),decimal());
  fs.writeFileSync(input,JSON.stringify(cases,null,2)+'\n');
  console.log('Generated '+cases.length+' Decimal Automation fixtures.');
}else if(process.argv[2]==='--check'){
  const cases=JSON.parse(fs.readFileSync(input,'utf8')),results=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.equal(results.length,cases.length,'Native runner must report every fixture');
  const byId=new Map(results.map(row=>[row.id,row]));assert.equal(byId.size,cases.length,'Duplicate native fixture result');
  const failures=[];let matches=0;
  for(const fixture of cases){
    const native=byId.get(fixture.id);assert.ok(native,'Missing native fixture '+fixture.id);
    let expected;
    try{
      const value=new D(fixture.left)[fixture.operation](new D(fixture.right));
      expected={value:fixture.operation==='compare'?String(value):value.toString()};
    }catch(error){
      if(![6,11].includes(error.number))throw error;
      expected={error:error.number};
    }
    const nativeError=({'8002000a':6,'80020012':11})[(native.hresult>>>0).toString(16)];
    let agrees=false;
    if(expected.error)agrees=nativeError===expected.error;
    else if(native.hresult===0){
      agrees=fixture.operation==='compare'?native.value===expected.value:new D(native.value).compare(new D(expected.value))===0;
    }
    if(agrees)matches++;else failures.push({...fixture,expected,native});
  }
  const report={reference:'Windows OleAut32 VarDecAdd/Sub/Mul/Div/Cmp; not a VB6 compiler run',node:process.version,platform:process.platform,architecture:process.arch,total:cases.length,matches,failures};
  fs.writeFileSync(path.join(directory,'automation-comparison.json'),JSON.stringify(report,null,2)+'\n');
  console.log(matches+' / '+cases.length+' exact Decimal Automation comparisons matched.');
  if(failures.length){console.error(JSON.stringify(failures.slice(0,20),null,2));process.exitCode=1;}
}else throw new Error('Usage: node tools/check-decimal-automation.mjs --generate|--check');
