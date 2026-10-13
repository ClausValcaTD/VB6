/** Resize only trailing project-owned segments. Native runtime addresses stay fixed.
 * Mach-O load command layout: apple-oss-distributions/xnu EXTERNAL_HEADERS/mach-o/loader.h.
 * Legacy dyld bind/rebase streams are copied unchanged: their segment indices and
 * all referenced runtime VM addresses remain stable. No project pointers enter them. */
import {aotImageLayout} from './aot-image.js';
import {planAOTCapacity} from './aot-capacity.js';
export function resizeAOTImage(input, codeBytes, metadataBytes) {
  const layout = aotImageLayout(input);
  if (!layout.growable) {
    if (codeBytes > layout.code.size || metadataBytes > layout.metadata.size - 16)
      throw new RangeError('Legacy SDK capacity exceeded; refresh the growable native runtime');
    return {bytes:Uint8Array.from(input), layout};
  }
  const {code,metadata,linkedit} = layout;
  const plan = planAOTCapacity(codeBytes,metadataBytes,layout.signature.offset-code.size-metadata.size);
  const codeDelta = plan.codeCapacity-code.size, delta = codeDelta+plan.metadataCapacity-metadata.size;
  const bytes = new Uint8Array(input.length+delta), view = new DataView(bytes.buffer);
  const original = new DataView(input.buffer,input.byteOffset,input.byteLength);
  bytes.set(input.subarray(0,code.offset));
  bytes.set(input.subarray(linkedit.offset),linkedit.offset+delta);
  const u32 = p=>original.getUint32(p,true), set32=(p,n)=>view.setUint32(p,n,true), set64=(p,n)=>view.setBigUint64(p,BigInt(n),true);
  const offset = p=>{
    const old=u32(p);if(!old)return;
    if(old<linkedit.offset||old>=input.length)throw new Error('Relocated metadata is outside __LINKEDIT');
    set32(p,old+delta);
  };
  // Every supported command is explicit. Unknown commands must not accidentally
  // retain stale file offsets after a future Apple linker update.
  const unchanged = new Set([0xe,0x1b,0x32,0x2a,0x80000028,0xc,0x80000018,0x8000001f,0x20,0x80000023,0x1c,0x8000001c,0x24]);
  for(const {kind,offset:at,length} of layout.commands) {
    if(kind===0x19)continue;
    if(kind===2){offset(at+8);offset(at+16);}
    else if(kind===11){for(const field of [32,40,48,56,64,72])offset(at+field);}
    else if(kind===0x22||kind===0x80000022){if(length!==48)throw new Error('Invalid dyld-info command');for(const field of [8,16,24,32,40])offset(at+field);}
    else if([0x1d,0x26,0x29,0x2b,0x2e,0x80000033,0x80000034,0x36].includes(kind)){
      if(length!==16)throw new Error('Invalid linkedit-data command');
      if(kind===0x80000034){
        const start=u32(at+8),size=u32(at+12);
        if(start<linkedit.offset||size<28||start+size>input.length)throw new Error('Invalid chained fixups');
        const starts=start+u32(start+4);
        if(starts<start+28||starts+4>start+size)throw new Error('Invalid chained segment table');
        const count=u32(starts);if(count!==layout.segments.length||starts+4+count*4>start+size)throw new Error('Invalid chained segment count');
        for(let i=0;i<count;i++)if(['__VB6CODE','__VB6META','__LINKEDIT'].includes(layout.segments[i].name)&&u32(starts+4+i*4))throw new Error('Project segments must not contain native chained fixups');
      }
      offset(at+8);
    } else if(kind===0x16){if(length!==16)throw new Error('Invalid two-level hints');offset(at+8);}
    else if(!unchanged.has(kind))throw new Error('Unsupported native resize load command: '+kind.toString(16));
  }
  for(const segment of layout.segments){
    const shift=segment.name==='__VB6META'?codeDelta:segment.name==='__LINKEDIT'?delta:0;
    const size=segment.name==='__VB6CODE'?plan.codeCapacity:segment.name==='__VB6META'?plan.metadataCapacity:segment.size;
    if(segment.name==='__VB6CODE'||segment.name==='__VB6META'){
      set64(segment.command+32,size);set64(segment.command+48,size);
    }
    if(shift){set64(segment.command+24,segment.address+shift);set64(segment.command+40,segment.offset+shift);}
  }
  for(const section of layout.sections){
    const shift=section===metadata?codeDelta:0,size=section===code?plan.codeCapacity:section===metadata?plan.metadataCapacity:section.size;
    if(section===code||section===metadata){set64(section.command+32,section.address+shift);set64(section.command+40,size);set32(section.command+48,section.offset+shift);}
    if(u32(section.command+60))throw new Error('Linked native runtime contains section relocations');
  }
  // Local marker nlist values move with metadata, even though only native helper
  // symbols are published in the export trie. Native function symbols never move.
  const symtab=u32(layout.symbolsCommand+8),count=u32(layout.symbolsCommand+12);
  for(let i=0;i<count;i++){
    const at=symtab+i*16,type=input[at+4],index=input[at+5];
    if((type&0xe)===0xe && !(type&0xe0) && index===metadata.index){
      const value=original.getBigUint64(at+8,true);if(value<BigInt(metadata.address)||value>BigInt(metadata.address+metadata.size))throw new Error('Invalid project marker symbol');
      view.setBigUint64(at+delta+8,value+BigInt(codeDelta),true);
    }
  }
  return {bytes,layout:aotImageLayout(bytes)};
}
