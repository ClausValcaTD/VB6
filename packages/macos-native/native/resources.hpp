// Portable, bounded native resource catalog. No COM, network or source decoding.
#pragma once
#include "vb6.hpp"
#include <tuple>
namespace vb6 {
inline constexpr size_t NativeResourceLimit=20*1024*1024;
using ResourceIdentifier=std::variant<uint16_t,Text>;
struct NativeResourceEntry {uint16_t language;uint32_t offset,length;};
class NativeResources {
  std::vector<uint8_t> storage;
  using Key=std::tuple<uint32_t,ResourceIdentifier,ResourceIdentifier>;
  std::map<Key,std::vector<NativeResourceEntry>> index;
public:
  uint16_t language=0;
  NativeResources()=default;
  explicit NativeResources(std::vector<uint8_t> bytes);
  const NativeResourceEntry& find(uint32_t domain,const ResourceIdentifier& name,const ResourceIdentifier& type,int selectedLanguage=-1)const;
  std::vector<uint8_t> bytes(const NativeResourceEntry&)const;
  Value data(Value name,Value type,size_t maxElements)const;
  Value string(Value id)const;
  std::vector<uint8_t> picture(Value name,int format)const;
  std::vector<uint8_t> designer(uint16_t id)const;
};
struct NativePicture {
  std::vector<uint8_t> bytes;
  int type=1;bool cursor=false;uint32_t width=0,height=0,hotspotX=0,hotspotY=0;
};
NativePicture decodeNativePicture(std::vector<uint8_t> bytes);
ResourceIdentifier resourceIdentifier(const Value&);
std::vector<uint8_t> readNativeResourceFile(const std::filesystem::path&,bool optional=false);
NativeResources& nativeResources(Runtime&);
void installResourceBuiltins(Runtime&);
} // namespace vb6
