import {parseDeclarations} from './declarations.js';
import {VBError} from './errors.js';
const lower=value=>String(value).toLowerCase();

export function parseRedimDeclarations(text,isConst=false,defaultTypes={}) {
  const declarations=parseDeclarations(text,isConst,defaultTypes);
  for(const d of declarations)if(!d.bounds?.length||d.autoNew||d.withEvents||d.initial)throw new VBError('ReDim requires array bounds and does not allow New, WithEvents or an initializer',1002);
  return declarations;
}

/** Rebuild implicit declarations on every binding pass. A later explicit
 * declaration (including a public module variable) wins over declarative ReDim.
 * Never mutate the cached statement declarations into variable declarations. */
export function bindRedimDeclarations(modules,scopes) {
  const diagnostics=[],publicVariables=new Map();
  const report=(m,ins,message,code='VB_REDIM')=>diagnostics.push({severity:'error',number:1002,code,message,source:m.name,line:ins.line,column:1});
  for(const [m,scope] of scopes)if(m.kind==='module')for(const [name,entry] of scope.globals)if(entry.d.scope!=='private'){
    const matches=publicVariables.get(name)||[];matches.push(entry.d);publicVariables.set(name,matches);
  }
  for(const [m,scope] of scopes){
   const members=new Set([...m.procedures.values()].map(proc=>lower(proc.name)));
   for(const p of m.procedures.values()){
    p.redimDeclarations=[];if(!p.code.some(ins=>ins.op==='redim'))continue;
    const locals=scope.locals.get(p),early=new Set();
    for(const ins of p.code)if(ins.op==='redim')for(const d of ins.decls){
      const name=lower(d.name),entry=locals.get(name)||scope.globals.get(name),imported=publicVariables.get(name)||[];
      let target=entry?.d;
      if(!target&&name===lower(p.name)&&(p.kind==='function'||p.kind==='property'&&p.accessor==='get'))target={type:p.returnType,storageType:p.storageReturnType,bounds:p.returnArray?[]:null};
      if(!target&&imported.length>1){report(m,ins,'Ambiguous ReDim variable: '+d.name);continue;}
      if(!target)target=imported[0];
      if(!target){
        if(members.has(name)){report(m,ins,'ReDim requires a variable: '+d.name);continue;}
        target={...d,bounds:[],initial:null};locals.set(name,{m,p,d:target,line:ins.line});
      }
      const array=target.bounds!==null&&target.bounds!==undefined,type=lower(target.storageType||target.type);
      if(target.paramArray)report(m,ins,'ReDim cannot resize a ParamArray: '+d.name);
      else if(array&&target.bounds.length)report(m,ins,'ReDim cannot resize a fixed array: '+d.name,'VB_REDIM_FIXED');
      else if(target.constant||!array&&type!=='variant')report(m,ins,'ReDim requires a resizable array or Variant variable: '+d.name);
      else if(array&&d.explicitType&&(lower(d.storageType||d.type)!==type||d.fixedLength!==null&&d.fixedLength!==target.fixedLength))report(m,ins,'ReDim cannot change the element type of a declared array: '+d.name,'VB_REDIM_TYPE');
      else if(!array&&d.fixedLength!==null)report(m,ins,'A Variant requires a variable-length String array, not fixed-length elements');
      // Dynamic local arrays exist throughout the procedure, even when their
      // explicit Dim appears after the first ReDim. Parameters alias their
      // supplied storage and must not be redeclared here.
      if(array&&!target.bounds.length&&locals.get(name)?.d===target&&!p.params.includes(target)&&!early.has(name)){
        early.add(name);p.redimDeclarations.push({...target,initial:null,static:!!locals.get(name)?.static});
      }
    }
  }
  }
  return diagnostics;
}
