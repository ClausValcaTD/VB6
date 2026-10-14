/** Whole native Form procedures, with explicit USER32/OleAut32 test doubles.
 * VT_UNKNOWN copies call the emitted vtable, not a JavaScript refcount model.
 * Window position/activation semantics here do not certify behavior on Windows.
 */
import assert from 'node:assert/strict';
import {dynamicControlMachine} from './native-dynamic-control-machine.mjs';
export function formMachine(t,project,optimization=1){
 const h=dynamicControlMachine(t,project,optimization),{vm,windows,window,callback}=h,m=vm.memory;
 const old=(dll,name)=>{const p=vm.labels.get('iat:'+dll+'!'+name);return p?vm.hooks.get(m.read(p))?.callback:null;};
 const originalCopy=old('oleaut32.dll','VariantCopyInd'),originalClear=old('oleaut32.dll','VariantClear'),originalCreate=old('user32.dll','CreateWindowExW'),originalSend=old('user32.dll','SendMessageW');
 const release=p=>{if(p)callback(m.read(m.read(p)+8),[p]);};const retain=p=>{if(p)callback(m.read(m.read(p)+4),[p]);};
 const clear=p=>{if(m.read(p,16)!==13)return originalClear([p]);const ptr=m.read(p+8);for(let i=0;i<16;i+=4)m.write(p+i,0);release(ptr);return 0;};
 vm.hook('oleaut32.dll','VariantClear',1,([p])=>clear(p));
 vm.hook('oleaut32.dll','VariantCopyInd',2,([out,source])=>{
  if(m.read(source,16)!==13){if(m.read(out,16)===13)clear(out);return originalCopy([out,source]);}
  const p=m.read(source+8);retain(p);clear(out);m.write(out,13,16);m.write(out+8,p);return 0;
 });
 const newWindow=args=>{const hwnd=originalCreate(args);if(hwnd)window(hwnd).mdiActive=0;return hwnd;};
 vm.hook('user32.dll','CreateWindowExW',12,newWindow);
 vm.hook('user32.dll','CreateMDIWindowW',10,([cls,title,style,x,y,w,height,parent,instance,param])=>newWindow([0x40,cls,title,style|0x40000000,x,y,w,height,parent,0,instance,param]));
 const activate=(client,hwnd)=>{const w=window(client),before=w.mdiActive;w.mdiActive=hwnd;if(before&&windows.has(before))h.send(before,0x222,before,hwnd);if(hwnd&&windows.has(hwnd))h.send(hwnd,0x222,before,hwnd);};
 vm.hook('user32.dll','SendMessageW',4,([hwnd,msg,wp,lp])=>{
  if(windows.get(hwnd)?.classname!=='MDICLIENT')return originalSend([hwnd,msg,wp,lp]);
  if(msg===0x229)return window(hwnd).mdiActive||0;
  if(msg===0x222){activate(hwnd,wp);return 0;}
  if(msg===0x221){const w=window(hwnd);h.destroy(wp);if(w.mdiActive===wp)activate(hwnd,[...windows.values()].find(c=>c.parent===hwnd)?.hwnd||0);return 0;}
  if([0x226,0x227,0x228].includes(msg)){window(hwnd).arrange={msg,flags:wp};return 1;}
  return 0;
 });
 const show=old('user32.dll','ShowWindow');vm.hook('user32.dll','ShowWindow',2,args=>{
  const result=show(args),[hwnd,mode]=args,w=window(hwnd);
  if(mode&&windows.get(w.parent)?.classname==='MDICLIENT')activate(w.parent,hwnd);
  if(mode&&windows.has(hwnd))h.send(hwnd,5,0,w.width|(w.height<<16));return result;
 });
 vm.hook('user32.dll','DefMDIChildProcW',4,args=>h.defaults(...args));
 vm.hook('user32.dll','DefFrameProcW',5,([hwnd,client,msg,wp,lp])=>h.defaults(hwnd,msg,wp,lp));
 vm.hook('user32.dll','GetWindow',2,([hwnd,cmd])=>{
  const w=window(hwnd);if(cmd===5)return [...windows.values()].find(x=>x.parent===hwnd)?.hwnd||0;
  const siblings=[...windows.values()].filter(x=>x.parent===w.parent),i=siblings.findIndex(x=>x.hwnd===hwnd);if(cmd===2)return siblings[i+1]?.hwnd||0;assert.fail('unsupported GetWindow command '+cmd);
 });
 vm.hook('user32.dll','IsIconic',1,([hwnd])=>window(hwnd).style&0x20000000?1:0);vm.hook('user32.dll','IsZoomed',1,([hwnd])=>window(hwnd).style&0x1000000?1:0);
 const move=old('user32.dll','MoveWindow');vm.hook('user32.dll','MoveWindow',6,args=>{const result=move(args);h.send(args[0],5,0,(args[3]&65535)|(args[4]<<16));return result;});
 let menu=20000;const menus=new Map();
 for(const name of ['CreateMenu','CreatePopupMenu'])vm.hook('user32.dll',name,0,()=>{const value=menu++;menus.set(value,[]);return value;});
 vm.hook('user32.dll','AppendMenuW',4,([menu,flags,item,text])=>{menus.get(menu).push({flags,item,text:m.utf16(text)});return 1;});
 vm.hook('user32.dll','GetMenu',1,([hwnd])=>window(hwnd).id);
 vm.hook('user32.dll','GetSubMenu',2,([menu,index])=>menus.get(menu)[index].item);
 vm.hook('user32.dll','GetMenuItemID',2,([menu,index])=>menus.get(menu)[index].item);
 vm.hook('kernel32.dll','GetCurrentProcess',0,()=>1);
 vm.hook('user32.dll','GetGuiResources',2,()=>h.fonts.size);
 return {...h,clear,retain,release,activate,
  children:hwnd=>[...windows.values()].filter(w=>w.parent===hwnd),
  findText:text=>[...windows.values()].find(w=>w.text===text),
  invokeInstance:(name,procedure,owner,args=[])=>vm.invoke('proc:'+name+':'+procedure,[owner,...args])};
}
