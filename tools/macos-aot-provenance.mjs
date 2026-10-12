/** Portable, LF-normalized provenance for the prelinked native AOT runtime. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function readAOTSourceProvenance(root=path.resolve(import.meta.dirname,'..')){
  const digest=directory=>{const hash=createHash('sha256');for(const name of fs.readdirSync(directory).filter(n=>/^[a-z0-9-]+\.(cpp|mm|hpp)$/.test(n)).sort())hash.update(name).update('\0').update(fs.readFileSync(path.join(directory,name),'utf8').replace(/\r\n/g,'\n')).update('\0');return hash.digest('hex');};
  const sdk=path.join(root,'packages/macos-native');
  return {nativeSourceSha256:digest(path.join(sdk,'native')),aotSourceSha256:digest(path.join(sdk,'aot'))};
}
