// Notification callbacks may release their emitter or replace their own callable.
// These are native lifetime regressions, independent of the generated-code VM.
#include "recordset-grid.hpp"
#include <array>
#include <iostream>
#include <stdexcept>
#include <string>
using namespace vb6;
namespace {
size_t checks=0;
void check(bool ok){++checks;if(!ok)throw std::runtime_error("Notification lifetime assertion "+std::to_string(checks));}
std::shared_ptr<NativeRecordset> records(){
  auto rs=NativeRecordset::create();rs->appendColumn(u"ID",3,0);rs->open();
  rs->add({});rs->field(0,Value::integer(1));rs->update();return rs;
}
void storeClose(bool reopen,bool throwing){
  auto rs=records();bool closed=false;size_t calls=0;
  auto watch=rs->observe([&]{++calls;if(!closed){closed=true;rs->close();if(reopen)rs->open();if(throwing)fail(5,"observer failure after close");}});
  rs->field(0,Value::integer(2));bool caught=false;
  try{rs->update();}catch(const Error& e){caught=true;check(e.number==5&&throwing);}
  check(caught==throwing);check(closed&&rs->opened==reopen);check(!rs->notifying);
  check(calls==(throwing?1u:2u));watch.reset();if(!reopen)rs->open();
  rs->add({});rs->field(0,Value::integer(3));rs->update();check(rs->field(0).integral()==3);
}
void storeLastOwner(bool throwing){
  auto owner=std::make_shared<RecordsetStore>();
  auto watch=std::make_shared<RecordsetWatch>();size_t calls=0;
  watch->changed=[&]{++calls;owner.reset();if(throwing)fail(5,"released emitter");};
  owner->watches.push_back(watch);auto raw=owner.get();bool caught=false;
  try{raw->notify();}catch(const Error& e){caught=true;check(e.number==5&&throwing);}
  check(caught==throwing&&calls==1);check(!owner);
}
void viewLastOwner(bool throwing){
  auto owner=records();size_t calls=0;
  auto watch=owner->observe([&]{++calls;owner.reset();if(throwing)fail(5,"released view");});
  auto raw=owner.get();bool caught=false;
  try{raw->notify();}catch(const Error& e){caught=true;check(e.number==5&&throwing);}
  check(caught==throwing&&calls==1);check(!owner);
}
// A large closure forces heap storage. Use its captured data after removing
// the registered function, so destroying an in-flight callable is observable.
void storeSelfRemoval(){
  auto store=std::make_shared<RecordsetStore>();auto watch=std::make_shared<RecordsetWatch>();
  auto owned=std::make_shared<int>(73);std::weak_ptr<int> weak=owned;size_t calls=0;
  watch->changed=[&,payload=std::array<int,64>{73},hold=owned]{
    watch->changed={};check(!weak.expired());check(payload[0]==73&&*hold==73);++calls;
  };
  owned.reset();store->watches.push_back(watch);store->notify();
  check(calls==1&&weak.expired()&&!store->notifying);store->notify();check(calls==1);
}
void viewSelfRemoval(){
  auto rs=records();std::shared_ptr<RecordsetWatch> watch;auto owned=std::make_shared<int>(91);
  std::weak_ptr<int> weak=owned;size_t calls=0;
  watch=rs->observe([&,payload=std::array<int,64>{91},hold=owned]{
    watch->changed={};check(!weak.expired());check(payload[0]==91&&*hold==91);++calls;
  });
  owned.reset();rs->notify();check(calls==1&&weak.expired()&&!rs->notifying);rs->notify();check(calls==1);
}
void gridDetach(){
  auto rs=records();std::shared_ptr<NativeRecordsetGrid> grid;auto owned=std::make_shared<int>(41);
  std::weak_ptr<int> weak=owned;size_t calls=0;
  grid=NativeRecordsetGrid::create(rs,[&,payload=std::array<int,64>{41},hold=owned]{
    grid->detach();grid.reset();check(!weak.expired());check(payload[0]==41&&*hold==41);++calls;
  });
  owned.reset();auto gridWeak=std::weak_ptr<NativeRecordsetGrid>(grid);
  rs->field(0,Value::integer(2));rs->update();
  check(calls==1&&weak.expired()&&gridWeak.expired());rs->notify();check(calls==1);
}
void throwingDelivery(){
  auto store=std::make_shared<RecordsetStore>();auto first=std::make_shared<RecordsetWatch>();
  auto second=std::make_shared<RecordsetWatch>();size_t delivered=0;
  first->changed=[&]{first->changed={};fail(5,"first observer fails");};
  second->changed=[&]{++delivered;};store->watches={first,second};
  bool caught=false;try{store->notify();}catch(const Error& e){caught=true;check(e.number==5);}
  check(caught&&delivered==1&&!store->notifying);store->notify();check(delivered==2);
}
void cloneSurvival(){
  auto rs=records();auto clone=rs->clone(-1);auto original=std::weak_ptr<RecordsetStore>(rs->store);bool closed=false;
  auto watch=rs->observe([&]{if(!closed){closed=true;rs->close();}});
  rs->field(0,Value::integer(2));rs->update();check(closed&&!rs->opened&&!original.expired());
  check(clone->field(0).integral()==2);clone->field(0,Value::integer(3));clone->update();
  check(clone->field(0).integral()==3);clone.reset();check(original.expired());
}
}
int main(int argc,char** argv){
  const std::pair<const char*,std::function<void()>> cases[]={
    {"store-close",[]{storeClose(false,false);}}, {"store-reopen",[]{storeClose(true,false);}},
    {"store-close-throw",[]{storeClose(false,true);}}, {"store-release",[]{storeLastOwner(false);}},
    {"store-release-throw",[]{storeLastOwner(true);}}, {"view-release",[]{viewLastOwner(false);}},
    {"view-release-throw",[]{viewLastOwner(true);}}, {"store-self-remove",storeSelfRemoval},
    {"view-self-remove",viewSelfRemoval}, {"grid-detach",gridDetach},
    {"throwing-delivery",throwingDelivery}, {"clone-survival",cloneSurvival}
  };
  try{
    size_t ran=0;
    for(const auto& item:cases)if(argc==1||item.first==std::string(argv[1])){item.second();++ran;std::cout<<"PASS "<<item.first<<"\n";}
    if(!ran)throw std::runtime_error("Unknown notification test case");
    std::cout<<"NATIVE_RECORDSET_NOTIFICATIONS_OK "<<ran<<" cases "<<checks<<" assertions\n";
  }catch(const std::exception& error){std::cerr<<error.what()<<"\n";return 1;}
}
