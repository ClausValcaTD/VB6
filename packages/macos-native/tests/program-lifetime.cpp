// Independent native application lifetime tests; no generated-code oracle.
#include "vb6.hpp"
#include "lifetime.hpp"
#include <cassert>
#include <iostream>
using namespace vb6;
namespace {
struct State {
  std::vector<int> terminated;
  int initialized=0,loaded=0,unloaded=0,queries=0,created=0,loops=0,shutdowns=0,lastMode=-1;
  bool cancelQuery=false,cancelUnload=false,failInitialize=false,failTerminate=false;
  int recreate=0;
};
struct Host final:NativeHost {
  State& state;
  std::map<Instance*,std::shared_ptr<Instance>> windows;
  explicit Host(State& state):state(state){}
  void createForm(const std::shared_ptr<Instance>& f)override {
    assert(f->formInitialized);windows[f.get()]=f;++state.created;
  }
  Value formCall(const std::shared_ptr<Instance>& f,const std::string& name,Args)override {
    if(name=="__unload"){windows.erase(f.get());return {};}
    if(name=="show"){assert(windows.count(f.get()));return {};}
    fail(438);
  }
  bool hasOpenForms()const noexcept override{return !windows.empty();}
  int run(Runtime& rt)override {
    ++state.loops;
    while(!windows.empty()){
      auto form=windows.begin()->second;rt.unload(form);
      assert(!form->loaded);
    }
    return 0;
  }
  void shutdown()override {
    ++state.shutdowns;
    for(auto& item:windows){item.second->loaded=false;item.second->controls.clear();}
    windows.clear();
  }
};
void proc(Module& m,std::string name,std::function<Value(Frame&)> code,std::vector<Parameter> params={}) {
  Procedure p;p.name=name;p.code=std::move(code);p.parameters=std::move(params);
  m.procedures[lower(name)]=std::move(p);
}
void install(Runtime& rt,State& state) {
  Module m;m.name="Main";m.kind="module";
  m.initialize=[](Frame& f){
    f.global("first","object");f.global("alias","object");f.global("scalar","long");
    f.global("items","object",{{0,1}},2);
  };
  m.publicFields.insert("scalar");
  rt.modules["main"]=std::move(m);
  Module p;p.name="Probe";p.kind="class";
  p.initialize=[](Frame& f){f.global("id","long");};
  proc(p,"Class_Terminate",[&state](Frame& f){
    assert(!f.runtime.ending&&state.shutdowns==0);
    state.terminated.push_back(int(f.get("id").integral()));
    if(state.failTerminate)fail(5,"deliberate finalizer failure");
    if(state.recreate){
      if(state.recreate>0)--state.recreate;
      auto next=f.runtime.instance("probe",true);
      next->fields.at("id")->set(Value::integer(99));
      f.runtime.instance("main")->fields.at("first")->set(Value::object(next),true);
    }
    return Value{};
  });
  rt.modules["probe"]=std::move(p);
  Module form;form.name="Form1";form.kind="form";
  form.form=ControlSpec{"Form1","Form","",{},-1};
  form.initialize=[](Frame& f){f.global("value","long");};
  form.publicFields.insert("value");
  proc(form,"Form_Initialize",[&state](Frame& f){
    ++state.initialized;assert(!f.self->loaded);
    assert(f.get("scalar").integral()==0);
    assert(f.call("abs",{Arg(Value::integer(-4))}).integral()==4);
    assert(!f.self->loaded);
    if(state.failInitialize)fail(5,"deliberate initializer failure");
    return Value{};
  });
  proc(form,"userget:get",[](Frame& f){return f.get("value");});
  proc(form,"Form_Load",[&state](Frame&){++state.loaded;return Value{};});
  proc(form,"Form_QueryUnload",[&state](Frame& f){
    ++state.queries;state.lastMode=int(f.get("UnloadMode").integral());
    if(state.cancelQuery)f.ref("Cancel").set(Value::integer(-1,Type::Integer));
    return Value{};
  },{{"Cancel","integer",true,false,false,false,{}},{"UnloadMode","integer",false,false,false,false,{}}});
  proc(form,"Form_Unload",[&state](Frame& f){
    ++state.unloaded;
    if(state.cancelUnload)f.ref("Cancel").set(Value::integer(-1,Type::Integer));
    return Value{};
  },{{"Cancel","integer",true,false,false,false,{}}});
  proc(form,"Form_Terminate",[&state](Frame&){
    assert(state.shutdowns==0);state.terminated.push_back(100);return Value{};
  });
  rt.modules["form1"]=std::move(form);
}
ObjectPtr probe(Runtime& rt,int id) {
  auto result=rt.instance("probe",true);
  result->fields.at("id")->set(Value::integer(id));
  return result;
}
void defaultFormVariables() {
  State state;Runtime rt(std::make_unique<Host>(state));install(rt,state);
  auto slot=rt.defaultFormRef("FORM1");
  slot.set(Value::object(nullptr),true);
  assert(state.initialized==0); // writing Nothing never materializes the form
  auto first=slot.get().asObject();
  assert(state.initialized==1&&state.created==0);
  auto instance=std::dynamic_pointer_cast<Instance>(first);
  assert(instance->get(rt,"userget").integral()==0);
  assert(state.created==0);
  rt.load(instance);rt.load(instance);
  assert(state.loaded==1&&state.created==1);
  state.cancelQuery=true;rt.unload(instance);
  assert(instance->loaded&&state.unloaded==0&&state.lastMode==1);
  state.cancelQuery=false;state.cancelUnload=true;rt.unload(instance,0);
  assert(instance->loaded&&state.unloaded==1&&state.lastMode==0);
  state.cancelUnload=false;rt.unload(instance);
  assert(!instance->loaded&&state.unloaded==2);
  assert(sameObject(slot.get().asObject(),first));
  slot.set(Value::object(nullptr),true);drainNativeFinalizers(rt);
  assert(state.terminated.empty()); // explicit alias is still an owner
  auto second=slot.get().asObject();
  assert(!sameObject(first,second)&&state.initialized==2);
  first.reset();instance.reset();drainNativeFinalizers(rt);
  assert((state.terminated==std::vector<int>{100}));
  try{slot.set(Value::object(probe(rt,1)),true);assert(false);}catch(const Error& e){assert(e.number==13);}
  assert(sameObject(slot.get().asObject(),second));
  Frame frame(rt,rt.instance("main"));
  assert(sameObject(frame.ref("Form1").get().asObject(),second));
  second.reset();slot.set(Value::object(nullptr),true);drainNativeFinalizers(rt);
  assert(std::count(state.terminated.begin(),state.terminated.end(),100)==2);
}
void failedFormInitialization() {
  State state;Runtime rt(std::make_unique<Host>(state));install(rt,state);
  state.failInitialize=true;
  try{rt.instance("form1");assert(false);}catch(const Error& e){assert(e.number==5);}
  drainNativeFinalizers(rt);
  assert(state.created==0&&state.terminated.empty()&&!rt.instances.count("form1"));
  state.failInitialize=false;
  auto form=rt.instance("form1");
  assert(state.initialized==2&&!form->loaded);
  rt.load(form);assert(state.created==1);
  rt.unload(form);form.reset();rt.defaultFormRef("form1").set(Value::object(nullptr),true);
  drainNativeFinalizers(rt);assert((state.terminated==std::vector<int>{100}));
}
void normalRoots(bool abrupt,bool failed) {
  State state;Runtime rt(std::make_unique<Host>(state));install(rt,state);rt.startup="Sub Main";
  proc(rt.modules.at("main"),"Main",[&](Frame& f){
    f.ref("first").set(Value::object(probe(rt,1)),true);
    f.ref("alias").set(f.get("first"),true);
    f.declare("saved","object",{},0,0,false,true);
    f.ref("saved").set(Value::object(probe(rt,2)),true);
    auto array=f.get("items").asArray();
    array->at({Value::integer(0)}).set(Value::object(probe(rt,3)),true);
    auto record=std::make_shared<Record>();record->name="Record";
    record->fields["nested"]=std::make_shared<Cell>(Value::object(probe(rt,4)),"object");
    f.self->fields["record"]=std::make_shared<Cell>(Value::record(record),"Record");
    f.runtime.files[7]=nullptr;f.runtime.error.number=53;
    if(abrupt)throw EndExecution{};
    if(failed)fail(11,"deliberate program failure");
    return Value{};
  });
  bool caught=false;try{rt.run();}catch(const Error& e){caught=true;assert(e.number==11&&failed);}
  assert(caught==failed&&rt.finished&&rt.ending&&rt.instances.empty()&&rt.files.empty());
  assert(state.shutdowns==1);
  if(abrupt||failed)assert(state.terminated.empty());
  else {std::sort(state.terminated.begin(),state.terminated.end());assert((state.terminated==std::vector<int>{1,2,3,4}));}
  assert(rt.finish());rt.stop();assert(state.shutdowns==1);
}
void defaultFormShutdown() {
  State state;Runtime rt(std::make_unique<Host>(state));install(rt,state);rt.startup="Form1";
  rt.run();
  assert(state.initialized==1&&state.loaded==1&&state.unloaded==1&&state.queries==1);
  assert((state.terminated==std::vector<int>{100})&&state.shutdowns==1);
}
void startupUnloadsItself() {
  State state;Runtime rt(std::make_unique<Host>(state));install(rt,state);rt.startup="Form1";
  proc(rt.modules.at("form1"),"Form_Load",[&](Frame& f){++state.loaded;f.runtime.unload(f.self);return Value{};});
  rt.run();assert(state.loaded==1&&state.created==1&&state.unloaded==1);
  assert((state.terminated==std::vector<int>{100})&&state.shutdowns==1);
}
void finalizerRoots(int recreate,bool failure) {
  State state;Runtime rt(std::make_unique<Host>(state));install(rt,state);rt.startup="Sub Main";
  state.recreate=recreate;state.failTerminate=failure;
  proc(rt.modules.at("main"),"Main",[&](Frame& f){f.ref("first").set(Value::object(probe(rt,1)),true);return Value{};});
  try{rt.run();assert(recreate>=0&&!failure);}
  catch(const Error& e){assert(e.number==(failure?5:28));assert(failure||recreate<0);}
  assert(rt.finished&&state.shutdowns==1&&rt.depth==0);
  if(recreate==2)assert(state.terminated.size()==3);
  if(recreate<0)assert(state.terminated.size()>=1024);
}
void finalizerOpensWindow() {
  State state;Runtime rt(std::make_unique<Host>(state));install(rt,state);rt.startup="Sub Main";
  proc(rt.modules.at("probe"),"Class_Terminate",[&](Frame& f){
    state.terminated.push_back(1);f.runtime.load(f.runtime.instance("form1"));return Value{};
  });
  proc(rt.modules.at("main"),"Main",[&](Frame& f){f.ref("first").set(Value::object(probe(rt,1)),true);return Value{};});
  rt.run();
  assert(state.loops==2&&state.loaded==1&&state.unloaded==1&&state.shutdowns==1);
  assert((state.terminated==std::vector<int>{1,100}));
}
}
int main(){
  defaultFormVariables();failedFormInitialization();
  normalRoots(false,false);normalRoots(true,false);normalRoots(false,true);
  defaultFormShutdown();startupUnloadsItself();finalizerRoots(2,false);finalizerRoots(0,true);
  finalizerRoots(-1,false);finalizerOpensWindow();
  std::cout<<"NATIVE_PROGRAM_LIFETIME_OK\n";
}
