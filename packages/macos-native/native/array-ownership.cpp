#include "array-ownership.hpp"
namespace vb6 {
namespace {
bool sameName(const std::string& a,const std::string& b){
  if(a.size()!=b.size())return false;
  for(size_t i=0;i<a.size();++i){const auto fold=[](unsigned char c){return c>='A'&&c<='Z'?c+32:c;};if(fold(a[i])!=fold(b[i]))return false;}
  return true;
}
bool aggregate(const Value& value){return value.type==Type::Array||value.type==Type::Record;}
void append(ArrayOwners& owners,const std::shared_ptr<Array>& array){
  for(const auto& existing:owners.arrays)if(existing.lock()==array)return;
  owners.arrays.emplace_back(array);
}
}
void ArrayBorrow::retain(const std::shared_ptr<Array>& array){
  if(std::find(arrays.begin(),arrays.end(),array)!=arrays.end())return;
  // Store ownership before incrementing so allocation failure cannot leak a lock.
  arrays.push_back(array);++array->borrowedElements;
}
ArrayBorrow::~ArrayBorrow(){for(const auto& array:arrays)--array->borrowedElements;}
Value addArrayOwner(Value value,const std::shared_ptr<Array>& array){
  if(!aggregate(value))return value;
  auto owners=std::make_shared<ArrayOwners>();
  if(value.arrayOwners)*owners=*value.arrayOwners;
  append(*owners,array);value.arrayOwners=std::move(owners);return value;
}
Value inheritArrayOwners(const Value& source,Value target){
  if(!aggregate(target)||!source.arrayOwners)return target;
  auto owners=std::make_shared<ArrayOwners>();
  if(target.arrayOwners)*owners=*target.arrayOwners;
  for(const auto& owner:source.arrayOwners->arrays)if(auto array=owner.lock())append(*owners,array);
  target.arrayOwners=std::move(owners);return target;
}
std::shared_ptr<ArrayBorrow> borrowArrayValue(const Value& value,bool includeSelf){
  if(!value.arrayOwners&&!(includeSelf&&value.type==Type::Array))return {};
  auto borrow=std::make_shared<ArrayBorrow>();
  if(includeSelf&&value.type==Type::Array)borrow->retain(value.asArray());
  if(value.arrayOwners)for(const auto& owner:value.arrayOwners->arrays)if(auto array=owner.lock())borrow->retain(array);
  return borrow;
}
Ref retainReferenceOwners(const Value& source,Ref reference){
  if(!source.arrayOwners)return reference;
  auto borrow=borrowArrayValue(source);auto owners=source.arrayOwners;
  auto read=std::move(reference.read);auto write=std::move(reference.write);
  reference.read=[read,borrow,owners]{Value parent;parent.arrayOwners=owners;return inheritArrayOwners(parent,read());};
  reference.write=[write,borrow](Value value,bool set){if(!write)fail(451);write(std::move(value),set);};
  return reference;
}
namespace {
void checkStorage(const Value& current,const Value* next,size_t depth){
  if(depth>256)fail(28,"Native record nesting limit exceeded");
  if(current.type==Type::Array){
    auto array=current.asArray();if(array->borrowedElements)fail(10,"This array is temporarily locked");
    const auto other=next&&next->type==Type::Array?next->asArray():nullptr;
    if(other&&array->elementType==other->elementType&&array->bounds==other->bounds&&array->values.size()!=other->values.size())fail(13);
    for(size_t i=0;i<array->values.size();++i)checkStorage(array->values[i],other&&i<other->values.size()?&other->values[i]:nullptr,depth+1);
  }else if(current.type==Type::Record){
    auto record=current.asRecord();const auto other=next&&next->type==Type::Record&&sameName(next->asRecord()->name,record->name)?next->asRecord():nullptr;
    if(other&&record->fields.size()!=other->fields.size())fail(13);
    for(const auto& [key,cell]:record->fields){
      CellPtr field;if(other){auto it=other->fields.find(key);if(it==other->fields.end())fail(13);field=it->second;
        if(cell->type!=field->type||cell->fixedLength!=field->fixedLength||cell->arrayStorage!=field->arrayStorage)fail(13);}
      checkStorage(cell->value,field?&field->value:nullptr,depth+1);
    }
  }
}
// All shapes and locks are checked first. The commit only walks existing
// containers and swaps payloads; it neither allocates nor invokes user code.
void commitStorage(Value& current,Value& next){
  if(current.type==Type::Record&&next.type==Type::Record&&sameName(current.asRecord()->name,next.asRecord()->name)){auto a=current.asRecord(),b=next.asRecord();for(auto& [key,cell]:a->fields)commitStorage(cell->value,b->fields.at(key)->value);}
  else if(current.type==Type::Array&&next.type==Type::Array&&current.asArray()->elementType==next.asArray()->elementType&&current.asArray()->bounds==next.asArray()->bounds){auto a=current.asArray(),b=next.asArray();for(size_t i=0;i<a->values.size();++i)commitStorage(a->values[i],b->values[i]);}
  else {current.payload.swap(next.payload);current.type=next.type;current.variant=next.variant;current.arrayOwners.reset();}
}
}
void storeNativeValue(Value& destination,Value incoming){
  if(destination.type==Type::Record&&incoming.type==Type::Record){checkStorage(destination,&incoming,0);commitStorage(destination,incoming);}
  else {incoming.arrayOwners.reset();destination=std::move(incoming);}
}
}
