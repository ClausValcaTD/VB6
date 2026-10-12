#!/usr/bin/env node
import {readMacOSProject,buildMacOSProject,exportMacOSSource,exportMacOSProject} from '../src/node.mjs';
export async function main(args=process.argv.slice(2)) {
  if(!args.length||args.includes('--help')) {
    console.log('vb6-macos PROJECT.vb6web|PROJECT.vbp|FOLDER --out DIRECTORY [--source-only | --clang] [--optimization 0..3] [--minimum-version 11.0] [--identity SIGNING_IDENTITY] [--jobs 1..16]');console.log('Default: direct arm64 .app.zip export on any host, with the bundled native runtime and ad-hoc signature. --clang uses Apple Clang on macOS; --identity and --jobs apply only to that mode.');return;
  }
  const input=args.shift(),options={compiler:{}};let out,sourceOnly=false,clang=false;
  for(let i=0;i<args.length;++i) {
    const key=args[i];if(key==='--source-only'){sourceOnly=true;continue;}if(key==='--clang'){clang=true;continue;}
    if(!['--out','--optimization','--minimum-version','--identity','--jobs','--name','--bundle-identifier'].includes(key)||!args[i+1])throw new Error('Unknown or missing argument: '+key);
    const value=args[++i];
    if(key==='--out')out=value;
    else if(key==='--identity')options.identity=value;
    else if(key==='--jobs')options.jobs=Number(value);
    else options.compiler[{'--optimization':'optimization','--minimum-version':'minimumVersion','--name':'name','--bundle-identifier':'bundleIdentifier'}[key]]=key==='--optimization'?Number(value):value;
  }
  if(!out)throw new Error('--out DIRECTORY is required');
  if(sourceOnly&&clang)throw new Error('--source-only and --clang are mutually exclusive');
  if((options.identity!==undefined||options.jobs!==undefined)&&!clang)throw new Error('--identity and --jobs require explicit --clang mode');
  const project=await readMacOSProject(input);
  const report=sourceOnly?await exportMacOSSource(project,out,options.compiler):clang?await buildMacOSProject(project,{...options,out,log:s=>process.stderr.write(s)}):await exportMacOSProject(project,{...options,out});
  console.log(JSON.stringify(report,null,2));
}
try {await main();}catch(error){console.error(error.message);if(error.diagnostics)console.error(JSON.stringify(error.diagnostics,null,2));if(error.output)console.error(error.output);process.exitCode=1;}
