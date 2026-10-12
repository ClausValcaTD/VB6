/** Structural fixture ONLY: helper bodies are RET, not a native runtime. Never ship. */
import {AOT_HELPERS} from '../src/aot-abi.js';
import {createAOTRuntimeManifest} from '../src/aot-image.js';
export async function syntheticAOTRuntime(){
  const page=16384,codeOffset=page*2,capacity=2097152,metadataOffset=codeOffset+capacity,textSize=metadataOffset+capacity;
  const names=['',...AOT_HELPERS.map(n=>'_vb6_aot_'+n)],encoder=new TextEncoder(),stringData=encoder.encode(names.join('\0')+'\0');
  const symOffset=textSize,strOffset=symOffset+AOT_HELPERS.length*16,signatureOffset=Math.ceil((strOffset+stringData.length)/16)*16,bytes=new Uint8Array(signatureOffset+16),v=new DataView(bytes.buffer);
  const u32=(p,n)=>v.setUint32(p,n,true),u64=(p,n)=>v.setBigUint64(p,BigInt(n),true),text=(p,n)=>bytes.set(encoder.encode(n),p),base=0x100000000;
  u32(0,0xfeedfacf);u32(4,0x100000c);u32(12,2);u32(24,0x200000);let at=32,count=0;
  const command=(kind,size)=>{const start=at;u32(at,kind);u32(at+4,size);at+=size;count++;return start;};
  const segment=(name,address,size,offset,fileSize,protection,sections=[])=>{
    const p=command(0x19,72+sections.length*80);text(p+8,name);u64(p+24,address);u64(p+32,size);u64(p+40,offset);u64(p+48,fileSize);u32(p+56,protection);u32(p+60,protection);u32(p+64,sections.length);
    sections.forEach((s,i)=>{const q=p+72+i*80;text(q,s.name);text(q+16,name);u64(q+32,base+s.offset);u64(q+40,s.size);u32(q+48,s.offset);u32(q+52,s.alignment);u32(q+64,s.flags);});
  };
  segment('__PAGEZERO',0,base,0,0,0);
  segment('__TEXT',base,textSize,0,textSize,5,[{name:'__text',offset:page,size:page,alignment:2,flags:0x80000400},{name:'__vb6code',offset:codeOffset,size:capacity,alignment:14,flags:0x80000400},{name:'__vb6meta',offset:metadataOffset,size:capacity,alignment:14,flags:0}]);
  segment('__LINKEDIT',base+textSize,page,textSize,bytes.length-textSize,1);
  let p=command(0x80000028,24);u64(p+8,page);
  p=command(0x32,24);u32(p+8,1);u32(p+12,0xb0000);u32(p+16,0xb0000);
  p=command(2,24);u32(p+8,symOffset);u32(p+12,AOT_HELPERS.length);u32(p+16,strOffset);u32(p+20,stringData.length);
  p=command(0x1d,16);u32(p+8,signatureOffset);u32(p+12,16);
  command(0x1b,24);u32(16,count);u32(20,at-32);let strIndex=1;
  AOT_HELPERS.forEach((name,i)=>{const p=symOffset+i*16;u32(p,strIndex);bytes[p+4]=0xf;bytes[p+5]=1;u64(p+8,base+page+i*4);u32(page+i*4,0xd65f03c0);strIndex+=encoder.encode('_vb6_aot_'+name).length+1;});bytes.set(stringData,strOffset);
  return {bytes,manifest:await createAOTRuntimeManifest(bytes,{structuralFixtureOnly:true,executableRuntime:false})};
}
