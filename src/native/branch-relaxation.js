/** Plan branch relaxation in original section coordinates. Only the width plan
 * changes in a fixed-point pass; bytes, labels and relocations are rebuilt once.
 * Retain the established simultaneous-pass order (shortened branches freeze),
 * including protected interior addresses and nonzero target addends.
 */
export function relaxNativeBranches(section,sections,level,branchPlan){
 const candidates=section.fixups.map(f=>branchPlan(section,f)).filter(Boolean).sort((a,b)=>a.start-b.start);
 if(!candidates.length)return {passes:0,branchesShortened:0,fallthroughBranchesRemoved:0,bytesSaved:0};
 const labels=section.labels,protectedOffsets=new Set(labels.values()),references=[],candidateFixups=new Set(candidates.map(c=>c.fixup));
 for(const owner of sections)for(const fixup of owner.fixups)if(labels.has(fixup.label)){
  const base=labels.get(fixup.label),target=base+fixup.addend;
  if(target<0||target>section.length)return {passes:0,branchesShortened:0,fallthroughBranchesRemoved:0,bytesSaved:0};
  protectedOffsets.add(target);references.push({fixup,base,target});
 }
 for(const f of section.fixups)if(!candidateFixups.has(f)){
  protectedOffsets.add(f.offset);protectedOffsets.add(f.offset+(f.kind==='rel8'?1:4));
 }
 const boundaries=[...protectedOffsets].sort((a,b)=>a-b);
 const upperBound=(array,n)=>{let lo=0,hi=array.length;while(lo<hi){const m=(lo+hi)>>>1;if(array[m]<=n)lo=m+1;else hi=m;}return lo;};
 for(const c of candidates){
  c.target=labels.get(c.fixup.label);
  const next=upperBound(boundaries,c.start);
  c.admitted=c.target!==undefined&&c.fixup.addend===0&&!(next<boundaries.length&&boundaries[next]<c.start+c.size);
 }
 const ends=candidates.map(c=>c.start+c.size),prefix=new Float64Array(candidates.length+1);
 const map=offset=>offset-prefix[upperBound(ends,offset)];
 let passes=0;
 for(;;){
  for(let i=0;i<candidates.length;i++)prefix[i+1]=prefix[i]+candidates[i].size-candidates[i].newSize;
  let changed=false;
  for(const c of candidates){
   if(!c.admitted||c.newSize!==c.size)continue;
   const start=map(c.start),target=map(c.target);
   if(level===2&&target===start+c.size)c.newSize=0;
   else {
    const afterSelf=target>=start+c.size?target-(c.size-2):target,distance=afterSelf-start-2;
    if(distance>=-128&&distance<=127)c.newSize=2;
   }
   if(c.newSize!==c.size)changed=true;
  }
  if(!changed)break;
  passes++;
 }
 if(!passes)return {passes:0,branchesShortened:0,fallthroughBranchesRemoved:0,bytesSaved:0};
 const edits=candidates.filter(c=>c.newSize!==c.size),byFixup=new Map(edits.map(c=>[c.fixup,c])),bytes=[];
 let cursor=0;
 for(const c of edits){for(;cursor<c.start;cursor++)bytes.push(section.bytes[cursor]);if(c.newSize)bytes.push(c.fixup.branch,0);cursor=c.start+c.size;}
 for(;cursor<section.length;cursor++)bytes.push(section.bytes[cursor]);
 for(const r of references)r.fixup.addend=map(r.target)-map(r.base);
 const fixups=[];
 for(const f of section.fixups){const c=byFixup.get(f);
  if(c){if(c.newSize)fixups.push({...f,offset:map(c.start)+1,kind:'rel8',branch:undefined});}
  else fixups.push({...f,offset:map(f.offset)});
 }
 section.labels=new Map([...labels].map(([label,offset])=>[label,map(offset)]));
 if(section.codeUnits)section.codeUnits=section.codeUnits.map(u=>({...u,start:map(u.start),end:map(u.end)}));
 const bytesSaved=section.length-bytes.length;section.bytes=bytes;section.fixups=fixups;
 return {passes,bytesSaved,branchesShortened:edits.filter(c=>c.newSize===2).length,fallthroughBranchesRemoved:edits.filter(c=>c.newSize===0).length};
}
