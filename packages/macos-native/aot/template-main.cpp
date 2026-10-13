/** Native runtime entry with project-sized, separately protected Mach-O segments. */
#include "runtime.hpp"
#include <iostream>
#include <cstring>
#include <mach-o/getsect.h>
#include <mach-o/ldsyms.h>
#if !defined(__APPLE__) || !defined(__aarch64__)
#error This runtime template must be built for macOS arm64
#endif
// The exporter resizes these trailing segments on disk. Runtime addresses and
// dyld fixups never move. getsectiondata applies the image slide at load time.
// no_dead_strip retains the markers without a static pointer into project data.
asm(".section __VB6CODE,__vb6code,regular,pure_instructions\n"
    ".p2align 14\n.globl _vb6_aot_code\n_vb6_aot_code:\n.space 16384\n.no_dead_strip _vb6_aot_code\n"
    ".section __VB6META,__vb6meta,regular\n"
    ".p2align 14\n.globl _vb6_aot_metadata\n_vb6_aot_metadata:\n.space 16384\n.no_dead_strip _vb6_aot_metadata\n");
int main(int argc,char**argv) {
  try {
    unsigned long metadataCapacity=0,codeCapacity=0;
    const auto*p=getsectiondata(&_mh_execute_header,"__VB6META","__vb6meta",&metadataCapacity);
    const auto*code=getsectiondata(&_mh_execute_header,"__VB6CODE","__vb6code",&codeCapacity);
    if(!p||!code||metadataCapacity<16||std::memcmp(p,"VB6AOT1\0",8)!=0)
      throw std::runtime_error("This is an unpopulated VB6 AOT runtime template, not an exported application");
    auto word=[&](size_t at){return uint32_t(p[at])|(uint32_t(p[at+1])<<8)|(uint32_t(p[at+2])<<16)|(uint32_t(p[at+3])<<24);};
    const auto size=word(8),codeSize=word(12);
    if(!size||size>metadataCapacity-16||size>8*1024*1024||codeSize<4||codeSize>codeCapacity||codeCapacity>64*1024*1024||codeSize%4)
      throw std::runtime_error("Invalid AOT project section sizes");
    std::string metadata(reinterpret_cast<const char*>(p+16),size);
    auto root=vb6::aot::JsonReader(metadata).parse();std::vector<vb6::aot::Entry> entries;
    if(root.at("abi").integer()!=vb6::aot::AbiVersion||root.at("entries").list().size()>65536)throw std::runtime_error("Invalid AOT entry table");
    for(const auto&j:root.at("entries").list()){
      auto offset=j.integer();if(offset<0||uint32_t(offset)>=codeSize||offset%16)throw std::runtime_error("Invalid AOT procedure address");
      entries.push_back(reinterpret_cast<vb6::aot::Entry>(reinterpret_cast<uintptr_t>(code)+uintptr_t(offset)));
    }
    return vb6::aot::run(metadata,entries,argc,argv);
  } catch(const std::exception&e) {std::cerr<<"Native AOT loader: "<<e.what()<<"\n";return 2;}
}
