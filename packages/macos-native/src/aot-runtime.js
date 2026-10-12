/** Offline, integrity-checked native SDK. Never downloads or executes host code. */
import {readZip} from '../../../src/project/zip.js';
import {verifyAOTRuntime} from './aot-image.js';
import {AOT_RUNTIME_MANIFEST,AOT_RUNTIME_ZIP_BASE64} from './aot-runtime-payload.js';
let loading;
export function macOSAOTRuntimeInfo(){return AOT_RUNTIME_MANIFEST?structuredClone(AOT_RUNTIME_MANIFEST):null;}
async function decode(){
  if(!AOT_RUNTIME_MANIFEST||!AOT_RUNTIME_ZIP_BASE64)throw new Error('This development build has no verified Apple Silicon runtime. Use a complete release or rebuild the SDK runtime; no source export was substituted.');
  if(AOT_RUNTIME_ZIP_BASE64.length>32*1024*1024)throw new Error('Embedded AOT archive exceeds limits');
  const decoded=atob(AOT_RUNTIME_ZIP_BASE64),archive=Uint8Array.from(decoded,c=>c.charCodeAt(0));
  const files=await readZip(archive,{maxExpandedBytes:64*1024*1024,maxFiles:1,filenameEncoding:'utf-8'});
  if(files.size!==1||!files.has('runtime-arm64'))throw new Error('Invalid embedded AOT runtime archive');
  const bytes=files.get('runtime-arm64'),manifest=structuredClone(AOT_RUNTIME_MANIFEST);await verifyAOTRuntime(bytes,manifest);return {bytes,manifest};
}
export async function loadMacOSAOTRuntime({signal}={}){
  signal?.throwIfAborted();loading??=decode().catch(error=>{loading=null;throw error;});const runtime=await loading;signal?.throwIfAborted();
  // Callers cannot corrupt the cached template or change addresses for later exports.
  return {bytes:runtime.bytes.slice(),manifest:structuredClone(runtime.manifest)};
}
