// Lexical With/For Each ownership, including suspended GoSub/error continuations.
#include "vb6.hpp"
#include "array-ownership.hpp"
namespace vb6 {
namespace {
bool contains(int at,int start,int end){return at>=start&&at<end;}
bool live(const Frame& frame,int at,int start,int end){
  if(contains(at,start,end))return true;
  if(frame.handlerActive&&contains(frame.errorSite,start,end))return true;
  for(const auto returned:frame.gosubs)if(contains(returned,start,end))return true;
  return false;
}
}
void Frame::closeEach(const std::string& id){each.erase(id);}
void Frame::closeWith(const std::string& id){withScopes.erase(id);}
void Frame::clearScopes(){each.clear();withScopes.clear();}
void Frame::reconcileScopes(int instruction){
  for(auto it=each.begin();it!=each.end();)if(!live(*this,instruction,it->second.start,it->second.end))it=each.erase(it);else ++it;
  for(auto it=withScopes.begin();it!=withScopes.end();)if(!live(*this,instruction,it->second.start,it->second.end))it=withScopes.erase(it);else ++it;
}
Value Frame::with(const std::string& id)const{
  if(!id.empty()){auto it=withScopes.find(id);if(it==withScopes.end())fail(91);return it->second.value;}
  const WithState* inner=nullptr;
  for(const auto& [key,state]:withScopes)if(contains(site,state.start,state.end)&&(!inner||inner->start<state.start))inner=&state;
  if(!inner)fail(91);return inner->value;
}
void Frame::pushWith(const std::string& id,Value value,int end,Ref reference){
  WithState state;state.start=site+1;state.end=end;
  if(state.end<state.start)fail(5,"Invalid native With interval");
  if(value.type==Type::Record){
    if(reference&&reference.direct){state.borrow=borrowArrayValue(value);state.reference=std::move(reference);}
    else value=value.copy();
  }else if(value.type!=Type::Object)fail(424);
  // Object values capture identity only, not the array containing a reference.
  state.value=std::move(value);withScopes.insert_or_assign(id,std::move(state));
}
void Frame::unwindWith(size_t count){
  std::vector<std::pair<int,std::string>> visible;
  for(const auto& [id,state]:withScopes)if(contains(site,state.start,state.end))visible.emplace_back(state.start,id);
  // A failed/skipped initializer has no activation to release.
  count=std::min(count,visible.size());
  std::sort(visible.begin(),visible.end());while(count--){closeWith(visible.back().second);visible.pop_back();}
}
bool Frame::eachStart(const std::string& id,Ref variable,Value iterable,int end){
  EachState state;state.start=site+1;state.end=end;state.variable=std::move(variable);
  if(state.end<state.start)fail(5,"Invalid native For Each interval");
  if(iterable.type==Type::Array){state.array=iterable.asArray();state.borrow=borrowArrayValue(iterable,true);}
  else state.values=iterable.asObject()->enumerate(runtime);
  each.insert_or_assign(id,std::move(state));return eachNext(id);
}
bool Frame::eachNext(const std::string& id){
  auto it=each.find(id);if(it==each.end())fail(92,"For Each loop is not initialized");auto& state=it->second;
  const auto& values=state.array?state.array->values:state.values;
  if(state.position>=values.size()){each.erase(it);return false;}
  auto value=values[state.position++];state.variable.set(value,value.type==Type::Object);return true;
}
}
