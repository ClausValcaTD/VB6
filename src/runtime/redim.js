import {VBArray} from './values.js';
import {VBError} from '../language/errors.js';
const lower=value=>String(value).toLowerCase();

/** Resolve storage and evaluate bounds once. Type-changing ReDim is legal only
 * for an array contained in a Variant and only without Preserve. Allocate before
 * assignment so a failure cannot erase the prior array or its element tags. */
export async function executeRedim(vm,decl,frame,preserve=false) {
  const ref=await vm.reference({kind:'id',name:decl.name},frame,true);
  const bounds=await vm.evalBounds(decl.bounds,frame),value=await ref.get();
  const type=decl.explicitType?decl.storageType||decl.type:value instanceof VBArray?value.type:ref.elementType||decl.storageType||decl.type;
  if(ref.constant)throw new VBError('Assignment to constant not permitted',500);
  if(ref.isArray&&lower(type)!==lower(ref.elementType))throw new VBError('Array type mismatch',13);
  if(value instanceof VBArray){
    if(lower(type)===lower(value.type))return value.redim(bounds,preserve);
    if(ref.isArray||preserve)throw new VBError('ReDim cannot change the array element type',13);
  }else if(value!==undefined||lower(ref.type)!=='variant')throw new VBError('Type mismatch',13);
  const next=await vm.createArray(bounds,type,frame,decl.fixedLength);next.dynamic=true;
  await ref.set(next);return next;
}
