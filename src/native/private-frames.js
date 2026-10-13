/** Compact compiler-owned procedure bookkeeping. Authored code always retains
 * its debugger/checkpoint map. Private helpers without Resume have no observable
 * internal next-statement address: failures inherit the caller's Erl/Source and
 * either propagate or jump directly to the helper's rollback handler.
 */
const coreOps=new Set(['dim','assign','expr','branch','jump','return','raiseError','onError','forInit','forNext','temp','case']);
export function privateNeedsCheckpoints(context){
 if(!context.module.deferredNativeKernel&&!context.module.nativeCompactFrame)return true;
 return context.proc.code.some(ins=>!coreOps.has(ins.op)||ins.op==='onError'&&ins.mode==='next');
}
export function zeroPrivateFrame(c,context){
 if(!context.module.deferredNativeKernel&&!context.module.nativeCompactFrame)return false;
 // EBP+8 and above hold incoming arguments; the saved callee registers are
 // below EBP-size. Only the newly allocated frame is cleared, once, before any
 // owned parameter or local initialization. Globals/instance fields are intact.
 if(!Number.isInteger(context.size)||context.size<0||context.size%4)throw new Error('Unaligned private native procedure frame');
 context.nativeFrameZeroed=true;
 c.x.local(-context.size).mov('edi','eax').mov('ecx',context.size/4).xor('eax','eax').cld().repStore(32);
 return true;
}
