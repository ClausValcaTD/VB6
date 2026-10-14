#pragma once
#include "appkit.hpp"
#include "resources.hpp"
namespace vb6 {
Value loadNativeImage(MacHost&,std::vector<uint8_t>);
NSCursor* nativePictureCursor(MacImage&,double scale);
bool nativePictureProperty(const std::string&);
void initializeNativePictures(MacControl&);
void refreshNativePictures(MacControl&);
void setNativePicture(MacControl&,const std::string&,Value);
void setNativePictureLayout(MacControl&,const std::string&,Value);
void updateNativeCursor(MacControl&);
}
