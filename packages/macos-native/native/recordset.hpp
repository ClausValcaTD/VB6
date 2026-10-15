// In-process disconnected ADO-style records; no COM or external provider. MIT.
#pragma once
#include "library.hpp"
#include <unordered_map>
#include <exception>

namespace vb6 {
struct RecordsetColumn {
  uint64_t id=0; Text name; int type=12; size_t size=0; int attributes=32;
  int precision=28,scale=0;
};
struct RecordsetRow { uint64_t id=0,version=1; std::vector<Value> values; };
struct RecordsetWatch { std::function<void()> changed; };
struct RecordsetStore : std::enable_shared_from_this<RecordsetStore> {
  uint64_t identity=0,nextId=1,nextColumn=1,revision=1,lastInserted=0;
  size_t cellLimit=1000000,byteLimit=64*1024*1024,bytes=0;
  std::vector<RecordsetColumn> columns;
  std::map<uint64_t,RecordsetRow> rows;
  std::vector<std::weak_ptr<RecordsetWatch>> watches;
  bool notifying=false,notifyAgain=false;
  RecordsetStore();
  void notify();
};
using RecordsetFilter=std::function<bool(const RecordsetRow&)>;
struct RecordsetSort { size_t column=0; bool descending=false; };
size_t recordsetColumn(const std::vector<RecordsetColumn>&,Value);
Value recordsetCoerce(const RecordsetColumn&,Value);
size_t recordsetBytes(const std::vector<Value>&);
int recordsetCompare(const Value&,const Value&);
RecordsetFilter recordsetFilter(const std::vector<RecordsetColumn>&,const Text&);
std::vector<RecordsetSort> recordsetSort(const std::vector<RecordsetColumn>&,const Text&);

struct NativeRecordset final : Object {
  struct Edit {
    int mode=0; uint64_t id=0,version=0,previous=0; int previousEdge=0;
    std::vector<Value> values,original;
  };
  std::shared_ptr<RecordsetStore> store;
  std::shared_ptr<RecordsetWatch> storeWatch;
  std::vector<std::weak_ptr<RecordsetWatch>> watches;
  std::vector<uint64_t> order;
  std::unordered_map<uint64_t,size_t> positions;
  uint64_t current=0,seen=0,epoch=1,viewRevision=1;
  int edge=1,cursorLocation=3,cursorType=3,lockType=3,pageSize=10;
  bool opened=false,everOpened=false,notifying=false,notifyAgain=false;
  Text sortText,filterText; Value filterValue=Value::integer(0);
  RecordsetFilter predicate; std::vector<RecordsetSort> sorting;
  Edit edit;
  explicit NativeRecordset(size_t maxCells=1000000);
  static std::shared_ptr<NativeRecordset> create(size_t maxCells=1000000);
  std::string className()const override { return "Recordset"; }
  bool supports(const std::string&)const override;
  Value get(Runtime&,const std::string&)override;
  void set(Runtime&,const std::string&,Value,bool=false)override;
  Value invoke(Runtime&,const std::string&,Args)override;
  std::vector<Value> enumerate(Runtime&)override;
  void attachStore();
  std::shared_ptr<RecordsetWatch> observe(std::function<void()>);
  void notify();
  void requireOpen()const;
  void requireWritable()const;
  void sync();
  void rebuild(bool first=false);
  size_t fieldIndex(Value)const;
  const RecordsetRow& row(uint64_t)const;
  Value field(size_t,int flavor=0);
  void field(size_t,Value);
  void appendColumn(Text,int,size_t,int=32);
  void deleteColumn(Value);
  void open(); void close();
  void moveTo(int64_t); void cancel();
  void add(Args); void update(Args={}); void erase();
  void editFields(std::vector<Value>&,Value,Value)const;
  Value bookmark(uint64_t)const;
  uint64_t resolveBookmark(Value)const;
  void applyFilter(Value); void applySort(Text);
  std::shared_ptr<NativeRecordset> clone(int);
  // Used by bindings: verify session/row versions, then commit without navigation.
  void writeRow(uint64_t rowId,uint64_t version,size_t column,Value);
};
Value createNativeRecordset(Runtime&);
} // namespace vb6
