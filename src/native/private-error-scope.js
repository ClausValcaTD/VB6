/** Private compiler services must not leak their implementation's On Error,
 * Exit Sub, or Declare calls into an authored caller's Err object. Move the
 * entire owned error state into a stack snapshot without allocating strings.
 * Success restores the prior state; a new fault replaces it. Cleanup entered
 * while unwinding preserves the original fault even if cleanup itself fails.
 * No callback/OS stack is unwound by these helpers.
 */
import {mem32} from './x86-operands.js';
const E='native:error:',P=E+'private:',arg=argument=>({argument});
const names=['pending','number','description','source','helpfile','helpcontext','erl','lastdllerror','description-owner','source-owner','helpfile-owner'];
const owners=[8,9,10],at=(base,displacement=0)=>mem32({base,displacement});
export function preparePrivateErrorScope(c,context){
 if(!context.module.deferredNativeKernel||context.proc.nativeTransparentErr)return;
 c.nativePrivateErrorScopes=true;
 context.privateErrorScope=c.arrayWorkspace(names.length*4,'private-error-state');
}
export function enterPrivateErrorScope(c,context){
 if(!context.privateErrorScope)return;
 c.rawStorageAddress(context.privateErrorScope);c.x.push().call(P+'enter');
}
export function leavePrivateErrorScope(c,context){
 if(!context.privateErrorScope)return;
 c.x.push();c.rawStorageAddress(context.privateErrorScope);c.x.push().call(P+'leave').popOperand('eax');
}
export function emitPrivateErrorScopes(c){
 if(!c.nativePrivateErrorScopes)return;
 const x=c.x;
 x.label(P+'enter').enter().value(arg(8)).mov('edx','eax');
 for(const [i,name]of names.entries())x.value({memory:E+name}).mov(at('edx',4*i),'eax').value(0).store(E+name);
 x.value(0).leave(4);
 const restore=x.unique(),done=x.unique();
 x.label(P+'leave').enter().value(arg(8)).mov('esi','eax')
   .cmp(mem32({label:E+'pending'}),0).branch('e',restore).cmp(at('esi'),0).branch('ne',restore);
 // A newly raised failure owns the public state. Release the superseded owners
 // without touching that failure or borrowing any pointer into a dying frame.
 for(const i of owners)x.pushOperand(at('esi',4*i)).invoke('oleaut32.dll','SysFreeString');
 x.jump(done).label(restore);
 for(const i of owners)x.api('oleaut32.dll','SysFreeString',[{memory:E+names[i]}]);
 for(const [i,name]of names.entries())x.mov('eax',at('esi',4*i)).store(E+name);
 x.label(done).value(0).leave(4);
}
