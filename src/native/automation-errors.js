/** HRESULT/EXCEPINFO/IErrorInfo transfer. Capture metadata before releasing COM
 * objects (Release may overwrite the thread's error object). Raise only after
 * every temporary is released; no external stack frame is bypassed.
 * https://learn.microsoft.com/windows/win32/api/oaidl/ns-oaidl-excepinfo
 */
import {mem32,mem16} from './x86-operands.js';
const P='native:automation:',E='native:error:',arg=argument=>({argument}),addr=address=>({address}),at=(base,displacement=0)=>mem32({base,displacement});
export function emitAutomationErrors(c){
 const x=c.x,done=x.unique(),filled=x.unique();
 x.label(P+'fill-error').enter(4).mov(at('ebp',-4),0).value(arg(8)).mov('esi','eax').mov('eax',at('esi',24)).test().branch('e',filled)
  .mov(at('esi',24),0).pushOperand('esi').callIndirect('eax');
 x.label(filled).api('oleaut32.dll','GetErrorInfo',[0,addr(-4)]).value(arg(-4)).test().branch('e',done);
 for(const [field,method]of [[4,16],[8,20],[12,24],[16,28]]){
  const next=x.unique();x.cmp(at('esi',field),0).branch('ne',next).lea('eax',at('esi',field)).push().value(arg(-4)).mov('ebx','eax').pushOperand('ebx').mov('eax',at('ebx')).callIndirect(at('eax',method)).label(next);
 }
 x.push(arg(-4)).call(P+'release').label(done).value(0).leave(4);
 const no=x.unique();x.label(P+'free-ex').enter().value(arg(8)).test().branch('e',no).mov('esi','eax');
 for(const offset of [4,8,12])x.pushOperand(at('esi',offset)).mov(at('esi',offset),0).invoke('oleaut32.dll','SysFreeString');
 x.label(no).value(0).leave(4);
 x.label(P+'raise').enter(4).value(arg(8)).mov('edi','eax').value(arg(12)).mov('esi','eax');
 const original=x.unique(),mapped=x.unique();x.cmp('edi',0x80020009).branch('ne',original).testOperand('esi','esi').branch('e',original)
  .movzx('eax',mem16({base:'esi'})).test().branch('ne',mapped).mov('eax',at('esi',28)).test().branch('e',original).mov('edi','eax');
 x.label(original).mov('eax','edi');
 for(const [hr,n]of [[0x80040154,429],[0x800401f3,429],[0x80020003,438],[0x80020006,438],[0x8002000e,450],[0x8002000f,449],[0x80020004,448],[0x80020005,13],[0x80020008,13],[0x8002000a,6],[0x8007000e,7],[0x80070057,5],[0x80020009,440]]){
  const next=x.unique();x.compare(hr).branch('ne',next).value(n).jump(mapped).label(next);
 }
 x.mov('edx','eax').and('edx',0xffff0000).cmp('edx',0x800a0000).branch('ne',mapped).and('eax',65535);
 x.label(mapped).mov(at('ebp',-4),'eax').call(E+'clear').value(arg(-4)).store(E+'number').call(E+'description-for').store(E+'description')
  .value(c.string(c.project.name)).store(E+'source');
 const noFrame=x.unique();x.value({memory:E+'frame'}).test().branch('e',noFrame).mov('edx',at('eax',-44)).mov('eax',at('eax',-48)).store(E+'source').mov('eax','edx').store(E+'erl').label(noFrame);
 const dispatch=x.unique();x.testOperand('esi','esi').branch('e',dispatch);
 for(const [offset,name]of [[4,'source'],[8,'description'],[12,'helpfile']]){
  const next=x.unique();x.mov('eax',at('esi',offset)).test().branch('e',next).store(E+name).store(E+name+'-owner').mov(at('esi',offset),0).label(next);
 }
 x.mov('eax',at('esi',16)).store(E+'helpcontext').label(dispatch).jump(E+'dispatch');
}
