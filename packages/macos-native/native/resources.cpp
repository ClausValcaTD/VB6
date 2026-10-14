// Immutable resource keys/data with exact UTF-16 string-table decoding. MIT.
#include "resources.hpp"
#include "library.hpp"
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <set>
#include <sys/stat.h>
#include <unistd.h>
#if defined(__APPLE__)
#include <mach-o/dyld.h>
#endif
namespace vb6 {
namespace {
struct Reader {
  const std::vector<uint8_t>& bytes;
  void range(size_t at,size_t count)const{if(at>bytes.size()||count>bytes.size()-at)fail(48,"Invalid native resource bounds");}
  uint16_t u16(size_t at)const{range(at,2);return uint16_t(bytes[at])|uint16_t(bytes[at+1])<<8;}
  uint32_t u32(size_t at)const{range(at,4);return uint32_t(bytes[at])|uint32_t(bytes[at+1])<<8|uint32_t(bytes[at+2])<<16|uint32_t(bytes[at+3])<<24;}
};
void word(std::vector<uint8_t>& bytes,size_t at,uint32_t n,size_t count){for(size_t i=0;i<count;++i)bytes.at(at+i)=uint8_t(n>>(8*i));}
uint32_t ordinal(const Value& value){auto n=value.integral();if(n<0||n>65535)fail(5,"Invalid native resource ordinal");return uint32_t(n);}
}
ResourceIdentifier resourceIdentifier(const Value& value){if(value.type==Type::String)return value.string();return uint16_t(ordinal(value));}
NativeResources::NativeResources(std::vector<uint8_t> bytes):storage(std::move(bytes)){
  const Reader reader{storage};reader.range(0,32);
  if(storage.size()>NativeResourceLimit||std::memcmp(storage.data(),"VB6RES1\0",8)||reader.u32(8)!=1||reader.u32(12)!=storage.size()||reader.u32(28))fail(48,"Invalid native resource catalog header");
  auto count=reader.u32(16),dataStart=reader.u32(20),lang=reader.u32(24);
  if(count>20000||dataStart!=32+32*count||dataStart>storage.size()||lang>65535)fail(48,"Invalid native resource catalog size");
  language=uint16_t(lang);
  auto identifier=[&](uint32_t offset,uint32_t size)->ResourceIdentifier{
    if(!offset){if(size>65535)fail(48,"Invalid resource ordinal");return uint16_t(size);}
    if(offset<dataStart||offset%2||!size||size>1024)fail(48,"Invalid resource identifier");
    reader.range(offset,size*2);Text value;value.reserve(size);
    for(size_t i=0;i<size;++i){auto c=reader.u16(offset+i*2);if(!c)fail(48,"NUL in resource identifier");value+=char16_t(c);}return value;
  };
  std::set<std::tuple<uint32_t,ResourceIdentifier,ResourceIdentifier,uint16_t>> identities;
  for(size_t i=0;i<count;++i){
    const size_t at=32+i*32;auto domain=reader.u32(at),entryLanguage=reader.u32(at+4),offset=reader.u32(at+24),size=reader.u32(at+28);
    if(domain>1||entryLanguage>65535||offset<dataStart)fail(48,"Invalid native resource entry");reader.range(offset,size);
    auto type=identifier(reader.u32(at+8),reader.u32(at+12)),name=identifier(reader.u32(at+16),reader.u32(at+20));
    if(domain==1&&(type!=ResourceIdentifier(uint16_t(0))||!std::holds_alternative<uint16_t>(name)||!std::get<uint16_t>(name)||entryLanguage))fail(48,"Invalid designer resource identity");
    if(!identities.emplace(domain,type,name,uint16_t(entryLanguage)).second)fail(48,"Duplicate native resource identity");
    auto& entries=index[{domain,std::move(type),std::move(name)}];
    entries.push_back({uint16_t(entryLanguage),offset,size});
  }
}
const NativeResourceEntry& NativeResources::find(uint32_t domain,const ResourceIdentifier& name,const ResourceIdentifier& type,int selectedLanguage)const{
  auto found=index.find({domain,type,name});if(found==index.end())fail(326,"Resource with identifier not found");
  const auto& entries=found->second;auto selected=selectedLanguage<0?language:selectedLanguage;
  for(const auto&e:entries)if(e.language==selected)return e;
  for(const auto&e:entries)if(!e.language)return e;
  return entries.front();
}
std::vector<uint8_t> NativeResources::bytes(const NativeResourceEntry& entry)const{
  Reader{storage}.range(entry.offset,entry.length);return {storage.begin()+entry.offset,storage.begin()+entry.offset+entry.length};
}
Value NativeResources::data(Value name,Value type,size_t maxElements)const{
  const auto& entry=find(0,resourceIdentifier(name),resourceIdentifier(type));
  if(entry.length>maxElements)fail(7,"Resource exceeds native array element limit");
  auto array=std::make_shared<Array>("byte",Bounds{},true,maxElements);array->allocated=true;array->bounds={{0,int32_t(entry.length)-1}};array->values.reserve(entry.length);
  for(size_t i=0;i<entry.length;++i)array->values.push_back(Value::integer(storage[entry.offset+i],Type::Byte));
  auto result=Value::array(array);result.variant=true;return result;
}
Value NativeResources::string(Value id)const{
  if(id.type==Type::String)fail(13,"String resource IDs must be numeric");const auto number=ordinal(id);
  const auto& entry=find(0,uint16_t((number>>4)+1),uint16_t(6));const auto data=bytes(entry);const Reader reader{data};
  size_t at=0;Text result;
  for(size_t slot=0;slot<16;++slot){auto size=reader.u16(at);at+=2;reader.range(at,size_t(size)*2);
    if(slot==(number&15)){result.reserve(size);for(size_t i=0;i<size;++i)result+=char16_t(reader.u16(at+i*2));}at+=size_t(size)*2;}
  if(at!=data.size())fail(48,"Invalid string-table trailing data");return Value::string(std::move(result));
}
std::vector<uint8_t> NativeResources::designer(uint16_t id)const{return bytes(find(1,id,uint16_t(0)));}
std::vector<uint8_t> NativeResources::picture(Value name,int format)const{
  if(format<0||format>2)fail(5,"Invalid resource picture format");
  auto id=resourceIdentifier(name);if(!format)return bytes(find(0,id,uint16_t(2)));
  const bool cursor=format==2;const auto& group=find(0,id,uint16_t(cursor?12:14));const auto data=bytes(group);const Reader reader{data};
  if(reader.u16(0)||reader.u16(2)!=(cursor?2:1))fail(481,"Invalid image resource group");
  const auto count=reader.u16(4);if(!count||count>256||data.size()!=6+14*size_t(count))fail(481,"Invalid image group size");
  std::vector<uint8_t> out(6+16*count);word(out,2,cursor?2:1,2);word(out,4,count,2);
  for(size_t i=0;i<count;++i){
    size_t at=6+i*14,target=6+i*16;auto component=bytes(find(0,uint16_t(reader.u16(at+12)),uint16_t(cursor?1:3),group.language));
    if(component.size()!=reader.u32(at+8)||component.size()<(cursor?5u:1u)||out.size()+component.size()>NativeResourceLimit)fail(481,"Invalid image resource component size");
    uint32_t width=cursor?reader.u16(at):data[at],height=cursor?reader.u16(at+2):data[at+1];
    width=width?width:256;
    // RT_GROUP_CURSOR stores XOR + AND bitmap height, unlike a CUR directory.
    // llvm/tools/llvm-rc/ResourceFileWriter.cpp doubles the file-header height.
    // A zero byte in a 256-pixel CUR can remain zero in a compiled group.
    if(cursor){height=height?height:512;if(height%2)fail(481,"Odd cursor resource bitmap height");height/=2;}
    else height=height?height:256;
    if(width>256||height>256)fail(481,"Invalid icon/cursor resource dimensions");
    out[target]=uint8_t(width);out[target+1]=uint8_t(height);out[target+2]=cursor?0:data[at+2];
    word(out,target+4,cursor?Reader{component}.u16(0):reader.u16(at+4),2);word(out,target+6,cursor?Reader{component}.u16(2):reader.u16(at+6),2);
    word(out,target+8,uint32_t(component.size()-(cursor?4:0)),4);word(out,target+12,uint32_t(out.size()),4);
    out.insert(out.end(),component.begin()+(cursor?4:0),component.end());
  }
  return out;
}
std::vector<uint8_t> readNativeResourceFile(const std::filesystem::path& path,bool optional){
  const auto name=path.string();if(name.find('\0')!=std::string::npos)fail(52);
  struct File{int fd;~File(){if(fd>=0)::close(fd);}} file{::open(name.c_str(),O_RDONLY|O_CLOEXEC|O_NOFOLLOW|O_NONBLOCK)};
  if(file.fd<0){if(optional&&errno==ENOENT)return {};fail(errno==ENOENT?53:70,"Cannot open native resource file");}
  struct stat info{};if(::fstat(file.fd,&info)||!S_ISREG(info.st_mode)||info.st_size<0||uint64_t(info.st_size)>NativeResourceLimit)fail(48,"Native resource is not a bounded regular file");
  if(optional&&!info.st_size)fail(48,"Empty native resource catalog");
  std::vector<uint8_t> bytes(size_t(info.st_size));size_t at=0;
  while(at<bytes.size()){auto n=::read(file.fd,bytes.data()+at,bytes.size()-at);if(n<0&&errno==EINTR)continue;if(n<=0)fail(48,"Resource changed or failed while reading");at+=size_t(n);}
  uint8_t extra;ssize_t trailing;do{trailing=::read(file.fd,&extra,1);}while(trailing<0&&errno==EINTR);
  if(trailing)fail(48,"Resource changed while reading");return bytes;
}
NativeResources& nativeResources(Runtime& rt){
  if(!rt.resources){
    auto executable=rt.executablePath;
#if defined(__APPLE__)
    uint32_t size=0;(void)_NSGetExecutablePath(nullptr,&size);
    if(!size||size>1024*1024)fail(48,"Invalid executable path");std::vector<char> path(size);
    if(_NSGetExecutablePath(path.data(),&size))fail(48,"Cannot resolve executable path");executable=path.data();
#endif
    if(executable.empty())fail(326,"No executable resource directory");
    std::error_code error;executable=std::filesystem::canonical(executable,error);if(error)fail(48,"Cannot resolve application resource directory");
    const auto bytes=readNativeResourceFile(executable.parent_path().parent_path()/"Resources"/"vb6-assets.bin",true);
    rt.resources=bytes.empty()?std::make_shared<NativeResources>():std::make_shared<NativeResources>(bytes);
  }
  return *rt.resources;
}
void installResourceBuiltins(Runtime& rt){
  addBuiltin(rt,"LoadResString","index",[](Frame&f,Args args){return nativeResources(f.runtime).string(argument(args,0));});
  addBuiltin(rt,"LoadResData","index,format",[](Frame&f,Args args){return nativeResources(f.runtime).data(argument(args,0),argument(args,1),f.runtime.maxArrayElements);});
  addBuiltin(rt,"LoadResPicture","index,format?",[](Frame&f,Args args){return f.runtime.host->builtin(f,"loadrespicture",std::move(args));});
}
} // namespace vb6
