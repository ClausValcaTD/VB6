/** Trusted local distribution authority. No credentials enter project/HTTP data.
 * Apple: https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
 * This signs an already exported executable. It never recompiles or launches it. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runTool} from './build-driver.mjs';
import {unpackMacOSAOTArchive,verifyMacOSAppArchive} from '../dist/index.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const xml=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const text=(value,label,max=512)=>{
  if(typeof value!=='string'||!value||value.length>max||/[\x00-\x1f\x7f]/.test(value)||value.startsWith('-')||!value.isWellFormed())throw new TypeError('Invalid '+label);
  return value;
};
export function macOSDistributionOptions(options={}) {
  if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('Distribution options must be an object');
  for(const key of Object.keys(options))if(!['identity','notarizeProfile','entitlements','timeout'].includes(key))throw new TypeError('Unknown distribution option: '+key);
  const {identity,notarizeProfile,entitlements={},timeout=600000}=options;
  if(identity!=='-')text(identity,'local signing identity');
  if(notarizeProfile!==undefined){text(notarizeProfile,'notarization Keychain profile',200);if(identity==='-')throw new Error('Notarization requires a Developer ID Application identity');}
  if(!Number.isInteger(timeout)||timeout<1000||timeout>600000)throw new TypeError('Distribution tool timeout must be 1000..600000 ms');
  return {identity,notarizeProfile,entitlements:distributionEntitlements(entitlements),timeout};
}
/** Serialize caller-approved entitlements, not XML supplied by a VB6 project. */
export function distributionEntitlements(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new TypeError('Entitlements must be a plain dictionary');
  let nodes=0,used=0;
  const part=value=>{used+=Buffer.byteLength(value);if(used>65536)throw new RangeError('Entitlements exceed 64 KiB');return value;};
  const encode=(item,depth=0)=>{
    if(++nodes>4096||depth>16)throw new RangeError('Entitlements exceed structural limits');
    if(item===true||item===false)return part(item?'<true/>':'<false/>');
    if(typeof item==='string'){if(!item.isWellFormed()||/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(item))throw new TypeError('Invalid entitlement string');if(item.length>65536)throw new RangeError('Entitlements exceed 64 KiB');return part('<string>'+xml(item)+'</string>');}
    if(typeof item==='number'&&Number.isSafeInteger(item))return part('<integer>'+item+'</integer>');
    if(Array.isArray(item)){if(item.length>4096)throw new RangeError('Entitlements exceed structural limits');part('<array></array>');return '<array>'+Array.from(item,v=>encode(v,depth+1)).join('')+'</array>';}
    if(item&&typeof item==='object'&&(Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null)){
      const keys=Object.keys(item);if(keys.length>4096)throw new RangeError('Entitlements exceed structural limits');part('<dict></dict>');
      return '<dict>'+keys.sort().map(key=>{text(key,'entitlement key',512);const descriptor=Object.getOwnPropertyDescriptor(item,key);if(!Object.hasOwn(descriptor,'value'))throw new TypeError('Entitlement accessors are not accepted');return part('<key>'+xml(key)+'</key>')+encode(descriptor.value,depth+1);}).join('')+'</dict>';
    }
    throw new TypeError('Unsupported entitlement value');
  };
  const result='<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">'+encode(value)+'</plist>\n';
  if(Buffer.byteLength(result)>65536)throw new RangeError('Entitlements exceed 64 KiB');return result;
}
export function readDistributionSignature(output,{identity}) {
  const flags=/\bflags=0x([0-9a-f]+)/i.exec(output);
  if(!flags||!(parseInt(flags[1],16)&0x10000))throw new Error('Signed application is missing Hardened Runtime');
  const developerID=/^Authority=Developer ID Application: .+$/m.test(output),adhoc=/^Signature=adhoc$/m.test(output);
  const team=/^TeamIdentifier=([A-Z0-9]{10})$/m.exec(output)?.[1];
  if(identity==='-'?!adhoc:(!developerID||!team))throw new Error('Native signature does not have the requested distribution identity type');
  if(identity!=='-'&&!/^Timestamp=.+$/m.test(output))throw new Error('Developer ID signature is missing a secure timestamp');
  return {signing:adhoc?'ad-hoc':'developer-id',developerID,teamIdentifier:team??null,hardenedRuntime:true};
}
export function readNotarizationResult(output) {
  let result;try{result=JSON.parse(output);}catch{throw new Error('Notary service did not return a JSON result');}
  if(!result||typeof result!=='object'||!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(result.id??''))throw new Error('Notary response has no valid submission identifier');
  if(result.status!=='Accepted')throw Object.assign(new Error('Notarization was not accepted: '+String(result.status)),{submissionId:result.id,notarizationStatus:result.status});
  return {submissionId:result.id,status:result.status};
}
async function absent(filename) {
  try{await fs.lstat(filename);}catch(error){if(error.code==='ENOENT')return;throw error;}
  throw Object.assign(new Error('Distribution output already exists: '+filename),{code:'EEXIST'});
}
async function removeOwned(filename,source) {
  const [a,b]=await Promise.all([fs.lstat(filename).catch(()=>null),fs.lstat(source).catch(()=>null)]);
  if(a&&b&&a.dev===b.dev&&a.ino===b.ino)await fs.unlink(filename);
}
/** Dependency injection is trusted host authority for embedding/testing only.
 * The default exported function always uses this host's actual Apple tools. */
export function createMacOSDistributor({platform=process.platform,run=runTool}={}) {
  if(typeof run!=='function')throw new TypeError('A native tool executor is required');
  return async function distribute(bytes,compilerOptions,{out=path.resolve('out'),signal,log,...configuration}={}) {
    signal?.throwIfAborted();
    const options=macOSDistributionOptions(configuration);
    if(platform!=='darwin')throw new Error('Developer ID distribution requires macOS with signing tools and a local Keychain identity');
    // Snapshot before any await: later caller mutation cannot change signed input.
    if(!(bytes instanceof Uint8Array)||bytes.length<22||bytes.length>128*1024*1024)throw new TypeError('Expected a bounded native app ZIP byte array');
    const original=Uint8Array.from(bytes),unpacked=await unpackMacOSAOTArchive(original,compilerOptions);
    const name=unpacked.options.name,directory=path.resolve(out);
    await fs.mkdir(directory,{recursive:true,mode:0o700});
    const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Distribution output must be a regular directory');
    const root=await fs.realpath(directory),archive=path.join(root,name+'.app.zip'),reportFile=path.join(root,name+'.distribution.json');
    await absent(archive);await absent(reportFile);signal?.throwIfAborted();
    const stage=await fs.mkdtemp(path.join(root,'.vb6-distribution-')),app=path.join(stage,name+'.app');
    let archiveLinked=false,reportLinked=false,complete=false;
    const stagedArchive=path.join(stage,'release.zip'),stagedReport=path.join(stage,'distribution.json');
    const invoke=(exe,args)=>{signal?.throwIfAborted();return run(exe,args,{cwd:stage,signal,timeout:options.timeout,log});};
    try {
      for(const [relative,content]of unpacked.files){
        signal?.throwIfAborted();
        const destination=path.join(stage,relative);
        await fs.mkdir(path.dirname(destination),{recursive:true,mode:0o755});
        // Explicit modes survive a restrictive caller umask. Staging itself
        // remains 0700, so these final bundle modes do not expose build inputs.
        for(let directory=path.dirname(destination);directory!==stage;directory=path.dirname(directory))await fs.chmod(directory,0o755);
        const mode=relative===name+'.app/Contents/MacOS/'+name?0o755:0o644,file=await fs.open(destination,'wx',mode);
        try{await file.writeFile(content);await file.chmod(mode);}finally{await file.close();}
      }
      const entitlements=path.join(stage,'entitlements.plist');
      await fs.writeFile(entitlements,options.entitlements,{flag:'wx',mode:0o600});
      await invoke('/usr/bin/plutil',['-lint',entitlements]);
      // Hardened Runtime does not need JIT or writable-executable entitlements.
      await invoke('/usr/bin/codesign',['--force','--sign',options.identity,'--options','runtime',options.identity==='-'?'--timestamp=none':'--timestamp','--entitlements',entitlements,app]);
      await invoke('/usr/bin/codesign',['--verify','--strict','--verbose=2',app]);
      const signature=readDistributionSignature(await invoke('/usr/bin/codesign',['--display','--verbose=4',app]),options);
      let notarization=null;
      if(options.notarizeProfile!==undefined){
        const submission=path.join(stage,'submission.zip');
        await invoke('/usr/bin/ditto',['-c','-k','--keepParent','--sequesterRsrc',app,submission]);
        // Profile name references the user's Keychain. Passwords/API keys are
        // neither accepted in project data nor echoed into generated scripts.
        const accepted=await invoke('/usr/bin/xcrun',['notarytool','submit',submission,'--keychain-profile',options.notarizeProfile,'--wait','--output-format','json']);
        notarization=readNotarizationResult(accepted);
        await invoke('/usr/bin/xcrun',['stapler','staple',app]);
        await invoke('/usr/bin/xcrun',['stapler','validate',app]);
        await invoke('/usr/sbin/spctl',['--assess','--type','execute','--verbose=4',app]);
      }
      await invoke('/usr/bin/ditto',['-c','-k','--keepParent','--sequesterRsrc',app,stagedArchive]);
      const info=await fs.lstat(stagedArchive);
      if(!info.isFile()||info.isSymbolicLink()||info.size>128*1024*1024)throw new Error('Native distribution archive is invalid or too large');
      const output=new Uint8Array(await fs.readFile(stagedArchive));
      await verifyMacOSAppArchive(output,unpacked.options);
      // Verify the actual deliverable after extraction, including resource forks
      // carrying stapled tickets. Do not equate verification of staging with ZIP.
      const extracted=path.join(stage,'roundtrip');await fs.mkdir(extracted);
      await invoke('/usr/bin/ditto',['-x','-k',stagedArchive,extracted]);
      const restored=path.join(extracted,name+'.app');
      await invoke('/usr/bin/codesign',['--verify','--strict','--verbose=2',restored]);
      const restoredSignature=readDistributionSignature(await invoke('/usr/bin/codesign',['--display','--verbose=4',restored]),options);
      if(JSON.stringify(signature)!==JSON.stringify(restoredSignature))throw new Error('Archive round trip changed the signing identity');
      if(notarization){await invoke('/usr/bin/xcrun',['stapler','validate',restored]);await invoke('/usr/sbin/spctl',['--assess','--type','execute','--verbose=4',restored]);}
      const report={artifact:'native-distribution',architecture:'arm64',archive,bytes:output.length,sha256:hash(output),inputSha256:hash(original),...signature,
        nativeSignatureVerified:true,archiveRoundtripVerified:true,notarized:!!notarization,ticketStapled:!!notarization,gatekeeperAccepted:!!notarization,notarization};
      await fs.writeFile(stagedReport,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o644});
      for(const filename of [stagedArchive,stagedReport]){const file=await fs.open(filename,'r');try{await file.chmod(0o644);await file.sync();}finally{await file.close();}}
      signal?.throwIfAborted();await fs.link(stagedArchive,archive);archiveLinked=true;
      signal?.throwIfAborted();await fs.link(stagedReport,reportFile);reportLinked=true;
      signal?.throwIfAborted();complete=true;return {...report,reportFile};
    } finally {
      if(!complete){if(reportLinked)await removeOwned(reportFile,stagedReport);if(archiveLinked)await removeOwned(archive,stagedArchive);}
      await fs.rm(stage,{recursive:true,force:true});
    }
  };
}
export const distributeMacOSApplication=createMacOSDistributor();
