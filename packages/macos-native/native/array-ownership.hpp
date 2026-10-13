// Scoped native references. No locks or ancestor ownership enter copied values.
#pragma once
#include "vb6.hpp"
namespace vb6 {
struct ArrayOwners { std::vector<std::weak_ptr<Array>> arrays; };
struct ArrayBorrow {
  std::vector<std::shared_ptr<Array>> arrays;
  void retain(const std::shared_ptr<Array>&);
  ~ArrayBorrow();
  ArrayBorrow()=default; ArrayBorrow(const ArrayBorrow&)=delete;
  ArrayBorrow& operator=(const ArrayBorrow&)=delete;
};
Value addArrayOwner(Value,const std::shared_ptr<Array>&);
Value inheritArrayOwners(const Value& source,Value target);
std::shared_ptr<ArrayBorrow> borrowArrayValue(const Value&,bool includeSelf=false);
Ref retainReferenceOwners(const Value&,Ref);
// Incoming value is already coerced/copied. Preserve record-field identity and
// reject locked descendant replacement before changing any destination field.
void storeNativeValue(Value& destination,Value incoming);
}
