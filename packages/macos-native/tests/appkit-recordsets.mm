// Genuine AppKit binding/readback/edit-delegate tests; no HTML table stand-in.
#include "appkit-recordsets.hpp"
#include <cassert>
#include <iostream>
using namespace vb6;
namespace {
Value s(Text value){return Value::string(std::move(value));}Value n(int value){return Value::integer(value);}
void error(int number,const std::function<void()>& f){bool failed=false;try{f();}catch(const Error& e){failed=true;assert(e.number==number);}assert(failed);}
std::shared_ptr<NativeRecordset> sample(){auto rs=NativeRecordset::create();rs->appendColumn(u"ID",3,0);rs->appendColumn(u"Name",202,16);rs->open();for(int i=1;i<=3;++i){rs->add({});rs->field(0,n(i));rs->field(1,s(i==1?u"one":i==2?u"two":u"three"));rs->update();}return rs;}
}
void checkNativeRecordsetsAppKit(Runtime& rt,MacHost& host,const std::shared_ptr<Instance>& form){
  auto rs=sample();auto value=Value::object(rs);const auto saved=rs->get(rt,"bookmark").string();
  for(auto key:{"c27","c28","c29"}){
    auto control=std::dynamic_pointer_cast<MacControl>(form->controls.at(key));auto table=(NSTableView*)control->widget;
    // Exercise the same no-Set assignment used by the unmodified Data sample.
    assign(rt,control->reference(rt,"DataSource",{}),value,false);
    assert(control->grid.size()==4&&control->grid.front()==std::vector<Text>({u"ID",u"Name"}));
    assert(rs->get(rt,"bookmark").string()==saved);
    assert(table.numberOfRows==4&&table.numberOfColumns==2);
    assert([control->tableDelegate tableView:table objectValueForTableColumn:table.tableColumns[1] row:1]&&
      text([control->tableDelegate tableView:table objectValueForTableColumn:table.tableColumns[1] row:1])==u"one");
  }
  auto flex=std::dynamic_pointer_cast<MacControl>(form->controls.at("c27"));
  auto data=std::dynamic_pointer_cast<MacControl>(form->controls.at("c29"));auto table=(NSTableView*)data->widget;
  flex->invoke(rt,"let:textmatrix",{Arg(n(3)),Arg(n(1)),Arg(s(u"changed"))});
  assert(rs->get(rt,"bookmark").string()==saved&&rs->field(1).string()==u"changed");
  assert(data->grid[3][1]==u"changed");
  auto ref=flex->reference(rt,"textmatrix",{Arg(n(1)),Arg(n(1))});rs->applySort(u"ID DESC");
  error(3218,[&]{ref.set(s(u"late"));});assert(data->grid[1][0]==u"3");
  auto column=table.tableColumns[1];
  assert([data->tableDelegate tableView:table shouldEditTableColumn:column row:1]);
  [data->tableDelegate tableView:table setObjectValue:@"native edit" forTableColumn:column row:1];host.check();
  assert(rs->field(1).string()==u"native edit"&&flex->grid[1][1]==u"native edit");
  assert(![data->tableDelegate tableView:table shouldEditTableColumn:column row:0]);
  assert([data->tableDelegate tableView:table shouldEditTableColumn:column row:1]);
  rs->applySort(u"ID ASC");
  [data->tableDelegate tableView:table setObjectValue:@"stale sort" forTableColumn:column row:1];error(3218,[&]{host.check();});
  assert(rs->row(rs->order[0]).values[1].string()==u"one");
  assert([data->tableDelegate tableView:table shouldEditTableColumn:column row:1]);
  bindNativeRecordset(*data,Value::object(sample()));
  [data->tableDelegate tableView:table setObjectValue:@"stale rebind" forTableColumn:column row:1];error(3218,[&]{host.check();});
  assert(data->grid[1][1]==u"one");
  bindNativeRecordset(*data,value);column=table.tableColumns[1];
  assert([data->tableDelegate tableView:table shouldEditTableColumn:column row:1]);
  [data->tableDelegate tableView:table setObjectValue:@"value exceeds column size" forTableColumn:column row:1];error(372,[&]{host.check();});
  assert(data->grid[1][1]==u"one"&&rs->edit.mode==0);
  error(380,[&]{flex->set(rt,"rows",n(10));});
  error(13,[&]{bindNativeRecordset(*flex,n(3));});assert(flex->dataBinding->source==rs);
  rs->applyFilter(s(u"ID = 3"));assert(data->grid.size()==2&&data->grid[1][0]==u"3");
  rs->applyFilter(n(0));assert(data->grid.size()==4);
  rs->close();assert(data->grid.size()==1&&data->grid.front()[1]==u"Name");
  auto old=data->dataBinding;bindNativeRecordset(*data,Value::object(nullptr));assert(!old->active&&!data->dataBinding);
  rs->open();rs->add({});rs->field(0,n(10));rs->update();assert(data->grid.size()==1&&flex->grid.size()==2);
  ref={};std::weak_ptr<NativeRecordsetGrid> weak=flex->dataBinding;flex->dispose();assert(weak.expired());
  rs->add({});rs->field(0,n(11));rs->update();host.check();
  std::cout<<"APPKIT_RECORDSETS_OK\n";
}
