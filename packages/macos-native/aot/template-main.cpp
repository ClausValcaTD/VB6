/** Fixed native runtime entry. Project procedures are native ARM64, not bytecode. */
#include "runtime.hpp"
#include <iostream>
#include <cstring>
#if !defined(__APPLE__) || !defined(__aarch64__)
#error This runtime template must be built for macOS arm64
#endif
extern "C" const unsigned char vb6_aot_code[];
extern "C" const unsigned char vb6_aot_metadata[];
// Keep fixed virtual addresses for the linked SDK. Browser export only fills
// these sections on disk and signs the finished image; it never requests JIT/WX.
asm(".section __TEXT,__vb6code,regular,pure_instructions\n"
    ".p2align 14\n.globl _vb6_aot_code\n_vb6_aot_code:\n.space 2097152\n"
    ".section __TEXT,__vb6meta,regular\n"
    ".p2align 14\n.globl _vb6_aot_metadata\n_vb6_aot_metadata:\n.space 2097152\n");
int main(int argc,char**argv) {
  try {
    const auto*p=vb6_aot_metadata;
    if(std::memcmp(p,"VB6AOT1\0",8)!=0)throw std::runtime_error("This is an unpopulated VB6 AOT runtime template, not an exported application");
    auto word=[&](size_t at){return uint32_t(p[at])|(uint32_t(p[at+1])<<8)|(uint32_t(p[at+2])<<16)|(uint32_t(p[at+3])<<24);};
    const auto size=word(8),codeSize=word(12);
    if(!size||size>2097152-16||codeSize<4||codeSize>2097152||codeSize%4)throw std::runtime_error("Invalid AOT project section sizes");
    std::string metadata(reinterpret_cast<const char*>(p+16),size);
    auto root=vb6::aot::JsonReader(metadata).parse();std::vector<vb6::aot::Entry> entries;
    if(root.at("abi").integer()!=1||root.at("entries").list().size()>65536)throw std::runtime_error("Invalid AOT entry table");
    for(const auto&j:root.at("entries").list()){
      auto offset=j.integer();if(offset<0||uint32_t(offset)>=codeSize||offset%16)throw std::runtime_error("Invalid AOT procedure address");
      entries.push_back(reinterpret_cast<vb6::aot::Entry>(reinterpret_cast<uintptr_t>(vb6_aot_code)+uintptr_t(offset)));
    }
    return vb6::aot::run(metadata,entries,argc,argv);
  } catch(const std::exception&e) {std::cerr<<"Native AOT loader: "<<e.what()<<"\n";return 2;}
}
