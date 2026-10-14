/** Execute a fixed authored Collection workload on the checked IA-32 machine.
 * This measures instructions and emitted bytes, NOT Windows hardware throughput.
 * Foreign Automation calls remain explicit test doubles. No guard is increased.
 */
import {mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {collectionMachine} from '../tests/support/native-collection-machine.mjs';
const result={kind:'checked IA-32 instructions; explicit foreign API doubles; not Windows throughput',node:process.version,iterations:50,results:[]};
for(const optimization of [0,1,2]){
 const h=collectionMachine({mock},`Private Sub Main()
 Dim values As New Collection,i As Long
 For i=1 To 50
  values.Add i
 Next
 For i=1 To 50
  values.Remove 1
 Next
End Sub`,optimization);
 let instructions=0;const step=h.vm.step.bind(h.vm);h.vm.step=()=>{instructions++;return step();};h.invoke();
 assert.equal(h.owned().length,0,'all Collection records and Automation values were released');
 result.results.push({optimization,bytes:h.result.bytes.length,instructions,remainingOwners:0});
}
const output=JSON.stringify(result,null,2)+'\n';if(process.argv[2])await fs.writeFile(process.argv[2],output);console.log(output);
