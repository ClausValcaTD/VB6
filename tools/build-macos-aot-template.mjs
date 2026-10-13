/** Maintainer tool: builds the reusable SDK template once, not per VB project. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readAOTSourceProvenance} from './macos-aot-provenance.mjs';
import {buildMacOSPackage} from './build-macos-native.mjs';
import {runTool,buildNativeKit,writeBuildKit} from '../packages/macos-native/src/build-driver.mjs';
import {createAOTRuntimeManifest} from '../packages/macos-native/src/aot-image.js';
import {AOT_HELPERS} from '../packages/macos-native/src/aot-abi.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sdk=path.join(root,'packages/macos-native');
export async function buildAOTTemplate({out=path.join(root,'artifacts/macos-aot/runtime'),cache,jobs=3,log=()=>{},signal}={}){
  if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('The SDK runtime template must be built on Apple Silicon macOS');
  if(!Number.isInteger(jobs)||jobs<1||jobs>16)throw new Error('jobs must be 1..16');
  buildMacOSPackage(root,{allowStaleAOTRuntime:true});const {createMacOSBuildKit}=await import('../packages/macos-native/dist/index.js');
  const work=await fs.mkdtemp(path.join(os.tmpdir(),'vb6-aot-runtime-'));cache??=path.join(work,'cache');
  try {
    const kit=createMacOSBuildKit({schema:1,name:'NativeAOTRuntime',startup:'Sub Main',modules:[{name:'MainModule',kind:'module',code:'Public Sub Main()\nEnd Sub'}]}),kitDir=path.join(work,'kit');
    await writeBuildKit(kitDir,kit.files);
    const built=await buildNativeKit(kitDir,{out:path.join(work,'native'),cache,jobs,zip:false,log,signal});
    const invoke=(exe,args)=>runTool(exe,args,{cwd:work,signal,log,timeout:180000}),compiler=await invoke('/usr/bin/xcrun',['--find','clang++']),sdkPath=await invoke('/usr/bin/xcrun',['--sdk','macosx','--show-sdk-path']);
    const names=['helpers.cpp','runtime.cpp','template-main.cpp'],objects=[];
    const flags=['-std=c++17','-arch','arm64','-isysroot',sdkPath,'-mmacosx-version-min=11.0','-O2','-fexceptions','-Wall','-Wextra','-Werror','-I',path.join(sdk,'native'),'-I',path.join(sdk,'aot')];
    const compilation=await Promise.allSettled(names.map(async(name,i)=>{const object=path.join(work,i+'.o');await invoke(compiler,[...flags,'-c',path.join(sdk,'aot',name),'-o',object]);objects[i]=object;}));
    const rejected=compilation.find(r=>r.status==='rejected');if(rejected)throw rejected.reason;
    const exports=path.join(work,'exports.txt');await fs.writeFile(exports,['_main',...AOT_HELPERS.map(n=>'_vb6_aot_'+n)].join('\n')+'\n');
    const executable=path.join(work,'runtime-arm64');
    await invoke(compiler,['-arch','arm64','-isysroot',sdkPath,'-mmacosx-version-min=11.0',...objects,path.join(cache,built.runtimeSha256,'libvb6-native.a'),'-framework','AppKit','-framework','Foundation','-framework','CoreGraphics','-framework','QuartzCore','-Wl,-dead_strip','-Wl,-pie','-Wl,-segprot,__VB6CODE,rx,rx','-Wl,-segprot,__VB6META,r,r','-Wl,-exported_symbols_list,'+exports,'-o',executable]);
    await invoke('/usr/bin/codesign',['--force','--sign','-','--timestamp=none',executable]);await invoke('/usr/bin/codesign',['--verify','--strict',executable]);
    const bytes=new Uint8Array(await fs.readFile(executable));
    const manifest=await createAOTRuntimeManifest(bytes,{...readAOTSourceProvenance(root),nativeRuntimeSha256:built.runtimeSha256,compilerVersion:built.compilerVersion,sdkVersion:built.sdkVersion});
    await fs.mkdir(out,{recursive:true});const stat=await fs.lstat(out);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('AOT template output must be a regular directory');
    await fs.writeFile(path.join(out,'runtime-arm64'),bytes,{flag:'wx',mode:0o644});await fs.writeFile(path.join(out,'runtime.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return {bytes,manifest};
  }finally{await fs.rm(work,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--out'))throw new Error('Usage: node tools/build-macos-aot-template.mjs [--out DIRECTORY]');console.log(JSON.stringify((await buildAOTTemplate({...(args.length?{out:path.resolve(args[1])}:{}),log:s=>process.stderr.write(s)})).manifest,null,2));}catch(error){console.error(error.message,error.output||'');process.exitCode=1;}}
