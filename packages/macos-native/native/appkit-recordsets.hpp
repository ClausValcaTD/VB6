#pragma once
#include "appkit.hpp"
namespace vb6 {
bool nativeRecordsetGridControl(const MacControl&);
void bindNativeRecordset(MacControl&,Value);
void refreshNativeRecordset(MacControl&);
void writeNativeRecordsetCell(MacControl&,size_t row,size_t column,Value);
Ref nativeRecordsetCellReference(MacControl&,size_t row,size_t column);
}
