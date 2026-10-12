import {VBError} from '../language/errors.js';

// MS-VBAL 5.6.9.6 and the VB6/VBA Like reference. This is a wildcard matcher,
// not a translation into a backtracking JavaScript regular expression.
// Text mode retains the runtime's invariant case-folding contract; Windows
// locale-specific collation/ligature expansion is not claimed here.
const CACHE_ENTRIES=128, CACHE_CHARACTERS=65536;
const patterns=new Map();let cachedCharacters=0;
const invalid=()=>{throw new VBError('Invalid pattern string',93);};
const fold=(value,text)=>text?value.toLowerCase():value;

function parsePattern(pattern,text) {
  const tokens=[];let malformed=false;
  for(let i=0;i<pattern.length;i++){
    const value=pattern[i];
    if(value==='*'){
      if(tokens.at(-1)?.kind!=='star')tokens.push({kind:'star'});
    }else if(value==='?'||value==='#')tokens.push({kind:value==='?'?'any':'digit'});
    else if(value!=='[')tokens.push({kind:'literal',value:fold(value,text)});
    else {
      const end=pattern.indexOf(']',i+1);
      if(end<0){malformed=true;break;}
      let at=i+1;const negate=pattern[at]==='!';if(negate)at++;
      const ranges=[];
      if(pattern[at]==='-'){ranges.push(['-','-']);at++;}
      while(at<end){
        const first=fold(pattern[at++],text);
        if(first==='-'&&at<end){malformed=true;break;}
        let last=first;
        if(at+1<end&&pattern[at]==='-'){
          at++;last=fold(pattern[at++],text);
          if(last==='-'||last<first){malformed=true;break;}
        }
        ranges.push([first,last]);
      }
      if(malformed)break;
      // [] consumes no character; [!] is the complement of the empty set.
      if(ranges.length||negate)tokens.push({kind:'class',negate,ranges});
      i=end;
    }
  }
  if(malformed)tokens.push({kind:'invalid'});
  for(const token of tokens){if(token.ranges){token.ranges.forEach(Object.freeze);Object.freeze(token.ranges);}Object.freeze(token);}
  return Object.freeze({tokens:Object.freeze(tokens),malformed,text});
}

/** Cached syntax contains an error token instead of throwing eagerly. Like may
 * produce False before it reaches an invalid suffix; encountering * validates
 * the entire remaining pattern. The cache is bounded by both entries and input
 * characters, and never retains source strings being matched. */
export function compileLikePattern(pattern,compare='binary') {
  if(typeof pattern!=='string')throw new TypeError('Like pattern must be a string');
  const text=compare==='text',key=(text?'t:':'b:')+pattern;
  const cached=patterns.get(key);
  if(cached){patterns.delete(key);patterns.set(key,cached);return cached;}
  const result=parsePattern(pattern,text);
  if(key.length<=CACHE_CHARACTERS){
    while(patterns.size&&(patterns.size>=CACHE_ENTRIES||cachedCharacters+key.length>CACHE_CHARACTERS)){
      const oldest=patterns.keys().next().value;cachedCharacters-=oldest.length;patterns.delete(oldest);
    }
    patterns.set(key,result);cachedCharacters+=key.length;
  }
  return result;
}

function matches(token,value,text) {
  if(token.kind==='any')return true;
  if(token.kind==='digit')return value>='0'&&value<='9';
  value=fold(value,text);
  if(token.kind==='literal')return value===token.value;
  const found=token.ranges.some(([first,last])=>value>=first&&value<=last);
  return token.negate?!found:found;
}

/** Greedy wildcard matching with one restart position. At most O(n*m) token
 * comparisons and constant matching state; no regex engine, recursion, or
 * exponential branching. UTF-16 units, including NUL/CR/LF, are characters. */
export function matchLike(source,pattern,compare='binary') {
  if(typeof source!=='string')throw new TypeError('Like source must be a string');
  const {tokens,malformed,text}=compileLikePattern(pattern,compare);
  let input=0,position=0,star=-1,restart=0;
  for(;;){
    const token=tokens[position];
    if(token?.kind==='invalid')invalid();
    if(token?.kind==='star'){
      if(malformed)invalid();
      star=position++;restart=input;
      if(position===tokens.length)return true;
      continue;
    }
    if(input===source.length)return position===tokens.length;
    if(token&&matches(token,source[input],text)){input++;position++;continue;}
    if(star<0)return false;
    input=++restart;position=star+1;
  }
}
