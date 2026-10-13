/** Bulk, owned Recordset GetRows -> grid text snapshot. Foreign calls never
 * raise across this helper: one HRESULT leaves after all array locks and the
 * private conversion VARIANT have been released. No per-cell IDispatch, array
 * indexing, resize or repaint occurs. A caller receives the vector only after
 * every BSTR has been converted successfully.
 * https://learn.microsoft.com/office/client-developer/access/desktop-database-reference/getrows-method-ado
 * https://learn.microsoft.com/windows/win32/api/oleauto/nf-oleauto-safearrayaccessdata
 */
import {mem16,mem32} from './x86-operands.js';
const A='oleaut32.dll',arg=argument=>({argument}),addr=address=>({address});
const at=(base,displacement=0)=>mem32({base,displacement}),local=n=>at('ebp',n);
export function emitNativeGridDataPack(c,proc){
 const x=c.x,invalid=x.unique(),oom=x.unique(),badType=x.unique(),failed=x.unique(),cleanup=x.unique(),done=x.unique();
 // Locals: array handles -4/-8/-12, locked data -16/-20/-24, HRESULT -28,
 // VARTYPE -32, lower/upper -36/-40, conversion VARIANT -56..-41, count -60.
 x.label(proc.label).enter(64).local(-64).mov('edi','eax').mov('ecx',16).xor('eax','eax').cld().repStore(32);
 x.value(arg(8)).test().branch('e',invalid).cmp(at('eax'),0).branch('ne',invalid);
 x.value(arg(20)).compare(1).branch('l',invalid).compare(10000).branch('g',invalid)
  .value(arg(24)).compare(0).branch('l',invalid).compare(100000).branch('g',oom).inc('eax').imul('eax',local(20)).branch('o',oom)
  .compare(Math.min(1048576,Math.floor(c.maxArrayBytes/4))).branch('a',oom).mov(local(-60),'eax');
 x.value(arg(12)).test().branch('e',invalid).mov('eax',at('eax')).test().branch('e',invalid).mov(local(-4),'eax');
 const check=()=>x.test().branch('s',failed);
 function shape(handle,kind,dimensions,lengths){
  x.api(A,'SafeArrayGetDim',[arg(handle)]).compare(dimensions).branch('ne',invalid);
  x.api(A,'SafeArrayGetElemsize',[arg(handle)]).compare(kind===12?16:4).branch('ne',badType);
  x.api(A,'SafeArrayGetVartype',[arg(handle),addr(-32)]);check();
  x.cmp(mem16({base:'ebp',displacement:-32}),kind).branch('ne',badType);
  for(const [index,length]of lengths.entries()){
   x.api(A,'SafeArrayGetLBound',[arg(handle),index+1,addr(-36)]);check();
   x.api(A,'SafeArrayGetUBound',[arg(handle),index+1,addr(-40)]);check();
   x.value(arg(-40)).sub('eax',local(-36)).branch('o',invalid).inc('eax').branch('o',invalid).cmp('eax',local(length)).branch('ne',invalid);
  }
 }
 shape(-4,8,1,[20]);
 const noBody=x.unique();x.cmp(local(24),0).branch('e',noBody).value(arg(16)).test().branch('e',invalid)
  .cmp(mem16({base:'eax'}),0x200c).branch('ne',badType).mov('eax',at('eax',8)).test().branch('e',invalid).mov(local(-8),'eax');
 shape(-8,12,2,[20,24]);x.label(noBody);
 x.api(A,'SafeArrayCreateVector',[8,0,arg(-60)]).test().branch('e',oom).mov(local(-12),'eax');
 x.api(A,'SafeArrayAccessData',[arg(-4),addr(-16)]);check();
 const notLocked=x.unique();x.cmp(local(-8),0).branch('e',notLocked).api(A,'SafeArrayAccessData',[arg(-8),addr(-20)]);check();x.label(notLocked);
 x.api(A,'SafeArrayAccessData',[arg(-12),addr(-24)]);check();
 x.mov('esi',local(-16)).mov('edi',local(-24)).mov('ebx',local(20));
 const headers=x.unique(),body=x.unique(),loop=x.unique(),nil=x.unique(),store=x.unique();
 x.label(headers).pushOperand(at('esi')).invoke(A,'SysStringLen').compare(1048576).branch('a',oom)
  .push().pushOperand(at('esi')).invoke(A,'SysAllocStringLen').test().branch('e',oom).mov(at('edi'),'eax')
  .add('esi',4).add('edi',4).dec('ebx').branch('ne',headers);
 x.mov('ebx',local(20)).imul('ebx',local(24)).testOperand('ebx','ebx').branch('e',cleanup).mov('esi',local(-20));
 x.label(loop).cmp(mem16({base:'esi'}),1).branch('e',nil)
  .push(8).push(2).push(0x400).pushOperand('esi').push(addr(-56)).invoke(A,'VariantChangeTypeEx');check();
 x.cmp(mem16({base:'ebp',displacement:-56}),8).branch('ne',badType)
  .api(A,'SysStringLen',[arg(-48)]).compare(1048576).branch('a',oom).mov('eax',local(-48));
 // A successful VT_BSTR conversion transfers the owned payload without copying.
 x.mov(local(-56),0).mov(local(-52),0).mov(local(-48),0).mov(local(-44),0).jump(store);
 x.label(nil).api(A,'SysAllocStringLen',[0,0]).test().branch('e',oom);
 x.label(store).mov(at('edi'),'eax').add('edi',4).add('esi',16).dec('ebx').branch('ne',loop).jump(cleanup);
 x.label(invalid).value(0x80070057).jump(failed).label(badType).value(0x80020005).jump(failed).label(oom).value(0x8007000e);
 x.label(failed).mov(local(-28),'eax');
 x.label(cleanup).api(A,'VariantClear',[addr(-56)]);
 // Successful AccessData calls are paired exactly once, in reverse order.
 for(const [data,handle]of [[-24,-12],[-20,-8],[-16,-4]]){
  const skip=x.unique(),ok=x.unique();x.cmp(local(data),0).branch('e',skip).api(A,'SafeArrayUnaccessData',[arg(handle)]).test().branch('ns',ok)
   .cmp(local(-28),0).branch('ne',ok).mov(local(-28),'eax').label(ok).mov(local(data),0).label(skip);
 }
 const publish=x.unique();x.cmp(local(-28),0).branch('e',publish).cmp(local(-12),0).branch('e',done).api(A,'SafeArrayDestroy',[arg(-12)]).jump(done);
 x.label(publish).mov('edx',local(-12)).value(arg(8)).mov(at('eax'),'edx').label(done).value(arg(-28)).leave(20);
}
