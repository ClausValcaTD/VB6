/** Count emitted IA-32 instructions for the original MDI acceptance workload.
 * Foreign Windows/OleAut32 APIs are explicit test doubles. These measurements
 * are not host compiler timings or native Windows hardware throughput.
 * The ordinary instruction guards and original sample/verifier are unchanged.
 */
import {mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {nativeMdiSampleFixture} from './win32-mdi-sample-fixture.mjs';
import {formMachine} from '../tests/support/native-form-machine.mjs';
const report={kind:'emitted IA-32 instructions with foreign API doubles; not Windows timing',node:process.version,results:[]};
for(const optimization of [0,1,2]){
 const {project,checks}=nativeMdiSampleFixture(),h=formMachine({mock},project,optimization);
 let instructions=0;const step=h.vm.step.bind(h.vm);h.vm.step=()=>{instructions++;return step();};
 h.create('frmWorkspace');const startupInstructions=instructions;instructions=0;
 const sentinel=new Error('native process exit');let exitCode;
 h.vm.hook('kernel32.dll','ExitProcess',1,([code])=>{exitCode=code;throw sentinel;});
 assert.throws(()=>h.invokeForm('frmWorkspace','NativeVerify'),error=>error===sentinel);
 assert.equal(exitCode,0);assert.equal(h.windows.size,0);assert.equal(h.owned().length,0);
 report.results.push({optimization,bytes:h.result.bytes.length,assertions:checks.length,startupInstructions,verifierInstructions:instructions,remainingWindows:0,remainingOwners:0});
}
const text=JSON.stringify(report,null,2)+'\n';if(process.argv[2])await fs.writeFile(process.argv[2],text);console.log(text);
