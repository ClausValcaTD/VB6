/** Hot sparse control lookup. Bounds are checked before pointer arithmetic;
 * an absent page is zero and an existing page requires exactly two data reads.
 * This leaf has no allocations, imports, callbacks or changes to caller Err.
 * Mutating index operations retain the independently tested VB service.
 */
import {mem32} from './x86-operands.js';
export function emitNativeControlIndexFind(c,proc){
 const x=c.x,done=x.unique();
 x.label(proc.label).enter().value({argument:12}).compare(32767).branch('a','error:340')
  .mov('ecx','eax').value({argument:8}).mov('edx','eax')
  .mov('eax','ecx').shift('shr','eax',8).mov('eax',mem32({base:'edx',index:'eax',scale:4}))
  .test().branch('e',done).and('ecx',255).mov('eax',mem32({base:'eax',index:'ecx',scale:4}))
  .label(done).leave(8);
}

/** Cold bound recomputation after removing the cached first/last entry. Native
 * pointer scans avoid hundreds of private VB calls across empty sparse pages.
 * At most 128 directory and 256 element reads find the next occupied boundary;
 * table mutation and page ownership stay in the independently checked service. */
export function emitNativeControlIndexBoundary(c,proc){
 const x=c.x,reverse=x.unique(),missing=x.unique();
 x.label(proc.label).enter().value({argument:8}).mov('edx','eax')
  .value({argument:12}).compare(1).branch('ne',reverse);
 const scan=direction=>{
  const page=x.unique(),advance=x.unique(),entry=x.unique(),found=x.unique();
  x.mov('ebx',direction===1?0:127).label(page)
   .mov('esi',mem32({base:'edx',index:'ebx',scale:4})).testOperand('esi','esi').branch('e',advance)
   .mov('edi',direction===1?0:255).label(entry)
   .cmp(mem32({base:'esi',index:'edi',scale:4}),0).branch('ne',found)
   .add('edi',direction).cmp('edi',256).branch('b',entry)
   .label(advance).add('ebx',direction).cmp('ebx',128).branch('b',page).jump(missing)
   .label(found).mov('eax','ebx').shift('shl','eax',8).add('eax','edi').leave(8);
 };
 scan(1);x.label(reverse).compare(-1).branch('ne','error:5');scan(-1);
 x.label(missing).value(-1).leave(8);
}
