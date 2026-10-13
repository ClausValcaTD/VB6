/** Portable, LF-normalized provenance for the prelinked native AOT runtime. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {AOT_ABI} from '../packages/macos-native/src/aot-abi.js';
export function readAOTSourceProvenance(root=path.resolve(import.meta.dirname,'..')){
  const digest=directory=>{const hash=createHash('sha256');for(const name of fs.readdirSync(directory).filter(n=>/^[a-z0-9-]+\.(cpp|mm|hpp)$/.test(n)).sort())hash.update(name).update('\0').update(fs.readFileSync(path.join(directory,name),'utf8').replace(/\r\n/g,'\n')).update('\0');return hash.digest('hex');};
  const sdk=path.join(root,'packages/macos-native');
  return {nativeSourceSha256:digest(path.join(sdk,'native')),aotSourceSha256:digest(path.join(sdk,'aot'))};
}
/** Fail normal builds on a missing/stale binary instead of shipping source-only export. */
export function checkAOTRuntimeProvenance(root=path.resolve(import.meta.dirname,'..')){
  const filename=path.join(root,'packages/macos-native/src/aot-runtime-payload.js'),source=fs.readFileSync(filename,'utf8');
  const match=/^export const AOT_RUNTIME_MANIFEST=(.+);$/m.exec(source);
  if(!match)throw new Error('Missing native AOT payload manifest; run the verified runtime refresh');
  const manifest=JSON.parse(match[1]);
  if(!manifest||manifest.abi!==AOT_ABI||manifest.architecture!=='arm64'||!manifest.verification?.nativeSignatureVerified||!manifest.verification?.arm64ExecutionVerified)throw new Error('Native AOT payload has no verified execution provenance');
  const expected=readAOTSourceProvenance(root);
  for(const key of Object.keys(expected))if(expected[key]!==manifest.provenance?.[key])throw new Error('Native AOT payload is stale: '+key+'. Rebuild and validate it on Apple Silicon.');
  return manifest;
}
