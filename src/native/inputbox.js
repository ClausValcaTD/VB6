/** Native InputBox lowering. Argument snapshots outlive the modal call; each
 * invocation owns its state on the stack, so a nested dialog cannot overwrite
 * another result. The callback records failures and returns through Windows
 * before the caller raises any VB error. No callback unwinds a user32 frame.
 * https://learn.microsoft.com/office/vba/language/reference/user-interface-help/inputbox-function
 */
import {planNativeArguments} from './call-plan.js';
import {nativeInputBoxTemplate} from './inputbox-template.js';
import {mem16,mem32} from './x86-operands.js';
const P='native:inputbox:',arg=argument=>({argument}),addr=address=>({address});
const at=(base,displacement=0)=>mem32({base,displacement}),slot=v=>at('ebp',v.offset);
const lit=value=>({kind:'literal',value});
export function isNativeInputBox(c,node){
 return node.kind==='call'&&node.callee.kind==='id'&&/^inputbox\$?$/i.test(node.callee.name)&&!c.resolveProcedure(node.callee);
}
export function nativeInputBoxCall(c,node){
 if(!isNativeInputBox(c,node))return false;
 const plan=planNativeArguments({name:'InputBox',params:['prompt','title','default','xpos','ypos','helpfile','context'].map((name,index)=>({name,optional:index!==0}))},node.args,m=>c.fail(m));
 if(plan.slots[5].omitted!==plan.slots[6].omitted)c.fail('InputBox helpfile and context must be supplied together');
 if(!plan.slots[5].omitted)c.fail('Native InputBox legacy Help-file integration is not implemented');
 const x=c.x,values=[],mask=(plan.slots[3].omitted?0:1)|(plan.slots[4].omitted?0:2);
 for(const entry of plan.order){
  if(entry.index>=5)continue;
  const expression=entry.omitted?lit(entry.index===1?c.project.name:entry.index<3?'':0):entry.node;
  if(entry.index<3)c.textExpression(expression);else c.numeric(expression);
  const value=c.arrayWorkspace(4,'inputbox-argument');x.mov(slot(value),'eax');values[entry.index]=value;
 }
 c.nativeInputBoxUsed=true;
 // Resolve the current native owner after authored operands, not a shared form
 // prototype handle. DialogBox manages disable/restore and the modal message loop.
 x.api('user32.dll','GetActiveWindow').push().push(arg(values[4].offset)).push(arg(values[3].offset)).push(mask)
  .push(arg(values[2].offset)).push(arg(values[1].offset)).push(arg(values[0].offset)).call(P+'show');
 c.ownString();return true;
}
export function emitNativeInputBox(c){
 if(!c.nativeInputBoxUsed)return;
 const x=c.x;nativeInputBoxTemplate(c.ro,P+'template');
 // State: borrowed prompt/title/default, position mask/x/y, owned result, error.
 x.label(P+'show').enter(32).local(-32).mov('edi','eax').mov('ecx',8).xor('eax','eax').cld().repStore(32);
 for(let i=0;i<6;i++)x.value(arg(8+4*i)).mov(at('ebp',-32+4*i),'eax');
 x.api('kernel32.dll','GetModuleHandleW',[0]).mov('ebx','eax').push(addr(-32)).push(P+'dialog').push(arg(32)).push(P+'template').pushOperand('ebx').invoke('user32.dll','DialogBoxIndirectParamW');
 const failed=x.unique(),cancel=x.unique(),ready=x.unique(),raise=x.unique();
 x.compare(-1).branch('e',failed).test().branch('e',failed).cmp(at('ebp',-4),0).branch('ne',raise)
  .compare(1).branch('ne',cancel).value(arg(-8)).test().branch('ne',ready).value(7).mov(at('ebp',-4),'eax').jump(raise);
 x.label(failed).mov(at('ebp',-4),5).jump(raise);
 x.label(cancel).api('oleaut32.dll','SysFreeString',[arg(-8)]).value(c.string('')).push().call('native:string:copy').jump(ready);
 x.label(raise).api('oleaut32.dll','SysFreeString',[arg(-8)]).value(arg(-4)).jump('native:error:raise');
 x.label(ready).leave(28);
 emitDialog(c);emitPosition(c);
}
function emitDialog(c){
 const x=c.x,init=x.unique(),command=x.unique(),ok=x.unique(),cancel=x.unique(),finish=x.unique(),unhandled=x.unique(),success=x.unique();
 x.label(P+'dialog').enter(528);c.enterCallbackBoundary(-4);
 x.value(arg(12)).compare(0x110).branch('e',init).api('user32.dll','GetWindowLongW',[arg(8),8]).test().branch('e',unhandled).mov('esi','eax');
 x.value(arg(12)).compare(0x10).branch('e',cancel).compare(0x111).branch('e',command).jump(unhandled);
 x.label(command).value(arg(16)).and('eax',65535).compare(1).branch('e',ok).compare(2).branch('e',cancel).jump(unhandled);
 x.label(init).value(arg(20)).test().branch('e',unhandled).mov('esi','eax').api('user32.dll','SetWindowLongW',[arg(8),8,arg(20)]);
 x.pushOperand(at('esi',4)).push(arg(8)).invoke('user32.dll','SetWindowTextW').test().branch('e',init+':failed');
 x.pushOperand(at('esi')).push(1001).push(arg(8)).invoke('user32.dll','SetDlgItemTextW').test().branch('e',init+':failed');
 x.api('user32.dll','SendDlgItemMessageW',[arg(8),1002,0xc5,255,0]);
 x.pushOperand(at('esi',8)).push(1002).push(arg(8)).invoke('user32.dll','SetDlgItemTextW').test().branch('e',init+':failed');
 x.pushOperand('esi').push(arg(8)).call(P+'position');
 x.api('user32.dll','SendDlgItemMessageW',[arg(8),1002,0xb1,0,-1]).api('user32.dll','GetDlgItem',[arg(8),1002]).push().invoke('user32.dll','SetFocus').value(0).jump(finish);
 x.label(init+':failed').mov(at('esi',28),5).jump(cancel);
 x.label(ok).mov(at('ebp',-528),0).api('user32.dll','GetDlgItemTextW',[arg(8),1002,addr(-528),256]);
 const bounded=x.unique(),scan=x.unique(),length=x.unique(),allocateFailure=x.unique();
 x.compare(254).branch('be',bounded).value(254).label(bounded).mov('ebx','eax').xor('ecx','ecx');
 x.label(scan).cmp('ecx','ebx').branch('ae',length).movzx('edx',mem16({base:'ebp',index:'ecx',scale:2,displacement:-528}));
 for(const value of [0,13,10])x.cmp('edx',value).branch('e',length);
 x.inc('ecx').jump(scan).label(length).pushOperand('ecx').push(addr(-528)).invoke('oleaut32.dll','SysAllocStringLen').test().branch('e',allocateFailure);
 x.mov(at('esi',24),'eax').api('user32.dll','EndDialog',[arg(8),1]).jump(success);
 x.label(allocateFailure).mov(at('esi',28),7).jump(cancel);
 x.label(cancel).api('user32.dll','EndDialog',[arg(8),2]).label(success).value(1).jump(finish);
 x.label(unhandled).value(0).label(finish).mov(at('ebp',-8),'eax');c.leaveCallbackBoundary(-4);x.value(arg(-8)).leave(16);
}
function emitPosition(c){
 const x=c.x,xReady=x.unique(),yReady=x.unique(),xExplicit=x.unique(),yExplicit=x.unique(),done=x.unique();
 x.label(P+'position').enter(24).value(arg(12)).mov('esi','eax').api('user32.dll','GetWindowRect',[arg(8),addr(-16)]).test().branch('e',done);
 x.testOperand(at('esi',12),1).branch('ne',xExplicit).api('user32.dll','GetSystemMetrics',[0]).sub('eax',at('ebp',-8)).add('eax',at('ebp',-16)).shift('sar','eax',1).jump(xReady);
 x.label(xExplicit).api('user32.dll','GetDC',[0]).test().branch('e',done).mov('edi','eax').push(88).pushOperand('edi').invoke('gdi32.dll','GetDeviceCaps').mov('ebx','eax').pushOperand('edi').push(0).invoke('user32.dll','ReleaseDC')
  .push(1440).pushOperand('ebx').pushOperand(at('esi',16)).invoke('kernel32.dll','MulDiv');
 x.label(xReady).mov(at('ebp',-20),'eax').testOperand(at('esi',12),2).branch('ne',yExplicit);
 x.api('user32.dll','GetSystemMetrics',[1]).sub('eax',at('ebp',-4)).add('eax',at('ebp',-12)).mov('ebx','eax').push(3).push(1).pushOperand('ebx').invoke('kernel32.dll','MulDiv').jump(yReady);
 x.label(yExplicit).api('user32.dll','GetDC',[0]).test().branch('e',done).mov('edi','eax').push(90).pushOperand('edi').invoke('gdi32.dll','GetDeviceCaps').mov('ebx','eax').pushOperand('edi').push(0).invoke('user32.dll','ReleaseDC')
  .push(1440).pushOperand('ebx').pushOperand(at('esi',20)).invoke('kernel32.dll','MulDiv');
 x.label(yReady).mov(at('ebp',-24),'eax').api('user32.dll','SetWindowPos',[arg(8),0,arg(-20),arg(-24),0,0,0x15]).label(done).value(0).leave(8);
}
