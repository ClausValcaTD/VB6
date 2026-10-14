// Color-managed bounded bitmap sampling for native GetPixel and image tests.
#include "appkit-pixels.hpp"
#include "vb6.hpp"
namespace vb6 {
int32_t nativeBitmapColor(NSBitmapImageRep* bitmap,NSInteger x,NSInteger y) {
  if(!bitmap||x<0||y<0||x>=bitmap.pixelsWide||y>=bitmap.pixelsHigh)fail(5,"Pixel is outside native bitmap");
  CGImageRef image=bitmap.CGImage;
  if(!image)fail(481,"Native bitmap has no readable image");
  CGImageRef sample=CGImageCreateWithImageInRect(image,CGRectMake(x,y,1,1));
  if(!sample)fail(7,"Cannot allocate native pixel sample");
  uint8_t pixel[4]={};
  CGColorSpaceRef space=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  if(!space){CGImageRelease(sample);fail(7);}
  CGContextRef context=CGBitmapContextCreate(pixel,1,1,8,4,space,
    kCGBitmapByteOrder32Big|kCGImageAlphaPremultipliedLast);
  CGColorSpaceRelease(space);
  if(!context){CGImageRelease(sample);fail(7);}
  // Preserve the source ICC profile and channel layout; a one-pixel destination
  // bounds scratch allocation regardless of source dimensions or pixel format.
  // https://developer.apple.com/documentation/coregraphics/cgimage/cropping(to:)
  CGContextSetInterpolationQuality(context,kCGInterpolationNone);
  CGContextSetBlendMode(context,kCGBlendModeCopy);
  CGContextDrawImage(context,CGRectMake(0,0,1,1),sample);
  CGContextRelease(context);CGImageRelease(sample);
  auto channel=[&](uint8_t value)->uint32_t {
    return pixel[3]?std::min(255u,(uint32_t(value)*255+pixel[3]/2)/pixel[3]):0u;
  };
  return int32_t(channel(pixel[0])|(channel(pixel[1])<<8)|(channel(pixel[2])<<16));
}
} // namespace vb6
