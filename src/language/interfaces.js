import {RecordTypeIndex} from './record-resolution.js';
import {lower} from '../core/core.js';
const json=x=>JSON.stringify(x);
function shape(p,m,records){const type=name=>records.resolve(name,m)?.identity||lower(name);return {kind:p.kind,accessor:p.accessor,type:type(p.returnType),array:!!p.returnArray,params:p.params.map(a=>({type:type(a.type),byRef:a.byRef,optional:a.optional,paramArray:a.paramArray,array:a.bounds!==null,initial:a.initial}))};}
function argument(type){return {name:'value',type,byRef:true,optional:false,paramArray:false,bounds:null,initial:null};}
/** Bind the project-defined public contract to private Interface_Member methods.
 * No native type library, inheritance or COM ABI is implied. */
export function validateInterfaces(modules){
 const errors=[],records=new RecordTypeIndex(modules);const diagnostic=(m,message,line=1)=>errors.push({severity:'error',message,number:1002,source:m.name,line,column:1});
 for(const module of modules.values()){
  module.interfaceBindings=Object.create(null);
  for(const contract of module.interfaces||[]){
   const iface=modules.get(lower(contract.name));
   if(!iface||iface.kind!=='class'){diagnostic(module,'Project class interface not found: '+contract.name,contract.line);continue;}
   if(iface===module){diagnostic(module,'A class cannot implement itself',contract.line);continue;}
   const expected=[...iface.procedures].filter(([,p])=>p.scope==='public').map(([key,p])=>({key,signature:p}));
   for(const d of iface.declarations.filter(d=>d.scope==='public'&&!d.constant)){
    if(d.bounds!==null){diagnostic(module,'Array fields in implemented interfaces are not supported: '+iface.name+'.'+d.name,contract.line);continue;}
    const object=!['variant','string','boolean','byte','integer','long','single','double','currency','date'].includes(lower(d.type))&&!records.resolve(d.type,iface);
    expected.push({key:lower(d.name)+':get',signature:{kind:'property',accessor:'get',name:d.name,returnType:d.type,params:[]}});
    expected.push({key:lower(d.name)+':'+(object?'set':'let'),signature:{kind:'property',accessor:object?'set':'let',name:d.name,returnType:'Variant',params:[argument(d.type)]}});
   }
   const members=Object.create(null);
   for(const {key,signature}of expected){
    const implementationKey=lower(iface.name)+'_'+key,implementation=module.procedures.get(implementationKey);
    if(!implementation){diagnostic(module,'Class must implement '+iface.name+'.'+signature.name+(signature.accessor?' ('+signature.accessor+')':''),contract.line);continue;}
    // Sub / Let / Set have no observable return type. Parameter identifiers are
    // allowed to differ; named invocation binds against the interface signature.
    const left=shape(signature,iface,records),right=shape(implementation,module,records);
    if(['sub'].includes(signature.kind)||['let','set'].includes(signature.accessor)){delete left.type;delete right.type;}
    if(json(left)!==json(right)){diagnostic(module,'Interface procedure declaration does not match: '+implementation.name,implementation.line);continue;}
    members[key]={procedure:implementationKey,signature};
   }
   module.interfaceBindings[lower(iface.name)]={name:iface.name,members,defaultMember:iface.defaultMember||null};
  }
 }
 return errors;
}
