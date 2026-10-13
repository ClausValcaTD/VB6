import {recursiveRecordFields} from './record-recursion.js';
const lower=value=>String(value).toLowerCase();

/** Declaration index owned by one validation pass or VM. Never cache
 * globally: unchanged parsed modules may be rebound against edited providers. */
export class RecordTypeIndex {
  constructor(modules) {
    this.modules=modules;this.local=new Map();this.public=new Map();this.hidden=new Set();
    for(const owner of modules.values()){
      const names=new Map();this.local.set(owner,names);
      for(const [name,fields] of Object.entries(owner.types||{})){
        const key=lower(name),scope=owner.typeScopes?.[key]||'public';
        const definition=Object.freeze({owner,name,fields,identity:lower(owner.name)+'.'+key,scope});names.set(key,definition);
        if(scope==='private')this.hidden.add(key);
        else this.public.set(key,this.public.has(key)?null:definition);
      }
    }
  }
  resolve(name,from) {
    const key=lower(name),dot=key.indexOf('.');
    if(dot>=0){const owner=this.modules.get(key.slice(0,dot)),definition=this.local.get(owner)?.get(key.slice(dot+1));return definition&&(owner===from||definition.scope!=='private')?definition:null;}
    const own=this.local.get(from)?.get(key);if(own)return own;
    // A project class is not an unrelated module's private record.
    if(this.modules.get(key)?.kind==='class')return null;
    return this.public.get(key)||null;
  }
  problem(name,from) {
    if(this.resolve(name,from))return null;
    const key=lower(name),dot=key.indexOf('.');
    if(dot>=0){const owner=this.modules.get(key.slice(0,dot)),definition=this.local.get(owner)?.get(key.slice(dot+1));return definition?'User-defined type is not accessible: '+name:null;}
    if(this.modules.get(key)?.kind==='class')return null;
    if(this.public.has(key))return 'Ambiguous user-defined type: '+name;
    return this.hidden.has(key)?'User-defined type is not accessible: '+name:null;
  }
}
export function resolveRecordDefinition(modules,name,from) {
  return new RecordTypeIndex(modules).resolve(name,from);
}

/** Diagnose project record declarations only. External/library type names are
 * still owned by their existing adapters; this is not a universal type binder. */
export function validateRecordDeclarations(modules) {
  const index=new RecordTypeIndex(modules),diagnostics=[];
  const report=(m,line,message)=>diagnostics.push({severity:'error',number:1002,code:'VB_RECORD_TYPE',message,source:m.name,line:line||1,column:1});
  for(const m of modules.values()){
    const check=(d,line=d.line)=>{
      const problem=index.problem(d.type,m);if(problem)report(m,line,problem);
      const definition=index.resolve(d.type,m);
      if(definition&&d.autoNew)report(m,line,'As New requires a class, not a user-defined type: '+d.type);
      if(definition&&d.withEvents)report(m,line,'WithEvents requires an object, not a user-defined type: '+d.type);
      return definition;
    };
    const parameter=(d,line)=>{const definition=check(d,line);if(definition&&!d.byRef&&!d.paramArray)report(m,line,'User-defined type may not be passed ByVal');if(definition&&d.optional)report(m,line,'User-defined type parameter cannot be Optional');};
    for(const d of m.declarations)check(d);
    for(const fields of Object.values(m.types))for(const d of fields)check(d);
    for(const p of m.procedures.values()){
      check({type:p.returnType},p.line);
      for(const d of p.params)parameter(d,p.line);
      for(const ins of p.code)if(ins.op==='dim'||ins.op==='redim')for(const d of ins.decls)check(d,ins.line);
    }
    for(const event of m.events?.values()||[])for(const d of event.params)parameter(d,event.line);
  }
  for(const {definition,field,target}of recursiveRecordFields(index))diagnostics.push({
    severity:'error',number:1002,code:'VB_RECORD_RECURSION',
    message:'Circular user-defined type dependency: '+definition.owner.name+'.'+definition.name+'.'+field.name+' As '+target.owner.name+'.'+target.name,
    source:definition.owner.name,line:field.line||1,column:1
  });
  return diagnostics;
}
