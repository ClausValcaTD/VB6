// Typed, bounded, independently owned row values and stable store identities. MIT.
#include "recordset.hpp"
#include <atomic>
namespace vb6 {
RecordsetStore::RecordsetStore(){static std::atomic<uint64_t> next{1};identity=next.fetch_add(1);if(!identity)fail(7,"Recordset identity exhausted");}
void RecordsetStore::notify(){
  // An observer can close its last Recordset and release this store. Declare
  // the owner before Guard so notification cleanup finishes before destruction.
  const auto keepAlive=weak_from_this().lock();
  if(notifying){notifyAgain=true;return;}
  struct Guard{bool& flag;~Guard(){flag=false;}} guard{notifying};notifying=true;
  for(size_t pass=0;pass<128;++pass){
    notifyAgain=false;std::vector<std::shared_ptr<RecordsetWatch>> live;
    watches.erase(std::remove_if(watches.begin(),watches.end(),[&](auto& weak){auto item=weak.lock();if(item)live.push_back(std::move(item));return weak.expired();}),watches.end());
    std::exception_ptr failure;
    for(const auto& item:live){
      try{
        // A callback may clear/replace its registration while it is running.
        // Keep the executing closure alive, not only its containing watch.
        auto callback=item->changed;if(callback)callback();
      }catch(...){if(!failure)failure=std::current_exception();}
    }
    if(failure)std::rethrow_exception(failure);
    if(!notifyAgain)return;
  }
  fail(28,"Recordset notification recursion limit");
}
size_t recordsetColumn(const std::vector<RecordsetColumn>& columns,Value key){
  if(key.type==Type::String){for(size_t i=0;i<columns.size();++i)if(compareText(key.string(),columns[i].name,true)==0)return i;fail(3265,"Field name not found");}
  auto n=key.integral();if(n<0||uint64_t(n)>=columns.size())fail(3265,"Field ordinal not found");return size_t(n);
}
Value recordsetCoerce(const RecordsetColumn& column,Value value){
  if(value.type==Type::Null){if(!(column.attributes&32))fail(3314,"Field cannot contain Null");return Value::null();}
  if(value.type==Type::Missing||value.type==Type::Object||value.type==Type::Record)fail(3421,"Invalid field value type");
  const char* type=nullptr;
  switch(column.type){
    case 2:type="integer";break;case 3:type="long";break;case 4:type="single";break;case 5:type="double";break;
    case 6:type="currency";break;case 7:case 133:case 134:case 135:type="date";break;case 11:type="boolean";break;
    case 14:case 131:type="decimal";break;case 17:type="byte";break;
    case 16:{auto n=value.integral();if(n< -128||n>127)fail(6);return Value::integer(n,Type::Integer);}
    case 18:{auto n=value.integral();if(n<0||n>65535)fail(6);return Value::integer(n);}
    case 19:{auto n=value.integral();if(n<0||n>UINT32_MAX)fail(6);return Value::real(double(n));}
    case 8:case 129:case 130:case 200:case 201:case 202:case 203:{
      auto text=value.string();if((column.size&&text.size()>column.size)||text.size()>1048576)fail(372,"Field value exceeds DefinedSize");
      return Value::string(std::move(text));
    }
    case 128:case 204:case 205:{
      auto array=value.asArray();if(array->elementType!="byte"||array->bounds.size()!=1)fail(3421,"Binary field requires a Byte array");
      if((column.size&&array->values.size()>column.size)||array->values.size()>1048576)fail(372,"Binary field exceeds DefinedSize");return value.copy();
    }
    case 12:
      if(value.type==Type::Array){auto array=value.asArray();if(array->elementType!="byte"||array->bounds.size()!=1||array->values.size()>1048576)fail(3421);}
      if(value.type==Type::String&&value.string().size()>1048576)fail(372);
      return coerce(std::move(value),"variant");
    default:fail(3251,"Unsupported native Recordset field type");
  }
  value=coerce(std::move(value),type);
  if(column.type==14||column.type==131){auto d=std::get<Decimal>(value.payload);if(d.scale>column.scale)fail(372,"Decimal scale exceeds field NumericScale");size_t digits=1;for(auto n=d.coefficient;n>=10;n/=10)++digits;if(digits>size_t(column.precision))fail(6);}
  return value;
}
size_t recordsetBytes(const std::vector<Value>& values){
  size_t bytes=values.size()*sizeof(Value);
  for(const auto& value:values){if(value.type==Type::String)bytes+=value.string().size()*2;else if(value.type==Type::Array)bytes+=value.asArray()->values.size()*sizeof(Value);}
  return bytes;
}
int recordsetCompare(const Value& a,const Value& b){
  if(a.type==Type::Null||b.type==Type::Null)return a.type==b.type?0:a.type==Type::Null?-1:1;
  if(a.type==Type::String&&b.type==Type::String)return compareText(a.string(),b.string(),true);
  if(a.type==Type::String||b.type==Type::String)return a.type==Type::String?1:-1;
  if(a.type==Type::Array||b.type==Type::Array)fail(3251,"Binary fields cannot be sorted or compared");
  if(binary("=",a,b).truth())return 0;return binary("<",a,b).truth()?-1:1;
}
} // namespace vb6
