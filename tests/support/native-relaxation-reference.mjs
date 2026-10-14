/** Test-only reference: the established repeated-rebuild branch algorithm.
 * Keep this independent oracle separate from the optimized production planner.
 * The source has no execution engine and does not certify Windows behavior. */
import {threadNativeBranches} from '../../src/native/branch-threading.js';
const nativeOptimizationLevel=value=>value;
function branchPlan(section,fixup) {
  if(fixup.kind!=='rel'||!Number.isInteger(fixup.branch))return null;
  const unconditional=fixup.branch===0xeb;
  if(!unconditional&&(fixup.branch<0x70||fixup.branch>0x7f))throw new Error('Invalid native branch metadata');
  const prefix=unconditional?1:2,start=fixup.offset-prefix,size=prefix+4;
  if(start<0||start+size>section.length||section.bytes[start]!== (unconditional?0xe9:0x0f)||!unconditional&&section.bytes[start+1]!==fixup.branch+0x10)throw new Error('Native branch metadata does not match instruction');
  return {fixup,start,size,newSize:size};
}
function remapper(edits) {
  const ends=edits.map(e=>e.start+e.size),prefix=[0];
  for(const edit of edits)prefix.push(prefix.at(-1)+edit.size-edit.newSize);
  return offset=>{
    let lo=0,hi=ends.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(ends[mid]<=offset)lo=mid+1;else hi=mid;}
    return offset-prefix[lo];
  };
}
/** Mutates section bytes and fixups before PE layout. Nonzero code addends are
 * rebased along with their target labels. Interior addresses inhibit resizing.
 */
export function optimizeNativeSections(sections,level=1) {
  level=nativeOptimizationLevel(level);
  const stats={level,passes:0,branchesShortened:0,branchesThreaded:0,fallthroughBranchesRemoved:0,bytesSaved:0};
  if(!level)return stats;
  for(const section of sections) {
    if(!(section.flags&0x20))continue;
    if(level===2)stats.branchesThreaded+=threadNativeBranches(section,section.fixups.map(f=>branchPlan(section,f)).filter(Boolean));
    // Start from current coordinates on every pass. Length decreases monotonically.
    while(true) {
      const candidates=section.fixups.map(f=>branchPlan(section,f)).filter(Boolean).sort((a,b)=>a.start-b.start);
      if(!candidates.length)break;
      const labels=new Map(section.labels),protectedOffsets=new Set(labels.values()),references=[],candidateFixups=new Set(candidates.map(c=>c.fixup));
      let unsafe=false;
      for(const owner of sections)for(const fixup of owner.fixups)if(labels.has(fixup.label)) {
        const base=labels.get(fixup.label),target=base+fixup.addend;
        if(target<0||target>section.length){unsafe=true;break;}
        protectedOffsets.add(target);references.push({fixup,base,target});
      }
      if(unsafe)break;
      // Also protect every other relocation field from being removed or split.
      for(const f of section.fixups)if(!candidateFixups.has(f)) {
        protectedOffsets.add(f.offset);protectedOffsets.add(f.offset+(f.kind==='rel8'?1:4));
      }
      const boundaries=[...protectedOffsets].sort((a,b)=>a-b);
      const interior=(start,end)=>{
        let lo=0,hi=boundaries.length;while(lo<hi){const m=(lo+hi)>>>1;if(boundaries[m]<=start)lo=m+1;else hi=m;}
        return lo<boundaries.length&&boundaries[lo]<end;
      };
      const edits=[];
      for(const c of candidates) {
        const target=labels.get(c.fixup.label);
        if(target===undefined||c.fixup.addend!==0||interior(c.start,c.start+c.size))continue;
        if(level===2&&target===c.start+c.size)c.newSize=0;
        else {
          const afterSelf=target>=c.start+c.size?target-(c.size-2):target;
          const distance=afterSelf-c.start-2;
          if(distance>=-128&&distance<=127)c.newSize=2;
        }
        if(c.newSize<c.size)edits.push(c);
      }
      if(!edits.length)break;
      const map=remapper(edits),byFixup=new Map(edits.map(e=>[e.fixup,e])),bytes=[];
      let cursor=0;
      for(const e of edits){for(;cursor<e.start;cursor++)bytes.push(section.bytes[cursor]);if(e.newSize)bytes.push(e.fixup.branch,0);cursor=e.start+e.size;}
      for(;cursor<section.length;cursor++)bytes.push(section.bytes[cursor]);
      for(const r of references)r.fixup.addend=map(r.target)-map(r.base);
      const fixups=[];
      for(const f of section.fixups){
        const e=byFixup.get(f);
        if(e){if(e.newSize)fixups.push({...f,offset:map(e.start)+1,kind:'rel8',branch:undefined});}
        else fixups.push({...f,offset:map(f.offset)});
      }
      section.labels=new Map([...labels].map(([label,offset])=>[label,map(offset)]));
      if(section.codeUnits)section.codeUnits=section.codeUnits.map(u=>({...u,start:map(u.start),end:map(u.end)}));
      stats.bytesSaved+=section.length-bytes.length;stats.passes++;
      stats.branchesShortened+=edits.filter(e=>e.newSize===2).length;
      stats.fallthroughBranchesRemoved+=edits.filter(e=>e.newSize===0).length;
      section.bytes=bytes;section.fixups=fixups;
    }
  }
  return stats;
}
