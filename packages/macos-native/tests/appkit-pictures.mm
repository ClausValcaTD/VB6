// Genuine native image decoding, pixels, control ownership and cursor hotspots.
#include "appkit-pictures.hpp"
#include "appkit-pixels.hpp"
#include <cassert>
#include <iostream>
using namespace vb6;
void checkNativePictureFramesAppKit(Runtime&,MacHost&,const std::shared_ptr<Instance>&);
namespace {
void put(std::vector<uint8_t>& b,size_t at,uint32_t v,size_t count){for(size_t i=0;i<count;i++)b.at(at+i)=uint8_t(v>>(i*8));}
std::vector<uint8_t> bitmap(){
  std::vector<uint8_t> b(70);b[0]='B';b[1]='M';put(b,2,70,4);put(b,10,54,4);put(b,14,40,4);put(b,18,2,4);put(b,22,2,4);put(b,26,1,2);put(b,28,24,2);
  const uint8_t pixels[]={255,0,0,255,255,255,0,0,0,0,255,0,255,0,0,0};std::copy(std::begin(pixels),std::end(pixels),b.begin()+54);return b;
}
std::vector<uint8_t> icon(bool cursor){
  std::vector<uint8_t> b(22+40+16*16*4+16*4);put(b,2,cursor?2:1,2);put(b,4,1,2);b[6]=b[7]=16;put(b,10,cursor?3:1,2);put(b,12,cursor?5:32,2);put(b,14,uint32_t(b.size()-22),4);put(b,18,22,4);
  put(b,22,40,4);put(b,26,16,4);put(b,30,32,4);put(b,34,1,2);put(b,36,32,2);
  for(size_t i=0;i<256;i++){b[62+i*4+2]=255;b[62+i*4+3]=255;}return b;
}
void expectError(int number,const std::function<void()>& f){bool caught=false;try{f();}catch(const Error&e){caught=true;assert(e.number==number);}assert(caught);}
std::shared_ptr<MacControl> ctl(const std::shared_ptr<Instance>& f,const std::string& name){return std::dynamic_pointer_cast<MacControl>(f->controls.at(name));}
}
void checkNativePictures(Runtime& rt,MacHost& host,const std::shared_ptr<Instance>& form){
  auto picture=loadNativeImage(host,bitmap());auto image=std::dynamic_pointer_cast<MacImage>(picture.asObject());
  assert(image&&image->get(rt,"Type").integral()==1&&image->get(rt,"Width").integral()==53&&image->get(rt,"Height").integral()==53);
  auto cg=[image->image CGImageForProposedRect:nullptr context:nil hints:nil];
  auto pixels=[[NSBitmapImageRep alloc]initWithCGImage:cg];assert(pixels.pixelsWide==2&&pixels.pixelsHigh==2);
  // Raw decoded RGB samples and profile-aware readback are separate oracles.
  // colorAtX:y: produced a calibrated NSColor on the macOS 14 runner despite
  // the bitmap's sRGB profile, so converting that object again changed colors.
  assert(pixels.bitsPerSample==8&&pixels.samplesPerPixel>=3);
  const uint32_t expected[]={0x0000ff,0x00ff00,0xff0000,0xffffff};
  std::set<int32_t> colors;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    NSUInteger components[5]={};[pixels getPixel:components atX:x y:y];
    const uint32_t raw=uint32_t(components[0])|(uint32_t(components[1])<<8)|(uint32_t(components[2])<<16);
    assert(raw==expected[y*2+x]);
    const auto sampled=nativeBitmapColor(pixels,x,y);
    assert(uint32_t(sampled)==expected[y*2+x]);colors.insert(sampled);
  }
  assert(colors==std::set<int32_t>({0xff0000,0x00ff00,0x0000ff,0xffffff}));
  expectError(5,[&]{(void)nativeBitmapColor(pixels,-1,0);});
  expectError(5,[&]{(void)nativeBitmapColor(pixels,2,0);});
  auto control=ctl(form,"c7"),box=ctl(form,"c6"),button=ctl(form,"c0");
  control->set(rt,"stretch",Value::boolean(false));control->set(rt,"picture",picture,true);
  assert(control->view.frame.size.width==2&&control->view.frame.size.height==2);
  auto native=(NSImageView*)control->widget;assert(native.image==image->image&&native.imageScaling==NSImageScaleNone);
  control->set(rt,"stretch",Value::boolean(true));control->set(rt,"width",Value::integer(900));control->set(rt,"height",Value::integer(600));
  assert(native.imageScaling==NSImageScaleAxesIndependently&&control->view.frame.size.width==60);
  box->set(rt,"autosize",Value::boolean(true));box->set(rt,"picture",picture,true);
  assert(box->view.frame.size.width==2&&box->view.frame.size.height==2);
  box->set(rt,"autosize",Value::boolean(false));box->set(rt,"width",Value::integer(600));box->set(rt,"height",Value::integer(450));
  NSBitmapImageRep* surface=[[NSBitmapImageRep alloc]initWithBitmapDataPlanes:nullptr pixelsWide:40 pixelsHigh:30 bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSCalibratedRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
  [NSGraphicsContext saveGraphicsState];NSGraphicsContext.currentContext=[NSGraphicsContext graphicsContextWithBitmapImageRep:surface];drawControl(*box,box->view.bounds);[NSGraphicsContext restoreGraphicsState];
  assert(nativeBitmapColor(surface,20,15)==0xffffff); // canvas picture is not stretched to fill
  bool hasImage=false;for(int y=0;y<30;y++)for(int x=0;x<40;x++)if(nativeBitmapColor(surface,x,y)!=0xffffff)hasImage=true;assert(hasImage);
  button->set(rt,"picture",picture,true);button->set(rt,"downpicture",picture,true);button->set(rt,"disabledpicture",picture,true);
  assert(((NSButton*)button->widget).image==image->image&&((NSButton*)button->widget).alternateImage==image->image);
  auto saved=control->get(rt,"picture");control->set(rt,"picture",Value::object(nullptr),true);assert(!native.image);
  assert(sameObject(saved.asObject(),picture.asObject()));
  auto ic=loadNativeImage(host,icon(false)),cursor=loadNativeImage(host,icon(true));auto cursorObject=std::dynamic_pointer_cast<MacImage>(cursor.asObject());
  assert(cursorObject->isCursor&&cursorObject->pictureType==3&&NSEqualPoints(cursorObject->hotspot,NSMakePoint(3,5)));
  form->set(rt,"icon",ic,true);assert(host.form(form)->window.miniwindowImage==std::dynamic_pointer_cast<MacImage>(ic.asObject())->image);
  expectError(485,[&]{form->set(rt,"icon",picture,true);});assert(sameObject(form->get(rt,"icon").asObject(),ic.asObject()));
  expectError(485,[&]{control->set(rt,"picture",cursor,true);});assert(!native.image);
  control->set(rt,"mouseicon",cursor,true);control->set(rt,"mousepointer",Value::integer(99));updateNativeCursor(*control);
  assert(NSEqualPoints(NSCursor.currentCursor.hotSpot,NSMakePoint(3,5))&&control->cursorTracking);
  expectError(380,[&]{control->set(rt,"mousepointer",Value::integer(100));});
  // No pixel allocation is required to exercise layout rejection: an image
  // object can be valid storage while its natural size exceeds control limits.
  auto oversized=Value::object(std::make_shared<MacImage>([[NSImage alloc]initWithSize:NSMakeSize(24000,2)]));
  control->set(rt,"picture",picture,true);control->set(rt,"stretch",Value::boolean(false));
  auto priorFrame=control->view.frame;
  expectError(380,[&]{control->set(rt,"picture",oversized,true);});
  assert(sameObject(control->get(rt,"picture").asObject(),picture.asObject())&&NSEqualRects(control->view.frame,priorFrame));
  control->set(rt,"stretch",Value::boolean(true));control->set(rt,"picture",oversized,true);
  expectError(380,[&]{control->set(rt,"stretch",Value::boolean(false));});
  assert(control->flag("stretch")&&NSEqualRects(control->view.frame,priorFrame));
  box->set(rt,"autosize",Value::boolean(false));box->set(rt,"picture",oversized,true);
  priorFrame=box->view.frame;expectError(380,[&]{box->set(rt,"autosize",Value::boolean(true));});
  assert(!box->flag("autosize")&&NSEqualRects(box->view.frame,priorFrame));
  box->set(rt,"picture",picture,true);control->set(rt,"picture",picture,true);
  int32_t oldHandle;{auto temporary=loadNativeImage(host,bitmap());oldHandle=temporary.asObject()->get(rt,"handle").integral();assert(host.handles.find(oldHandle));}
  assert(!host.handles.find(oldHandle)); // dead picture cannot be resolved through a stale handle
  auto malformed=bitmap();malformed.resize(60);expectError(481,[&]{(void)loadNativeImage(host,malformed);});
  checkNativePictureFramesAppKit(rt,host,form);
  std::cout<<"APPKIT_PICTURES_OK\n";
}
