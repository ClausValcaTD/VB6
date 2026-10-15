// Weak-owner Recordset subscriptions and versioned AppKit table editing. MIT.
#include "appkit-recordsets.hpp"
namespace vb6 {
bool nativeRecordsetGridControl(const MacControl& c){return c.spec.type=="MSFlexGrid"||c.spec.type=="MSHFlexGrid"||c.spec.type=="DataGrid";}
void refreshNativeRecordset(MacControl& c){
  if(c.disposed||!c.dataBinding)return;auto binding=c.dataBinding;
  // Build copies before publication: failed allocation must retain the old view.
  auto cells=binding->cells;const auto oldColumns=c.grid.empty()?0:c.grid.front().size();
  const auto newColumns=cells.empty()?0:cells.front().size();c.grid.swap(cells);
  c.properties["fixedrows"]=Value::integer(1);c.properties["fixedcols"]=Value::integer(0);
  c.selected.clear();auto found=std::find(binding->rowIds.begin(),binding->rowIds.end(),c.boundSelection);
  if(found!=binding->rowIds.end())c.selected.insert(size_t(found-binding->rowIds.begin())+1);
  c.properties["row"]=Value::integer(c.selected.empty()?0:int64_t(*c.selected.begin()));
  c.properties["col"]=Value::integer(std::clamp<int64_t>(int64_t(c.number("col",0)),0,newColumns?int64_t(newColumns)-1:0));
  if(oldColumns!=newColumns||!c.boundColumnsReady){c.updateColumns();c.boundColumnsReady=true;}
  c.reloadList();
}
void bindNativeRecordset(MacControl& c,Value value){
  if(!nativeRecordsetGridControl(c))fail(438,"Control does not support native Recordset binding");
  if(value.type!=Type::Object)fail(13,"DataSource must be a native Recordset or Nothing");
  auto object=std::get<ObjectPtr>(value.payload);auto rs=std::dynamic_pointer_cast<NativeRecordset>(object);
  if(object&&!rs)fail(13,"DataSource is not a native Recordset");
  std::shared_ptr<NativeRecordsetGrid> next;
  if(rs){
    std::weak_ptr<MacControl> weak=c.self();
    next=NativeRecordsetGrid::create(rs,[weak]{if(auto control=weak.lock())control->host->event([control]{refreshNativeRecordset(*control);});});
  }
  if(c.dataBinding)c.dataBinding->detach();c.dataBinding=std::move(next);c.boundColumnsReady=false;
  // Preserve an outstanding edit token: a delayed native commit must reject its
  // previous binding, not reinterpret the row number in this new Recordset.
  if(c.dataBinding){c.boundSelection=rs->current;refreshNativeRecordset(c);}
  else {c.boundSelection=0;c.updateColumns();c.reloadList();}
}
void writeNativeRecordsetCell(MacControl& c,size_t row,size_t column,Value value){
  if(c.disposed)fail(91);
  if(!c.dataBinding){if(row>=c.grid.size()||column>=c.grid[row].size())fail(381);c.grid[row][column]=value.string();c.reloadList();return;}
  auto binding=c.dataBinding;const auto token=binding->begin(row,column);binding->commit(token,std::move(value));
}
Ref nativeRecordsetCellReference(MacControl& c,size_t row,size_t column){
  if(c.disposed)fail(91);auto binding=c.dataBinding;if(!binding||row>=c.grid.size()||column>=c.grid[row].size())fail(381);
  const auto original=Value::string(c.grid[row][column]);std::optional<RecordsetGridEdit> token;
  if(row)token=binding->begin(row,column);
  std::weak_ptr<MacControl> weak=c.self();
  return {[original]{return original;},[weak,binding,token](Value value,bool){
    auto control=weak.lock();if(!control||control->disposed)fail(91);
    if(control->dataBinding!=binding||!binding->active)fail(3218,"Grid binding changed during assignment");
    if(!token)fail(381,"Cannot edit a fixed header cell");binding->commit(*token,std::move(value));
  },"string",false,false};
}
} // namespace vb6
