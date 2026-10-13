/** Conservative native-code optimizations. Never remove helper calls/checkpoints.
 * Slots may be reused across source instructions; global read sets are deliberately
 * conservative, avoiding SSA assumptions about GoSub/Resume/exception edges. */
export function aotOptimizationLevel(value=2) {
  if(!Number.isInteger(value)||value<0||value>3)throw new RangeError('AOT optimization must be 0, 1, 2 or 3');
  return value;
}
export function optimizeAOTOperations(operations,level=2) {
  aotOptimizationLevel(level);
  const readSlots=new Set(),read=value=>{if(value&&typeof value==='object'&&Number.isInteger(value.slot))readSlots.add(value.slot);};
  for(const op of operations){if(op.op==='call')op.args.forEach(read);else if(['move','branch','select'].includes(op.op))read(op.value);}
  let removedJumps=0;
  const ops=operations.filter((op,index)=>{
    if(!level||op.op!=='jump')return true;
    for(let i=index+1;i<operations.length&&operations[i].op==='label';i++)if(operations[i].name===op.name){removedJumps++;return false;}
    if(index===operations.length-1&&op.name==='exit'){removedJumps++;return false;}
    return true;
  });
  return {ops,readSlots,removedJumps};
}
