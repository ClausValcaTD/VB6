/** Whole emitted HWND-control/lifetime procedures run on the checked IA-32
 * machine. Only foreign Windows/Automation calls are explicit doubles. These
 * tests check ABI/ownership/event order, not Windows execution or pixel fidelity.
 */
import assert from 'node:assert/strict';
import {collectionMachine} from './native-collection-machine.mjs';
export function dynamicControlMachine(t,project,optimization=1){
 const h=collectionMachine(t,'',optimization,[],project),vm=h.vm,m=vm.memory,windows=new Map(),fonts=new Map(),faults=new Map();
 let nextWindow=100,nextFont=1000,active=0;
 const writeText=(p,text,n)=>{const count=Math.min(text.length,Math.max(0,n-1));for(let i=0;i<count;i++)m.write(p+2*i,text.charCodeAt(i),16);if(n)m.write(p+2*count,0,16);return count;};
 const logfont=(height=-11,name='MS Sans Serif')=>{const b=new Uint8Array(92),v=new DataView(b.buffer);v.setInt32(0,height,true);v.setInt32(16,400,true);for(let i=0;i<Math.min(name.length,31);i++)v.setUint16(28+2*i,name.charCodeAt(i),true);return b;};
 fonts.set(17,{bytes:logfont(),stock:true});
 const window=hwnd=>{const w=windows.get(hwnd);assert.ok(w,'live HWND '+hwnd);return w;};
 const hook=(dll,name,n,fn)=>vm.hook(dll,name,n,args=>{
  if(faults.has(name)){const left=faults.get(name)-1;if(!left){faults.delete(name);return 0;}faults.set(name,left);}
  return fn(...args);
 });
 const isChild=(parent,child)=>{for(let w=windows.get(child);w?.parent;w=windows.get(w.parent))if(w.parent===parent)return true;return false;};
 const abs=hwnd=>{const w=window(hwnd);const parent=w.parent?abs(w.parent):[0,0];return [parent[0]+w.left,parent[1]+w.top];};
 const defaults=(hwnd,msg,wp,lp)=>{
  const w=window(hwnd);
  if(msg===0x30){w.font=wp;return 0;}if(msg===0x31)return w.font;
  if(msg===0xf0)return w.check;if(msg===0xf1){w.check=wp;return 0;}
  if(msg===0xd5)return w.limit;if(msg===0xc5){w.limit=wp;return 0;}
  if(msg===0xd2)return w.password;if(msg===0xcc){w.password=wp;return 0;}
  if(msg===0xf5){if(w.parent)send(w.parent,0x111,w.id,hwnd);return 0;}
  if(msg===0x102){w.text+=String.fromCharCode(wp);if(w.parent)send(w.parent,0x111,(0x300<<16)|w.id,hwnd);return 0;}
  if(msg===0x10){destroy(hwnd);return 0;}
  return 0;
 };
 // Invoke real compiled callbacks while preserving the suspended foreign-call
 // context. The nested invocation still checks stdcall, callee saves and x87.
 const callback=(address,args)=>{
  const name=[...vm.labels].find(([,value])=>value===address)?.[0];
  assert.ok(name,'linked callback '+address.toString(16));
  const registers=vm.registers.slice(),flags={...vm.flags},ip=vm.ip;
  try{return vm.invoke(name,args);}finally{vm.registers.set(registers);vm.flags=flags;vm.ip=ip;}
 };
 const send=(hwnd,msg,wp=0,lp=0)=>{
  const w=window(hwnd);
  if(w.subclass)return callback(w.subclass.proc,[hwnd,msg,wp,lp,1,w.subclass.node]);
  if(w.proc)return callback(w.proc,[hwnd,msg,wp,lp]);
  return defaults(hwnd,msg,wp,lp);
 };
 const destroy=hwnd=>{
  const w=windows.get(hwnd);if(!w)return 0;if(w.destroying)return 1;w.destroying=true;
  send(hwnd,2);
  for(const child of [...windows.values()].filter(c=>c.parent===hwnd))destroy(child.hwnd);
  send(hwnd,0x82);windows.delete(hwnd);if(active===hwnd)active=0;return 1;
 };
 hook('kernel32.dll','CompareStringOrdinal',5,(a,an,b,bn,ignore)=>{assert.equal(ignore,1);const text=(p,n)=>Array.from({length:n},(_,i)=>String.fromCharCode(m.read(p+2*i,16))).join('').toLowerCase();const x=text(a,an),y=text(b,bn);return x===y?2:x<y?1:3;});
 hook('oleaut32.dll','VarBstrFromI4',4,(value,lcid,flags,out)=>{assert.equal(lcid,0x400);assert.equal(flags,0);m.write(out,m.string(String(value|0)));return 0;});
 hook('kernel32.dll','GetModuleHandleW',1,()=>1);hook('kernel32.dll','SetLastError',1,()=>0);hook('kernel32.dll','GetLastError',0,()=>0);
 hook('user32.dll','RegisterClassW',1,()=>1);hook('user32.dll','LoadCursorW',2,()=>1);hook('user32.dll','AdjustWindowRectEx',4,()=>1);
 hook('user32.dll','CreateWindowExW',12,(ex,cls,title,style,left,top,width,height,parent,id)=>{
  assert.ok(!parent||windows.has(parent),'created in a live parent');
  const classname=m.utf16(cls),formName=classname.startsWith('VB6.Native.')?classname.slice('VB6.Native.'.length):null,hwnd=nextWindow++;
  const proc=formName?vm.symbol('wndproc:'+formName):0;
  windows.set(hwnd,{hwnd,classname,text:m.utf16(title),style,ex,left:left|0,top:top|0,width,height,parent,id,font:0,state:0,proc,originalProc:0,subclass:null,props:new Map(),check:0,limit:32767,password:0});return hwnd;
 });
 hook('user32.dll','DestroyWindow',1,destroy);hook('user32.dll','IsWindow',1,hwnd=>windows.has(hwnd)?1:0);hook('user32.dll','IsChild',2,(p,c)=>isChild(p,c)?1:0);
 hook('user32.dll','GetParent',1,hwnd=>window(hwnd).parent);hook('user32.dll','GetDlgCtrlID',1,hwnd=>window(hwnd).id);
 hook('user32.dll','GetDlgItem',2,(p,id)=>[...windows.values()].find(w=>w.parent===p&&w.id===id)?.hwnd||0);
 hook('user32.dll','GetWindowLongW',2,(hwnd,index)=>{const w=window(hwnd);return {'-16':w.style,'-20':w.ex,'-21':w.state,'-4':w.proc}[index|0]||0;});
 hook('user32.dll','SetWindowLongW',3,(hwnd,index,value)=>{const w=window(hwnd),name={'-16':'style','-20':'ex','-21':'state','-4':'proc'}[index|0];assert.ok(name,'supported index '+(index|0));const old=w[name];w[name]=value;return name==='proc'?old||0xf0000000:old;});
 hook('user32.dll','GetWindowRect',2,(hwnd,rect)=>{const w=window(hwnd),[x,y]=abs(hwnd);[x,y,x+w.width,y+w.height].forEach((v,i)=>m.write(rect+4*i,v));return 1;});
 hook('user32.dll','GetClientRect',2,(hwnd,rect)=>{const w=window(hwnd);[0,0,w.width,w.height].forEach((v,i)=>m.write(rect+4*i,v));return 1;});
 hook('user32.dll','MapWindowPoints',4,(from,to,points,count)=>{const a=from?abs(from):[0,0],b=to?abs(to):[0,0];for(let i=0;i<count;i++)for(let k=0;k<2;k++)m.write(points+8*i+4*k,(m.read(points+8*i+4*k)|0)+a[k]-b[k]);return 1;});
 hook('user32.dll','SetWindowPos',7,(hwnd,after,x,y,w,h,flags)=>{const target=window(hwnd);if(!(flags&2)){target.left=x|0;target.top=y|0;}if(!(flags&1)){target.width=w;target.height=h;}return 1;});
 hook('user32.dll','MoveWindow',6,(hwnd,x,y,w,h)=>{Object.assign(window(hwnd),{left:x|0,top:y|0,width:w,height:h});return 1;});
 hook('user32.dll','GetWindowTextLengthW',1,hwnd=>window(hwnd).text.length);
 hook('user32.dll','GetWindowTextW',3,(hwnd,out,count)=>writeText(out,window(hwnd).text,count));
 hook('user32.dll','SetWindowTextW',2,(hwnd,p)=>{const w=window(hwnd);w.text=m.utf16(p);if(w.classname==='EDIT'&&w.parent)send(w.parent,0x111,(0x300<<16)|w.id,hwnd);return 1;});
 hook('user32.dll','GetPropW',2,(hwnd,p)=>window(hwnd).props.get(m.utf16(p))||0);
 hook('user32.dll','SetPropW',3,(hwnd,p,v)=>{window(hwnd).props.set(m.utf16(p),v);return 1;});
 hook('user32.dll','RemovePropW',2,(hwnd,p)=>{const props=window(hwnd).props,k=m.utf16(p),old=props.get(k)||0;props.delete(k);return old;});
 hook('comctl32.dll','SetWindowSubclass',4,(hwnd,proc,id,node)=>{assert.equal(id,1);window(hwnd).subclass={proc,node};return 1;});
 hook('comctl32.dll','RemoveWindowSubclass',3,(hwnd,proc,id)=>{assert.equal(id,1);const w=window(hwnd);if(w.subclass?.proc===proc){w.subclass=null;return 1;}return 0;});
 hook('comctl32.dll','DefSubclassProc',4,(hwnd,msg,wp,lp)=>{const w=window(hwnd);return w.proc?callback(w.proc,[hwnd,msg,wp,lp]):defaults(hwnd,msg,wp,lp);});
 hook('user32.dll','DefWindowProcW',4,defaults);hook('user32.dll','CallWindowProcW',5,(proc,...args)=>defaults(...args));hook('user32.dll','SendMessageW',4,send);
 hook('user32.dll','ShowWindow',2,(hwnd,mode)=>{const w=window(hwnd);w.style=mode?w.style|0x10000000:w.style&~0x10000000;active=hwnd;return 1;});
 hook('user32.dll','IsWindowVisible',1,hwnd=>window(hwnd).style&0x10000000?1:0);hook('user32.dll','IsWindowEnabled',1,hwnd=>window(hwnd).style&0x8000000?0:1);
 hook('user32.dll','EnableWindow',2,(hwnd,on)=>{const w=window(hwnd);w.style=on?w.style&~0x8000000:w.style|0x8000000;return 1;});
 for(const name of ['UpdateWindow','InvalidateRect'])hook('user32.dll',name,name==='UpdateWindow'?1:3,()=>1);
 hook('user32.dll','PostQuitMessage',1,()=>0);hook('user32.dll','SetFocus',1,hwnd=>{active=hwnd;return 0;});hook('user32.dll','GetActiveWindow',0,()=>active);
 hook('user32.dll','GetDC',1,()=>900);hook('user32.dll','ReleaseDC',2,()=>1);hook('gdi32.dll','GetDeviceCaps',2,(dc,index)=>{assert.equal(index,90);return 96;});
 hook('gdi32.dll','GetStockObject',1,id=>{assert.equal(id,17);return 17;});
 hook('gdi32.dll','CreateFontW',14,(height,w,e,o,weight,i,u,s,c,op,cp,q,p,name)=>{const bytes=logfont(height|0,m.utf16(name));new DataView(bytes.buffer).setInt32(16,weight,true);const id=nextFont++;fonts.set(id,{bytes});return id;});
 hook('gdi32.dll','GetObjectW',3,(id,bytes,out)=>{assert.equal(bytes,92);const f=fonts.get(id);assert.ok(f,'live font '+id);for(let i=0;i<92;i++)m.write(out+i,f.bytes[i],8);return 92;});
 hook('gdi32.dll','CreateFontIndirectW',1,p=>{const id=nextFont++,bytes=Uint8Array.from({length:92},(_,i)=>m.read(p+i,8));fonts.set(id,{bytes});return id;});
 hook('gdi32.dll','DeleteObject',1,id=>{const f=fonts.get(id);assert.ok(f&&!f.stock,'delete owned live font '+id);assert.ok(![...windows.values()].some(w=>!w.destroying&&w.font===id),'do not delete a font still used by a live HWND');fonts.delete(id);return 1;});
 hook('user32.dll','GetKeyState',1,()=>0);
 hook('user32.dll','MessageBoxW',4,(_,p)=>{throw new Error('Unhandled native error: '+m.utf16(p));});
 hook('kernel32.dll','ExitProcess',1,code=>{throw new Error('Native ExitProcess '+code);});
 return {...h,windows,fonts,send,destroy,window,faults,create:form=>vm.invoke('create:'+form),handle:label=>m.read(vm.symbol('hwnd:'+label)),
  invokeForm:(form,name,args=[])=>vm.invoke('proc:'+form+':'+name,args),reuseHandle:hwnd=>{assert.ok(!windows.has(hwnd));nextWindow=hwnd;},fail:(name,after=1)=>faults.set(name,after)};
}
