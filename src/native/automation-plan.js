import {nativeEventItemStorage} from './control-items.js';
/** IDispatch argument layout is separate from source evaluation order.
 * Named arguments lead rgvarg; positional arguments follow in reverse order.
 * A property value is the first named argument (DISPID_PROPERTYPUT).
 * https://learn.microsoft.com/windows/win32/api/oaidl/nf-oaidl-idispatch-invoke
 */
export function planAutomationArguments(args,{put=false,fail=message=>{throw new TypeError(message);}}={}){
 if(args.length>64)fail('Native Automation calls are limited to 64 arguments');
 const names=new Set();let named=false;
 const entries=args.map((original,index)=>{
  const name=original.kind==='named'?String(original.name):null,node=name?original.expr:original;
  if(name){named=true;const key=name.toLowerCase();if(names.has(key))fail('Duplicate Automation named argument: '+name);names.add(key);}
  else if(named&&!(put&&index===args.length-1))fail('Positional argument follows a named Automation argument');
  if(!node)fail('Missing Automation argument node');
  return {node,name,index,put:put&&index===args.length-1};
 });
 if(put&&!entries.length)fail('Automation property assignment requires a value');
 const ordinary=entries.filter(e=>!e.put);
 const namedEntries=ordinary.filter(e=>e.name).reverse();
 return {entries,abi:[...entries.filter(e=>e.put),...namedEntries,...ordinary.filter(e=>!e.name).reverse()],names:namedEntries.map(e=>e.name)};
}

/** An external Automation project gives unqualified Object storage the genuine
 * VARIANT ABI. Keep authored text untouched; only the bound native program is
 * specialized. Existing control-only projects retain their exact prior ABI.
 * Mixing private HWND references into an Automation Object fails explicitly.
 */
export function prepareNativeAutomation(program){
 let enabled=false;
 const publicCreate=[...program.modules.values()].some(m=>[...m.procedures.values()].some(p=>p.name.toLowerCase()==='createobject'&&p.scope==='public'));
 for(const module of program.modules.values()){
  if(module.procedures.has('createobject')||publicCreate)continue;
  const visit=n=>{if(!n||typeof n!=='object')return;
   if(n.kind==='call'&&n.callee.kind==='id'&&n.callee.name.toLowerCase()==='createobject')enabled=true;
   if(Array.isArray(n))n.forEach(visit);else for(const value of Object.values(n))visit(value);
  };
  for(const p of module.procedures.values())visit(p.code);
 }
 if(!enabled)return false;
 const lower=d=>{if(String(d.storageType||d.type).toLowerCase()!=='object')return;
  if(d.autoNew||d.withEvents||d.bounds!=null)throw new TypeError('Native Automation Object storage must be scalar without As New or WithEvents');
  d.type='Variant';if(d.storageType)d.storageType='Variant';d.nativeAutomationObject=true;
 };
 for(const m of program.modules.values()){
  m.declarations.forEach(lower);
  for(const p of m.procedures.values()){
   // An imported Object ABI requires a type library rather than a local pointer.
   if(p.external){if(p.params.some(a=>String(a.type).toLowerCase()==='object')||String(p.returnType).toLowerCase()==='object')throw new TypeError('Native Declare Object Automation ABI is not supported');continue;}
   for(const parameter of p.params){
    // Common-control callbacks expose borrowed item descriptors, not COM Object.
    if(nativeEventItemStorage({fail:message=>{throw new TypeError(message);}}, {...parameter,parameter:true},m,p))continue;
    lower(parameter);
   }
   if(String(p.storageReturnType||p.returnType).toLowerCase()==='object'){
    p.returnType='Variant';if(p.storageReturnType)p.storageReturnType='Variant';p.nativeAutomationReturn=true;
   }
   for(const ins of p.code)if(ins.op==='dim')ins.decls.forEach(lower);
  }
 }
 return true;
}
