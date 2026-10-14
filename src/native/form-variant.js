/** Native form references use their embedded, canonical IUnknown when boxed.
 * Actual OleAut32 owns/copies/clears the VT_UNKNOWN value. Typed form loads and
 * calls still use the ordinary hidden-receiver ABI, not generic COM dispatch. */
import {FORM_INSTANCE as F} from './form-instance-layout.js';
import {declareFormInterface} from './form-instance-abi.js';
import {mem32,mem16} from './x86-operands.js';
const at=(base,displacement=0)=>mem32({base,displacement});
export function boxNativeForm(c,node){
 declareFormInterface(c);c.useVariant('copy');c.nativeClassValue(node);const x=c.x,nil=x.unique();
 // Transfer a separately retained native owner into a VARIANT. Boxing itself
 // does not allocate an extra wrapper or mutate canonical identity.
 x.test().branch('e',nil).push().call(c.classProcedure('Retain')).add('eax',F.unknown).label(nil);
 const owner=c.ownNativePointer('native:form:iunknown:release-nullable'),value=c.temporaryVariant();
 c.clearVariantStorage(value);c.rawStorageAddress(value);x.mov(at('eax'),13).mov('edx',at('ebp',owner.offset)).mov(at('eax',8),'edx').mov(at('ebp',owner.offset),0);
}
export function unboxNativeForm(c,node,descriptor){
 declareFormInterface(c);c.expression(node);const x=c.x,nil=x.unique();
 x.cmp(mem16({base:'eax'}),13).branch('ne','error:13').mov('eax',at('eax',8)).test().branch('e',nil).mov('edx','eax').value('native:form:iunknown').cmp(at('edx'),'eax').branch('ne','error:13').mov('eax','edx').sub('eax',F.unknown);
 if(descriptor&&!descriptor.formUnion)x.cmp(at('eax',4),descriptor.id).branch('ne','error:13');
 x.label(nil).push().call(c.classProcedure('Retain'));c.ownClass();
}
