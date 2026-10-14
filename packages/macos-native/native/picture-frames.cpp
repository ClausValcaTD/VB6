// Non-destructive icon/cursor frame selection. Shared by AppKit and native tests.
#include "resources.hpp"
#include <tuple>
namespace vb6 {
std::vector<uint8_t> nativePictureFrameBytes(const NativePicture& picture,size_t index) {
  if(picture.type!=3||index>=picture.frames.size())fail(5,"Invalid native picture frame");
  const auto& frame=picture.frames[index];
  if(!frame.width||!frame.height||frame.width>256||frame.height>256||!frame.length||
      frame.offset>picture.bytes.size()||frame.length>picture.bytes.size()-frame.offset||
      frame.length>NativeResourceLimit-22)fail(481,"Invalid native picture frame bounds");
  // AppKit receives a one-image ICO; cursor hotspot words are not icon depth.
  // The complete original ICO/CUR remains untouched for SavePicture.
  std::vector<uint8_t> out(22+frame.length);
  auto put=[&](size_t at,uint32_t value,size_t count){for(size_t i=0;i<count;++i)out[at+i]=uint8_t(value>>(i*8));};
  put(2,1,2);put(4,1,2);out[6]=uint8_t(frame.width);out[7]=uint8_t(frame.height);
  put(10,1,2);put(12,frame.bits,2);put(14,frame.length,4);put(18,22,4);
  std::copy_n(picture.bytes.begin()+frame.offset,frame.length,out.begin()+22);
  return out;
}
size_t selectNativePictureFrame(const std::vector<NativePictureFrame>& frames,uint32_t width,uint32_t height) {
  if(frames.empty()||frames.size()>256||!width||!height||width>32768||height>32768)fail(5,"Invalid native picture target size");
  // Prefer a representation that does not require upsampling, then nearest
  // dimensions, highest color depth, and stable original directory order.
  size_t selected=0;auto best=std::make_tuple(true,UINT32_MAX,0);
  for(size_t i=0;i<frames.size();++i) {
    const auto& frame=frames[i];
    if(!frame.width||!frame.height||frame.width>256||frame.height>256)fail(481,"Invalid native frame dimensions");
    const auto delta=uint32_t(std::abs(int(frame.width)-int(width))+std::abs(int(frame.height)-int(height)));
    const auto rank=std::make_tuple(frame.width<width||frame.height<height,delta,-int(frame.bits));
    if(rank<best){best=rank;selected=i;}
  }
  return selected;
}
} // namespace vb6
