/** Actual Windows class/reflection and String mutation acceptance. Assertions
 * observe authored results and HWND text, never read the private class header.
 */
export function nativeClassFixtures(fixture){return [classInstances(fixture),classStrings(fixture)];}
function classInstances(fixture){
 const f=fixture('AotControlClasses'),{add,check,finish,project}=f;
 add('Dim a As New Counter,b As New Counter,alias As Counter,n As Long,value As Variant,name As String');
 add('n=a.NextValue()');check('n=1 And a.NextValue()=2 And b.NextValue()=1','two native class instances keep independent procedure Static state');
 add('Set alias=a\nSet a=Nothing');check('alias.NextValue()=3 And a.NextValue()=1','aliases preserve the old class and As New re-creates only its variable');
 check('Not (a Is b) And TypeOf alias Is Counter And VarType(alias)=vbObject And IsObject(alias)','typed class identity is distinct from scalar storage');
 add('alias.Value=40');check('alias.Value=40 And alias.NextValue()=4','Property Get/Let uses the same hidden receiver as ordinary methods');
 add('name="nextvalue"\nn=CallByName(alias,name,vbMethod)');check('n=5','runtime CallByName selects a case-insensitive compiled class method');
 add('CallByName alias,"Value",vbLet,71');check('CallByName(alias,"VALUE",vbGet)=71','runtime property dispatch reads and writes the addressed instance');
 add('n=CallByName(alias,"Sum",vbMethod,7,8)');check('n=15','late-dispatched scalar arguments use the typed method ABI');
 add('On Error Resume Next\nErr.Clear\nn=CallByName(alias,"Missing",vbMethod)');check('Err.Number=438','missing dynamic class members retain explicit runtime diagnostics');
 add('Err.Clear\nn=CallByName(alias,"Sum",vbMethod,7)');check('Err.Number=450','dynamic method arity is checked before entering the method');
 add('Err.Clear\nOn Error GoTo 0\nDim live As New Lifetime,kept As Lifetime\nname=live.Title\nSet kept=live.Self()');check('name="initial" And started=1 And live Is kept','Class_Initialize runs once and a typed class function returns the same owned identity');
 add('Take live\nClear (live)');check('live.Title="changed"','ByVal parameters mutate the instance but grouped ByRef parameters do not replace the original slot');
 add('Clear live');check('kept.Title="changed" And finished=0','replacing one reference does not terminate an object retained by an alias');
 add('Set kept=Nothing');check('finished=1','the final release invokes Class_Terminate once');
 add('On Error Resume Next\nErr.Clear\nDim failed As Failing\nSet failed=New Failing');check('Err.Number=903 And Err.Source="initializer" And Err.Description="owned failure" And failed Is Nothing','failed initialization preserves custom Err while rolling back the unpublished object');
 add('Err.Clear\nOn Error GoTo 0\nFor n=1 To 100\n Set live=New Lifetime\n live.Title=String$(1024,"x")\n Set live=Nothing\nNext');check('started=101 And finished=101','repeated native allocation, owned strings and release retain exact lifecycle counts');
 add('Set a=Nothing\nSet b=Nothing\nSet alias=Nothing');
 const result=finish('Public started As Long,finished As Long',`Private Sub Take(ByVal value As Lifetime)
 value.Title="changed"
 Set value=Nothing
End Sub
Private Sub Clear(ByRef value As Lifetime)
 Set value=Nothing
End Sub`);
 project.modules.push({id:'counter',kind:'class',name:'Counter',code:`Private total As Long
Public Function NextValue() As Long
 Static count As Long
 count=count+1
 NextValue=count
End Function
Public Function Sum(ByVal a As Long,ByRef b As Long) As Long
 Sum=a+b
End Function
Public Property Get Value() As Long
 Value=total
End Property
Public Property Let Value(ByVal value As Long)
 total=value
End Property`},{id:'lifetime',kind:'class',name:'Lifetime',code:`Private text As String
Private owned As New Collection
Private Sub Class_Initialize()
 started=started+1
 text="initial"
 owned.Add "owned"
End Sub
Private Sub Class_Terminate()
 finished=finished+1
End Sub
Public Property Get Title() As String
 Title=text
End Property
Public Property Let Title(ByVal value As String)
 text=value
End Property
Public Function Self() As Lifetime
 Set Self=Me
End Function`},{id:'failing',kind:'class',name:'Failing',code:`Private text As String
Private Sub Class_Initialize()
 text="owned"
 Err.Raise 903,"initializer","owned failure"
End Sub`});
 return result;
}
function classStrings(fixture){
 const {add,check,control,finish}=fixture('AotControlClassStrings');
 control('Label','CaptionTarget');
 add('Dim s As String,fixed As String * 10,v As Variant,name As String,n As Long,items(1 To 2) As String\ns="abcdef"\nMid$(s,2,2)="XYZ"');check('s="aXYdef"','Mid assigns a bounded source prefix without resizing the destination');
 add('fixed="abc"\nRSet fixed="xy"');check('fixed="        xy"','RSet right-aligns within fixed-width Unicode storage');
 add('LSet fixed="abcdefghijkl"');check('fixed="abcdefghij"','LSet truncates to destination width rather than extending it');
 add('v="A" & ChrW$(0) & "B"\nMid(v,2,1)=ChrW$(937)');check('v="A" & ChrW$(937) & "B"','Variant String mutation retains embedded NUL and Unicode semantics');
 add('LSet v="Z"');check('v="Z  "','LSet accepts Variant String destinations');
 add('RSet v="T"');check('v="  T"','RSet retains the original Variant String length');
 add('items(1)="12345"\nitems(2)="other"\nMid(items(1),2,2)="AB"');check('items(1)="1AB45" And items(2)="other"','String array element mutation writes only its captured pinned element');
 add('On Error Resume Next\nErr.Clear\nMid(s,0,1)="x"');check('Err.Number=5 And s="aXYdef"','invalid Mid start cannot modify existing storage');
 add('Err.Clear\nMid(s,1,-1)="x"');check('Err.Number=5 And s="aXYdef"','invalid Mid length cannot modify existing storage');
 add('Err.Clear\nv=42\nLSet v="x"');check('Err.Number=13 And v=42','non-String Variant destinations fail rather than becoming hidden numeric references');
 add('Err.Clear\nOn Error GoTo 0\nname="Caption"\nCallByName CaptionTarget,name,vbLet,"native " & ChrW$(937)');check('CaptionTarget.Caption="native " & ChrW$(937)','CallByName assigns actual native control text through the property implementation');
 check('CallByName(CaptionTarget,"CAPTION",vbGet)="native " & ChrW$(937)','CallByName reads counted Unicode from the actual HWND');
 add('s=String$(8192,"x")\nMid(s,8192)="long"');check('Len(s)=8192 And Right$(s,1)="l"','long mutation is bounded by the BSTR count instead of the window scratch-buffer limit');
 return finish();
}
