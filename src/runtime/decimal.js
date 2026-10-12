import {VBError} from '../language/errors.js';
const MAX=(1n<<96n)-1n;
const abs=n=>n<0n?-n:n;
// Arithmetic needs at most 56 decimal places. Conversion may temporarily need
// more, but user-controlled exponents must never grow a process-wide cache.
const POWERS=(()=>{const values=[1n];for(let n=1;n<=56;n++)values.push(values[n-1]*10n);return Object.freeze(values);})();
const ten=n=>POWERS[n]??10n**BigInt(n);
const operand=value=>value instanceof VBDecimal?value:new VBDecimal(value);
function rounded(n,d){if(d===0n)throw new VBError('Division by zero',11);const negative=(n<0n)!==(d<0n);n=abs(n);d=abs(d);let q=n/d,r=n%d;if(r*2n>d||r*2n===d&&q%2n!==0n)q++;return negative?-q:q;}
function fit(raw,scale){
  if(!Number.isInteger(scale)||scale<0||scale>4096)throw new VBError('Invalid Decimal scale',5);
  if(raw===0n)return [0n,0];
  // A fitting coefficient has at most 29 digits. Skip only candidates that
  // cannot fit even before rounding. Every candidate still rounds the original
  // coefficient: reducing an already-rounded value causes double rounding.
  let first=Math.max(0,scale-28);
  if(abs(raw)>MAX)first=Math.max(first,abs(raw).toString().length-29);
  for(let drop=first;drop<=scale;drop++){
    const value=drop?rounded(raw,ten(drop)):raw;
    if(abs(value)<=MAX){raw=value;scale-=drop;while(scale>0&&raw%10n===0n){raw/=10n;scale--;}return [raw,scale];}
  }
  throw new VBError('Overflow',6);
}
function parse(value){
  if(value instanceof VBDecimal)return [value.coefficient,value.scale];
  if(value===undefined)return [0n,0];
  if(value===null)throw new VBError('Invalid use of Null',94);
  if(typeof value==='boolean')return [value?-1n:0n,0];
  if(typeof value==='bigint')return fit(value,0);
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new VBError('Overflow',6);
    // OLE Double-to-Decimal conversion uses fifteen significant decimal digits.
    value=value.toPrecision(15);
  }
  if(typeof value!=='string')throw new VBError('Type mismatch',13);
  if(value.length>4096)throw new VBError('Decimal input exceeds conversion limit',7);
  const m=value.trim().match(/^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eEdD]([+-]?\d+))?$/);
  if(!m)throw new VBError('Type mismatch',13);
  const parts=m[2].split('.'),digits=(parts.join('').replace(/^0+/,'')||'0'),exponent=Number(m[3]||0);
  if(digits==='0')return [0n,0];
  if(!Number.isSafeInteger(exponent))throw new VBError('Overflow',6);
  let scale=(parts[1]?.length||0)-exponent,raw=BigInt(digits)*(m[1]==='-'?-1n:1n);
  if(scale<0){if(digits.length-scale>29)throw new VBError('Overflow',6);raw*=ten(-scale);scale=0;}
  if(scale-digits.length>28)return [0n,0];
  return fit(raw,scale);
}
function sum(left,right,subtract=false){
  right=operand(right);const scale=Math.max(left.scale,right.scale),a=left.coefficient*ten(scale-left.scale),b=right.coefficient*ten(scale-right.scale);
  return VBDecimal.fromParts(subtract?a-b:a+b,scale);
}
/** Immutable Variant/Decimal: a signed coefficient with 96 magnitude bits and
 * 0..28 decimal places. Arithmetic and comparisons never pass through Number. */
export class VBDecimal {
  constructor(value=0){[this.coefficient,this.scale]=parse(value);Object.freeze(this);}
  static fromParts(coefficient,scale){const d=Object.create(VBDecimal.prototype);[d.coefficient,d.scale]=fit(BigInt(coefficient),scale);return Object.freeze(d);}
  static fromBytes(bytes){
    if(!(bytes instanceof Uint8Array)||bytes.length!==16)throw new VBError('Invalid Decimal payload length',5);
    const v=new DataView(bytes.buffer,bytes.byteOffset,16),scale=v.getUint8(2),sign=v.getUint8(3);
    if(scale>28||(sign!==0&&sign!==128))throw new VBError('Invalid Decimal payload',5);
    const raw=(BigInt(v.getUint32(4,true))<<64n)|v.getBigUint64(8,true);
    return VBDecimal.fromParts(sign?-raw:raw,scale);
  }
  toBytes(){const bytes=new Uint8Array(16),v=new DataView(bytes.buffer),raw=abs(this.coefficient);v.setUint8(2,this.scale);v.setUint8(3,this.coefficient<0n?128:0);v.setUint32(4,Number(raw>>64n),true);v.setBigUint64(8,raw&((1n<<64n)-1n),true);return bytes;}
  toString(){const negative=this.coefficient<0n,n=abs(this.coefficient).toString().padStart(this.scale+1,'0');return (negative?'-':'')+(this.scale?n.slice(0,-this.scale)+'.'+n.slice(-this.scale):n);}
  valueOf(){return Number(this.coefficient)/10**this.scale;}
  toJSON(){return {__decimal:this.toString()};}
  negate(){return VBDecimal.fromParts(-this.coefficient,this.scale);}
  absolute(){return this.coefficient<0n?this.negate():this;}
  integer(floor=false){const divisor=ten(this.scale);let q=this.coefficient/divisor;if(floor&&this.coefficient<0n&&this.coefficient%divisor!==0n)q--;return VBDecimal.fromParts(q,0);}
  roundedInteger(){return rounded(this.coefficient,ten(this.scale));}
  round(digits=0){if(!Number.isInteger(digits)||digits<0||digits>28)throw new VBError('Invalid procedure call',5);return digits>=this.scale?this:VBDecimal.fromParts(rounded(this.coefficient,ten(this.scale-digits)),digits);}
  compare(other){other=operand(other);const difference=this.scale-other.scale,a=difference<0?this.coefficient*ten(-difference):this.coefficient,b=difference>0?other.coefficient*ten(difference):other.coefficient;return a<b?-1:a>b?1:0;}
  add(other){return sum(this,other);}
  subtract(other){return sum(this,other,true);}
  multiply(other){other=operand(other);return VBDecimal.fromParts(this.coefficient*other.coefficient,this.scale+other.scale);}
  divide(other){
    other=operand(other);if(other.coefficient===0n)throw new VBError('Division by zero',11);
    const difference=other.scale-this.scale,numerator=this.coefficient*ten(Math.max(0,difference)),denominator=other.coefficient*ten(Math.max(0,-difference));
    // Exact integer quotients need neither a 28-place temporary nor a scale
    // search; fromParts still enforces the same 96-bit overflow boundary.
    if(numerator%denominator===0n)return VBDecimal.fromParts(numerator/denominator,0);
    let first=28;
    if(abs(numerator)>abs(denominator))first=Math.min(first,29-(abs(numerator).toString().length-abs(denominator).toString().length));
    // The digit bound skips only coefficients necessarily greater than MAX.
    // A rounding carry is tested against MAX, then the exact ratio is retried.
    for(let scale=first;scale>=0;scale--){const raw=rounded(numerator*ten(scale),denominator);if(abs(raw)<=MAX)return VBDecimal.fromParts(raw,scale);}
    throw new VBError('Overflow',6);
  }
}
