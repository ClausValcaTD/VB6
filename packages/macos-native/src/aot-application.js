/** End-to-end direct application export for browser and Node; no compiler bridge. */
import {compileMacOSAOT} from './aot-compiler.js';
import {linkMacOSAOT} from './aot-export.js';
import {loadMacOSAOTRuntime} from './aot-runtime.js';
export async function exportMacOSApplication(project,options={},packaging={}){
  const {signal,resources}=packaging;signal?.throwIfAborted();
  const compiled=compileMacOSAOT(project,options),runtime=await loadMacOSAOTRuntime({signal});signal?.throwIfAborted();
  const result=await linkMacOSAOT(compiled,runtime,{resources});signal?.throwIfAborted();return result;
}
