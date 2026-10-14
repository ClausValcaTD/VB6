/** Actual emitted modal caller and dialog callback, with foreign user32 calls
 * explicitly doubled. Windows acceptance separately tests real native dialogs.
 */
import assert from 'node:assert/strict';
import {collectionMachine} from './native-collection-machine.mjs';
export function inputBoxMachine(t,code,optimization=1,actions=[]){
 const h=collectionMachine(t,code,optimization),vm=h.vm,m=vm.memory,dialogs=[],live=new Map();let next=100;
 const callback=(label,args)=>{const registers=vm.registers.slice(),flags={...vm.flags},ip=vm.ip;
  try{return vm.invoke(label,args);}finally{vm.registers.set(registers);vm.flags=flags;vm.ip=ip;}
 };
 const hook=(name,n,fn)=>vm.hook('user32.dll',name,n,args=>fn(...args));
 hook('GetActiveWindow',0,()=>live.size?[...live.keys()].at(-1):42);
 vm.hook('kernel32.dll','GetModuleHandleW',1,()=>7);
 const allocator=vm.hooks.get(m.read(vm.symbol('iat:oleaut32.dll!SysAllocStringLen'))).callback;
 vm.hook('oleaut32.dll','SysAllocStringLen',2,args=>{const d=[...live.values()].at(-1);if(d?.action.resultFailure)return 0;return allocator(args);});
 const write=(out,text,count)=>{let n=Math.min(text.length,count-1);for(let i=0;i<n;i++)m.write(out+2*i,text.charCodeAt(i),16);m.write(out+2*n,0,16);return n;};
 hook('GetWindowLongW',2,(hwnd,offset)=>{assert.equal(offset,8);return live.get(hwnd).state;});
 hook('SetWindowLongW',3,(hwnd,offset,p)=>{assert.equal(offset,8);const d=live.get(hwnd),old=d.state;d.state=p;return old;});
 hook('SetWindowTextW',2,(hwnd,text)=>{live.get(hwnd).title=m.utf16(text);return 1;});
 hook('SetDlgItemTextW',3,(hwnd,id,text)=>{if(live.get(hwnd).action.textFailure)return 0;live.get(hwnd)[id===1001?'prompt':'text']=m.utf16(text);return 1;});
 hook('GetDlgItemTextW',4,(hwnd,id,out,count)=>{assert.equal(id,1002);return write(out,live.get(hwnd).text,count);});
 hook('SendDlgItemMessageW',5,(hwnd,id,msg,w,l)=>{assert.equal(id,1002);const d=live.get(hwnd);if(msg===0xc5)d.limit=w;else{assert.equal(msg,0xb1);d.selection=[w,l];}return 0;});
 hook('GetDlgItem',2,(hwnd,id)=>{assert.equal(id,1002);return hwnd+1000;});hook('SetFocus',1,()=>0);
 hook('EndDialog',2,(hwnd,result)=>{live.get(hwnd).ended=result;return 1;});
 hook('GetWindowRect',2,(hwnd,out)=>{[50,80,550,280].forEach((v,i)=>m.write(out+4*i,v));return 1;});
 hook('GetSystemMetrics',1,id=>id===0?1600:1000);
 hook('GetDC',1,()=>900);hook('ReleaseDC',2,()=>1);
 vm.hook('gdi32.dll','GetDeviceCaps',2,([dc,id])=>{assert.equal(dc,900);assert.ok([88,90].includes(id));return 144;});
 hook('SetWindowPos',7,(hwnd,after,x,y,w,h,flags)=>{assert.equal(flags,0x15);live.get(hwnd).position=[x|0,y|0];return 1;});
 hook('DialogBoxIndirectParamW',5,(instance,template,owner,proc,state)=>{
  assert.equal(instance,7);assert.equal(proc,vm.symbol('native:inputbox:dialog'));assert.equal(m.read(template+8,16),4);
  const action=actions.shift()||{},d={hwnd:next++,owner,state:0,ended:0,text:'',action};dialogs.push(d);
  if(action.apiFailure)return -1;
  live.set(d.hwnd,d);const init=callback('native:inputbox:dialog',[d.hwnd,0x110,0,state]);
  if(d.ended){assert.equal(init,1);live.delete(d.hwnd);return d.ended;}assert.equal(init,0);
  assert.equal(d.state,state);assert.equal(d.limit,255);assert.deepEqual(d.selection,[0,0xffffffff]);
  action.during?.({...h,dialogs,live,callback});
  if(action.text!==undefined)d.text=action.text;
  callback('native:inputbox:dialog',[d.hwnd,action.close?0x10:0x111,action.cancel?2:1,0]);
  assert.equal(d.ended,action.cancel||action.close||action.resultFailure?2:1);live.delete(d.hwnd);return d.ended;
 });
 return {...h,dialogs,live,callback};
}
