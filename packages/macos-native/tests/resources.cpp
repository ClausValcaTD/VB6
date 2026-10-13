// Independent native parser/image contracts; JavaScript supplies only catalog bytes.
#include "resources.hpp"
#include <cassert>
#include <fstream>
#include <iostream>
#include <functional>
using namespace vb6;
using namespace std::string_literals;
namespace {
void error(const std::function<void()>& action,int number){bool failed=false;try{action();}catch(const Error& e){failed=true;assert(e.number==number);}assert(failed);}
uint32_t u32(const std::vector<uint8_t>& b,size_t at){return uint32_t(b.at(at))|uint32_t(b.at(at+1))<<8|uint32_t(b.at(at+2))<<16|uint32_t(b.at(at+3))<<24;}
void word(std::vector<uint8_t>& b,size_t at,uint32_t value){for(int i=0;i<4;++i)b.at(at+i)=uint8_t(value>>(i*8));}
void catalog(const std::vector<uint8_t>& bytes){
  NativeResources r(bytes);
  assert(r.language==1045);assert(r.string(Value::integer(101)).string()==u"Zażółć\0🙂"s);
  assert(r.string(Value::integer(0)).string()==u"zero");assert(r.string(Value::integer(65535)).string()==u"last");
  assert(r.string(Value::integer(102)).string().empty());
  r.language=1033;assert(r.string(Value::integer(101)).string()==u"English");
  r.language=999;assert(r.string(Value::integer(101)).string()==u"English"); // stable first language fallback
  assert(r.string(Value::integer(0)).string()==u"zero"); // neutral language fallback
  r.language=1045;
  auto a=r.data(Value::integer(101),Value::integer(10),100).asArray();
  assert(a->elementType=="byte"&&a->bounds==Bounds({{0,4}}));
  assert(a->values.at(3).integral()==128&&a->values.at(4).integral()==255);
  a->at({Value::integer(0)}).set(Value::integer(77));
  assert(r.data(Value::integer(101),Value::integer(10),100).asArray()->values.at(0).integral()==0);
  assert(r.data(Value::string(u"101"),Value::integer(10),100).asArray()->values.at(0).integral()==33);
  assert(r.data(Value::string(u"日本語🙂"),Value::string(u"CUSTOM Ω"),100).asArray()->values.size()==3);
  auto empty=r.data(Value::string(u"empty"),Value::integer(10),100).asArray();
  assert(empty->allocated&&empty->values.empty()&&empty->bounds==Bounds({{0,-1}}));
  error([&]{(void)r.string(Value::integer(900));},326);
  error([&]{(void)r.string(Value::integer(-1));},5);
  error([&]{(void)r.string(Value::string(u"101"));},13);
  error([&]{(void)r.data(Value::integer(101),Value::integer(10),4);},7);
  auto bmp=decodeNativePicture(r.picture(Value::integer(202),0));
  assert(bmp.type==1&&!bmp.cursor&&bmp.width==2&&bmp.height==2&&bmp.bytes[0]=='B');
  auto icon=decodeNativePicture(r.picture(Value::integer(203),1));
  assert(icon.type==3&&!icon.cursor&&icon.width==16&&icon.height==16);
  auto cursor=decodeNativePicture(r.picture(Value::integer(204),2));
  assert(cursor.type==3&&cursor.cursor&&cursor.width==16&&cursor.height==16&&cursor.hotspotX==3&&cursor.hotspotY==5);
  error([&]{(void)r.picture(Value::integer(202),3);},5);
  error([&]{(void)r.picture(Value::integer(202),1);},326);
  const auto& stringEntry=r.find(0,uint16_t(7),uint16_t(6));
  auto broken=bytes;broken.at(stringEntry.offset)=255;broken.at(stringEntry.offset+1)=255;
  NativeResources badString(broken);error([&]{(void)badString.string(Value::integer(101));},48);
  const auto& group=r.find(0,uint16_t(203),uint16_t(14));broken=bytes;word(broken,group.offset+14,UINT32_MAX);
  NativeResources badGroup(broken);error([&]{(void)badGroup.picture(Value::integer(203),1);},481);
}
void malformed(const std::vector<uint8_t>& good){
  for(const auto& item:std::vector<std::pair<size_t,uint32_t>>{{8,2},{12,0},{16,20001},{20,0},{24,65536},{28,1},{32,2},{36,65536},{40,1},{44,65536},{56,0},{60,UINT32_MAX}}){
    auto bad=good;word(bad,item.first,item.second);error([&]{NativeResources r(bad);},48);
  }
  auto duplicate=good;std::copy(duplicate.begin()+32,duplicate.begin()+64,duplicate.begin()+64);error([&]{NativeResources r(duplicate);},48);
  // Truncations and random header mutations must return VB errors, never native OOB access.
  for(size_t n=0;n<good.size();n+=17){auto cut=good;cut.resize(n);error([&]{NativeResources r(cut);},48);}
  auto huge=good;huge.resize(NativeResourceLimit+1);error([&]{NativeResources r(huge);},48);
  assert(u32(good,12)==good.size());
}
void pictures(const std::vector<uint8_t>& bytes){
  NativeResources r(bytes);auto bmp=decodeNativePicture(r.picture(Value::integer(202),0)).bytes;
  auto bad=bmp;word(bad,18,32769);error([&]{(void)decodeNativePicture(bad);},481);
  bad=bmp;bad.pop_back();error([&]{(void)decodeNativePicture(bad);},481);
  bad=bmp;word(bad,10,UINT32_MAX);error([&]{(void)decodeNativePicture(bad);},481);
  bad=r.picture(Value::integer(203),1);word(bad,18,UINT32_MAX);error([&]{(void)decodeNativePicture(bad);},481);
  bad=r.picture(Value::integer(204),2);bad[10]=16;error([&]{(void)decodeNativePicture(bad);},481);
  for(auto n:{size_t(0),size_t(1),size_t(7),size_t(32),size_t(53)}){bad=bmp;bad.resize(n);error([&]{(void)decodeNativePicture(bad);},481);}
}
void files(const std::filesystem::path& path){
  const auto absent=path.parent_path()/"no-resource.bin";
  assert(readNativeResourceFile(absent,true).empty());error([&]{(void)readNativeResourceFile(absent);},53);
  const auto empty=path.parent_path()/"empty-resource.bin";std::ofstream(empty).close();
  error([&]{(void)readNativeResourceFile(empty,true);},48);
  const auto link=path.parent_path()/"resource-link.bin";std::filesystem::create_symlink(path,link);
  error([&]{(void)readNativeResourceFile(link);},70);
  error([&]{(void)readNativeResourceFile(path.parent_path());},48);
  std::filesystem::remove(empty);std::filesystem::remove(link);
}
}
int main(int argc,char**argv){assert(argc==2);const std::filesystem::path path=argv[1];auto bytes=readNativeResourceFile(path);catalog(bytes);malformed(bytes);pictures(bytes);files(path);std::cout<<"NATIVE_RESOURCE_PARSER_OK\n";}
