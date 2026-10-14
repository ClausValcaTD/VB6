/** Explicit lowering for the private grid kernel's scalar leaf routines. This
 * never substitutes authored procedures with matching names. No owned values or
 * callback frame is elided: these signatures contain only ByVal Long scalars.
 * The independent VB kernel remains the algorithm oracle for grid tests.
 */
import {mem32} from './x86-operands.js';
import {NATIVE_GRID_FIELDS as F} from './control-grid-contract.js';
const arg=argument=>({argument}),at=(base,displacement=0)=>mem32({base,displacement});
const signatures={guard:3,bounded:3,stamp:1,version:1,invalidate:1,getfield:4};
export function emitNativeGridPrimitive(c,name,proc){
 if(!Object.hasOwn(signatures,name))return false;
 if(proc.module!==c.gridModule||proc.proc.params.length!==signatures[name]||proc.proc.params.some(p=>p.byRef||String(p.type).toLowerCase()!=='long'))throw new Error('Invalid private grid primitive signature');
 const x=c.x,{label,fields,count}=c.gridModule.nativeState,table=(error=9)=>x.value(arg(8)).compare(count).branch('ae','error:'+error).imul('eax','eax',fields*4).emit(0x05).addr(label);
 x.label(proc.label).enter();
 if(name==='bounded'){
  const first=x.unique(),second=x.unique(),third=x.unique();
  x.value(arg(8)).cmp('eax',at('ebp',12)).branch('ge',first).value(arg(12)).label(first)
   .cmp('eax',at('ebp',16)).branch('le',second).value(arg(16)).label(second)
   .cmp('eax',at('ebp',12)).branch('ge',third).value(arg(12)).label(third).leave(12);return true;
 }
 table(['guard','stamp','getfield'].includes(name)?340:9);
 if(name==='guard'||name==='getfield'){
  x.mov('edx','eax').value(arg(12)).test().branch('e','error:91').cmp('eax',at('edx',4*F.hwnd)).branch('ne','error:91')
   .value(arg(16)).cmp('eax',at('edx',4*F.epoch)).branch('ne','error:91');
  if(name==='guard')x.value(0);
  else x.value(arg(20)).compare(fields).branch('ae','error:9').mov('eax',mem32({base:'edx',index:'eax',scale:4}));
 }else if(name==='stamp')x.mov('eax',at('eax',4*F.epoch));
 else if(name==='version'){
  const increment=x.unique();x.cmp(at('eax',4*F.version),2147483647).branch('ne',increment).mov(at('eax',4*F.version),0)
   .label(increment).inc(at('eax',4*F.version)).branch('o','error:6').value(0);
 }else{
  const done=x.unique();x.cmp(at('eax',4*F.redraw),0).branch('e',done).mov('eax',at('eax',4*F.hwnd)).test().branch('e',done)
   .push(0).push(0).pushOperand('eax').invoke('user32.dll','InvalidateRect').label(done).value(0);
 }
 x.leave(signatures[name]*4);return true;
}
