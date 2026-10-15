// Native Recordset cursors, edit buffers, clone sharing and optimistic writes. MIT.
#include "recordset.hpp"
#include <charconv>
namespace vb6 {
NativeRecordset::NativeRecordset(size_t limit):store(std::make_shared<RecordsetStore>()){store->cellLimit=std::min(limit,size_t(1000000));}
std::shared_ptr<NativeRecordset> NativeRecordset::create(size_t limit){auto result=std::make_shared<NativeRecordset>(limit);result->attachStore();return result;}
Value createNativeRecordset(Runtime& rt){return Value::object(NativeRecordset::create(rt.maxArrayElements));}
bool NativeRecordset::supports(const std::string& name)const {return Object::supports(name)||lower(name)=="adodb.recordset"||lower(name)=="_recordset";}
void NativeRecordset::attachStore(){
  std::weak_ptr<NativeRecordset> weak=std::static_pointer_cast<NativeRecordset>(shared_from_this());
  storeWatch=std::make_shared<RecordsetWatch>();storeWatch->changed=[weak]{if(auto self=weak.lock()){self->sync();self->notify();}};
  store->watches.erase(std::remove_if(store->watches.begin(),store->watches.end(),[](auto& item){return item.expired();}),store->watches.end());
  if(store->watches.size()>=4096)fail(7,"Recordset clone limit");
  store->watches.push_back(storeWatch);
}
std::shared_ptr<RecordsetWatch> NativeRecordset::observe(std::function<void()> callback){
  watches.erase(std::remove_if(watches.begin(),watches.end(),[](auto& item){return item.expired();}),watches.end());
  if(watches.size()>=4096)fail(7,"Recordset observer limit");auto watch=std::make_shared<RecordsetWatch>();watch->changed=std::move(callback);watches.push_back(watch);return watch;
}
void NativeRecordset::notify(){
  // Keep an explicitly notified view alive even if its observer drops the
  // last external owner; the guard still writes to this view during cleanup.
  const auto keepAlive=weak_from_this().lock();
  if(notifying){notifyAgain=true;return;}
  struct Guard{bool& flag;~Guard(){flag=false;}} guard{notifying};notifying=true;
  for(size_t pass=0;pass<128;++pass){
    notifyAgain=false;std::vector<std::shared_ptr<RecordsetWatch>> live;
    watches.erase(std::remove_if(watches.begin(),watches.end(),[&](auto& weak){auto item=weak.lock();if(item)live.push_back(std::move(item));return weak.expired();}),watches.end());
    std::exception_ptr failure;
    for(const auto& watch:live){
      try{auto callback=watch->changed;if(callback)callback();}
      catch(...){if(!failure)failure=std::current_exception();}
    }
    if(failure)std::rethrow_exception(failure);
    if(!notifyAgain)return;
  }
  fail(28,"Recordset view notification recursion limit");
}
void NativeRecordset::requireOpen()const{if(!opened)fail(3704,"Recordset is closed");}
void NativeRecordset::requireWritable()const{requireOpen();if(lockType==1)fail(3251,"Recordset is read-only");}
void NativeRecordset::sync(){
  if(!opened||seen==store->revision)return;
  if(seen+1==store->revision&&store->lastInserted&&!predicate&&sorting.empty()){
    auto id=store->lastInserted;if(!positions.count(id)){positions.emplace(id,order.size());order.push_back(id);}
    if(!current&&order.size()==1&&edge!=-1){current=id;edge=0;}
    seen=store->revision;++viewRevision;return;
  }
  rebuild();
}
void NativeRecordset::rebuild(bool first){
  const auto oldPosition=positions.find(current);const size_t previous=oldPosition==positions.end()?0:oldPosition->second;
  std::vector<uint64_t> ids;ids.reserve(store->rows.size());
  if(opened)for(auto& entry:store->rows)if(!predicate||predicate(entry.second))ids.push_back(entry.first);
  if(!sorting.empty())std::stable_sort(ids.begin(),ids.end(),[&](uint64_t a,uint64_t b){
    for(auto key:sorting){const int c=recordsetCompare(row(a).values.at(key.column),row(b).values.at(key.column));if(c)return key.descending?c>0:c<0;}return a<b;
  });
  std::unordered_map<uint64_t,size_t> next;next.reserve(ids.size());for(size_t i=0;i<ids.size();++i)next.emplace(ids[i],i);
  order.swap(ids);positions.swap(next);seen=store->revision;++viewRevision;
  if(order.empty()){current=0;edge=1;}
  else if(first){current=order.front();edge=0;}
  else if(current&&!positions.count(current)){current=order[std::min(previous,order.size()-1)];edge=0;}
}
size_t NativeRecordset::fieldIndex(Value value)const{return recordsetColumn(store->columns,std::move(value));}
const RecordsetRow& NativeRecordset::row(uint64_t id)const{auto it=store->rows.find(id);if(it==store->rows.end())fail(3021,"No current record");return it->second;}
Value NativeRecordset::field(size_t column,int flavor){
  requireOpen();sync();if(column>=store->columns.size())fail(3265);
  if(edit.mode&&flavor!=2)return (flavor==1?edit.original:edit.values).at(column).copy();
  if(!current||edge)fail(3021,"No current record");return row(current).values.at(column).copy();
}
void NativeRecordset::field(size_t column,Value value){
  requireWritable();sync();if(column>=store->columns.size())fail(3265);
  auto next=recordsetCoerce(store->columns[column],std::move(value));
  if(!edit.mode){const auto& old=row(current);if(edge)fail(3021);Edit pending;pending.mode=1;pending.id=current;pending.version=old.version;pending.values=old.values;pending.original=old.values;edit=std::move(pending);}
  edit.values.at(column)=std::move(next);
}
void NativeRecordset::appendColumn(Text name,int type,size_t size,int attributes){
  if(opened)fail(3705,"Cannot change schema of an open Recordset");
  if(name.empty()||name.size()>255||name.find(u'\0')!=Text::npos||size>1048576||store->columns.size()>=256)fail(3001,"Invalid field definition");
  for(auto& column:store->columns)if(compareText(column.name,name,true)==0)fail(3265,"Duplicate field name");
  if(attributes&~(32|64|128))fail(3251,"Unsupported native field attributes");
  RecordsetColumn column{store->nextColumn,std::move(name),type,size,attributes};
  const std::map<int,int> precisions={{2,5},{3,10},{4,7},{5,15},{6,19},{14,28},{16,3},{17,3},{18,5},{19,10},{131,28}};
  auto numeric=precisions.find(type);column.precision=numeric==precisions.end()?0:numeric->second;
  if(type==6)column.scale=4;
  // Validate supported type without pretending a provider exists.
  Value initial=Value::integer(0);if(type==128||type==204||type==205)initial=arrayValue({},0,"byte");
  (void)recordsetCoerce(column,initial);
  store->columns.push_back(std::move(column));++store->nextColumn;++epoch;
}
void NativeRecordset::deleteColumn(Value key){if(opened)fail(3705);auto index=fieldIndex(key);store->columns.erase(store->columns.begin()+ptrdiff_t(index));++epoch;}
void NativeRecordset::open(){
  if(opened)fail(3705,"Recordset already open");if(store->columns.empty())fail(3708,"No fields defined");
  if(everOpened){auto replacement=std::make_shared<RecordsetStore>();replacement->columns=store->columns;replacement->nextColumn=store->nextColumn;replacement->cellLimit=store->cellLimit;replacement->byteLimit=store->byteLimit;store=std::move(replacement);attachStore();}
  opened=everOpened=true;edit={};current=0;edge=0;++epoch;seen=0;rebuild(true);notify();
}
void NativeRecordset::close(){
  requireOpen();update();
  // A closed original must not mutate the schema still used by an open clone.
  auto replacement=std::make_shared<RecordsetStore>();replacement->columns=store->columns;
  replacement->nextColumn=store->nextColumn;replacement->cellLimit=store->cellLimit;replacement->byteLimit=store->byteLimit;
  storeWatch.reset();store=std::move(replacement);attachStore();
  opened=false;edit={};current=0;edge=1;order.clear();positions.clear();
  predicate={};sorting.clear();filterText.clear();sortText.clear();filterValue=Value::integer(0);
  ++epoch;++viewRevision;notify();
}
void NativeRecordset::moveTo(int64_t position){
  requireOpen();update();sync();
  if(position<0){current=0;edge=-1;}else if(uint64_t(position)>=order.size()){current=0;edge=1;}else{current=order[size_t(position)];edge=0;}
}
void NativeRecordset::cancel(){
  requireOpen();if(edit.mode==2){current=edit.previous;edge=edit.previousEdge;}edit={};sync();
  if(current&&!positions.count(current)){current=order.empty()?0:order.front();edge=current?0:1;}
}
void NativeRecordset::editFields(std::vector<Value>& values,Value fields,Value data)const{
  if(fields.type==Type::Missing&&data.type==Type::Missing)return;
  if(fields.type==Type::Missing||data.type==Type::Missing)fail(3001,"Fields and Values must both be supplied");
  std::vector<Value> keys,items;
  if(fields.type==Type::Array){auto a=fields.asArray();if(a->bounds.size()!=1)fail(3001);keys=a->values;}
  else keys.push_back(fields);
  if(data.type==Type::Array&&fields.type==Type::Array){auto a=data.asArray();if(a->bounds.size()!=1)fail(3001);items=a->values;}
  else items.push_back(data);
  if(keys.size()!=items.size()||keys.size()>store->columns.size())fail(3001,"Fields and Values length mismatch");
  std::set<size_t> assigned;
  for(size_t i=0;i<keys.size();++i){auto index=fieldIndex(keys[i]);if(!assigned.insert(index).second)fail(3001,"Duplicate updated field");values[index]=recordsetCoerce(store->columns[index],items[i]);}
}
void NativeRecordset::add(Args args){
  requireWritable();args=bindNamed(std::move(args),"fieldlist?,values?");
  std::vector<Value> values(store->columns.size(),Value::null());
  editFields(values,argument(args,0),argument(args,1));update();sync();
  Edit pending;pending.mode=2;pending.previous=current;pending.previousEdge=edge;pending.values=values;pending.original=std::move(values);edit=std::move(pending);
  if(argument(args,0).type!=Type::Missing)update();
}
void NativeRecordset::update(Args args){
  requireOpen();args=bindNamed(std::move(args),"fields?,values?");
  if(!edit.mode&&argument(args,0).type==Type::Missing&&argument(args,1).type==Type::Missing)return;
  requireWritable();sync();auto pending=edit;
  if(!pending.mode){const auto& old=row(current);if(edge)fail(3021);pending.mode=1;pending.id=current;pending.version=old.version;pending.values=old.values;pending.original=old.values;}
  editFields(pending.values,argument(args,0),argument(args,1));
  for(size_t i=0;i<store->columns.size();++i)pending.values[i]=recordsetCoerce(store->columns[i],pending.values[i]);
  const size_t bytes=recordsetBytes(pending.values);size_t previousBytes=0;
  if(pending.mode==1){const auto& old=row(pending.id);if(old.version!=pending.version)fail(3218,"Record changed in another cursor");previousBytes=recordsetBytes(old.values);}
  else if(store->rows.size()>=store->cellLimit/store->columns.size()||store->nextId>INT32_MAX)fail(7,"Native Recordset row budget exceeded");
  if(bytes>store->byteLimit||store->bytes-previousBytes>store->byteLimit-bytes)fail(7,"Native Recordset byte budget exceeded");
  uint64_t id=pending.id;
  if(pending.mode==2){id=store->nextId;store->rows.emplace(id,RecordsetRow{id,1,std::move(pending.values)});++store->nextId;store->lastInserted=id;}
  else{auto& target=store->rows.at(id);target.values.swap(pending.values);++target.version;store->lastInserted=0;}
  store->bytes=store->bytes-previousBytes+bytes;++store->revision;edit={};current=id;edge=0;sync();store->notify();
}
void NativeRecordset::erase(){
  requireWritable();update();sync();if(!current||edge)fail(3021);auto found=store->rows.find(current);
  store->bytes-=recordsetBytes(found->second.values);store->rows.erase(found);store->lastInserted=0;++store->revision;sync();store->notify();
}
Value NativeRecordset::bookmark(uint64_t id)const{return Value::string(fromUTF8("VB6RS:"+std::to_string(store->identity)+":"+std::to_string(id)));}
uint64_t NativeRecordset::resolveBookmark(Value value)const{
  if(value.type!=Type::String)fail(3001,"Invalid Recordset bookmark");auto s=toUTF8(value.string());
  const auto prefix="VB6RS:"+std::to_string(store->identity)+":";if(s.rfind(prefix,0)!=0)fail(3001,"Bookmark belongs to another Recordset");
  uint64_t id=0;auto result=std::from_chars(s.data()+prefix.size(),s.data()+s.size(),id);
  if(result.ec!=std::errc{}||result.ptr!=s.data()+s.size()||!store->rows.count(id))fail(3001,"Invalid or deleted Recordset bookmark");return id;
}
void NativeRecordset::applyFilter(Value value){
  requireOpen();RecordsetFilter next;Text text;
  if(value.type==Type::String){text=value.string();next=recordsetFilter(store->columns,text);}
  else if(value.type==Type::Array){std::set<uint64_t> ids;auto a=value.asArray();if(a->bounds.size()!=1)fail(3001);for(auto& v:a->values)ids.insert(resolveBookmark(v));next=[ids=std::move(ids)](const RecordsetRow& row){return ids.count(row.id)!=0;};}
  else if(value.integral()!=0)fail(3251,"Native Recordset does not support batch filter groups");
  update();auto previous=predicate;predicate=std::move(next);
  try{rebuild(true);}catch(...){predicate=std::move(previous);throw;}
  filterText=std::move(text);filterValue=value.copy();notify();
}
void NativeRecordset::applySort(Text text){
  requireOpen();auto next=recordsetSort(store->columns,text);
  for(auto key:next){auto type=store->columns[key.column].type;if(type==128||type==204||type==205)fail(3251,"Binary field cannot be sorted");}
  update();auto previous=sorting;sorting=std::move(next);try{rebuild();}catch(...){sorting=std::move(previous);throw;}sortText=std::move(text);notify();
}
std::shared_ptr<NativeRecordset> NativeRecordset::clone(int locking){
  requireOpen();if(locking!=-1&&locking!=1)fail(3001,"Clone supports inherited or read-only locks");
  auto result=create(store->cellLimit);result->storeWatch.reset();result->store=store;result->attachStore();result->opened=result->everOpened=true;
  result->lockType=locking==-1?lockType:1;result->cursorLocation=cursorLocation;result->cursorType=cursorType;result->sortText=sortText;result->sorting=sorting;result->rebuild(true);return result;
}
void NativeRecordset::writeRow(uint64_t id,uint64_t version,size_t column,Value value){
  requireWritable();sync();if(edit.mode)fail(3218,"Finish or cancel pending Recordset edits before a bound write");
  if(!positions.count(id)||column>=store->columns.size())fail(3218,"Bound record is no longer visible");
  const auto& old=row(id);if(old.version!=version)fail(3218,"Bound record changed during editing");
  auto values=old.values;values[column]=recordsetCoerce(store->columns[column],std::move(value));
  const size_t before=recordsetBytes(old.values),after=recordsetBytes(values);
  if(after>store->byteLimit||store->bytes-before>store->byteLimit-after)fail(7,"Native Recordset byte budget exceeded");
  auto& target=store->rows.at(id);target.values.swap(values);++target.version;store->bytes=store->bytes-before+after;
  store->lastInserted=0;++store->revision;sync();store->notify();
}
} // namespace vb6
