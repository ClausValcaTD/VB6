// Real AppKit decoding, resolution-aware drawing, cursor hotspots and file I/O.
#include "appkit-pictures.hpp"
#include "appkit-pixels.hpp"
#include "picture-frames.hpp"
#include <cassert>
using namespace vb6;
namespace {
int32_t renderedCenter(NSImage* image,unsigned scale) {
  const size_t width=32*scale;std::vector<uint8_t> pixels(width*width*4);
  auto space=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);assert(space);
  auto cg=CGBitmapContextCreate(pixels.data(),width,width,8,width*4,space,kCGBitmapByteOrder32Big|kCGImageAlphaPremultipliedLast);assert(cg);
  CGColorSpaceRelease(space);
  [NSGraphicsContext saveGraphicsState];NSGraphicsContext.currentContext=[NSGraphicsContext graphicsContextWithCGContext:cg flipped:NO];
  CGContextScaleCTM(cg,scale,scale);
  [image drawInRect:NSMakeRect(0,0,32,32) fromRect:NSZeroRect operation:NSCompositingOperationCopy fraction:1 respectFlipped:NO hints:nil];
  [NSGraphicsContext restoreGraphicsState];
  auto output=CGBitmapContextCreateImage(cg);assert(output);
  NSBitmapImageRep* result=[[NSBitmapImageRep alloc]initWithCGImage:output];CGImageRelease(output);CGContextRelease(cg);
  return nativeBitmapColor(result,NSInteger(width/2),NSInteger(width/2));
}
}
void checkNativePictureFramesAppKit(Runtime& rt,MacHost& host,const std::shared_ptr<Instance>& form) {
  Frame frame(rt,form);
  for(const bool cursor:{false,true}){
    const auto bytes=pictureTests::multiPicture(cursor);auto value=loadNativeImage(host,bytes);
    auto picture=std::dynamic_pointer_cast<MacImage>(value.asObject());assert(picture&&picture->encoded==bytes);
    assert(picture->image.representations.count==4&&NSEqualSizes(picture->image.size,NSMakeSize(32,32)));
    const uint32_t sizes[]={16,32,64,256};const int32_t colors[]={0x0000ff,0x00ff00,0xff0000,0xffffff};
    size_t index=0;
    for(NSBitmapImageRep* rep in picture->image.representations){
      assert(rep.pixelsWide==sizes[index]&&rep.pixelsHigh==sizes[index]);
      assert(NSEqualSizes(rep.size,NSMakeSize(32,32)));
      assert(nativeBitmapColor(rep,0,0)==colors[index]);++index;
    }
    // Different source colors make choosing/upscaling the wrong image observable.
    assert(renderedCenter(picture->image,1)==0x00ff00);
    assert(renderedCenter(picture->image,2)==0xff0000);
    assert(renderedCenter(picture->image,4)==0xffffff);
    auto one=nativePictureCursor(*picture,1),two=nativePictureCursor(*picture,2);
    assert(one!=two&&nativePictureCursor(*picture,1)==one&&nativePictureCursor(*picture,1.5)==two);
    assert(one.image.representations.firstObject.pixelsWide==32&&two.image.representations.firstObject.pixelsWide==64);
    assert(NSEqualPoints(one.hotSpot,cursor?NSMakePoint(2,4):NSZeroPoint));
    assert(NSEqualPoints(two.hotSpot,cursor?NSMakePoint(1.5,2.5):NSZeroPoint));
    pictureTests::error(5,[&]{(void)nativePictureCursor(*picture,0);});
    pictureTests::error(5,[&]{(void)nativePictureCursor(*picture,INFINITY);});
    const std::string filename=cursor?"native-multires-picture.cur":"native-multires-picture.ico";
    host.builtin(frame,"savepicture",{Arg(value),Arg(Value::string(fromUTF8(filename)))});
    assert(readNativeResourceFile(filename)==bytes);
    auto copy=host.builtin(frame,"loadpicture",{Arg(Value::string(fromUTF8(filename)))});
    auto loaded=std::dynamic_pointer_cast<MacImage>(copy.asObject());
    assert(loaded->encoded==bytes&&loaded->image.representations.count==4&&loaded->isCursor==cursor);
    assert(!sameObject(value.asObject(),copy.asObject()));std::filesystem::remove(filename);
  }
  std::cout<<"APPKIT_PICTURE_FRAMES_OK\n";
}
