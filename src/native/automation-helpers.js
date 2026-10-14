/** Genuine COM/IDispatch clients for PE32. All local out parameters begin zero;
 * partial results and EXCEPINFO owners are released before any VB error jump.
 * https://learn.microsoft.com/windows/win32/api/oaidl/nf-oaidl-idispatch-invoke
 */
import {mem16,mem32} from './x86-operands.js';
import {emitAutomationErrors} from './automation-errors.js';
const P='native:automation:',A='oleaut32.dll',O='ole32.dll',arg=argument=>({argument}),addr=address=>({address});
const at=(base,displacement=0)=>mem32({base,displacement});
export function comCall(x,self,offset,args){
 x.value(self).mov('ebx','eax');for(const a of [...args].reverse())x.push(a);
 x.pushOperand('ebx').mov('eax',at('ebx')).callIndirect(at('eax',offset));
}
function zero(x,bytes){x.local(-bytes).mov('edi','eax').mov('ecx',bytes/4).xor('eax','eax').cld().repStore(32);}
export function emitNativeAutomation(c){
 if(!c.nativeAutomationUsed)return;const x=c.x;
 c.ro.align(4).label(P+'iid-null').zero(16).label(P+'iid-dispatch').u32(0x00020400).u32(0).u32(0xc0).u32(0x46000000)
  .label(P+'iid-unknown').u32(0).u32(0).u32(0xc0).u32(0x46000000);
 const none=x.unique(),object=x.unique();
 x.label(P+'release').enter().value(arg(8)).test().branch('e',none);comCall(x,arg(8),8,[]);x.label(none).value(0).leave(4);
 x.label(P+'check-object').cmp(mem16({base:'eax'}),9).branch('e',object).cmp(mem16({base:'eax'}),13).branch('e',object).cmp(mem16({base:'eax'}),0).branch('ne','error:424').label(object).ret();
 const ready=x.unique(),initialized=x.unique();x.label(P+'ensure').enter().api('kernel32.dll','GetCurrentThreadId').mov('esi','eax').value({memory:P+'thread'}).test().branch('ne',initialized)
  .api(O,'CoInitializeEx',[0,2]).test().branch('ns',ready).push(0).pushOperand('eax').call(P+'raise');
 x.label(ready).mov('eax','esi').store(P+'thread').label(initialized).cmp('eax','esi').branch('ne','error:5').value(0).leave();
 const stopped=x.unique();x.label(P+'shutdown').enter().value({memory:P+'thread'}).test().branch('e',stopped)
  .api(O,'CoUninitialize').value(0).store(P+'thread').label(stopped).value(0).leave();
 emitCreate(c);emitInvoke(c);emitIdentity(c);emitAutomationErrors(c);
}
function emitCreate(c){
 const x=c.x,fail=x.unique(),ok=x.unique(),scan=x.unique(),validated=x.unique();
 // create(destination VARIANT*, ProgID BSTR). CLSID16, out4, EXCEPINFO32, hr4.
 x.label(P+'create').enter(56);zero(x,56);x.call(P+'ensure');
 x.api(A,'SysStringLen',[arg(12)]).compare(1).branch('l','error:5').compare(1024).branch('g','error:5').mov('ecx','eax').value(arg(12)).mov('esi','eax');
 x.label(scan).cmp(mem16({base:'esi'}),0).branch('e','error:5').add('esi',2).dec('ecx').branch('ne',scan);
 x.api(A,'SetErrorInfo',[0,0]).api(O,'CLSIDFromProgID',[arg(12),addr(-16)]).test().branch('s',fail)
  .api(O,'CoCreateInstance',[addr(-16),0,5,P+'iid-dispatch',addr(-20)]).test().branch('s',fail);
 x.value(arg(-20)).test().branch('ne',ok).value(0x80004005).jump(fail);
 x.label(ok).value(arg(8)).push().invoke(A,'VariantClear').test().branch('s',fail);
 x.value(arg(8)).mov('edx','eax').value(arg(-20)).mov(at('edx'),9).mov(at('edx',4),0).mov(at('edx',8),'eax').mov(at('edx',12),0).mov('eax','edx').leave(8);
 x.label(fail).mov(at('ebp',-56),'eax').push(addr(-52)).call(P+'fill-error').push(arg(-20)).call(P+'release').push(addr(-52)).push(arg(-56)).call(P+'raise');
}
function emitInvoke(c){
 const x=c.x,fail=x.unique(),resolved=x.unique(),direct=x.unique(),get=x.unique(),invoke=x.unique(),byval=x.unique(),resultReady=x.unique(),bounded=x.unique();
 // 384 bytes: EXCEPINFO(-32), primary VARIANT(-48), owned result(-64),
 // DISPPARAMS(-80), dispatch(-84), owned QI(-88), HRESULT(-92), argerr(-96),
 // DISPID result(-100), selected result(-104), 65 DISPIDs(-364..-108).
 x.label(P+'invoke').enter(384);zero(x,384);x.call(P+'ensure').api(A,'SetErrorInfo',[0,0]);
 x.value(arg(12)).call(P+'check-object').mov('edx',at('eax',8)).testOperand('edx','edx').branch('e','error:91')
  .mov(at('ebp',-84),'edx').cmp(mem16({base:'eax'}),9).branch('e',direct);
 comCall(x,arg(-84),0,[P+'iid-dispatch',addr(-88)]);x.test().branch('s',fail).value(arg(-88)).mov(at('ebp',-84),'eax');
 x.label(direct).cmp(at('ebp',20),0).branch('e',resolved);
 comCall(x,arg(-84),20,[P+'iid-null',arg(16),arg(20),0x400,addr(-364)]);x.test().branch('s',fail).value(arg(-364)).mov(at('ebp',-100),'eax');
 x.label(resolved).value(arg(28)).mov(at('ebp',-80),'eax').value(arg(32)).mov(at('ebp',-72),'eax')
  .value(arg(20)).test();const count=x.unique();x.branch('e',count).dec('eax').label(count).mov(at('ebp',-68),'eax')
  .local(-360).mov(at('ebp',-76),'eax').testOperand(at('ebp',24),12).branch('e',invoke)
  .mov(at('ebp',-364),-3).local(-364).mov(at('ebp',-76),'eax').inc(at('ebp',-68));
 x.label(invoke);
 comCall(x,arg(-84),24,[arg(-100),P+'iid-null',0x400,arg(24),addr(-80),addr(-48),addr(-32),addr(-96)]);
 x.test().branch('s',fail).testOperand(mem16({base:'ebp',displacement:-48}),0x4000).branch('e',byval)
  .api(A,'VariantCopyInd',[addr(-64),addr(-48)]).test().branch('s',fail)
  .api(A,'VariantClear',[addr(-48)]).test().branch('s',fail).local(-64).jump(resultReady);
 x.label(byval).local(-48).label(resultReady).mov(at('ebp',-104),'eax').cmp(mem16({base:'eax'}),8).branch('ne',bounded)
  .pushOperand(at('eax',8)).invoke(A,'SysStringLen').compare(1048576).branch('be',bounded).value(0x8007000e).jump(fail);
 x.label(bounded).push(addr(-32)).call(P+'free-ex').push(arg(-88)).call(P+'release')
  .push(arg(-104)).push(arg(8)).call('native:variant:publish').leave(28);
 x.label(fail).mov(at('ebp',-92),'eax').push(addr(-32)).call(P+'fill-error')
  .api(A,'VariantClear',[addr(-48)]).api(A,'VariantClear',[addr(-64)]).push(arg(-88)).call(P+'release')
  .push(addr(-32)).push(arg(-92)).call(P+'raise');
}
function emitIdentity(c){
 const x=c.x,fail=x.unique();x.label(P+'identity').enter(48);zero(x,48);x.call(P+'ensure');
 for(const [input,out]of [[8,-4],[12,-8]]){
  const nil=x.unique();x.value(arg(input)).call(P+'check-object').mov('eax',at('eax',8)).test().branch('e',nil).mov(at('ebp',-12),'eax');
  comCall(x,arg(-12),0,[P+'iid-unknown',addr(out)]);x.test().branch('s',fail).label(nil);
 }
 x.value(arg(-4)).cmp('eax',at('ebp',-8));c.boolean('=');x.mov(at('ebp',-12),'eax')
  .push(arg(-4)).call(P+'release').push(arg(-8)).call(P+'release').value(arg(-12)).leave(8);
 x.label(fail).mov(at('ebp',-16),'eax').push(addr(-48)).call(P+'fill-error').push(arg(-4)).call(P+'release').push(arg(-8)).call(P+'release')
  .push(addr(-48)).push(arg(-16)).call(P+'raise');
}
