/** Execute complete authored conversion/predicate code, with foreign Automation
 * calls explicitly doubled by the checked IA-32 harness. The Windows fixture
 * independently runs the same language contracts against real OleAut32/GDI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionMachine} from './support/native-collection-machine.mjs';
function machine(...args){
 const h=collectionMachine(...args);
 h.vm.hook('oleaut32.dll','VarBstrFromI4',4,([value,locale,flags,out])=>{
  assert.equal(locale,0x400);assert.equal(flags,0);
  h.vm.memory.write(out,h.vm.memory.string(String(value|0)));return 0;
 });
 return h;
}
for(const optimization of [0,1,2]) {
 test(`Boolean display text preserves its logical type and source evaluation count O${optimization}`,t=>{
  const h=machine(t,`Private text As String, count As Long, kinds As String
Private Sub Main()
 Dim flag As Boolean, value As Variant
 flag=True
 text=CStr(flag) & "/" & CStr(False) & "/" & CStr(Check()) & "/" & CStr(Check())
 text=text & "/" & (2=2) & "/" & ("x"="y") & "/" & (1.5<2.5)
 value=Not ("x"="y")
 kinds=TypeName(value) & "/" & TypeName("x"="y") & "/" & CStr(VarType(1.5<2.5))
 text=text & "/" & CStr(value)
 text=text & "/" & CStr(-1&) & "/" & CStr(0&)
End Sub
Private Function Check() As Boolean
 count=count+1
 Check=count=1
End Function`,optimization);
  h.invoke();assert.equal(h.text('text'),'True/False/True/False/True/False/True/True/-1/0');
  assert.equal(h.text('kinds'),'Boolean/Boolean/11');assert.equal(h.number('count'),2);assert.equal(h.owned().length,2);
 });
 test(`class Is/TypeOf return Boolean values for CStr, Not and Variant boxing O${optimization}`,t=>{
  const h=machine(t,`Private text As String, tags As String
Private Sub Main()
 Dim a As New Counter,b As Counter,value As Variant
 text=CStr(TypeOf a Is Counter) & "/" & CStr(TypeOf b Is Counter)
 text=text & "/" & CStr(a Is Nothing) & "/" & CStr(b Is Nothing) & "/" & CStr(Not (a Is Nothing))
 value=TypeOf a Is Counter
 tags=TypeName(value) & "/" & CStr(VarType(a Is b)) & "/" & CStr(VarType(Not (a Is b)))
 Set b=a
 text=text & "/" & CStr(a Is b)
End Sub`,optimization,[{id:'c',name:'Counter',kind:'class',code:'Public value As Long'}]);
  h.invoke();assert.equal(h.text('text'),'True/False/False/True/True/True');assert.equal(h.text('tags'),'Boolean/11/11');assert.equal(h.owned().length,2);
 });
 test(`Collection reference predicates retain Boolean text and boxed subtype O${optimization}`,t=>{
  const h=machine(t,`Private text As String, tags As String
Private Sub Main()
 Dim a As New Collection,b As Collection,value As Variant
 text=CStr(TypeOf a Is Collection) & "/" & CStr(TypeOf b Is Collection)
 text=text & "/" & CStr(a Is Nothing) & "/" & CStr(b Is Nothing) & "/" & CStr(Not (a Is Nothing))
 value=a Is b
 tags=TypeName(value) & "/" & CStr(VarType(TypeOf a Is Collection))
 Set b=a
 text=text & "/" & CStr(a Is b)
End Sub`,optimization);
  h.invoke();assert.equal(h.text('text'),'True/False/False/True/True/True');assert.equal(h.text('tags'),'Boolean/11');assert.equal(h.owned().length,2);
 });
}
