#include "recordset-grid.hpp"
namespace vb6 {
std::shared_ptr<NativeRecordsetGrid> NativeRecordsetGrid::create(std::shared_ptr<NativeRecordset> source,std::function<void()> changed){
  if(!source)fail(13,"Native grid requires a Recordset");
  auto result=std::make_shared<NativeRecordsetGrid>();result->source=std::move(source);result->changed=std::move(changed);result->refresh();
  std::weak_ptr<NativeRecordsetGrid> weak=result;
  result->watch=result->source->observe([weak]{if(auto grid=weak.lock()){if(!grid->active)return;grid->refresh();auto callback=grid->changed;if(callback)callback();}});
  return result;
}
void NativeRecordsetGrid::refresh(){
  if(!active)return;source->sync();const auto& columns=source->store->columns;
  const size_t count=source->opened?source->order.size():0;
  if(count>=100000||columns.size()>256||(!columns.empty()&&count+1>1000000/columns.size()))fail(7,"Bound native grid exceeds cell budget");
  std::vector<std::vector<Text>> data(count+1);std::vector<uint64_t> ids,versions;ids.reserve(count);versions.reserve(count);
  size_t bytes=0;for(auto& column:columns)data[0].push_back(column.name);
  for(size_t i=0;i<count;++i){
    const auto& row=source->row(source->order[i]);ids.push_back(row.id);versions.push_back(row.version);auto& output=data[i+1];output.reserve(columns.size());
    for(const auto& value:row.values){Text text=value.type==Type::Null?Text():value.type==Type::Array?u"(Binary)":value.string();bytes+=text.size()*2;if(bytes>64*1024*1024)fail(7,"Bound native grid exceeds text budget");output.push_back(std::move(text));}
  }
  rowIds.swap(ids);rowVersions.swap(versions);cells.swap(data);epoch=source->epoch;viewRevision=source->viewRevision;
}
void NativeRecordsetGrid::detach(){active=false;watch.reset();changed={};}
RecordsetGridEdit NativeRecordsetGrid::begin(size_t row,size_t column){
  if(!active)fail(3218,"Grid binding was replaced");source->requireWritable();source->sync();
  if(epoch!=source->epoch||viewRevision!=source->viewRevision)fail(3218,"Grid snapshot is stale");
  if(!row||row>rowIds.size()||column>=source->store->columns.size())fail(381,"Cannot edit a header or missing grid cell");
  return {shared_from_this(),source->store,epoch,viewRevision,rowIds[row-1],rowVersions[row-1],source->store->columns[column].id,column};
}
void NativeRecordsetGrid::commit(const RecordsetGridEdit& token,Value value){
  if(!active||token.binding.lock().get()!=this||token.store.lock()!=source->store)fail(3218,"Grid was rebound while editing");
  source->sync();if(token.epoch!=source->epoch||token.viewRevision!=source->viewRevision||token.column>=source->store->columns.size()||token.columnId!=source->store->columns[token.column].id)fail(3218,"Grid data or layout changed while editing");
  source->writeRow(token.row,token.version,token.column,std::move(value));
}
} // namespace vb6
