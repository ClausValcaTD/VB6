// Independent native storage checks complement the source-program acceptance.
#include "vb6.hpp"
#include "array-ownership.hpp"
#include <cassert>
#include <iostream>
using namespace vb6;
template<class F> void error(int number,F action){bool thrown=false;try{action();}catch(const Error& e){assert(e.number==number);thrown=true;}assert(thrown);}
std::shared_ptr<Record> record(){
  auto result=std::make_shared<Record>();result->name="OwnedRecord";
  result->fields["first"]=std::make_shared<Cell>(Value::integer(7),"long");
  result->fields["numbers"]=std::make_shared<Cell>(Value::array(std::make_shared<Array>("long",Bounds{{0,1}},false,2)),"long",0,false,true);
  result->order={"first","numbers"};return result;
}
int main(){
  Runtime runtime(makeNativeHost());
  auto array=std::make_shared<Array>("OwnedRecord",Bounds{{0,1}},true,8,0,[]{return Value::record(record());});
  auto element=callValue(runtime,Value::array(array),{Arg(Value::integer(0))});
  assert(array->borrowedElements==0&&element.arrayOwners);
  {
    auto reference=memberRef(runtime,element,"first"),alias=reference;
    assert(array->borrowedElements==1);
    error(10,[&]{array->erase();});error(10,[&]{array->resized({{0,3}},true,8);});
    reference={};assert(array->borrowedElements==1);alias.set(Value::integer(19));
    assert(element.asRecord()->fields.at("first")->get().integral()==19);
  }
  assert(array->borrowedElements==0);
  auto nested=getMember(runtime,element,"numbers");
  {
    auto reference=indexedRef(runtime,nested,{Value::integer(0)});
    assert(array->borrowedElements==1&&nested.asArray()->borrowedElements==1);
    error(10,[&]{array->erase();});error(10,[&]{nested.asArray()->erase();});
    reference.set(Value::integer(23));
  }
  assert(array->borrowedElements==0&&nested.asArray()->borrowedElements==0);
  auto copied=element.copy();assert(!copied.arrayOwners);
  {auto ref=memberRef(runtime,copied,"first");ref.set(Value::integer(31));assert(array->borrowedElements==0);}
  assert(getMember(runtime,element,"first").integral()==19);
  auto current=Value::record(record()),next=Value::record(record());
  next.asRecord()->fields.at("first")->set(Value::integer(41));
  auto stable=current.asRecord()->member("first");
  {
    auto inner=current.asRecord()->fields.at("numbers")->get().asArray()->at({Value::integer(0)});
    error(10,[&]{storeNativeValue(current,next.copy());});
    assert(stable.get().integral()==7); // No early scalar update before lock failure.
  }
  storeNativeValue(current,next.copy());assert(stable.get().integral()==41);
  auto malformed=next.copy();malformed.asRecord()->fields.at("numbers")->value.asArray()->values.clear();
  error(13,[&]{storeNativeValue(current,std::move(malformed));});assert(stable.get().integral()==41);
  std::weak_ptr<Array> weak;
  {
    auto owner=std::make_shared<Array>("OwnedRecord",Bounds{{0,0}},true,1,0,[]{return Value::record(record());});weak=owner;
    auto escaped=callValue(runtime,Value::array(owner),{Arg(Value::integer(0))});
    owner.reset();assert(weak.expired());assert(escaped.asRecord()->fields.at("first")->get().integral()==7);
  }
  // Discarding a copied aggregate never prolongs or changes the source lock.
  {auto hold=borrowArrayValue(element);auto duplicate=inheritArrayOwners(element,element);auto second=borrowArrayValue(duplicate);assert(array->borrowedElements==2);second.reset();assert(array->borrowedElements==1);}
  assert(array->borrowedElements==0);array->erase();
  std::cout<<"NATIVE_SCOPE_OWNERSHIP_OK\n";
}
