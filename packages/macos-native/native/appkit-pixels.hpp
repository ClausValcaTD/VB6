#pragma once
#import <AppKit/AppKit.h>
#include <cstdint>
namespace vb6 {
// Sample in the image's actual profile, then return an unpremultiplied sRGB
// VB/OLE COLORREF (0x00BBGGRR), not a reinterpreted calibrated NSColor.
int32_t nativeBitmapColor(NSBitmapImageRep*,NSInteger x,NSInteger y);
}
