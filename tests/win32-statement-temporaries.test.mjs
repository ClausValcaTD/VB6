import test from 'node:test';import assert from 'node:assert/strict';
import {beginNativeTemporaryStatement,endNativeTemporaryStatements,nativeStatementTemporary} from '../src/native/statement-temporaries.js';
import {collectionMachine} from './support/native-collection-machine.mjs';

test('statement owner pools reuse high-water slots only at explicit cleanup boundaries',()=>{
 const c={};let count=0;const allocate=()=>({offset:-4*(++count),type:'String'});
 const outside=nativeStatementTemporary(c,'string',allocate);
 beginNativeTemporaryStatement(c);
 const a=nativeStatementTemporary(c,'string',allocate),b=nativeStatementTemporary(c,'string',allocate);
 assert.notEqual(a.offset,b.offset);a.parameter=true;
 beginNativeTemporaryStatement(c);
 const again=nativeStatementTemporary(c,'string',allocate);assert.equal(again.offset,a.offset);assert.equal(again.parameter,undefined);
 const different=nativeStatementTemporary(c,'variant',allocate);assert.notEqual(different.offset,again.offset);
 assert.notEqual(outside.offset,again.offset);
 endNativeTemporaryStatements(c);assert.notEqual(nativeStatementTemporary(c,'string',allocate).offset,a.offset);
 assert.equal(count,5);
});
function frame(vm,label){
 let p=vm.symbol(label)+3,total=0;
 while(vm.memory.read(p,8)===0x81&&vm.memory.read(p+1,8)===0xec){total+=vm.memory.read(p+2);p+=10;}
 return total;
}
for(const optimization of [0,1,2]){
 test(`100 distinct string statements reuse owners without quadratic cleanup O${optimization}`,t=>{
  const h=collectionMachine(t,`Private result As String
Sub Main()
${Array(100).fill('result=result & "x"').join('\n')}
End Sub`,optimization);
  const addr=h.vm.memory.read(h.vm.symbol('iat:oleaut32.dll!SysFreeString')),callback=h.vm.hooks.get(addr).callback;let frees=0;
  h.vm.hook('oleaut32.dll','SysFreeString',1,args=>{frees++;return callback(args);});
  h.invoke();assert.equal(h.text('result'),'x'.repeat(100));assert.equal(h.owned().length,1);
  assert.ok(frame(h.vm,'proc:M:Main')<128,'frame growth depends on simultaneous owners, not statement count');
  assert.ok(frees<1000,'cleanup visits only the high-water owner set, not all 100 expressions');
 });
 test(`pooled String/Variant snapshots survive recursion, grouped ByRef and handler control flow O${optimization}`,t=>{
  const h=collectionMachine(t,`Private result As String,n As Long
Sub Main()
 Dim text As String,value As Variant,c As New Collection
 text="first":value="second"
 Change (text),(value)
 result=text & "/" & CStr(value)
 c.Add "kept"
 With c
  result=result & "/" & .Item(1)
  text=Echo("ab",3)
  result=result & "/" & text
 End With
 On Error GoTo Failed
 text="before"
 value=CVErr(13)
 text=CStr(value & "failure")
 result=result & "/" & text
 GoTo Done
Failed:
 n=Err.Number
 Resume Next
Done:
 Set c=Nothing
End Sub
Sub Change(ByRef text As String,ByRef value As Variant)
 text="changed":value="changed"
End Sub
Function Echo(ByVal text As String,ByVal count As Long) As String
 If count=0 Then
  Echo=text
 Else
  Echo=text & Echo(text,count-1)
 End If
End Function`,optimization);
  // VarCat's explicit foreign double mirrors invalid Error-to-text coercion.
  h.vm.hook('oleaut32.dll','VarCat',3,([a,b,out])=>{
   const av=h.read(a),bv=h.read(b);if(av.tag===10||bv.tag===10)return 0x80020005;
   return h.write(out,{tag:8,value:String(av.value)+String(bv.value)});
  });
  h.invoke();assert.equal(h.text('result'),'first/second/kept/abababab/before');assert.equal(h.number('n'),13);assert.equal(h.owned().length,1);
 });
}
