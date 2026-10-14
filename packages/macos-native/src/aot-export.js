/** Browser/Node direct arm64 executable linker and .app ZIP packager. */
import {MACOS_RESOURCE_FILE} from './resources.js';
import {resizeAOTImage} from './aot-resize.js';
import {compileMacOSAOT} from './aot-compiler.js';
import {linkARM64} from '../../../src/native/arm64.js';
import {writeZip,readZip} from '../../../src/project/zip.js';
import {verifyAOTRuntime,aotImageLayout} from './aot-image.js';
import {aotCodeResources,signAOTImage,verifyAOTSignature} from './aot-signature.js';
import {macOSInfoPlist,MacOSCompileError,macOSOptions} from './target.js';
import {verifyMacOSAppArchive,sha256Bytes} from './archive.js';
const encoder=new TextEncoder();
const resourcePath=name=>typeof name==='string'&&name.startsWith('Resources/')&&!/[\\\x00-\x1f\x7f:]/.test(name)&&!name.split('/').some(p=>!p||p==='.'||p==='..');
export function writeMacOSAppZip(files,executable){
  if(!Object.hasOwn(files,executable))throw new Error('Missing application executable');
  const names=new Set();for(const name of Object.keys(files)){const key=name.normalize('NFD').toLowerCase();if(names.has(key))throw new Error('macOS-normalized application filename collision');names.add(key);}
  const bytes=writeZip(files),view=new DataView(bytes.buffer),end=bytes.length-22,decoder=new TextDecoder('utf-8',{fatal:true});let at=view.getUint32(end+16,true);
  for(let i=0;i<view.getUint16(end+10,true);i++){
    if(view.getUint32(at,true)!==0x02014b50)throw new Error('Invalid generated ZIP directory');
    const length=view.getUint16(at+28,true),name=decoder.decode(bytes.subarray(at+46,at+46+length)),local=view.getUint32(at+42,true);
    view.setUint16(at+4,0x0314,true);view.setUint32(at+38,((name===executable?0o100755:0o100644)*65536)>>>0,true);
    // Fixed 1980-01-01 DOS timestamp makes exports reproducible across timezones.
    view.setUint16(at+12,0,true);view.setUint16(at+14,33,true);view.setUint16(local+10,0,true);view.setUint16(local+12,33,true);
    at+=46+length+view.getUint16(at+30,true)+view.getUint16(at+32,true);
  }
  return bytes;
}
export async function linkMacOSAOT(compiled,runtime,{resources={}}={}){
  if(!compiled?.section||compiled.report?.codegen!=='arm64-aot')throw new TypeError('Expected compiled macOS AOT object code');
  await verifyAOTRuntime(runtime?.bytes,runtime?.manifest);
  const o=compiled.options,metadata=encoder.encode(JSON.stringify(compiled.metadata));
  let resized;try{resized=resizeAOTImage(runtime.bytes,compiled.section.length,metadata.length);}catch(e){throw new MacOSCompileError(e.message,'',0,'MACA204');}
  const {bytes:image,layout}=resized,code=linkARM64(compiled.section,layout.code.address,layout.symbols),v=new DataView(image.buffer);
  image.fill(0,layout.code.offset,layout.code.offset+layout.code.size);image.set(code,layout.code.offset);
  image.fill(0,layout.metadata.offset,layout.metadata.offset+layout.metadata.size);image.set(encoder.encode('VB6AOT1\0'),layout.metadata.offset);
  v.setUint32(layout.metadata.offset+8,metadata.length,true);v.setUint32(layout.metadata.offset+12,code.length,true);image.set(metadata,layout.metadata.offset+16);
  const version=o.minimumVersion.split('.').map(Number);v.setUint32(layout.buildCommand+12,version[0]*65536+(version[1]||0)*256+(version[2]||0),true);
  const buildReport={...compiled.report,artifact:'native-executable',compiled:true,name:o.name,codeCapacity:layout.code.size,metadataCapacity:layout.metadata.size,runtimeSha256:runtime.manifest.sha256,minimumVersion:o.minimumVersion,optimization:o.optimization,projectOptimization:compiled.report.optimization,runtimeOptimization:2,signing:'ad-hoc',notarized:false};
  const bundleResources=Object.create(null);let total=0;
  for(const [name,value]of Object.entries(resources)){
    if(!resourcePath(name)||['Resources/vb6-source-map.json','Resources/vb6-build.json','Resources/'+MACOS_RESOURCE_FILE].includes(name))throw new Error('Invalid or reserved native resource path');
    const bytes=typeof value==='string'?encoder.encode(value):value instanceof Uint8Array?value.slice():null;
    if(!bytes||bytes.length>20*1024*1024||(total+=bytes.length)>50*1024*1024)throw new Error('Native resource is invalid or exceeds limits');bundleResources[name]=bytes;
  }
  for(const [name,bytes]of Object.entries(compiled.resourceFiles||{})){
    if(name!=='resources/'+MACOS_RESOURCE_FILE||!(bytes instanceof Uint8Array)||bytes.length>20*1024*1024||(total+=bytes.length)>50*1024*1024)throw new Error('Invalid compiled resource catalog');
    bundleResources['Resources/'+MACOS_RESOURCE_FILE]=bytes.slice();
  }
  bundleResources['Resources/vb6-source-map.json']=encoder.encode(JSON.stringify(compiled.sourceMap,null,2)+'\n');
  bundleResources['Resources/vb6-build.json']=encoder.encode(JSON.stringify(buildReport,null,2)+'\n');
  const infoPlist=encoder.encode(macOSInfoPlist(o)),codeResources=await aotCodeResources(bundleResources),signing={identifier:o.bundleIdentifier,infoPlist,codeResources};
  const executable=await signAOTImage(image,layout,signing),finalLayout=aotImageLayout(executable),signature=await verifyAOTSignature(executable,finalLayout,signing);
  const root=o.name+'.app/Contents/',entry=root+'MacOS/'+o.name,files={[entry]:executable,[root+'Info.plist']:infoPlist,[root+'_CodeSignature/CodeResources']:codeResources};
  for(const [name,bytes]of Object.entries(bundleResources))files[root+name]=bytes;
  const bytes=writeMacOSAppZip(files,entry),archive=await verifyMacOSAOTArchive(bytes,o);
  return {bytes,executable,files,filename:o.name+'.app.zip',options:o,report:{...buildReport,...archive,signature,browserSignatureCryptographicallyVerified:true,executableSha256:await sha256Bytes(executable)}};
}
export async function exportMacOSAOT(project,runtime,options={},packaging={}){return linkMacOSAOT(compileMacOSAOT(project,options),runtime,packaging);}

/** Verify bytes from an arbitrary download, including every resource and page. */
export async function verifyMacOSAOTArchive(bytes,options={}){
  const o=macOSOptions(options),report=await verifyMacOSAppArchive(bytes,o),files=await readZip(bytes,{maxExpandedBytes:128*1024*1024,maxFiles:4096,filenameEncoding:'utf-8'});
  const root=o.name+'.app/Contents/',resources=Object.create(null);
  for(const [name,value]of files){
    if(name.startsWith(root+'Resources/'))resources[name.slice(root.length)]=value;
    else if(![root+'MacOS/'+o.name,root+'Info.plist',root+'_CodeSignature/CodeResources'].includes(name))throw new Error('Unexpected direct AOT archive member: '+name);
  }
  const seal=files.get(root+'_CodeSignature/CodeResources'),expected=await aotCodeResources(resources);
  if(!seal||seal.length!==expected.length||!seal.every((b,i)=>b===expected[i]))throw new Error('Native resource seal does not match archive contents');
  const binary=files.get(root+'MacOS/'+o.name),layout=aotImageLayout(binary),signature=await verifyAOTSignature(binary,layout,{identifier:o.bundleIdentifier,infoPlist:files.get(root+'Info.plist'),codeResources:seal});
  return {...report,signature,browserSignatureCryptographicallyVerified:true};
}

/** Verified in-memory input for trusted local distribution. Does not touch disk. */
export async function unpackMacOSAOTArchive(input,options={}) {
  const bytes=Uint8Array.from(input),normalized=macOSOptions(options);
  await verifyMacOSAOTArchive(bytes,normalized);
  return {options:normalized,files:await readZip(bytes,{maxExpandedBytes:128*1024*1024,maxFiles:4096,filenameEncoding:'utf-8'})};
}
