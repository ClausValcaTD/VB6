/** CheckBox.Value admits 0/1/2, independently of user click cycling. A native
 * BS_AUTOCHECKBOX silently clamps BST_INDETERMINATE. Use BS_3STATE and apply
 * the two/three-state click policy before dispatching the authored Click event.
 * State word 0 (unused by non-range controls) records the authored TripleState.
 * https://learn.microsoft.com/windows/win32/controls/bm-setcheck
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/triplestate-property
 */
import {mem32} from './x86-operands.js';
const arg=argument=>({argument});
export function nativeCheckBoxClick(c,handle){c.nativeCheckBoxClicks=true;c.x.push(handle).call('native:control:check-click');}
export function emitNativeCheckBoxHelpers(c){
 if(!c.nativeCheckBoxClicks)return;
 const x=c.x,two=x.unique(),checked=x.unique(),apply=x.unique(),zero=x.unique();
 x.label('native:control:check-click').enter()
  .api('user32.dll','SendMessageW',[arg(8),0xf0,0,0]).mov('ebx','eax')
  .api('user32.dll','GetWindowLongW',[arg(8),-21]).test().branch('e',two)
  .cmp(mem32({base:'eax'}),0).branch('e',two)
  .mov('eax','ebx').inc('eax').compare(3).branch('ge',zero).jump(apply)
  .label(two).mov('eax','ebx').compare(1).branch('ne',checked)
  .label(zero).value(0).jump(apply).label(checked).value(1)
  .label(apply).pushOperand(0).pushOperand('eax').push(0xf1).push(arg(8)).invoke('user32.dll','SendMessageW').leave(4);
}
