// Header-bounded raster/ICO/CUR decoding before handing bytes to AppKit. MIT.
// Mirrors the shared Win32 planner limits, independent of platform image codecs.
#include "resources.hpp"
#include <cstring>
namespace vb6 {
namespace {
struct Bytes {
  const std::vector<uint8_t>& data;
  void range(size_t at,size_t count)const{if(at>data.size()||count>data.size()-at)fail(481,"Truncated native picture");}
  uint16_t u16(size_t at)const{range(at,2);return uint16_t(data[at])|uint16_t(data[at+1])<<8;}
  uint32_t u32(size_t at)const{range(at,4);return uint32_t(data[at])|uint32_t(data[at+1])<<8|uint32_t(data[at+2])<<16|uint32_t(data[at+3])<<24;}
  uint32_t be32(size_t at)const{range(at,4);return uint32_t(data[at])<<24|uint32_t(data[at+1])<<16|uint32_t(data[at+2])<<8|uint32_t(data[at+3]);}
};
void put(std::vector<uint8_t>& b,size_t at,uint32_t n,size_t size){for(size_t i=0;i<size;++i)b.at(at+i)=uint8_t(n>>(8*i));}
void dimensions(uint32_t width,uint32_t height){if(!width||!height||width>32768||height>32768||uint64_t(width)*height>64*1024*1024)fail(481,"Native picture exceeds bounded pixel dimensions");}
uint32_t positiveHeight(uint32_t bits){const auto value=int32_t(bits);if(value==INT32_MIN)fail(481);return uint32_t(value<0?-value:value);}
bool png(const std::vector<uint8_t>& b){return b.size()>=8&&!std::memcmp(b.data(),"\x89PNG\r\n\x1a\n",8);}
}
NativePicture decodeNativePicture(std::vector<uint8_t> bytes){
  if(bytes.size()<8||bytes.size()>NativeResourceLimit)fail(481,"Invalid picture payload size");
  NativePicture result;Bytes r{bytes};
  // RT_BITMAP contains a DIB, without the fourteen-byte BMP file header.
  if(r.u32(0)==40||r.u32(0)==108||r.u32(0)==124){
    const uint32_t header=r.u32(0),bits=r.u16(14),compression=r.u32(16),used=r.u32(32);
    if(!bits||bits>32||!(bits==1||bits==4||bits==8||bits==16||bits==24||bits==32)||!(compression==0||compression==3||compression==6))fail(481,"Unsupported DIB format");
    const uint64_t colors=used?used:(bits<=8?uint64_t(1)<<bits:0),extra=header==40?(compression==3?12:compression==6?16:0):0;
    const uint64_t start=header+colors*4+extra;
    if(colors>256||start>bytes.size()||bytes.size()+14>NativeResourceLimit)fail(481,"Invalid bitmap palette");
    std::vector<uint8_t> bmp(bytes.size()+14);bmp[0]='B';bmp[1]='M';put(bmp,2,uint32_t(bmp.size()),4);put(bmp,10,uint32_t(start+14),4);std::copy(bytes.begin(),bytes.end(),bmp.begin()+14);bytes=std::move(bmp);
  }
  if(png(bytes)){
    if(bytes.size()<33||r.be32(8)!=13||r.be32(12)!=0x49484452)fail(481,"Invalid PNG header");result.width=r.be32(16);result.height=r.be32(20);
  }else if(bytes.size()>=10&&!std::memcmp(bytes.data(),"GIF8",4)&&(bytes[4]=='7'||bytes[4]=='9')&&bytes[5]=='a'){
    result.width=r.u16(6);result.height=r.u16(8);
  }else if(bytes[0]=='B'&&bytes[1]=='M'){
    r.range(0,54);const uint32_t header=r.u32(14),offset=r.u32(10),bits=r.u16(28);
    if(header<40||uint64_t(header)+14>bytes.size()||offset<14+header||offset>bytes.size()||r.u16(26)!=1||!bits||bits>32)fail(481,"Invalid BMP header");
    result.width=r.u32(18);result.height=positiveHeight(r.u32(22));dimensions(result.width,result.height);
    const auto compression=r.u32(30);
    if((compression==0||compression==3||compression==6)&&uint64_t(offset)+((uint64_t(result.width)*bits+31)/32*4)*result.height>bytes.size())fail(481,"Truncated BMP pixels");
  }else if(bytes[0]==255&&bytes[1]==216){
    size_t at=2;while(at+4<=bytes.size()){
      if(bytes[at++]!=255)fail(481,"Invalid JPEG marker");while(at<bytes.size()&&bytes[at]==255)++at;r.range(at,1);auto marker=bytes[at++];
      if(marker==0xd9||marker==0xda)break;if(marker==1||(marker>=0xd0&&marker<=0xd7))continue;
      r.range(at,2);auto size=uint32_t(bytes[at])*256+bytes[at+1];if(size<2)fail(481,"Invalid JPEG segment");r.range(at,size);
      if(marker>=0xc0&&marker<=0xcf&&marker!=0xc4&&marker!=0xc8&&marker!=0xcc){if(size<8)fail(481);result.height=uint32_t(bytes[at+3])*256+bytes[at+4];result.width=uint32_t(bytes[at+5])*256+bytes[at+6];break;}at+=size;
    }
  }else if(!r.u16(0)&&(r.u16(2)==1||r.u16(2)==2)){
    result.type=3;result.cursor=r.u16(2)==2;auto count=r.u16(4);if(!count||count>256)fail(481,"Invalid icon/cursor count");r.range(6,size_t(count)*16);
    size_t chosen=0;int best=INT32_MAX,bestBits=-1;
    for(size_t i=0;i<count;++i){
      const size_t at=6+i*16;const uint32_t width=bytes[at]?bytes[at]:256,height=bytes[at+1]?bytes[at+1]:256,offset=r.u32(at+12),size=r.u32(at+8);
      if(bytes[at+3]||!size||offset<6+size_t(count)*16)fail(481,"Invalid icon/cursor entry");r.range(offset,size);
      if(result.cursor&&(r.u16(at+4)>=width||r.u16(at+6)>=height))fail(481,"Invalid cursor hotspot");
      int bits=32;
      if(bytes[offset]==137){
        if(size<33||std::memcmp(bytes.data()+offset,"\x89PNG\r\n\x1a\n",8)||r.be32(offset+8)!=13||r.be32(offset+12)!=0x49484452||r.be32(offset+16)!=width||r.be32(offset+20)!=height)fail(481,"Icon PNG dimensions disagree");
      }else{
        const auto header=r.u32(offset);if(size<40||!(header==40||header==108||header==124)||header>size||r.u32(offset+4)!=width||r.u32(offset+8)!=height*2||r.u16(offset+12)!=1)fail(481,"Icon bitmap dimensions disagree");
        bits=r.u16(offset+14);if(bits!=1&&bits!=4&&bits!=8&&bits!=16&&bits!=24&&bits!=32)fail(481,"Invalid icon depth");
        const auto compression=r.u32(offset+16),used=r.u32(offset+32);if(compression!=0&&compression!=3&&compression!=6)fail(481,"Unsupported icon compression");
        const uint64_t colors=used?used:(bits<=8?uint64_t(1)<<bits:0),masks=header==40?(compression==3?12:compression==6?16:0):0;
        const uint64_t required=header+colors*4+masks+((uint64_t(width)*bits+31)/32*4)*height+(bits==32?0:((width+31)/32*4)*height);
        if(colors>256||required>size)fail(481,"Truncated icon pixels");
      }
      result.frames.push_back({width,height,offset,size,result.cursor?uint32_t(r.u16(at+4)):0,
        result.cursor?uint32_t(r.u16(at+6)):0,uint16_t(bits)});
      const int score=std::abs(int(width)-32)+std::abs(int(height)-32);
      if(score<best||(score==best&&bits>bestBits)){best=score;bestBits=bits;chosen=i;result.width=width;result.height=height;}
    }
    const size_t at=6+chosen*16;
    if(result.cursor){result.hotspotX=r.u16(at+4);result.hotspotY=r.u16(at+6);}
    result.selected=chosen; // Decoding a frame must never discard other owned images.
  }else fail(481,"Unsupported native picture format");
  dimensions(result.width,result.height);result.bytes=std::move(bytes);return result;
}
} // namespace vb6
