/** Private grid lifetime/scalar lowering. SAFEARRAY ownership and error numbers
 * match the independently executable VB kernel. Metadata initialization uses
 * two bounded bulk fills rather than one foreign call for each row/column. */
import {mem32} from './x86-operands.js';
import {NATIVE_GRID_FIELDS as F,NATIVE_GRID_MAX_CELLS} from './control-grid-contract.js';
const arg=argument=>({argument}),addr=address=>({address}),at=(base,displacement=0)=>mem32({base,displacement}),m=n=>at('ebp',n),DLL='oleaut32.dll';
const signatures={normalize:1,cellguard:3,notify:2,dispose:1,initialize:4,gettext:5,settext:6,getindexed:5,setindexed:6};
export function emitNativeGridLifetime(c,name,proc){
 if(!Object.hasOwn(signatures,name))return false;
 if(proc.module!==c.gridModule||proc.proc.params.length!==signatures[name]||proc.proc.params.some((p,i)=>p.byRef||String(p.type).toLowerCase()!==(name==='settext'&&i===5?'string':'long')))throw new Error('Invalid private grid lifetime signature');
 const x=c.x,{label,fields,count}=c.gridModule.nativeState;
 const table=(error=9)=>x.value(arg(8)).compare(count).branch('ae','error:'+error).imul('eax','eax',fields*4).emit(0x05).addr(label).mov('ebx','eax');
 const field=f=>at('ebx',F[f]*4),helper=n=>c.gridModule.procedures.get(n).label;
 const guard=()=>{table(340);x.value(arg(12)).test().branch('e','error:91').cmp('eax',field('hwnd')).branch('ne','error:91').value(arg(16)).cmp('eax',field('epoch')).branch('ne','error:91');};
 const invalidate=()=>{const done=x.unique();x.cmp(field('redraw'),0).branch('e',done).cmp(field('hwnd'),0).branch('e',done).push(0).push(0).pushOperand(field('hwnd')).invoke('user32.dll','InvalidateRect').label(done);};
 const version=()=>{const next=x.unique();x.cmp(field('version'),2147483647).branch('ne',next).mov(field('version'),0).label(next).inc(field('version')).branch('o','error:6');};
 x.label(proc.label).enter(name==='initialize'?20:['gettext','settext','getindexed','setindexed'].includes(name)?8:0);
 if(name==='normalize'){
  table();
  for(const [target,upper,lower,minus]of [['fixedrows','rows',null,false],['fixedcols','cols',null,false],['row','rows',null,true],['col','cols',null,true],['rowsel','rows',null,true],['colsel','cols',null,true],['toprow','rows','fixedrows',true],['leftcol','cols','fixedcols',true]]){
   const low=x.unique(),high=x.unique(),last=x.unique();x.mov('eax',field(target)).mov('ecx',field(upper));if(minus)x.dec('ecx').branch('o','error:6');if(lower)x.mov('edx',field(lower));else x.xor('edx','edx');
   x.cmp('eax','edx').branch('ge',low).mov('eax','edx').label(low).cmp('eax','ecx').branch('le',high).mov('eax','ecx').label(high).cmp('eax','edx').branch('ge',last).mov('eax','edx').label(last).mov(field(target),'eax');
  }
 }else if(name==='cellguard'){
  // Source comparisons validate a negative row/column before indexing D.
  x.value(arg(12)).test().branch('s','error:381').value(arg(16)).test().branch('s','error:381');table();
  x.value(arg(12)).cmp('eax',field('rows')).branch('ge','error:381').value(arg(16)).cmp('eax',field('cols')).branch('ge','error:381');
 }else if(name==='notify'){
  table();invalidate();const none=x.unique();x.cmp(m(12),0).branch('e',none).push(arg(12)).pushOperand(field('hwnd')).call(helper('hostnotify')).label(none);
 }else if(name==='dispose'){
  table(340);x.mov(field('hwnd'),0);
  for(const f of ['format','cells','widths','heights','rowdata','coldata','alignment']){
   const next=x.unique();x.mov('eax',field(f)).test().branch('e',next).push().invoke(DLL,'SafeArrayDestroy').call('native:array:check').mov(field(f),0).label(next);
  }
 }else if(name==='initialize'){
  table(340);x.cmp(m(12),0).branch('e','error:91').push(arg(8)).call(helper('dispose'));
  const epoch=x.unique();x.mov('esi',field('epoch')).cmp('esi',2147483647).branch('ne',epoch).xor('esi','esi').label(epoch).mov('edi','ebx').mov('ecx',fields).xor('eax','eax').cld().repStore(32)
   .value(arg(12)).mov(field('hwnd'),'eax').inc('esi').branch('o','error:6').mov(field('epoch'),'esi');
  x.mov(m(-4),0).mov(m(-8),0).mov(m(-12),0).mov(m(-16),0).mov(m(-20),0);
  const invalid=x.unique(),oom=x.unique(),failed=x.unique(),cleanup=x.unique(),done=x.unique();
  const cap=Math.min(NATIVE_GRID_MAX_CELLS,Math.floor(c.maxArrayBytes/4));
  x.value(arg(16)).compare(0).branch('l',invalid).compare(100001).branch('g',invalid).value(arg(20)).compare(1).branch('l',invalid).compare(10000).branch('g',invalid).compare(cap).branch('a',oom)
   .imul('eax',m(16)).branch('o',oom).compare(cap).branch('a',oom).mov(m(-20),'eax');
  for(const [f,kind,n]of [['cells',8,arg(-20)],['widths',3,arg(20)],['heights',3,arg(16)],['rowdata',3,arg(16)],['coldata',3,arg(20)],['alignment',3,arg(20)],['format',8,1]])x.api(DLL,'SafeArrayCreateVector',[kind,0,n]).test().branch('e',oom).mov(field(f),'eax');
  x.value(arg(16)).mov(field('rows'),'eax').value(arg(20)).mov(field('cols'),'eax');
  x.push(addr(-4)).pushOperand(field('widths')).invoke(DLL,'SafeArrayAccessData').test().branch('s',failed);
  const noRows=x.unique();x.cmp(m(16),0).branch('e',noRows).push(addr(-8)).pushOperand(field('heights')).invoke(DLL,'SafeArrayAccessData').test().branch('s',failed).label(noRows);
  x.mov('edi',m(-4)).mov('ecx',m(20)).value(1200).cld().repStore(32).mov('edi',m(-8)).mov('ecx',m(16)).value(315).repStore(32).jump(cleanup);
  x.label(invalid).value(380).jump(failed).label(oom).value(7).label(failed).mov(m(-12),'eax');
  x.label(cleanup);
  for(const [pointer,f]of [[-8,'heights'],[-4,'widths']]){const next=x.unique(),ok=x.unique();x.cmp(m(pointer),0).branch('e',next).pushOperand(field(f)).invoke(DLL,'SafeArrayUnaccessData').test().branch('ns',ok).cmp(m(-12),0).branch('ne',ok).mov(m(-12),'eax').label(ok).label(next);}
  x.cmp(m(-12),0).branch('e',done).push(arg(8)).call(helper('dispose')).value(arg(-12)).test();const hr=x.unique();x.branch('s',hr).jump('native:error:raise').label(hr).call('native:array:check');
  x.label(done).mov(field('redraw'),-1);
 }else if(name==='getindexed'||name==='setindexed'){
  guard();const rowCount=x.unique(),countReady=x.unique();
  x.value(arg(20)).compare(F.heights).branch('e',rowCount).compare(F.rowdata).branch('e',rowCount).mov('esi',field('cols')).jump(countReady)
   .label(rowCount).mov('esi',field('rows')).label(countReady).value(arg(24)).compare(name==='setindexed'?-1:0).branch('l','error:381').cmp('eax','esi').branch('ge','error:381');
  if(name==='setindexed'){
   const size=x.unique(),alignment=x.unique(),valid=x.unique();x.value(arg(20)).compare(F.widths).branch('e',size).compare(F.heights).branch('e',size).compare(F.alignment).branch('e',alignment).jump(valid)
    .label(size).value(arg(28)).compare(0).branch('l','error:380').compare(300000).branch('g','error:380').jump(valid)
    .label(alignment).value(arg(28)).compare(0).branch('l','error:380').compare(2).branch('g','error:380').label(valid);
  }
  // All public callers select an admitted scalar vector. Still check the D
  // subscript before loading a handle, preserving the private kernel's guard.
  x.value(arg(20)).compare(fields).branch('ae','error:9').mov('edx',mem32({base:'ebx',index:'eax',scale:4}));
  if(name==='getindexed'){
   x.mov(m(-4),0).push(addr(-4)).push(addr(24)).pushOperand('edx').invoke(DLL,'SafeArrayGetElement').call('native:array:check').value(arg(-4)).leave(20);return true;
  }
  const all=x.unique(),done=x.unique();x.cmp(m(24),-1).branch('e',all).push(addr(28)).push(addr(24)).pushOperand('edx').invoke(DLL,'SafeArrayPutElement').call('native:array:check').jump(done);
  x.label(all).testOperand('esi','esi').branch('e',done).mov(m(-8),'edx').mov(m(-4),0).push(addr(-4)).pushOperand('edx').invoke(DLL,'SafeArrayAccessData').call('native:array:check')
   .mov('edi',m(-4)).mov('ecx','esi').value(arg(28)).cld().repStore(32).push(arg(-8)).invoke(DLL,'SafeArrayUnaccessData').call('native:array:check')
   .label(done);invalidate();
 }else{
  guard();const row=x.unique(),col=x.unique();
  x.value(arg(20)).test().branch('ns',row).mov('eax',field('row')).label(row).test().branch('s','error:381').cmp('eax',field('rows')).branch('ge','error:381').mov('esi','eax')
   .value(arg(24)).test().branch('ns',col).mov('eax',field('col')).label(col).test().branch('s','error:381').cmp('eax',field('cols')).branch('ge','error:381')
   .imul('esi',field('cols')).branch('o','error:6').add('eax','esi').branch('o','error:6').mov(m(-4),'eax');
  if(name==='settext'){
   x.push(arg(28)).push(addr(-4)).pushOperand(field('cells')).invoke(DLL,'SafeArrayPutElement').call('native:array:check');version();invalidate();
  }else{
   const success=x.unique();x.mov(m(-8),0).push(addr(-8)).push(addr(-4)).pushOperand(field('cells')).invoke(DLL,'SafeArrayGetElement').test().branch('ns',success)
    .push().api(DLL,'SysFreeString',[arg(-8)]).popOperand('eax').call('native:array:check');
   x.label(success).value(arg(-8)).leave(20);return true;
  }
 }
 x.value(0).leave(signatures[name]*4);return true;
}
