/** Deterministic ad-hoc SHA-256 signatures. Never claims Developer ID/notarization.
 * Binary layout: Apple's CS_CodeDirectory v0x20400 / CS_SuperBlob; also see
 * llvm-project/lld/MachO/SyntheticSections.cpp, CodeSignatureSection::writeTo.
 */
const encoder=new TextEncoder();
const align=(n,a)=>Math.ceil(n/a)*a;
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
async function digest(bytes,algorithm='SHA-256'){
  if(!globalThis.crypto?.subtle)throw new Error('Native signing requires Web Crypto (HTTPS, localhost, or a secure offline file)');
  return new Uint8Array(await globalThis.crypto.subtle.digest(algorithm,bytes));
}
export const aotXML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const base64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
const plist=body=>'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>'+body+'</dict></plist>\n';
/** Seal every resource using both the v1 and v2 resource envelope formats. */
export async function aotCodeResources(resources){
  const legacy=[],modern=[];
  for(const [name,bytes]of Object.entries(resources).sort(([a],[b])=>a<b?-1:a>b?1:0)){
    if(!name.startsWith('Resources/')||!(bytes instanceof Uint8Array))throw new TypeError('Expected bundle-relative resource bytes');
    const sha1=base64(await digest(bytes,'SHA-1')),sha256=base64(await digest(bytes));
    legacy.push('<key>'+aotXML(name)+'</key><data>'+sha1+'</data>');
    modern.push('<key>'+aotXML(name)+'</key><dict><key>hash</key><data>'+sha1+'</data><key>hash2</key><data>'+sha256+'</data></dict>');
  }
  return encoder.encode(plist('<key>files</key><dict>'+legacy.join('')+'</dict><key>files2</key><dict>'+modern.join('')+'</dict>'+
    '<key>rules</key><dict><key>^Resources/</key><true/></dict>'+
    '<key>rules2</key><dict><key>.*</key><true/><key>^Info\\.plist$</key><dict><key>omit</key><true/><key>weight</key><real>10</real></dict><key>^PkgInfo$</key><dict><key>omit</key><true/><key>weight</key><real>10</real></dict></dict>'));
}
function signaturePlan(codeLimit,identifier){
  if(!Number.isInteger(codeLimit)||codeLimit<4096||codeLimit>64*1024*1024||codeLimit%16||typeof identifier!=='string'||identifier.includes('\0')||encoder.encode(identifier).length>200)throw new Error('Invalid ad-hoc signature parameters');
  const ident=encoder.encode(identifier),header=align(88+ident.length+1,16),special=3,slots=Math.ceil(codeLimit/4096),hashOffset=header+special*32,cdLength=hashOffset+slots*32;
  return {ident,header,special,slots,hashOffset,cdLength,size:align(24+cdLength,16)};
}
/** The caller supplies the original layout; all edits happen in a fresh copy. */
export async function signAOTImage(input,layout,{identifier,infoPlist,codeResources}){
  const codeLimit=layout.signature.offset,plan=signaturePlan(codeLimit,identifier),bytes=new Uint8Array(codeLimit+plan.size);
  bytes.set(input.subarray(0,codeLimit));const view=new DataView(bytes.buffer);
  view.setUint32(layout.signatureCommand+8,codeLimit,true);view.setUint32(layout.signatureCommand+12,plan.size,true);
  view.setBigUint64(layout.linkedit.command+48,BigInt(bytes.length-layout.linkedit.offset),true);
  view.setBigUint64(layout.linkedit.command+32,BigInt(align(bytes.length-layout.linkedit.offset,16384)),true);
  if(layout.uuidCommand!==undefined){const uuid=(await digest(bytes.subarray(0,codeLimit))).slice(0,16);uuid[6]=(uuid[6]&15)|0x50;uuid[8]=(uuid[8]&63)|0x80;bytes.set(uuid,layout.uuidCommand+8);}
  const signature=new Uint8Array(plan.size),s=new DataView(signature.buffer),cdOffset=24,cd=new DataView(signature.buffer,cdOffset,plan.cdLength);
  s.setUint32(0,0xfade0cc0);s.setUint32(4,signature.length);s.setUint32(8,1);s.setUint32(12,0);s.setUint32(16,cdOffset);
  cd.setUint32(0,0xfade0c02);cd.setUint32(4,plan.cdLength);cd.setUint32(8,0x20400);cd.setUint32(12,2);
  cd.setUint32(16,plan.hashOffset);cd.setUint32(20,88);cd.setUint32(24,plan.special);cd.setUint32(28,plan.slots);cd.setUint32(32,codeLimit);
  cd.setUint8(36,32);cd.setUint8(37,2);cd.setUint8(39,12);
  cd.setBigUint64(64,BigInt(layout.textSegment.offset));cd.setBigUint64(72,BigInt(layout.textSegment.fileSize));cd.setBigUint64(80,1n);
  signature.set(plan.ident,cdOffset+88);
  signature.set(await digest(infoPlist),cdOffset+plan.hashOffset-32);
  signature.set(await digest(codeResources),cdOffset+plan.hashOffset-96);
  // Limit in-flight hashes; do not allocate a promise per page for large images.
  for(let first=0;first<plan.slots;first+=32)await Promise.all(Array.from({length:Math.min(32,plan.slots-first)},async(_,j)=>{
    const i=first+j,hash=await digest(bytes.subarray(i*4096,Math.min((i+1)*4096,codeLimit)));signature.set(hash,cdOffset+plan.hashOffset+i*32);
  }));
  bytes.set(signature,codeLimit);return bytes;
}
/** Independently verify the generated CodeDirectory and all page/special hashes.
 * This is cryptographic byte verification, not macOS trust/Gatekeeper evaluation. */
export async function verifyAOTSignature(bytes,layout,{identifier,infoPlist,codeResources}){
  const {offset,size}=layout.signature;if(offset+size!==bytes.length)throw new Error('Signature is not at end of Mach-O');
  const s=new DataView(bytes.buffer,bytes.byteOffset+offset,size),u32=p=>s.getUint32(p);
  if(size<24||u32(0)!==0xfade0cc0||u32(4)!==size||u32(8)!==1||u32(12)!==0||u32(16)!==24||u32(20)!==0)throw new Error('Invalid AOT signature superblob');
  const plan=signaturePlan(offset,identifier),cd=new DataView(bytes.buffer,bytes.byteOffset+offset+24,size-24),n=p=>cd.getUint32(p);
  if(size!==plan.size||n(0)!==0xfade0c02||n(4)!==plan.cdLength||n(8)!==0x20400||n(12)!==2||n(16)!==plan.hashOffset||n(20)!==88||n(24)!==3||n(28)!==plan.slots||n(32)!==offset||cd.getUint8(36)!==32||cd.getUint8(37)!==2||cd.getUint8(38)!==0||cd.getUint8(39)!==12||n(40)||n(44)||n(48)||n(52)||cd.getBigUint64(56)!==0n||cd.getBigUint64(64)!==BigInt(layout.textSegment.offset)||cd.getBigUint64(72)!==BigInt(layout.textSegment.fileSize)||cd.getBigUint64(80)!==1n)throw new Error('Invalid AOT CodeDirectory fields');
  const raw=bytes.subarray(offset+24),read=(start,length)=>raw.subarray(start,start+length);
  if(!same(read(88,plan.ident.length),plan.ident)||read(88+plan.ident.length,plan.header-88-plan.ident.length).some(b=>b)||read(plan.hashOffset-64,32).some(b=>b)||raw.subarray(plan.cdLength).some(b=>b))throw new Error('Invalid AOT signature identifier or padding');
  if(!same(read(plan.hashOffset-32,32),await digest(infoPlist))||!same(read(plan.hashOffset-96,32),await digest(codeResources)))throw new Error('AOT bundle metadata signature mismatch');
  for(let first=0;first<plan.slots;first+=32)await Promise.all(Array.from({length:Math.min(32,plan.slots-first)},async(_,j)=>{const i=first+j;if(!same(read(plan.hashOffset+i*32,32),await digest(bytes.subarray(i*4096,Math.min((i+1)*4096,offset)))))throw new Error('AOT code signature page mismatch: '+i);}));
  return {algorithm:'SHA-256',signing:'ad-hoc',codePages:plan.slots,codeDirectorySha256:Array.from(await digest(raw.subarray(0,plan.cdLength)),b=>b.toString(16).padStart(2,'0')).join(''),byteHashesVerified:true,macOSTrustEvaluated:false,notarized:false};
}
