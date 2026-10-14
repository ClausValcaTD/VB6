// Independent C++ ICO/CUR fixture and ownership/selection acceptance.
#pragma once
#include "resources.hpp"
#include <cassert>
#include <functional>
#include <iostream>
namespace vb6::pictureTests {
inline void put(std::vector<uint8_t>& bytes,size_t at,uint32_t value,size_t count) {
  for(size_t i=0;i<count;++i)bytes.at(at+i)=uint8_t(value>>(8*i));
}
inline std::vector<uint8_t> multiPicture(bool cursor) {
  const uint32_t sizes[]={16,32,64,256},colors[]={0x0000ff,0x00ff00,0xff0000,0xffffff};
  std::vector<uint8_t> bytes(6+16*4);put(bytes,2,cursor?2:1,2);put(bytes,4,4,2);
  for(size_t i=0;i<4;++i){
    const size_t at=6+i*16,offset=bytes.size();const uint32_t side=sizes[i];
    const uint32_t count=40+side*side*4+((side+31)/32*4)*side;
    bytes[at]=bytes[at+1]=uint8_t(side);put(bytes,at+4,cursor?uint32_t(i+1):1,2);
    put(bytes,at+6,cursor?uint32_t(i+3):32,2);put(bytes,at+8,count,4);put(bytes,at+12,uint32_t(offset),4);
    bytes.resize(offset+count);put(bytes,offset,40,4);put(bytes,offset+4,side,4);put(bytes,offset+8,side*2,4);
    put(bytes,offset+12,1,2);put(bytes,offset+14,32,2);
    for(size_t j=0;j<side*side;++j){const auto p=offset+40+j*4;bytes[p]=uint8_t(colors[i]>>16);bytes[p+1]=uint8_t(colors[i]>>8);bytes[p+2]=uint8_t(colors[i]);bytes[p+3]=255;}
  }
  return bytes;
}
inline void error(int number,const std::function<void()>& action) {
  bool caught=false;try{action();}catch(const Error& e){caught=true;assert(e.number==number);}assert(caught);
}
inline void checkFrames() {
  for(const bool cursor:{false,true}){
    auto original=multiPicture(cursor);auto picture=decodeNativePicture(original);
    assert(picture.bytes==original&&picture.frames.size()==4&&picture.selected==1);
    assert(picture.width==32&&picture.height==32&&picture.type==3&&picture.cursor==cursor);
    const uint32_t sizes[]={16,32,64,256};
    for(size_t i=0;i<4;++i){
      const auto& frame=picture.frames[i];assert(frame.width==sizes[i]&&frame.height==sizes[i]&&frame.bits==32);
      assert(frame.hotspotX==(cursor?i+1:0)&&frame.hotspotY==(cursor?i+3:0));
      auto isolated=decodeNativePicture(nativePictureFrameBytes(picture,i));
      assert(!isolated.cursor&&isolated.frames.size()==1&&isolated.width==sizes[i]);
      assert(std::equal(isolated.bytes.begin()+22,isolated.bytes.end(),original.begin()+frame.offset));
      assert(selectNativePictureFrame(picture.frames,sizes[i],sizes[i])==i);
    }
    assert(selectNativePictureFrame(picture.frames,48,48)==2);
    assert(selectNativePictureFrame(picture.frames,128,128)==3);
    assert(selectNativePictureFrame(picture.frames,512,512)==3);
    assert(picture.bytes==original);
    error(5,[&]{(void)nativePictureFrameBytes(picture,4);});
    error(5,[&]{(void)selectNativePictureFrame(picture.frames,0,32);});
    error(5,[&]{(void)selectNativePictureFrame(picture.frames,32769,32);});
    auto corrupt=original;put(corrupt,6+3*16+8,UINT32_MAX,4);
    error(481,[&]{(void)decodeNativePicture(corrupt);});
    corrupt=original;put(corrupt,picture.frames[0].offset+14,7,2);
    error(481,[&]{(void)decodeNativePicture(corrupt);});
    corrupt=original;corrupt.resize(corrupt.size()-10000);
    error(481,[&]{(void)decodeNativePicture(corrupt);});
    if(cursor){corrupt=original;put(corrupt,6+3*16+4,256,2);error(481,[&]{(void)decodeNativePicture(corrupt);});}
  }
  auto picture=decodeNativePicture(multiPicture(false));
  auto frames=std::vector<NativePictureFrame>{picture.frames[1],picture.frames[1]};frames[0].bits=8;
  assert(selectNativePictureFrame(frames,32,32)==1);frames[0].bits=32;
  assert(selectNativePictureFrame(frames,32,32)==0);
  error(5,[&]{(void)selectNativePictureFrame({},32,32);});
  picture.frames[0].offset=UINT32_MAX;error(481,[&]{(void)nativePictureFrameBytes(picture,0);});
  std::cout<<"NATIVE_PICTURE_FRAMES_OK\n";
}
} // namespace vb6::pictureTests
