// Independent native Recordset and stale-binding regressions. No VM oracle.
#include "recordset-grid.hpp"
#include <chrono>
#include <iostream>
#include <stdexcept>
using namespace vb6;
namespace {
size_t checks=0;
void check(bool condition){++checks;if(!condition)throw std::runtime_error("Native Recordset check failed #"+std::to_string(checks));}
void error(int number,const std::function<void()>& action){++checks;try{action();}catch(const Error& e){if(e.number==number)return;throw std::runtime_error("Expected error "+std::to_string(number)+", got "+std::to_string(e.number)+": "+e.what());}throw std::runtime_error("Missing expected error "+std::to_string(number));}
Value v(int n){return Value::integer(n);}Value s(const Text& value){return Value::string(value);}
std::shared_ptr<NativeRecordset> make(){auto rs=NativeRecordset::create();rs->appendColumn(u"ID",3,0);rs->appendColumn(u"Name",202,16);rs->appendColumn(u"Amount",6,0);rs->open();return rs;}
void add(const std::shared_ptr<NativeRecordset>& rs,int id,const Text& name){rs->add({});rs->field(0,v(id));rs->field(1,s(name));rs->field(2,Value::currency(u"1.25"));rs->update();}
void storage(Runtime& rt){
  auto rs=std::dynamic_pointer_cast<NativeRecordset>(rt.create("ADODB.Recordset").asObject());check(bool(rs));
  error(3704,[&]{rs->get(rt,"RecordCount");});rs->appendColumn(u"ID",3,0);rs->appendColumn(u"Name",202,16);rs->appendColumn(u"Amount",6,0);rs->open();
  check(rs->get(rt,"bof").truth()&&rs->get(rt,"eof").truth());
  add(rs,1,u"Bêta");add(rs,2,u"Alpha");add(rs,3,u"Gamma");rs->moveTo(0);
  auto bookmark=rs->get(rt,"bookmark");auto field=rs->get(rt,"fields").asObject()->invoke(rt,"item",{Arg(s(u"Name"))}).asObject();
  field->set(rt,"value",s(u"pending"));check(rs->edit.mode==1);check(field->get(rt,"originalvalue").string()==u"Bêta");
  rs->cancel();check(field->get(rt,"value").string()==u"Bêta");
  error(372,[&]{field->set(rt,"value",s(u"12345678901234567"));});check(rs->edit.mode==0&&rs->field(1).string()==u"Bêta");
  rs->applySort(u"Name ASC");rs->moveTo(0);check(rs->field(0).integral()==2);rs->set(rt,"Bookmark",bookmark);check(rs->field(0).integral()==1);
  rs->applyFilter(s(u"ID >= 2 AND Name LIKE 'G*'"));check(rs->order.size()==1&&rs->field(1).string()==u"Gamma");
  const auto before=rs->get(rt,"bookmark");error(3001,[&]{rs->applyFilter(s(u"ID >= AND"));});check(rs->get(rt,"bookmark").string()==before.string()&&rs->order.size()==1);
  rs->applyFilter(v(0));rs->applySort(u"ID ASC");rs->moveTo(0);
  auto data=rs->invoke(rt,"getrows",{Arg(v(2))}).asArray();check(data->bounds==Bounds({{0,2},{0,1}}));
  check(data->at({v(0),v(0)}).get().integral()==1&&data->at({v(1),v(1)}).get().string()==u"Alpha");
  check(data->at({v(2),v(1)}).get().type==Type::Currency&&rs->field(0).integral()==3);
  rs->add({});rs->field(0,v(4));rs->cancel();check(rs->order.size()==3&&rs->field(0).integral()==3);
  rs->moveTo(0);rs->erase();check(rs->order.size()==2&&rs->field(0).integral()==2);
  rs->invoke(rt,"find",{Arg(s(u"Name = 'Gamma'"))});check(rs->field(0).integral()==3);
  rs->moveTo(0);check(rs->invoke(rt,"getstring",{}).string()==u"2\tAlpha\t1.25\r3\tGamma\t1.25\r");check(rs->get(rt,"eof").truth());
  rs->close();check(!rs->opened);error(3704,[&]{field->get(rt,"value");});rs->open();check(rs->order.empty());
  error(3251,[&]{rs->invoke(rt,"requery",{});});error(3705,[&]{rs->appendColumn(u"new",3,0);});
}
void clones(Runtime& rt){
  auto rs=make();add(rs,1,u"one");add(rs,2,u"two");rs->moveTo(0);auto mark=rs->get(rt,"bookmark");
  rs->applyFilter(s(u"ID = 1"));auto clone=rs->clone(-1);check(clone->order.size()==2&&clone->field(0).integral()==1);
  check(clone->get(rt,"bookmark").string()==mark.string());
  clone->field(1,s(u"clone pending"));rs->field(1,s(u"original"));rs->update();
  check(clone->field(1).string()==u"clone pending");check(clone->field(1,2).string()==u"original");
  error(3218,[&]{clone->update();});check(clone->edit.mode==1);clone->cancel();check(clone->field(1).string()==u"original");
  auto readonly=clone->clone(1);error(3251,[&]{readonly->field(1,s(u"no"));});error(3001,[&]{clone->clone(3);});
  rs->close();rs->deleteColumn(s(u"Name"));check(clone->store->columns.size()==3&&clone->order.size()==2);
  clone->moveTo(1);clone->field(1,s(u"alive"));clone->update();check(readonly->order.size()==2);
  auto other=make();add(other,99,u"other");error(3001,[&]{other->set(rt,"bookmark",mark);});
  clone->moveTo(0);clone->erase();error(3001,[&]{readonly->set(rt,"bookmark",mark);});check(readonly->field(0).integral()==2);
  std::weak_ptr<NativeRecordset> weak=clone;readonly.reset();clone.reset();check(weak.expired());
}
void queries(){
  auto rs=make();add(rs,1,u"O'Malley");add(rs,2,u"Alpha");add(rs,3,u"Gamma");
  rs->applyFilter(s(u"Name = 'O''Malley'"));check(rs->order.size()==1);
  rs->applyFilter(s(u"(ID = 1 OR ID = 2) AND ID > 1"));check(rs->order.size()==1&&rs->field(0).integral()==2);
  rs->applyFilter(s(u"Name LIKE '*amm*'"));check(rs->order.size()==1&&rs->field(0).integral()==3);
  rs->applyFilter(s(u"[Name] LIKE 'Al%'"));check(rs->order.size()==1&&rs->field(0).integral()==2);
  for(auto bad:{u"Name LIKE 'A*B'",u"Name = 'unterminated",u"ID = Null",u"ID == 2",u"ID = 1 AND",u"(ID = 1",u"ID >= nope",u"ID = 1 ; DROP"})error(3001,[&]{rs->applyFilter(s(bad));});
  error(3265,[&]{rs->applySort(u"Missing DESC");});error(3001,[&]{rs->applySort(u"Name ASC,");});error(3001,[&]{rs->applySort(u"Name, Name");});
  rs->applyFilter(v(0));rs->moveTo(0);rs->field(1,Value::null());rs->update();rs->applyFilter(s(u"Name IS NULL"));check(rs->order.size()==1);
  rs->applyFilter(s(u"Name IS NOT NULL"));check(rs->order.size()==2);
  rs->applyFilter(v(0));rs->applySort(u"Name DESC, ID ASC");check(rs->row(rs->order.back()).values[1].type==Type::Null);
}
void binding(Runtime& rt){
  auto rs=make();add(rs,1,u"one");add(rs,2,u"two");auto mark=rs->get(rt,"bookmark");size_t changes=0;
  auto grid=NativeRecordsetGrid::create(rs,[&]{++changes;});check(grid->cells.size()==3&&grid->cells[0][1]==u"Name");
  auto token=grid->begin(2,1);grid->commit(token,s(u"edited"));check(rs->get(rt,"bookmark").string()==mark.string());check(rs->field(1).string()==u"edited");check(changes==1);
  error(3218,[&]{grid->commit(token,s(u"late"));});
  token=grid->begin(1,1);rs->applySort(u"ID DESC");error(3218,[&]{grid->commit(token,s(u"wrong row"));});
  token=grid->begin(1,1);rs->applyFilter(s(u"ID = 1"));error(3218,[&]{grid->commit(token,s(u"filtered"));});
  rs->applyFilter(v(0));token=grid->begin(1,1);auto clone=rs->clone(-1);clone->moveTo(0);clone->field(1,s(u"concurrent"));clone->update();error(3218,[&]{grid->commit(token,s(u"lost"));});
  token=grid->begin(1,1);error(372,[&]{grid->commit(token,s(u"12345678901234567"));});check(rs->edit.mode==0);grid->commit(token,s(u"valid"));
  token=grid->begin(1,1);grid->detach();error(3218,[&]{grid->commit(token,s(u"detached"));});
  grid=NativeRecordsetGrid::create(rs,[]{});token=grid->begin(1,1);rs->close();check(grid->cells.size()==1&&grid->cells[0][1]==u"Name");error(3218,[&]{grid->commit(token,s(u"closed"));});
  rs->open();add(rs,3,u"new");error(3218,[&]{grid->commit(token,s(u"reopened"));});
  error(381,[&]{grid->begin(0,0);});error(381,[&]{grid->begin(2,0);});
  token=grid->begin(1,1);rs->field(1,s(u"pending"));error(3218,[&]{grid->commit(token,s(u"overwrite"));});rs->cancel();
  std::weak_ptr<NativeRecordsetGrid> weak=grid;grid.reset();check(weak.expired());add(rs,4,u"no observer");
}
void atomic(Runtime& rt){
  auto rs=make();add(rs,1,u"first");
  auto fields=arrayValue({s(u"Name"),s(u"ID")});auto bad=arrayValue({s(u"changed"),s(u"not a number")});
  error(13,[&]{rs->update({Arg(fields),Arg(bad)});});check(rs->field(1).string()==u"first"&&rs->edit.mode==0);
  error(13,[&]{rs->add({Arg(fields),Arg(bad)});});check(rs->order.size()==1&&rs->edit.mode==0);
  rs->store->cellLimit=3;rs->add({});rs->field(0,v(2));error(7,[&]{rs->update();});check(rs->order.size()==1&&rs->edit.mode==2);rs->cancel();
  rs->store->byteLimit=rs->store->bytes;rs->field(1,s(u"longer name"));error(7,[&]{rs->update();});rs->cancel();check(rs->field(1).string()==u"first");
  rs->store->byteLimit=64*1024*1024;auto rowmark=rs->get(rt,"bookmark");error(3001,[&]{rs->set(rt,"bookmark",s(rowmark.string()+u"junk"));});check(rs->get(rt,"bookmark").string()==rowmark.string());
  auto closed=NativeRecordset::create();closed->appendColumn(u"id",3,0);error(3251,[&]{closed->invoke(rt,"Open",{Arg(s(u"SELECT * FROM x"))});});check(!closed->opened);
}
void additional(Runtime& rt){
  auto rs=make();add(rs,1,u"one");add(rs,2,u"two");add(rs,3,u"three");
  rs->applyFilter(s(u"ID > 1.5"));check(rs->order.size()==2);
  rs->applyFilter(s(u"ID < 1.5"));check(rs->order.size()==1&&rs->field(0).integral()==1);
  rs->applyFilter(v(0));
  check(recordsetCompare(v(2),v(10))<0&&recordsetCompare(v(10),s(u"11"))<0&&recordsetCompare(v(2),s(u"11"))<0);
  size_t loops=0;auto watch=rs->observe([&]{++loops;rs->notify();});
  error(28,[&]{rs->notify();});check(loops==128&&!rs->notifying);watch.reset();
  size_t delivered=0;auto failWatch=rs->observe([]{fail(5,"subscriber failure");});auto goodWatch=rs->observe([&]{++delivered;});
  error(5,[&]{rs->notify();});check(delivered==1&&!rs->notifying);failWatch.reset();goodWatch.reset();
  auto required=NativeRecordset::create();required->appendColumn(u"required",3,0,0);required->open();required->add({});
  error(3314,[&]{required->update();});check(required->edit.mode==2&&required->order.empty());required->field(0,v(1));required->update();check(required->order.size()==1);
  error(6,[&]{rs->set(rt,"AbsolutePage",Value::real(9e18));});
  auto binary=NativeRecordset::create();binary->appendColumn(u"data",204,8);binary->open();binary->add({});
  auto bytes=arrayValue({v(1),v(2)},0,"byte");binary->field(0,bytes);binary->update();bytes.asArray()->at({v(0)}).set(v(9));check(binary->field(0).asArray()->values[0].integral()==1);
  auto clone=binary->clone(-1);auto copy=clone->field(0);copy.asArray()->at({v(1)}).set(v(7));check(binary->field(0).asArray()->values[1].integral()==2);
  auto chunk=binary->get(rt,"Fields").asObject()->invoke(rt,"Item",{Arg(v(0))}).asObject();
  check(chunk->invoke(rt,"GetChunk",{Arg(v(1))}).asArray()->values[0].integral()==1);
  check(chunk->invoke(rt,"GetChunk",{Arg(v(9))}).asArray()->values[0].integral()==2);
  chunk->invoke(rt,"AppendChunk",{Arg(arrayValue({v(3)},0,"byte"))});binary->update();check(binary->field(0).asArray()->values.size()==3);
}
void scale(Runtime& rt){
  auto rs=NativeRecordset::create();rs->appendColumn(u"ID",3,0);rs->open();auto clone=rs->clone(-1);
  const auto start=std::chrono::steady_clock::now();
  for(int i=0;i<10000;++i){rs->add({});rs->field(0,v(i));rs->update();check(rs->order.size()==size_t(i+1));check(clone->order.size()==size_t(i+1));}
  clone->moveTo(9999);check(clone->field(0).integral()==9999);rs->moveTo(0);auto rows=rs->invoke(rt,"GetRows",{}).asArray();check(rows->values.size()==10000&&rows->values.back().integral()==9999);
  std::cout<<"RECORDSET_10000_APPEND_MS "<<std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-start).count()<<"\n";
}
}
int main(){try{Runtime rt(makeNativeHost());storage(rt);clones(rt);queries();binding(rt);atomic(rt);additional(rt);scale(rt);std::cout<<"NATIVE_RECORDSETS_CORE_OK "<<checks<<" assertions\n";}catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
