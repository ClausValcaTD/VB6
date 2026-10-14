/** Counted String mutation statements. Capture the destination and its original
 * value before operands. Never edit shared literals or borrowed BSTR storage.
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/mid-statement
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/lset-statement
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/rset-statement
 */
import {mem16,mem32} from './x86-operands.js';
import {MAX_NATIVE_STRING} from './storage.js';
const P='native:string-statement:',A='oleaut32.dll',key=v=>String(v).toLowerCase(),arg=argument=>({argument});
const at=(base,displacement=0)=>mem32({base,displacement});
export function nativeStringStatement(c,ins){
 if(!['stringMid','stringAlign'].includes(ins.op))return false;
 const v=c.variable(ins.target),x=c.x;
 if(!v||!['string','variant'].includes(key(v.type))||v.recordFieldArray||v.nativeArray&&!v.elementOf)c.fail('Native '+(ins.op==='stringMid'?'Mid':'LSet/RSet')+' requires an addressable String or Variant (String)');
 c.nativeStringStatements=true;
 const address=c.arrayWorkspace(4,'string-write-address'),pin=c.address(v);x.mov(at('ebp',address.offset),'eax');
 const alias={name:address.name,type:v.type,parameter:true,byRef:true,offset:address.offset,fixedLength:v.fixedLength,nativeInlineString:v.nativeInlineString};
 c.load(alias);
 if(key(v.type)==='variant'){
  x.cmp(mem16({base:'eax'}),8).branch('ne','error:13').mov('eax',at('eax',8)).push().call('native:string:copy');c.ownString();
 }
 const original=c.arrayWorkspace(4,'string-write-original');x.mov(at('ebp',original.offset),'eax');
 if(ins.op==='stringMid'){
  c.numeric(ins.start);x.compare(1).branch('l','error:5');const start=c.arrayWorkspace(4,'mid-start');x.mov(at('ebp',start.offset),'eax');
  if(ins.length)c.numeric(ins.length);else x.value(MAX_NATIVE_STRING);
  x.test().branch('s','error:5');const length=c.arrayWorkspace(4,'mid-length');x.mov(at('ebp',length.offset),'eax');
  c.textExpression(ins.expr);x.push().push(arg(length.offset)).push(arg(start.offset)).push(arg(original.offset)).call(P+'mid');
 }else{
  c.textExpression(ins.expr);x.push().push(ins.right?1:0).push(arg(original.offset)).call(P+'align');
 }
 const unchanged=x.unique();
 // A zero-count Mid is a no-op, even if evaluating its RHS changed the target.
 if(ins.op==='stringMid')x.test().branch('e',unchanged);
 const result=c.ownString();
 if(key(v.type)==='variant')c.boxVariant(c.nativeKernelStorage(result));
 c.store(alias);x.label(unchanged);c.releaseArrayPin(pin);return true;
}
export function emitNativeStringStatements(c){
 if(!c.nativeStringStatements)return;const x=c.x;
 const fits=x.unique(),empty=x.unique(),done=x.unique();
 // mid(original,start,length,source) -> owned result, or 0 for no publication.
 x.label(P+'mid').enter(4).api(A,'SysStringLen',[arg(8)]).compare(MAX_NATIVE_STRING).branch('a','error:7').mov('ebx','eax')
  .value(arg(12)).compare(1).branch('l','error:5').dec('eax').mov('edi','eax').cmp('eax','ebx').branch('ae',empty)
  .value(arg(16)).test().branch('s','error:5').test().branch('e',empty)
  .sub('ebx','edi').cmp('eax','ebx').branch('ae',fits).mov('ebx','eax').label(fits)
  .api(A,'SysStringLen',[arg(20)]).cmp('eax','ebx');const count=x.unique();x.branch('ae',count).mov('ebx','eax').label(count)
  .testOperand('ebx','ebx').branch('e',empty).mov(at('ebp',-4),'edi')
  .push(arg(8)).call('native:string:copy').push().mov('edi','eax').mov('eax',at('ebp',-4)).lea('edi',mem32({base:'edi',index:'eax',scale:2}))
  .value(arg(20)).mov('esi','eax').mov('ecx','ebx').cld().repMove(16).popOperand('eax').jump(done)
  .label(empty).value(0).label(done).leave(16);
 // align(original,right,source) -> owned exactly original-length, space-padded.
 const copyFits=x.unique(),left=x.unique();
 x.label(P+'align').enter().api(A,'SysStringLen',[arg(8)]).compare(MAX_NATIVE_STRING).branch('a','error:7').mov('ebx','eax')
  .api(A,'SysStringLen',[arg(16)]).cmp('eax','ebx').branch('be',copyFits).mov('eax','ebx').label(copyFits).mov('esi','eax')
  .pushOperand('ebx').push(0).invoke(A,'SysAllocStringLen').test().branch('e','error:7').push().mov('edi','eax').mov('ecx','ebx').mov('eax',32).cld().repStore(16)
  .mov('edi',at('esp')).cmp(at('ebp',12),0).branch('e',left).sub('ebx','esi').lea('edi',mem32({base:'edi',index:'ebx',scale:2})).label(left)
  .mov('ecx','esi').value(arg(16)).mov('esi','eax').repMove(16).popOperand('eax').leave(12);
}
