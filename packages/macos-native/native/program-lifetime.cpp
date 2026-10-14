// Program-root release and default-form variables. MIT.
// End is abrupt; ordinary completion must drain Terminate before host teardown.
// https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/end-statement
#include "lifetime.hpp"
#include <unordered_set>

namespace vb6 {
namespace {
// Traverse aggregates without recursive destruction or an O(element-count)
// auxiliary pointer vector. No VB callback runs during this traversal.
class RootRelease {
  struct Cursor {
    Value* value;
    Array* array=nullptr;
    Record* record=nullptr;
    size_t index=0;
    std::map<std::string,CellPtr>::iterator field;
    explicit Cursor(Value* v):value(v) {}
  };
  std::unordered_set<const void*> visited;
  std::vector<Cursor> stack;
public:
  bool changed=false;
  void visit(Value& root) {
    stack.emplace_back(&root);
    while(!stack.empty()) {
      auto& current=stack.back();
      if(auto* value=std::exchange(current.value,nullptr)) {
        if(value->type==Type::Object) {
          auto& object=std::get<ObjectPtr>(value->payload);
          if(object){changed=true;object.reset();}
          stack.pop_back();
        } else if(value->type==Type::Array) {
          auto* array=value->asArray().get();
          if(visited.insert(array).second)current.array=array;
          else stack.pop_back();
        } else if(value->type==Type::Record) {
          auto* record=value->asRecord().get();
          if(visited.insert(record).second){current.record=record;current.field=record->fields.begin();}
          else stack.pop_back();
        } else stack.pop_back();
      } else if(current.array && current.index<current.array->values.size()) {
        auto* child=&current.array->values[current.index++];
        stack.emplace_back(child);
      } else if(current.record && current.field!=current.record->fields.end()) {
        auto* child=&(current.field++)->second->value;
        stack.emplace_back(child);
      } else stack.pop_back();
    }
  }
  void cells(std::map<std::string,CellPtr>& cells) {
    for(auto& entry:cells)visit(entry.second->value);
  }
};
struct FinishGuard {
  bool& flag;
  explicit FinishGuard(bool& flag):flag(flag){flag=true;}
  ~FinishGuard(){flag=false;}
};
}

bool Instance::hasControl(const std::string& name) const {
  if(controls.count(name))return true;
  auto matches=[&](const ControlSpec& spec){return lower(spec.name)==name;};
  return std::any_of(module->controls.begin(),module->controls.end(),matches) ||
    std::any_of(module->menus.begin(),module->menus.end(),matches);
}

Ref Runtime::defaultFormRef(const std::string& raw) {
  const auto name=lower(raw);
  auto found=modules.find(name);
  if(found==modules.end()||found->second.kind!="form")fail(13,"Default variable requires a form type");
  return {[this,name]{return Value::object(instance(name));},
    [this,name](Value value,bool objectSet) {
      if(finished)fail(5,"Native program has finished");
      if(!objectSet||value.type!=Type::Object)fail(13,"A form variable requires Set");
      auto object=std::get<ObjectPtr>(value.payload);
      auto form=std::dynamic_pointer_cast<Instance>(object);
      if(object&&(!form||form->runtime!=this||lower(form->module->name)!=name))
        fail(13,"Default form variable type mismatch");
      // Never instantiate merely to write Nothing. Validate before replacing,
      // and leave loaded-window and explicit aliases as independent owners.
      if(form)instances[name]=std::move(form);
      else instances.erase(name);
    },name,false,true};
}

bool Runtime::finish() {
  if(finished)return true;
  if(depth||finishing)fail(5,"Program cleanup requires an idle native call stack");
  if(host->hasOpenForms())return false;
  FinishGuard guard(finishing);
  // A finalizer is allowed to publish another root or open another form. Drain
  // again or resume the event loop, but bound self-recreating shutdown programs.
  for(size_t pass=0;pass<1024;++pass) {
    drainNativeFinalizers(*this);
    if(host->hasOpenForms())return false;
    RootRelease release;
    for(auto it=instances.begin();it!=instances.end();) {
      auto& object=it->second;
      if(object->module->kind!="module") {
        if(object->loaded){++it;continue;}
        it=instances.erase(it);release.changed=true;
      } else {
        release.cells(object->fields);
        for(auto& procedure:object->statics)release.cells(procedure.second);
        ++it;
      }
    }
    drainNativeFinalizers(*this);
    if(host->hasOpenForms())return false;
    if(!release.changed){stop();return true;}
  }
  fail(28,"Finalizers repeatedly recreate native program roots");
}

void Runtime::stop() noexcept {
  if(finished)return;
  ending=true;
  // Destructors and abrupt End must not execute arbitrary VB callbacks.
  stopNativeFinalizers(*this);
  try{if(host)host->shutdown();}catch(...){}
  instances.clear();
  files.clear();
  subscriptions.clear();
  constants.clear();
  resources.reset();
  finished=true;
}
} // namespace vb6
