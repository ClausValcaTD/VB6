// Automation-style Recordset, Fields and Field dispatch over native storage. MIT.
#include "recordset.hpp"
namespace vb6 {
namespace {
struct NativeField final:Object {
  std::shared_ptr<NativeRecordset> owner;uint64_t id;Text name;size_t chunk=0;uint64_t chunkRow=0;
  NativeField(std::shared_ptr<NativeRecordset> rs,const RecordsetColumn& c):owner(std::move(rs)),id(c.id),name(c.name){}
  std::string className()const override{return "Field";}
  size_t index()const{auto i=owner->fieldIndex(Value::string(name));if(owner->store->columns[i].id!=id)fail(3265,"Field definition has been replaced");return i;}
  Value get(Runtime&,const std::string& raw)override{
    const auto key=lower(raw);const auto i=index();const auto& column=owner->store->columns[i];
    if(key.empty()||key=="value")return owner->field(i);
    if(key=="originalvalue")return owner->field(i,1);if(key=="underlyingvalue")return owner->field(i,2);
    if(key=="name")return Value::string(column.name);if(key=="type")return Value::integer(column.type);
    if(key=="definedsize")return Value::integer(column.size);if(key=="attributes")return Value::integer(column.attributes);
    if(key=="precision")return Value::integer(column.precision);if(key=="numericscale")return Value::integer(column.scale);
    if(key=="status")return Value::integer(0);
    if(key=="actualsize"){
      const auto value=owner->field(i);if(value.type==Type::Null)return Value::integer(0);
      if(value.type==Type::Array)return Value::integer(value.asArray()->values.size());
      if(value.type==Type::String)return Value::integer(value.string().size()*2);
      if(column.type==12){
        if(value.type==Type::Empty)return Value::integer(0);
        return Value::integer(value.type==Type::Byte?1:value.type==Type::Integer||value.type==Type::Boolean?2:value.type==Type::Long||value.type==Type::Single||value.type==Type::Error?4:value.type==Type::Decimal?16:8);
      }
      return Value::integer(column.type==2||column.type==11||column.type==18?2:column.type==16||column.type==17?1:column.type==3||column.type==4||column.type==19?4:column.type==14||column.type==131?16:8);
    }
    fail(438,"Unknown native Field property");
  }
  void set(Runtime&,const std::string& raw,Value value,bool=false)override{
    const auto key=lower(raw);const auto i=index();
    if(key.empty()||key=="value"){owner->field(i,std::move(value));chunk=0;return;}
    if(owner->opened)fail(3705,"Field metadata is frozen while open");
    auto next=owner->store->columns[i];auto n=value.integral();
    if((key=="precision"||key=="numericscale")&&next.type!=14&&next.type!=131)fail(3251,"Precision/scale are writable only for native Decimal fields");
    if(key=="precision"){if(n<1||n>28||n<next.scale)fail(3001);next.precision=int(n);}
    else if(key=="numericscale"){if(n<0||n>next.precision)fail(3001);next.scale=int(n);}
    else if(key=="definedsize"){if(n<0||n>1048576)fail(3001);next.size=size_t(n);}
    else fail(438,"Unknown writable native Field property");
    owner->store->columns[i]=std::move(next);
  }
  Value invoke(Runtime& rt,const std::string& raw,Args args)override{
    auto key=lower(raw);
    if(key=="appendchunk"){
      args=bindNamed(std::move(args),"data");auto value=owner->field(index());auto addition=argument(args,0);
      if(value.type==Type::Null)value=addition.type==Type::Array?arrayValue({},0,"byte"):Value::string(u"");
      if(value.type==Type::String){auto s=value.string(),more=addition.string();if(more.size()>1048576-s.size())fail(372);s+=more;owner->field(index(),Value::string(std::move(s)));}
      else{auto a=value.asArray(),b=addition.asArray();if(a->elementType!="byte"||b->elementType!="byte"||b->values.size()>1048576-a->values.size())fail(372);auto values=a->values;values.insert(values.end(),b->values.begin(),b->values.end());owner->field(index(),arrayValue(std::move(values),0,"byte"));}
      return {};
    }
    if(key=="getchunk"){
      args=bindNamed(std::move(args),"length");auto count=integerArgument(args,0);if(count<0||count>1048576)fail(3001);
      auto value=owner->field(index());if(chunkRow!=owner->current){chunkRow=owner->current;chunk=0;}
      if(value.type==Type::Null)return value;
      if(value.type==Type::String){auto s=value.string();auto length=std::min(size_t(count),s.size()-std::min(chunk,s.size()));auto result=Value::string(s.substr(std::min(chunk,s.size()),length));chunk+=length;return result;}
      auto a=value.asArray();if(a->elementType!="byte")fail(3251);auto start=std::min(chunk,a->values.size()),end=start+std::min(size_t(count),a->values.size()-start);chunk=end;
      return arrayValue(std::vector<Value>(a->values.begin()+ptrdiff_t(start),a->values.begin()+ptrdiff_t(end)),0,"byte");
    }
    return Object::invoke(rt,raw,std::move(args));
  }
};
struct NativeFields final:Object {
  std::shared_ptr<NativeRecordset> owner;
  explicit NativeFields(std::shared_ptr<NativeRecordset> rs):owner(std::move(rs)){}
  std::string className()const override{return "Fields";}
  Value get(Runtime&,const std::string& raw)override{if(lower(raw)=="count")return Value::integer(owner->store->columns.size());fail(438);}
  Value invoke(Runtime& rt,const std::string& raw,Args args)override{
    auto name=lower(raw);
    if(name.empty()||name=="item"){args=bindNamed(std::move(args),"index");return Value::object(std::make_shared<NativeField>(owner,owner->store->columns[owner->fieldIndex(argument(args,0))]));}
    if(name=="append"){
      args=bindNamed(std::move(args),"name,type,definedsize?,attrib?,fieldvalue?");
      if(argument(args,4).type!=Type::Missing)fail(3251,"Recordset schema defaults are not supported");
      auto size=integerArgument(args,2);if(size<0)fail(3001);
      owner->appendColumn(stringArgument(args,0),int(integerArgument(args,1)),size_t(size),int(integerArgument(args,3,32)));return {};
    }
    if(name=="delete"){args=bindNamed(std::move(args),"index");owner->deleteColumn(argument(args,0));return {};}
    return Object::invoke(rt,raw,std::move(args));
  }
  std::vector<Value> enumerate(Runtime&)override{std::vector<Value> result;for(auto& column:owner->store->columns)result.push_back(Value::object(std::make_shared<NativeField>(owner,column)));return result;}
};
int64_t position(NativeRecordset& rs,Value start){
  rs.sync();
  if(start.type==Type::Missing||((start.type!=Type::String)&&start.integral()==0))return rs.current?int64_t(rs.positions.at(rs.current)):rs.edge<0?-1:int64_t(rs.order.size());
  if(start.type==Type::String){auto id=rs.resolveBookmark(start);auto found=rs.positions.find(id);if(found==rs.positions.end())fail(3001,"Bookmark is outside current filter");return int64_t(found->second);}
  auto n=start.integral();if(n==1)return 0;if(n==2)return int64_t(rs.order.size())-1;fail(3001,"Invalid start bookmark");
}
std::vector<size_t> selectedFields(NativeRecordset& rs,Value input){
  std::vector<size_t> result;
  if(input.type==Type::Missing){for(size_t i=0;i<rs.store->columns.size();++i)result.push_back(i);}
  else if(input.type==Type::Array){auto a=input.asArray();if(a->bounds.size()!=1||a->values.empty()||a->values.size()>256)fail(3001);for(auto& v:a->values)result.push_back(rs.fieldIndex(v));}
  else result.push_back(rs.fieldIndex(input));return result;
}
}
Value NativeRecordset::get(Runtime&,const std::string& raw){
  auto name=lower(raw);auto self=std::static_pointer_cast<NativeRecordset>(shared_from_this());
  if(name=="fields")return Value::object(std::make_shared<NativeFields>(self));
  if(name=="state")return Value::integer(opened?1:0);if(name=="activeconnection")return Value::object(nullptr);
  if(name=="cursorlocation")return Value::integer(cursorLocation);if(name=="cursortype")return Value::integer(cursorType);
  if(name=="locktype")return Value::integer(lockType);if(name=="source")return Value::string(u"");
  if(name=="sort")return Value::string(sortText);if(name=="filter")return filterValue.copy();if(name=="pagesize")return Value::integer(pageSize);
  requireOpen();sync();
  if(name=="recordcount")return Value::integer(order.size());if(name=="editmode")return Value::integer(edit.mode);
  if(name=="bof")return Value::boolean(edit.mode==2?false:order.empty()||edge<0);
  if(name=="eof")return Value::boolean(edit.mode==2?false:order.empty()||edge>0);
  if(name=="bookmark"){if(!current||edge||edit.mode==2)fail(3021);return bookmark(current);}
  if(name=="absoluteposition")return Value::integer(current&&!edge?int64_t(positions.at(current))+1:edge<0?-2:-3);
  if(name=="absolutepage")return Value::integer(current&&!edge?int64_t(positions.at(current))/pageSize+1:edge<0?-2:-3);
  if(name=="pagecount")return Value::integer((order.size()+size_t(pageSize)-1)/size_t(pageSize));
  if(name=="status")return Value::integer(edit.mode==2?1:edit.mode==1?2:0);
  fail(438,"Unknown native Recordset property: "+raw);
}
void NativeRecordset::set(Runtime&,const std::string& raw,Value value,bool){
  auto name=lower(raw);
  if(name=="activeconnection"){if(value.type==Type::Object&&!std::get<ObjectPtr>(value.payload))return;fail(3251,"Only disconnected native Recordsets are supported");}
  if(name=="source"){if(value.type==Type::String&&value.string().empty())return;fail(3251,"No external native Recordset provider");}
  if(name=="cursorlocation"||name=="cursortype"||name=="locktype"){
    if(opened)fail(3705);auto n=value.integral();
    if(name=="cursorlocation"){if(n!=3)fail(3251,"Only client-side native cursors are supported");cursorLocation=int(n);}
    else if(name=="cursortype"){if(n!=3)fail(3251,"Only static native cursors are supported");cursorType=int(n);}
    else{if(n!=1&&n!=3)fail(3251,"Only read-only or optimistic native locks are supported");lockType=int(n);}return;
  }
  if(name=="sort"){applySort(value.string());return;}if(name=="filter"){applyFilter(std::move(value));return;}
  if(name=="pagesize"){auto n=value.integral();if(n<1||n>INT32_MAX)fail(3001);pageSize=int(n);return;}
  requireOpen();sync();
  if(name=="bookmark"){auto id=resolveBookmark(value);auto found=positions.find(id);if(found==positions.end())fail(3001,"Bookmark outside filter");update();sync();if(!positions.count(id))fail(3001);current=id;edge=0;return;}
  if(name=="absoluteposition"||name=="absolutepage"){
    auto n=coerce(value,"long").integral();if(n==-2){moveTo(-1);return;}if(n==-3){moveTo(INT32_MAX);return;}
    auto next=name=="absolutepage"?(n-1)*int64_t(pageSize):n-1;if(n<1||next<0||uint64_t(next)>=order.size())fail(3001);moveTo(next);return;
  }
  fail(438,"Unknown writable native Recordset property: "+raw);
}
Value NativeRecordset::invoke(Runtime& rt,const std::string& raw,Args args){
  auto name=lower(raw);
  if(name.empty()||name=="item"||name=="fields"){
    if(args.empty()&&name=="fields")return get(rt,name);args=bindNamed(std::move(args),"index");
    return Value::object(std::make_shared<NativeField>(std::static_pointer_cast<NativeRecordset>(shared_from_this()),store->columns[fieldIndex(argument(args,0))]));
  }
  if(name=="let:"||name=="set:"||name=="let:item"||name=="set:item"){args=bindNamed(std::move(args),"index,value");field(fieldIndex(argument(args,0)),argument(args,1));return {};}
  if(name=="open"){
    args=bindNamed(std::move(args),"source?,activeconnection?,cursortype?,locktype?,options?");
    auto source=argument(args,0),connection=argument(args,1);
    if(source.type!=Type::Missing&&!(source.type==Type::String&&source.string().empty()))fail(3251,"Native Recordset has no external SQL provider");
    if(connection.type!=Type::Missing&&!(connection.type==Type::Object&&!std::get<ObjectPtr>(connection.payload)))fail(3251,"Native Recordset must be disconnected");
    auto cursor=integerArgument(args,2,cursorType),locking=integerArgument(args,3,lockType),options=integerArgument(args,4,-1);
    if(cursor!=3||(locking!=1&&locking!=3)||(options!=0&&options!=-1))fail(3251,"Unsupported native Recordset open options");
    if(opened)fail(3705);cursorType=int(cursor);lockType=int(locking);open();return {};
  }
  if(name=="addnew"){add(std::move(args));return {};}if(name=="update"){update(std::move(args));return {};}
  if(name=="close"){bindNamed(std::move(args),"");close();return {};}
  if(name=="cancelupdate"){bindNamed(std::move(args),"");cancel();return {};}
  if(name=="delete"){args=bindNamed(std::move(args),"affectrecords?");if(integerArgument(args,0,1)!=1)fail(3251);erase();return {};}
  if(name=="clone"){args=bindNamed(std::move(args),"locktype?");return Value::object(clone(int(integerArgument(args,0,-1))));}
  if(name=="supports"){
    args=bindNamed(std::move(args),"cursoroptions");requireOpen();auto flag=integerArgument(args,0);
    const bool read=flag==512||flag==8192||flag==16384||flag==524288;
    const bool write=flag==16778240||flag==16809984||flag==16781312;
    return Value::boolean(read||(write&&lockType!=1));
  }
  if(name=="movefirst"||name=="movelast"||name=="movenext"||name=="moveprevious"){
    bindNamed(std::move(args),"");requireOpen();update();sync();auto p=position(*this,Value::missing());
    moveTo(name=="movefirst"?0:name=="movelast"?int64_t(order.size())-1:name=="movenext"?p+1:p-1);return {};
  }
  if(name=="move"){
    args=bindNamed(std::move(args),"numrecords,start?");requireOpen();auto delta=integerArgument(args,0);update();auto p=position(*this,argument(args,1));moveTo(p+delta);return {};
  }
  if(name=="getrows"){
    args=bindNamed(std::move(args),"rows?,start?,fields?");requireOpen();auto requested=integerArgument(args,0,-1);if(requested< -1)fail(3001);
    auto fields=selectedFields(*this,argument(args,2));update();sync();const auto first=position(*this,argument(args,1));
    if(first<0)fail(3021);const size_t start=std::min(size_t(first),order.size());
    const size_t count=std::min(order.size()-start,requested<0?order.size():size_t(requested));
    if(!fields.empty()&&count>std::min(rt.maxArrayElements,store->cellLimit)/fields.size())fail(7,"GetRows exceeds array budget");
    auto array=std::make_shared<Array>("variant",Bounds{},true,1);array->allocated=true;array->bounds={{0,int32_t(fields.size())-1},{0,int32_t(count)-1}};
    array->values.reserve(fields.size()*count);size_t bytes=0;
    for(size_t i=0;i<count;++i)for(auto column:fields){auto value=coerce(row(order[start+i]).values[column],"variant");bytes+=recordsetBytes({value});if(bytes>store->byteLimit)fail(7,"GetRows exceeds byte budget");array->values.push_back(std::move(value));}
    moveTo(int64_t(start+count));auto result=Value::array(array);result.variant=true;return result;
  }
  if(name=="getstring"){
    args=bindNamed(std::move(args),"stringformat?,numrows?,columndelimiter?,rowdelimiter?,nullexpr?");requireOpen();
    if(integerArgument(args,0,2)!=2)fail(3251);const auto requested=integerArgument(args,1,-1);if(requested< -1)fail(3001);
    auto col=stringArgument(args,2,u"\t"),end=stringArgument(args,3,u"\r"),null=stringArgument(args,4,u"");update();sync();
    const auto first=position(*this,Value::missing());if(first<0)fail(3021);const size_t start=std::min(size_t(first),order.size()),count=std::min(order.size()-start,requested<0?order.size():size_t(requested));
    Text output;auto append=[&](const Text& value){if(value.size()>16777216-output.size())fail(7);output+=value;};
    for(size_t i=0;i<count;++i){const auto& values=row(order[start+i]).values;for(size_t j=0;j<values.size();++j){if(j)append(col);append(values[j].type==Type::Null?null:values[j].string());}append(end);}
    moveTo(int64_t(start+count));return Value::string(std::move(output));
  }
  if(name=="find"){
    args=bindNamed(std::move(args),"criteria,skiprecords?,searchdirection?,start?");requireOpen();auto test=recordsetFilter(store->columns,stringArgument(args,0));if(!test)fail(3001);
    auto skip=integerArgument(args,1),direction=integerArgument(args,2,1);if(skip<0||(direction!=1&&direction!=-1))fail(3001);update();sync();
    int64_t index=position(*this,argument(args,3))+direction*skip;
    for(;index>=0&&uint64_t(index)<order.size();index+=direction)if(test(row(order[size_t(index)]))){moveTo(index);return {};}
    moveTo(direction==1?int64_t(order.size()):-1);return {};
  }
  if(name=="updatebatch"||name=="cancelbatch"||name=="resync"||name=="requery"||name=="save"||name=="seek"||name=="nextrecordset")fail(3251,"Operation requires an unimplemented native provider or persistence contract");
  return Object::invoke(rt,raw,std::move(args));
}
std::vector<Value> NativeRecordset::enumerate(Runtime& rt){return get(rt,"fields").asObject()->enumerate(rt);}
} // namespace vb6
