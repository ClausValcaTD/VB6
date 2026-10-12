import test from 'node:test';
import assert from 'node:assert/strict';
import {VBDecimal as D} from '../src/runtime/decimal.js';
import {scalarBinary,tagScalar,unbox,scalarType} from '../src/runtime/values.js';

const MAX=(1n<<96n)-1n;
const magnitude=n=>n<0n?-n:n;
const power=n=>10n**BigInt(n);
// Deliberately starts at every legal output scale. No production fitting,
// power cache, digit bound, Decimal arithmetic or rounding helper is reused.
function rational(numerator,denominator){
  if(denominator===0n)return {error:11};
  const negative=(numerator<0n)!==(denominator<0n);
  numerator=magnitude(numerator);denominator=magnitude(denominator);
  for(let scale=28;scale>=0;scale--){
    const scaled=numerator*power(scale);let coefficient=scaled/denominator;
    const remainder=scaled%denominator;
    if(remainder*2n>denominator||remainder*2n===denominator&&(coefficient&1n)!==0n)coefficient++;
    if(coefficient>MAX)continue;
    while(scale>0&&coefficient%10n===0n){coefficient/=10n;scale--;}
    return {coefficient:negative?-coefficient:coefficient,scale};
  }
  return {error:6};
}
function check(action,expected,label){
  if(expected.error){assert.throws(action,e=>e.number===expected.error,label);return;}
  const result=action();assert.ok(result instanceof D,label);assert.ok(Object.isFrozen(result),label);
  assert.equal(result.coefficient,expected.coefficient,label);assert.equal(result.scale,expected.scale,label);
  assert.ok(magnitude(result.coefficient)<=MAX,label);assert.ok(result.scale>=0&&result.scale<=28,label);
}
function pair(a,b,label){
  const ac=a.coefficient,bc=b.coefficient,ap=power(a.scale),bp=power(b.scale);
  check(()=>a.add(b),rational(ac*bp+bc*ap,ap*bp),label+' add');
  check(()=>a.subtract(b),rational(ac*bp-bc*ap,ap*bp),label+' subtract');
  check(()=>a.multiply(b),rational(ac*bc,ap*bp),label+' multiply');
  check(()=>a.divide(b),rational(ac*bp,bc*ap),label+' divide');
  const left=ac*bp,right=bc*ap;
  assert.equal(a.compare(b),left<right?-1:left>right?1:0,label+' compare');
  assert.equal(a.coefficient,ac,label+' unchanged lhs');assert.equal(b.coefficient,bc,label+' unchanged rhs');
}

for(const sign of [1n,-1n])test('Decimal exact half-even and carry boundaries, sign '+sign,()=>{
  for(const raw of [5n,15n,25n,35n,45n,55n,MAX*10n-5n,MAX*10n+4n,MAX*10n+5n,MAX*100n+49n,MAX*100n+51n]){
    for(const scale of [0,1,2,28,29,56])check(()=>D.fromParts(sign*raw,scale),rational(sign*raw,power(scale)),String(raw)+' / 10^'+scale);
  }
});
for(const scale of [0,1,14,27,28])test('Decimal all operations at scale '+scale,()=>{
  const values=[0n,1n,-1n,2n,-3n,MAX,MAX-1n,-MAX,-MAX+1n].map(n=>D.fromParts(n,scale));
  for(const a of values)for(const b of values)pair(a,b,a+' , '+b);
});
for(const [left,right] of [['1','3'],['2','3'],['1','6'],['-1','6'],['1e-28','2'],['3e-28','2'],['5e-28','2'],['7e-28','2'],[String(MAX),'1.0000000000000000000000000001'],[String(MAX),'.9999999999999999999999999999'],[String(MAX),'1e-28'],['1e-28',String(MAX)],['123.456','.001'],['-123.456','-.001']])test('Decimal ratio '+left+' / '+right,()=>pair(new D(left),new D(right),left+' / '+right));

for(let seed=1;seed<=16;seed++)test('Decimal independent rational oracle, deterministic seed '+seed,()=>{
  let state=seed;
  const word=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
  const decimal=()=>{const raw=(BigInt(word())<<64n)|(BigInt(word())<<32n)|BigInt(word());return D.fromParts(word()&1?-raw:raw,word()%29);};
  for(let i=0;i<128;i++)pair(decimal(),decimal(),'seed '+seed+' case '+i);
});

test('Decimal conversion fits large transient scales without retaining a growing power cache',()=>{
  for(const scale of [57,128,1024,4096]){
    check(()=>D.fromParts(power(scale),scale),{coefficient:1n,scale:0},'scale '+scale);
    check(()=>D.fromParts(25n*power(scale-29),scale),{coefficient:2n,scale:28},'tie at scale '+scale);
  }
  assert.throws(()=>D.fromParts(0n,4097),e=>e.number===5);
  assert.throws(()=>D.fromParts(0n,-1),e=>e.number===5);
  assert.throws(()=>D.fromParts(1n,0.5),e=>e.number===5);
});
test('Decimal input conversions and errors retain their existing contract',()=>{
  for(const [input,expected] of [[undefined,'0'],[true,'-1'],[false,'0'],['.125','0.125'],[' -1.25D+2 ','-125'],['1e-4000','0'],['0e999999999999999999999','0']])assert.equal(new D(input).toString(),expected);
  assert.equal(new D(1.2345678901234567).toString(),'1.23456789012346');
  for(const [input,number] of [[null,94],['',13],['NaN',13],[{},13],[Infinity,6],[NaN,6],[(MAX+1n).toString(),6],['1'.repeat(4097),7]])assert.throws(()=>new D(input),e=>e.number===number);
});
test('Decimal comparison aligns only the differing scales without losing low-order digits',()=>{
  const a=new D('7922816251426433759354395033.5'),b=new D('7922816251426433759354395033');
  assert.equal(a.compare(b),1);assert.equal(b.compare(a),-1);
  assert.equal(a.negate().compare(b.negate()),-1);
  assert.equal(new D('0.0000000000000000000000000001').compare(0),1);
});
test('Decimal Int, Fix, Round and roundedInteger retain exact signed ties',()=>{
  const d=new D('-2.5');assert.equal(d.integer().toString(),'-2');assert.equal(d.integer(true).toString(),'-3');assert.equal(d.roundedInteger(),-2n);
  assert.equal(new D('-3.5').roundedInteger(),-4n);
  assert.equal(new D('1.245').round(2).toString(),'1.24');assert.equal(new D('1.255').round(2).toString(),'1.26');
  assert.equal(new D('-1.245').round(2).toString(),'-1.24');assert.equal(new D('-1.255').round(2).toString(),'-1.26');
});
test('Decimal Automation payload respects byte offsets and ignores reserved input words',()=>{
  const original=new D('-7922816251426433759354395033.5'),buffer=new Uint8Array(30),view=buffer.subarray(7,23);
  view.set(original.toBytes());view[0]=255;view[1]=255;
  const copy=D.fromBytes(view);assert.equal(copy.toString(),original.toString());
  assert.equal(copy.toBytes()[0],0);assert.equal(copy.toBytes()[1],0);
  view[2]=29;assert.throws(()=>D.fromBytes(view),e=>e.number===5);view[2]=1;view[3]=1;assert.throws(()=>D.fromBytes(view),e=>e.number===5);
  assert.throws(()=>D.fromBytes(new Uint8Array(15)),e=>e.number===5);
});
for(const [op,expected] of [['+','1.75'],['-','0.75'],['*','0.625'],['/','2.5']])test('Variant/Decimal runtime operator '+op,()=>{
  const result=scalarBinary(op,tagScalar(new D('1.25'),'decimal',true),tagScalar(new D('.5'),'decimal',true));
  assert.equal(scalarType(result),'decimal');assert.equal(result.variant,true);assert.equal(unbox(result).toString(),expected);
});
