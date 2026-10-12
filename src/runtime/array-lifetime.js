import {VBError} from '../language/errors.js';

// Execution metadata must not be cloned with a Variant, exported as a native
// descriptor, or retained globally after its array becomes unreachable.
const locks=new WeakMap(),owners=new WeakMap();
const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
export function assertArrayUnlocked(array) {
  if(locks.has(array))throw new VBError('This array is fixed or temporarily locked',10);
}
function addOwner(value,array) {
  let set=owners.get(value);if(!set)owners.set(value,set=new Set());set.add(array);
}
/** Records/nested arrays depend on their containing array's storage. Ordinary
 * object references do not: their instance fields outlive the array element. */
export function bindArrayOwner(value,array) {
  if(object(value)){addOwner(value,array);inheritArrayOwners(array,value);}return value;
}
export function inheritArrayOwners(source,target) {
  if(object(source)&&object(target))for(const array of owners.get(source)||[])addOwner(target,array);
  return target;
}
export function inheritReferenceOwners(source,target) {
  if(source?.win32Array)addOwner(target,source.win32Array);
  return inheritArrayOwners(source,target);
}
/** One scope owns at most one retain per descriptor; nested calls have distinct
 * scopes. Release is idempotent and never executes user code. A scope should be
 * released in finally, including argument validation and evaluation failures. */
export class ArrayLeaseScope {
  retain(array) {
    if(this.arrays?.has(array))return;
    (this.arrays??=new Set()).add(array);locks.set(array,(locks.get(array)||0)+1);
  }
  reference(ref) {
    if(ref?.win32Array){this.retain(ref.win32Array);this.value(ref.win32Array);}
    if(object(ref))for(const array of owners.get(ref)||[])this.retain(array);
    return ref;
  }
  value(value) {
    if(object(value))for(const array of owners.get(value)||[])this.retain(array);
    return value;
  }
  release() {
    if(!this.arrays)return;
    for(const array of this.arrays){const count=locks.get(array);if(count>1)locks.set(array,count-1);else locks.delete(array);}
    this.arrays.clear();
  }
}

export function closeArrayEnumeration(frame,id) {
  const scope=frame.arrayEnumerations?.get(id);if(!scope)return;
  scope.leases.release();frame.arrayEnumerations.delete(id);frame.temps.delete(id);
}
export function closeArrayEnumerations(frame) {
  if(frame.arrayEnumerations)for(const id of frame.arrayEnumerations.keys())closeArrayEnumeration(frame,id);
}
/** Leaving a loop releases its array. A GoSub or active error handler suspends
 * its caller's loop rather than terminating it. Resume/Return, ordinary jumps,
 * computed jumps and Exit For are handled by their actual destination PCs.
 * Cached intervals are rebuilt only when live editing replaces the code array. */
export function reconcileArrayEnumerations(frame) {
  if(!frame.arrayEnumerations?.size)return;
  for(const [id,scope] of frame.arrayEnumerations){
    if(scope.code!==frame.proc.code){
      const index=frame.proc.code.findIndex(ins=>ins.op==='eachInit'&&ins.id===id);
      if(index<0)throw new VBError('Restart required: active array enumeration was removed',5);
      scope.code=frame.proc.code;scope.start=index+1;scope.end=frame.proc.code[index].target;
    }
    // The overwhelmingly common case stays in the loop. Do not allocate a
    // closure (or traverse GoSub PCs) for every instruction in that case.
    const start=scope.start,end=scope.end;
    if(frame.pc>=start&&frame.pc<end)continue;
    if(frame.errorActive&&frame.errorPc>=start&&frame.errorPc<end)continue;
    let suspended=false;
    for(const pc of frame.gosubStack)if(pc>=start&&pc<end){suspended=true;break;}
    if(!suspended)closeArrayEnumeration(frame,id);
  }
}
