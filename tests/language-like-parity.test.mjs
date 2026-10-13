import test from 'node:test';
import assert from 'node:assert/strict';
import {matchLike,compileLikePattern} from '../src/runtime/like.js';
import {binary,tagScalar,unbox} from '../src/runtime/values.js';
import {compileProject} from '../src/language/compiler.js';
import {preprocess} from '../src/language/conditional.js';
import {VirtualMachine} from '../src/runtime/vm.js';

const cases=[
  ['aBBBa','a*a',true],['F','[A-Z]',true],['F','[!A-Z]',false],
  ['a2a','a#a',true],['aM5b','a[L-P]#[!c-e]',true],['BAT123khg','B?T*',true],
  ['CAT123khg','B?T*',false],['ab','a*b',true],['a*b','a [*]b',false],
  ['a [xyz','a [[]*',true],['','',true],['','*',true],['','[]',true],
  ['abc','a[]b[]c',true],['abc','*[]',true],['abc','[]*[]',true],
  ['a\nb','a?b',true],['a\r\nb','a*b',true],['\0','?',true],['a\n','a',false],
  ['[','[[]',true],[']',']',true],['^','[^]',true],['a','[^]',false],
  ['\\','[\\]',true],['*','[*]',true],['?','[?]',true],['#','[#]',true],
  ['!','[!!]',false],['a','[!!]',true],['a','[!]',true],['','[!]',false],
  ['-','[-a]',true],['-','[a-]',true],['-','[-]',true],['-','[!-]',false],
  ['x','[a-cx-z]',true],['d','[a-cx-z]',false],['7','[!a-z]',true],
  ['\ud800','?',true],['😀','??',true],['😀','?',false],
  ['abcdef','*a*b*c*d*e*f*',true],['aaaaaaaaab','*a*a*a*a*c',false],
];
for(const [source,pattern,expected] of cases)test('Like '+JSON.stringify([source,pattern]),()=>{
  assert.equal(matchLike(source,pattern),expected);
  assert.equal(binary('like',source,pattern),expected?-1:0);
  assert.equal(unbox(binary('like',tagScalar(source,'string'),tagScalar(pattern,'string'))),expected?-1:0);
});
for(const pattern of ['[','[z-a]','[a-b-c]','[a--b]'])test('Like Error 93: '+pattern,()=>{
  assert.throws(()=>matchLike('a',pattern),e=>e.number===93);
  assert.throws(()=>binary('like','a',pattern),e=>e.number===93);
});
test('Like invalid suffix is checked at matching position, and eagerly after a reached star',()=>{
  assert.equal(matchLike('a','b['),false);
  assert.equal(matchLike('a','b*['),false);
  assert.throws(()=>matchLike('a','a['),e=>e.number===93);
  assert.throws(()=>matchLike('a','*b['),e=>e.number===93);
  assert.throws(()=>matchLike('','*['),e=>e.number===93);
});
test('Like Text mode is isolated from Binary mode in the syntax cache',()=>{
  assert.equal(matchLike('BAT','b[a-z]t','text'),true);
  assert.equal(matchLike('BAT','b[a-z]t','binary'),false);
  assert.notEqual(compileLikePattern('A','binary'),compileLikePattern('A','text'));
  assert.equal(compileLikePattern('A'),compileLikePattern('A'));
  assert.ok(Object.isFrozen(compileLikePattern('[a-z]').tokens[0].ranges[0]));
});
test('Like bounded cache evicts old patterns and does not retain oversized patterns',()=>{
  const old=compileLikePattern('first-cache-entry');
  for(let i=0;i<200;i++)compileLikePattern('pattern-'+i);
  assert.notEqual(compileLikePattern('first-cache-entry'),old);
  const big='x'.repeat(65537);assert.notEqual(compileLikePattern(big),compileLikePattern(big));
});
test('Like adversarial wildcard pattern terminates without exponential regex backtracking',()=>{
  assert.equal(matchLike('a'.repeat(30000),'*a'.repeat(1000)+'b'),false);
  assert.equal(matchLike('a'.repeat(30000)+'b','*a'.repeat(1000)+'b'),true);
});
test('Like Null is propagated before pattern validation and scalars use VB string conversion',()=>{
  assert.equal(binary('like',null,'['),null);
  assert.equal(unbox(binary('like',tagScalar(null,'null',true),tagScalar('[','string'))),null);
  assert.equal(binary('like',undefined,''),-1);
  assert.equal(binary('like',17,'##'),-1);
});

// Independent tabulation oracle for valid small patterns (no greedy restarts).
function oracle(source,parts){
  let previous=Array(source.length+1).fill(false);previous[0]=true;
  for(const part of parts){
    const next=Array(source.length+1).fill(false);
    if(part==='[]'){previous=previous.slice();continue;}
    if(part==='*'){next[0]=previous[0];for(let i=1;i<next.length;i++)next[i]=previous[i]||next[i-1];}
    else for(let i=1;i<next.length;i++)next[i]=previous[i-1]&&(part==='?'||part==='#'&&/^[0-9]$/.test(source[i-1])||part==='[ab]'&&'ab'.includes(source[i-1])||part==='[!a]'&&source[i-1]!=='a'||part===source[i-1]);
    previous=next;
  }
  return previous[source.length];
}
test('Like exhaustive small strings and wildcard combinations agree with independent dynamic programming',()=>{
  const alphabet=['a','b','0','\n'],pieces=['a','b','?','*','#','[]','[ab]','[!a]'];
  const strings=[''];for(let n=1;n<=3;n++)for(const prefix of strings.filter(s=>s.length===n-1))for(const c of alphabet)strings.push(prefix+c);
  const patterns=[[]];for(let n=1;n<=3;n++)for(const prefix of patterns.filter(p=>p.length===n-1))for(const p of pieces)patterns.push([...prefix,p]);
  for(const source of strings)for(const parts of patterns)assert.equal(matchLike(source,parts.join('')),oracle(source,parts),JSON.stringify([source,parts]));
});
test('Like uses the same implementation in constants, conditional compilation and VM execution',async()=>{
  const code='Const A = "ab" Like "a[]b"\nSub Main()\nDebug.Print A\nDebug.Print "a" & vbLf & "b" Like "a?b"\nOn Error Resume Next\nDebug.Print "a" Like "[z-a]"\nDebug.Print Err.Number\nEnd Sub';
  const program=compileProject({name:'Like',startup:'Sub Main',modules:[{name:'M',kind:'module',code}]});
  assert.deepEqual(program.diagnostics,[]);const output=[];const vm=new VirtualMachine(program,{print:s=>output.push(s)});await vm.start();
  assert.deepEqual(output,['True','True','93']);
  assert.equal(preprocess('#If "ab" Like "a[]b" Then\nselected\n#End If').trim(),'selected');
});
