// Stable-identity, versioned native Recordset view for UI adapters. MIT.
#pragma once
#include "recordset.hpp"
namespace vb6 {
struct NativeRecordsetGrid;
struct RecordsetGridEdit {
  std::weak_ptr<NativeRecordsetGrid> binding;
  std::weak_ptr<RecordsetStore> store;
  uint64_t epoch=0,viewRevision=0,row=0,version=0,columnId=0;
  size_t column=0;
};
struct NativeRecordsetGrid : std::enable_shared_from_this<NativeRecordsetGrid> {
  std::shared_ptr<NativeRecordset> source;
  std::shared_ptr<RecordsetWatch> watch;
  std::vector<uint64_t> rowIds,rowVersions;
  std::vector<std::vector<Text>> cells;
  std::function<void()> changed;
  uint64_t epoch=0,viewRevision=0;
  bool active=true;
  static std::shared_ptr<NativeRecordsetGrid> create(std::shared_ptr<NativeRecordset>,std::function<void()>);
  void refresh();void detach();
  RecordsetGridEdit begin(size_t row,size_t column);
  void commit(const RecordsetGridEdit&,Value);
};
} // namespace vb6
