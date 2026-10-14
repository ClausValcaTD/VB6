/** Native lowering of the private grid PublishData transaction. The VB kernel
 * remains an independently executable algorithm oracle. Dense metadata vectors
 * are filled/copied while locked once, not via a foreign call for every row.
 * All preparation and unlocking precede the guarded, non-callback publication.
 */
import {mem32} from './x86-operands.js';
import {NATIVE_GRID_FIELDS as F,NATIVE_GRID_MAX_CELLS} from './control-grid-contract.js';
const DLL='oleaut32.dll',arg=argument=>({argument}),addr=address=>({address});
const at=(base,displacement=0)=>mem32({base,displacement}),m=n=>at('ebp',n);
export function emitNativeGridDataTransaction(c,proc){
 const x=c.x,{label,count,fields}=c.gridModule.nativeState;
 const fresh=[-4,-8,-12,-16,-20],data=[-24,-28,-32,-36,-40],oldData=[-44,-48,-52],old=[-56,-60,-64,-68,-72,-76];
 const fail=x.unique(),cleanup=x.unique(),finish=x.unique(),commit=x.unique(),invalid=x.unique(),memory=x.unique(),stale=x.unique(),version=x.unique(),idError=x.unique();
 x.label(proc.label).enter(96).local(-96).mov('edi','eax').mov('ecx',24).xor('eax','eax').cld().repStore(32);
 x.value(arg(8)).compare(count).branch('ae',idError).imul('eax','eax',fields*4).emit(0x05).addr(label).mov('ebx','eax');
 const guard=()=>x.value(arg(12)).test().branch('e',stale).cmp('eax',at('ebx',F.hwnd*4)).branch('ne',stale)
  .value(arg(16)).cmp('eax',at('ebx',F.epoch*4)).branch('ne',stale).value(arg(20)).cmp('eax',at('ebx',F.version*4)).branch('ne',version);
 guard();x.value(arg(24)).test().branch('e',invalid).cmp(at('eax'),0).branch('e',invalid)
  .value(arg(28)).compare(0).branch('l',invalid).compare(100001).branch('g',invalid)
  .value(arg(32)).compare(1).branch('l',invalid).compare(10000).branch('g',invalid)
  .imul('eax',m(28)).branch('o',memory).compare(NATIVE_GRID_MAX_CELLS).branch('a',memory);
 const checked=()=>x.test().branch('s',fail);
 for(let i=0;i<5;i++)x.api(DLL,'SafeArrayCreateVector',[3,0,arg(i===1||i===2?28:32)]).test().branch('e',memory).mov(m(fresh[i]),'eax');
 guard();
 const n=x.unique();x.value(arg(32)).cmp('eax',at('ebx',F.cols*4)).branch('le',n).mov('eax',at('ebx',F.cols*4)).label(n).mov(m(-88),'eax');
 // Capture old vector ownership before lock acquisition, but never dispose it
 // on a preparation failure. This list becomes the retired set only at commit.
 for(const [i,field]of [F.cells,F.widths,F.heights,F.rowdata,F.coldata,F.alignment].entries())x.mov('eax',at('ebx',field*4)).mov(m(old[i]),'eax');
 for(const i of [0,1,3,4]){const empty=x.unique();if(i===1)x.cmp(m(28),0).branch('e',empty);x.api(DLL,'SafeArrayAccessData',[arg(fresh[i]),addr(data[i])]);checked();x.label(empty);}
 for(const [i,oldIndex]of [1,4,5].entries()){x.api(DLL,'SafeArrayAccessData',[arg(old[oldIndex]),addr(oldData[i])]);checked();}
 x.mov('edi',m(data[0])).value(1200).mov('ecx',m(32)).cld().repStore(32)
  .mov('edi',m(data[1])).value(315).mov('ecx',m(28)).repStore(32);
 for(const [i,destination]of [0,3,4].entries())x.mov('esi',m(oldData[i])).mov('edi',m(data[destination])).mov('ecx',m(-88)).repMove(32);
 x.jump(cleanup);
 for(const [label,code]of [[invalid,380],[memory,7],[stale,91],[version,5],[idError,340]])x.label(label).value(code).jump(fail);
 x.label(fail).mov(m(-80),'eax');
 x.label(cleanup);
 // Reverse lock order; retain the original failure rather than replacing it
 // with a secondary cleanup HRESULT. Null pointers identify unacquired locks.
 for(const [pointer,handle]of [...data.map((p,i)=>[p,fresh[i]]),...oldData.map((p,i)=>[p,old[[1,4,5][i]]])].reverse()){
  const skip=x.unique(),ok=x.unique();x.cmp(m(pointer),0).branch('e',skip).api(DLL,'SafeArrayUnaccessData',[arg(handle)]).test().branch('ns',ok)
   .cmp(m(-80),0).branch('ne',ok).mov(m(-80),'eax').label(ok).mov(m(pointer),0).label(skip);
 }
 x.cmp(m(-80),0).branch('e',commit);
 for(const handle of fresh){const next=x.unique();x.cmp(m(handle),0).branch('e',next).api(DLL,'SafeArrayDestroy',[arg(handle)]).mov(m(handle),0).label(next);}
 x.value(arg(-80)).test().branch('s',finish).jump('native:error:raise');
 x.label(finish).call('native:variant:check').leave(28);
 x.label(commit);guard();
 // No foreign/user code is invoked between the final identity/version guard
 // and publication of all dimensions, pointers and the caller's owner transfer.
 x.value(arg(24)).mov('edx',at('eax')).mov(at('eax'),0).mov(at('ebx',F.cells*4),'edx');
 for(const [i,field]of [F.widths,F.heights,F.rowdata,F.coldata,F.alignment].entries())x.mov('eax',m(fresh[i])).mov(at('ebx',field*4),'eax').mov(m(fresh[i]),0);
 x.value(arg(28)).mov(at('ebx',F.rows*4),'eax').test().setcc('ne','al').movzx('eax','al');
 for(const field of [F.fixedrows,F.row,F.rowsel,F.toprow])x.mov(at('ebx',field*4),'eax');
 x.value(arg(32)).mov(at('ebx',F.cols*4),'eax').value(0);
 for(const field of [F.fixedcols,F.col,F.colsel,F.leftcol])x.mov(at('ebx',field*4),'eax');
 // With at most a header, row selection remains 0 even when FixedRows=1.
 const body=x.unique();x.cmp(m(28),1).branch('g',body);
 for(const field of [F.row,F.rowsel])x.mov(at('ebx',field*4),0);x.label(body);
 const increment=x.unique();x.cmp(at('ebx',F.version*4),2147483647).branch('ne',increment).mov(at('ebx',F.version*4),0).label(increment).inc(at('ebx',F.version*4));
 // Retired vectors contain only Long/BSTR values; they are never exposed or
 // locked across callbacks. Destruction cannot invoke an authored COM finalizer.
 for(const handle of old)x.api(DLL,'SafeArrayDestroy',[arg(handle)]);
 const noPaint=x.unique();x.cmp(at('ebx',F.redraw*4),0).branch('e',noPaint).api('user32.dll','InvalidateRect',[arg(12),0,0]).label(noPaint).value(0).leave(28);
}
