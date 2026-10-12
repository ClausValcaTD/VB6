/** Minimal STA IUnknown for compiler-owned Form objects, deliberately not
 * IDispatch. No VB error transfer may cross the OleAut32 callback boundary.
 * https://learn.microsoft.com/windows/win32/api/unknwn/nn-unknwn-iunknown
 */
import {mem32} from './x86-operands.js';
import {FORM_INSTANCE as F,FORM_INTERFACE as I} from './form-instance-layout.js';
const arg=argument=>({argument}),at=(base,displacement=0)=>mem32({base,displacement});
export function declareFormInterface(c){
 if(c.nativeFormInterface)return I;
 c.nativeFormInterface=true;
 c.ro.align(4).label(I).reference(I+':query').reference(I+':addref').reference(I+':release');
 // Reserve release now, before private-kernel reachability is closed.
 c.classProcedure('Release');return I;
}
export function emitFormInterface(c){
 if(!c.nativeFormInterface)return;
 const x=c.x,nil=x.unique();
 x.label(I+':release-nullable').enter().value(arg(8)).test().branch('e',nil).push().call(I+':release').label(nil).leave(4);
 const invalid=x.unique(),missing=x.unique(),done=x.unique(),full=x.unique();
 x.label(I+':query').enter().value(arg(16)).test().branch('e',invalid).mov(at('eax'),0)
  .value(arg(12)).test().branch('e',invalid);
 // IID_IUnknown = 00000000-0000-0000-C000-000000000046 (little endian).
 for(const [offset,value]of [[0,0],[4,0],[8,0xc0],[12,0x46000000]])x.cmp(at('eax',offset),value).branch('ne',missing);
 x.push(arg(8)).call(I+':addref').value(arg(8)).mov('edx','eax').value(arg(16)).mov(at('eax'),'edx').value(0).jump(done)
  .label(missing).value(0x80004002).jump(done).label(invalid).value(0x80004003).label(done).leave(12);
 // Saturation cannot signal a VB exception through a COM callback. A saturated
 // object stays alive; normal compiler reference acquisition still diagnoses
 // count overflow before reaching this unreachable practical bound.
 x.label(I+':addref').enter().value(arg(8)).sub('eax',F.unknown).cmp(at('eax'),0x7fffffff).branch('ae',full)
  .inc(at('eax')).label(full).mov('eax',at('eax')).leave(4);
 const immortal=x.unique();x.label(I+':release').enter(8).value(arg(8)).sub('eax',F.unknown)
  .cmp(at('eax'),0x7fffffff).branch('ae',immortal).mov('edx',at('eax')).dec('edx').mov(at('ebp',-4),'edx').push()
  .call(c.classProcedure('Release')).value(arg(-4)).leave(4).label(immortal).value(0x7fffffff).leave(4);
}
