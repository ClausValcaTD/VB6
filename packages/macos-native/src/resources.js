/** Shared RES/FRX and Win32 image validation -> bounded native resource catalog.
 * Resource bytes are bundle data, never interpreted code or external URLs. */
import {hydrateResources,fromBase64,toBase64,MAX_RESOURCE_BYTES,readFRXRecord,resolveProjectPath} from '../../../src/project/frx.js';
import {normalizeResources,decodeStringTable} from '../../../src/project/res.js';
import {nativePictureHeader,resolveNativePicture} from '../../../src/native/picture-resources.js';
import {MacOSCompileError} from './target.js';
export const MACOS_RESOURCE_FILE='vb6-assets.bin';
const align=n=>Math.ceil(n/4)*4;
const fail=message=>{throw new MacOSCompileError(message,'',0,'MACR100');};
const textBytes=text=>{const b=new Uint8Array(text.length*2),v=new DataView(b.buffer);for(let i=0;i<text.length;i++)v.setUint16(i*2,text.charCodeAt(i),true);return b;};
/** The v1 catalog has a 32-byte header and fixed 32-byte records. Offset zero
 * denotes a numeric key, so numeric 101 and the name "101" remain distinct. */
export function encodeMacOSResources(records,language=0){
  if(!Number.isInteger(language)||language<0||language>65535)fail('Invalid native resource language');
  if(!Array.isArray(records)||records.length>20000)fail('Native resource catalog exceeds 20,000 records');
  let length=32+32*records.length;const chunks=[],pool=new Map(),keys=new Set();
  const put=bytes=>{const key=toBase64(bytes);if(pool.has(key))return pool.get(key);const offset=length;length=align(length+bytes.length);if(length>MAX_RESOURCE_BYTES)fail('Native resource catalog exceeds 20 MiB');chunks.push([offset,bytes]);pool.set(key,offset);return offset;};
  const identifier=value=>{
    if(typeof value==='number'){if(!Number.isInteger(value)||value<0||value>65535)fail('Invalid resource ordinal');return [0,value];}
    if(typeof value!=='string'||!value||value.length>1024||value.includes('\0'))fail('Invalid resource name');
    return [put(textBytes(value)),value.length];
  };
  const entries=records.map(record=>{
    const {domain=0,language:lang=0,type,name,bytes}=record;
    if(![0,1].includes(domain)||!Number.isInteger(lang)||lang<0||lang>65535||!(bytes instanceof Uint8Array))fail('Invalid native resource record');
    const key=JSON.stringify([domain,type,name,lang]);if(keys.has(key))fail('Duplicate native resource identity');keys.add(key);
    return [domain,lang,...identifier(type),...identifier(name),put(bytes),bytes.length];
  });
  const out=new Uint8Array(length),v=new DataView(out.buffer);out.set(new TextEncoder().encode('VB6RES1\0'));
  [1,length,records.length,32+32*records.length,language,0].forEach((n,i)=>v.setUint32(8+i*4,n,true));
  entries.forEach((entry,i)=>entry.forEach((n,j)=>v.setUint32(32+i*32+j*4,n,true)));
  for(const [offset,bytes]of chunks)out.set(bytes,offset);
  return out;
}
function cursorHeader(bytes){
  if(bytes.length<6||bytes[0]||bytes[1]||bytes[2]!==2||bytes[3])return null;
  const copy=bytes.slice(),v=new DataView(copy.buffer),count=v.getUint16(4,true);copy[2]=1;
  if(!count||count>256||copy.length<6+16*count)fail('Invalid cursor directory');
  for(let i=0;i<count;i++){
    const at=6+i*16,width=copy[at]||256,height=copy[at+1]||256;
    if(v.getUint16(at+4,true)>=width||v.getUint16(at+6,true)>=height)fail('Cursor hotspot is outside its image');
    v.setUint16(at+4,1,true);v.setUint16(at+6,32,true);
  }
  return nativePictureHeader(copy);
}
export function resolveMacOSPicture(project,value,module){
  // Reuse Win32's counted FRX resolution and decompression-size validation.
  // CUR shares ICO storage but its two words identify the cursor hotspot.
  try{return resolveNativePicture(project,value,module);}catch(error){
    let bytes;
    if(typeof value==='string'&&/^data:image\/(?:x-icon|x-cursor|vnd\.microsoft\.icon);base64,/i.test(value))bytes=fromBase64(value.slice(value.indexOf(',')+1));
    else if(value?.resource){
      const path=resolveProjectPath(Object.keys(project.assets||{}),module.sourcePath||module.name+'.frm',value.resource);
      if(path){const record=readFRXRecord(fromBase64(project.assets[path].data),value.offset,'Picture');if(record.kind==='picture')bytes=record.bytes;}
    }else if(typeof value==='string'){
      const path=resolveProjectPath(Object.keys(project.assets||{}),module.sourcePath||module.name+'.frm',value);
      if(path&&project.assets[path].encoding==='base64')bytes=fromBase64(project.assets[path].data);
    }
    const header=bytes&&cursorHeader(bytes);if(!header)throw error;
    return {...header,format:'cur',bytes};
  }
}
/** Input must be normalized and privately owned by the compiler. This does not
 * read disk, fetch URLs, or trust a designer's stale resourceBindings snapshot. */
export function prepareMacOSResources(project){
  hydrateResources(project,[]);
  const records=[],model=normalizeResources(project.resources||{entries:[]});
  for(const entry of model.entries){
    const bytes=fromBase64(entry.data);
    if(entry.type===6)decodeStringTable(bytes); // Reject malformed counted UTF-16 before native startup.
    records.push({domain:0,type:entry.type,name:entry.name,language:entry.language,bytes});
  }
  let pictures=0,hydrated=0;
  for(const module of project.modules)if(module.form){
    for(const control of [module.form,...module.form.controls,...module.form.menus]){
      for(const [key,value]of Object.entries(control.properties||{})){
        const picture=['picture','icon','mouseicon','disabledpicture','downpicture'].includes(key.toLowerCase());
        if(picture){
          if(value===null||value===undefined||value===''||value===0){control.properties[key]=0;continue;}
          let resolved;try{resolved=resolveMacOSPicture(project,value,module);}catch(error){throw new MacOSCompileError(`${control.name||module.name}.${key}: ${error.message}`,module.name,1,'MACR101');}
          if(++pictures>10000)fail('Native designer exceeds 10,000 pictures');
          records.push({domain:1,type:0,name:pictures,bytes:resolved.bytes});control.properties[key]=pictures;
        }else if(value?.resource){throw new MacOSCompileError(`${control.name||module.name}.${key}: unresolved native/FRX resource`,module.name,1,'MACR102');}
        if(control.resourceBindings?.[key])++hydrated;
      }
    }
  }
  const bytes=records.length?encodeMacOSResources(records,project.settings?.resourceLanguage??0):null;
  return {files:bytes?{['resources/'+MACOS_RESOURCE_FILE]:bytes}:{},bytes,
    report:{entries:model.entries.length,pictures,hydratedProperties:hydrated,bytes:bytes?.length||0,language:project.settings?.resourceLanguage??0}};
}
