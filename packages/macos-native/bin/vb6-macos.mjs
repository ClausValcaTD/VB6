#!/usr/bin/env node
import fs from 'node:fs/promises';
import {readMacOSProject,buildMacOSProject,exportMacOSSource,exportMacOSProject,exportMacOSDistribution} from '../src/node.mjs';
import {macOSDistributionOptions} from '../src/distribution.mjs';
export async function main(args=process.argv.slice(2)) {
  if(!args.length||args.includes('--help')) {
    console.log('vb6-macos PROJECT.vb6web|PROJECT.vbp|FOLDER --out DIRECTORY [--source-only | --clang | --distribute] [--optimization 0..3] [--minimum-version 11.0] [--name NAME] [--bundle-identifier ID]');
    console.log('Default: offline arm64 .app.zip export on any host, with native project-code O0..O3 and the bundled O2 runtime. --clang explicitly compiles on macOS (--identity, --jobs). --source-only exports source, not an executable.');
    console.log('--distribute: local Mac signing of the direct executable, requiring --identity ID (or - for ad-hoc). Optional --notarize-profile KEYCHAIN_PROFILE explicitly uploads to Apple and waits for acceptance, stapling and Gatekeeper verification. Optional --entitlements-json FILE and --sign-timeout MILLISECONDS (1000..600000). No credentials are read from the VB6 project.');return;
  }
  const input=args.shift(),options={compiler:{}},seen=new Set();let out,sourceOnly=false,clang=false,distribution=false,entitlementsFile;
  for(let i=0;i<args.length;++i) {
    const key=args[i];if(seen.has(key))throw new Error('Duplicate argument: '+key);seen.add(key);
    if(key==='--source-only'){sourceOnly=true;continue;}if(key==='--clang'){clang=true;continue;}if(key==='--distribute'){distribution=true;continue;}
    if(!['--out','--optimization','--minimum-version','--identity','--jobs','--name','--bundle-identifier','--notarize-profile','--entitlements-json','--sign-timeout'].includes(key)||!args[i+1])throw new Error('Unknown or missing argument: '+key);
    const value=args[++i];
    if(key==='--out')out=value;
    else if(key==='--identity')options.identity=value;
    else if(key==='--jobs')options.jobs=Number(value);
    else if(key==='--notarize-profile')options.notarizeProfile=value;
    else if(key==='--sign-timeout')options.timeout=Number(value);
    else if(key==='--entitlements-json')entitlementsFile=value;
    else options.compiler[{'--optimization':'optimization','--minimum-version':'minimumVersion','--name':'name','--bundle-identifier':'bundleIdentifier'}[key]]=key==='--optimization'?Number(value):value;
  }
  if(!out)throw new Error('--out DIRECTORY is required');
  if(Number(sourceOnly)+Number(clang)+Number(distribution)>1)throw new Error('--source-only, --clang and --distribute are mutually exclusive');
  if(options.jobs!==undefined&&!clang)throw new Error('--jobs requires explicit --clang mode');
  if(options.identity!==undefined&&!clang&&!distribution)throw new Error('Signing identities require explicit --clang or --distribute mode');
  if((options.notarizeProfile!==undefined||entitlementsFile!==undefined||options.timeout!==undefined)&&!distribution)throw new Error('Notarization, entitlements and signing timeout require explicit --distribute mode');
  if(distribution){
    const {compiler,...configuration}=options;macOSDistributionOptions(configuration);
    if(process.platform!=='darwin')throw new Error('--distribute requires macOS signing tools and a local Keychain identity');
    if(entitlementsFile!==undefined){
      const info=await fs.lstat(entitlementsFile);if(!info.isFile()||info.isSymbolicLink()||info.size>65536)throw new Error('Entitlements must be a regular JSON file no larger than 64 KiB');
      const bytes=await fs.readFile(entitlementsFile);if(bytes.length>65536)throw new Error('Entitlements file grew beyond 64 KiB');options.entitlements=JSON.parse(bytes.toString('utf8'));
    }
  }
  const project=await readMacOSProject(input);
  const report=sourceOnly?await exportMacOSSource(project,out,options.compiler):clang?await buildMacOSProject(project,{...options,out,log:s=>process.stderr.write(s)}):distribution?await exportMacOSDistribution(project,{...options,out,log:s=>process.stderr.write(s)}):await exportMacOSProject(project,{...options,out});
  console.log(JSON.stringify(report,null,2));
}
try {await main();}catch(error){console.error(error.message);if(error.diagnostics)console.error(JSON.stringify(error.diagnostics,null,2));if(error.output)console.error(error.output);process.exitCode=1;}
