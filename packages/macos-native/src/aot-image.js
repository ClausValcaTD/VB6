/** Mach-O section and symbol layout for a pinned, prelinked native runtime. */
import {inspectMachO} from './mach-o.js';
import {AOT_ABI,AOT_HELPERS} from './aot-abi.js';
import {sha256Bytes} from './archive.js';
const decoder=new TextDecoder('utf-8',{fatal:true});
export function aotImageLayout(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),image=inspectMachO(bytes),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length>64*1024*1024||!image.pie||!image.signature)throw new Error('AOT template must be a bounded, signed PIE Mach-O');
  if(image.dylibs.some(s=>!s.startsWith('/usr/lib/')&&!s.startsWith('/System/Library/')))throw new Error('AOT runtime has non-system dependencies');
  const u32=p=>v.getUint32(p,true),u64=p=>{const n=v.getBigUint64(p,true);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Unsafe Mach-O address');return Number(n);};
  const range=(offset,size,end=bytes.length)=>{if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||offset<0||size<0||offset>end-size)throw new Error('Mach-O range is outside image');};
  const text=(offset,size,terminated=false)=>{range(offset,size);let end=offset;while(end<offset+size&&bytes[end])++end;if(terminated&&end===offset+size)throw new Error('Unterminated Mach-O name');return decoder.decode(bytes.subarray(offset,end));};
  const sections=[],segments=[],commands=[];let symbolsCommand,signatureCommand,buildCommand,uuidCommand;
  for(let at=32,end=32+u32(20);at<end;at+=u32(at+4)){
    const kind=u32(at),length=u32(at+4);commands.push({kind,offset:at,length});
    if(kind===0x19){
      const segment={name:text(at+8,16),address:u64(at+24),size:u64(at+32),offset:u64(at+40),fileSize:u64(at+48),protection:u32(at+60),command:at};
      if(segment.fileSize>segment.size||segment.address+segment.size>Number.MAX_SAFE_INTEGER)throw new Error('Invalid Mach-O segment bounds');
      if(segments.some(s=>segment.size&&s.size&&segment.address<s.address+s.size&&s.address<segment.address+segment.size))throw new Error('Overlapping Mach-O virtual segments');
      if(segment.fileSize&&segments.some(s=>s.fileSize&&segment.offset<s.offset+s.fileSize&&s.offset<segment.offset+segment.fileSize))throw new Error('Overlapping Mach-O file segments');
      segments.push(segment);
      for(let j=0;j<u32(at+64);j++){
        const p=at+72+j*80,section={index:sections.length+1,name:text(p,16),segment:text(p+16,16),address:u64(p+32),size:u64(p+40),offset:u32(p+48),alignment:u32(p+52),flags:u32(p+64),command:p};
        if(section.segment!==segment.name||section.address<segment.address||section.address+section.size>segment.address+segment.size||section.alignment>30)throw new Error('Invalid Mach-O section address');
        if(![1,12,18].includes(section.flags&255)){range(section.offset,section.size,segment.offset+segment.fileSize);if(section.offset<segment.offset)throw new Error('Section precedes segment');}
        if(sections.some(s=>s.segment===section.segment&&s.name===section.name))throw new Error('Duplicate Mach-O section');sections.push(section);
      }
    } else if(kind===2){if(symbolsCommand||length<24)throw new Error('Invalid symbol table');symbolsCommand=at;}
    else if(kind===0x1d){if(signatureCommand!==undefined)throw new Error('Duplicate code signature');signatureCommand=at;}
    else if(kind===0x32){if(buildCommand!==undefined)throw new Error('Duplicate build command');buildCommand=at;}
    else if(kind===0x1b){if(uuidCommand!==undefined||length!==24)throw new Error('Invalid UUID command');uuidCommand=at;}
  }
  if(symbolsCommand===undefined||signatureCommand===undefined||buildCommand===undefined)throw new Error('Missing AOT link metadata');
  const signature=image.signature,linkedit=segments.find(s=>s.name==='__LINKEDIT'),textSegment=segments.find(s=>s.name==='__TEXT');
  if(!linkedit||signature.offset<linkedit.offset||signature.offset+signature.size!==bytes.length||linkedit.offset+linkedit.fileSize!==bytes.length||signature.offset%16)throw new Error('Code signature must terminate __LINKEDIT');
  const growable=segments.some(s=>s.name==='__VB6CODE');
  const find=name=>{const segmentName=growable?(name==='__vb6code'?'__VB6CODE':'__VB6META'):'__TEXT';const owner=segments.find(s=>s.name===segmentName),s=sections.find(s=>s.segment===segmentName&&s.name===name);if(!s||!owner||s.size<16384||s.size%16384||(!growable&&s.size!==2097152)||s.alignment!==14||s.offset%16384||s.address%16384||s.address-owner.address!==s.offset-owner.offset||(s.flags&255)!==0)throw new Error('Missing or invalid reserved AOT section: '+name);return s;};
  const code=find('__vb6code'),metadata=find('__vb6meta');
  if(!(code.flags&0x80000000)||code.offset<metadata.offset+metadata.size&&metadata.offset<code.offset+code.size)throw new Error('Invalid AOT code section');
  if(growable){
    const c=segments.find(s=>s.name==='__VB6CODE'),m=segments.find(s=>s.name==='__VB6META');
    if(!m||c.protection!==5||m.protection!==1||[c,m].some(s=>s.size!==s.fileSize||sections.filter(t=>t.segment===s.name).length!==1)||code.size!==c.size||metadata.size!==m.size||c.offset+c.fileSize!==m.offset||m.offset+m.fileSize!==linkedit.offset||c.address+c.size!==m.address||m.address+m.size!==linkedit.address)throw new Error('Invalid growable AOT segment layout');
    if(segments.filter(s=>s.fileSize).slice(-3).map(s=>s.name).join(',')!=='__VB6CODE,__VB6META,__LINKEDIT')throw new Error('Project segments must follow all fixed native segments');
  }
  const table=u32(symbolsCommand+8),count=u32(symbolsCommand+12),strings=u32(symbolsCommand+16),stringSize=u32(symbolsCommand+20);range(table,count*16,signature.offset);range(strings,stringSize,signature.offset);
  const wanted=new Set(AOT_HELPERS.map(n=>'_vb6_aot_'+n)),symbols=new Map();
  for(let i=0;i<count;i++){
    const at=table+i*16,index=u32(at),type=bytes[at+4],sectionIndex=bytes[at+5];if(index>=stringSize)throw new Error('Invalid Mach-O symbol name');
    const name=text(strings+index,stringSize-index,true);if(!wanted.has(name))continue;
    if(symbols.has(name)||(type&0xe)!==0xe||(type&0xe0)||!sectionIndex||sectionIndex>sections.length)throw new Error('Invalid or duplicate AOT helper symbol');
    const address=u64(at+8),section=sections[sectionIndex-1],segment=segments.find(s=>s.name===section.segment);
    if(!(segment.protection&4)||segment.protection&2||section===code||section===metadata||address%4||address<section.address||address>=section.address+section.size)throw new Error('AOT helper is outside native executable code');
    symbols.set(name,address);
  }
  for(const name of wanted)if(!symbols.has(name))throw new Error('Runtime is missing AOT helper: '+name);
  return {image,growable,commands,segments,sections,code,metadata,symbols,symbolsCommand,signature,signatureCommand,buildCommand,uuidCommand,linkedit,textSegment};
}
export async function createAOTRuntimeManifest(bytes,provenance={}){
  const layout=aotImageLayout(bytes);
  return {version:1,layout:layout.growable?'project-segments-v2':'reserved-v1',abi:AOT_ABI,architecture:'arm64',sha256:await sha256Bytes(bytes),bytes:bytes.length,code:{offset:layout.code.offset,address:layout.code.address,capacity:layout.code.size},metadata:{offset:layout.metadata.offset,capacity:layout.metadata.size},helpers:Object.fromEntries(layout.symbols),provenance};
}
export async function verifyAOTRuntime(bytes,manifest){
  if(!(bytes instanceof Uint8Array)||!manifest||manifest.version!==1||manifest.abi!==AOT_ABI||manifest.architecture!=='arm64'||manifest.bytes!==bytes.length||manifest.sha256!==await sha256Bytes(bytes))throw new Error('AOT runtime integrity or ABI mismatch');
  const layout=aotImageLayout(bytes);
  if((manifest.layout??'reserved-v1')!==(layout.growable?'project-segments-v2':'reserved-v1'))throw new Error('AOT runtime loader layout mismatch');
  if(manifest.code?.offset!==layout.code.offset||manifest.code?.address!==layout.code.address||manifest.code?.capacity!==layout.code.size||manifest.metadata?.offset!==layout.metadata.offset||manifest.metadata?.capacity!==layout.metadata.size)throw new Error('AOT runtime section manifest mismatch');
  if(!manifest.helpers||Object.keys(manifest.helpers).length!==layout.symbols.size||[...layout.symbols].some(([n,address])=>manifest.helpers[n]!==address))throw new Error('AOT runtime helper manifest mismatch');
  return layout;
}
