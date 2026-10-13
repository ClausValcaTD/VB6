import {Cell,VBArray,NOTHING,unbox,arrayTypeMatches,recordTypeMatches} from './values.js';
import {VBError} from '../language/errors.js';

/** Typed array temporaries and function results own their descriptor. The
 * element VARTYPE is invariant; scalar conversions must never hide a mismatch. */
export function createArrayCell(type,value=new VBArray([],type),identity=null) {
  value=unbox(value);
  if(!arrayTypeMatches(value,type,identity))throw new VBError('Array type mismatch',13);
  const cell=new Cell('Variant',value);
  cell.isArray=true;cell.elementType=type;cell.elementIdentity=identity;cell.get().dynamic=true;
  return cell;
}
export function procedureResult(vm,proc) {
  const type=proc.storageReturnType||proc.returnType||'Variant';
  if(proc.returnArray)return createArrayCell(type);
  if(vm.program.modules.has(type.toLowerCase())||vm.data?.isObjectType(type))return new Cell(type,NOTHING);
  return new Cell(type);
}

/** A record rvalue may become a ByRef temporary, but cannot change nominal
 * type. Validate against the formal's declaration, before Cell's generic
 * name-based coercion; Cell then creates an independent value copy. */
export function createRecordCell(type,value,identity) {
  value=unbox(value);
  if(!recordTypeMatches(value,type,identity))throw new VBError('User-defined type mismatch',13);
  return new Cell(type,value);
}
