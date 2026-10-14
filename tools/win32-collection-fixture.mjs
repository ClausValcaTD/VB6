/** Real Win32 acceptance of authored Collection methods and ownership. No
 * Collection runtime entrypoint is hooked; checks use source-visible results.
 * Allocation/error injection is independently covered by the checked IA-32 tests.
 */
export function nativeCollectionFixtures(fixture){return [collectionValues(fixture),collectionOwnership(fixture)];}
function collectionValues(fixture){
 const {add,check,finish}=fixture('AotControlCollectionValues');
 add('Dim c As New Collection,a As Collection,b As Collection,item As Variant,nested As Variant,s As String,n As Long,values(1 To 2) As Long,v As Variant');
 check('c.Count=0 And IsObject(c) And VarType(c)=vbObject And TypeName(c)="Collection"','lazy Collection creation retains its object type rather than becoming a Long');
 add('c.Add "a","first"\nc.Add "c","last"\nc.Add "b",before:="LAST"\nc.Add "d",after:=3');
 check('c.Count=4 And c(1)="a" And c.Item(2)="b" And c("last")="c" And c(4)="d"','keyed/default Item and before/after preserve ordered one-based indexing');
 check('c.Item(index:="FIRST")="a"','named Item arguments preserve case-insensitive key lookup');
 add('s=""\nFor Each item In c\n s=s & CStr(item)\nNext');
 check('s="abcd"','For Each enumerates every current member in order');
 add('Set a=c\nSet c=Nothing');
 check('a.Count=4 And c.Count=0','an alias keeps the old collection and As New re-creates only its own variable');
 check('Not (a Is c) And TypeOf a Is Collection','Collection identities are distinct from numeric values');
 add('a.Remove "first"\na.Remove 1');
 check('a.Count=2 And a(1)="c" And a(2)="d"','Remove unlinks keyed/indexed nodes and reindexes remaining values');
 add('c.Add "x" & ChrW$(0) & ChrW$(937) & ChrW$(20013),"key" & ChrW$(0) & "tail"');
 check('Len(c("KEY" & ChrW$(0) & "TAIL"))=4 And AscW(Mid$(c(1),3,1))=937','keys and values retain counted embedded NUL and Unicode characters');
 add('s=String$(8192,"q") & ChrW$(937)\nc.Add s,"long"\ns="changed"');
 check('Len(c("long"))=8193 And Right$(c("long"),1)=ChrW$(937)','stored long Strings own a snapshot independent of the caller variable');
 add('c.Add 12,"integer"\nc.Add 70000&,"longnum"\nc.Add True,"bool"\nc.Add CCur(123.25),"currency"\nc.Add CDec(42),"decimal"\nc.Add DateSerial(2032,2,29),"date"\nc.Add Null,"null"\nc.Add Empty,"empty"');
 check('VarType(c("integer"))=vbInteger And VarType(c("longnum"))=vbLong And c("bool")=True','Collection keeps native Automation scalar subtypes');
 check('VarType(c("currency"))=vbCurrency And c("currency")=123.25@ And VarType(c("decimal"))=vbDecimal','Currency and Decimal items do not lose their tagged storage');
 check('VarType(c("date"))=vbDate And Day(c("date"))=29 And IsNull(c("null")) And IsEmpty(c("empty"))','Date, Null and Empty remain distinct Collection values');
 add('values(1)=11\nvalues(2)=22\nc.Add values,"array"\nvalues(1)=99\nv=c("array")');
 check('IsArray(v) And LBound(v)=1 And UBound(v)=2 And v(1)=11 And v(2)=22','array items own an independent SAFEARRAY snapshot');
 add('v(1)=77\nv=c("array")');
 check('v(1)=11','retrieving a scalar/array Item does not expose mutable Collection backing');
 return finish();
}
function collectionOwnership(fixture){
 const {add,check,finish}=fixture('AotControlCollections');
 add('Dim c As New Collection,a As Collection,b As Collection,item As Variant,nested As Variant,s As String,n As Long,v As Variant');
 add('c.Add "kept","long"\nFor n=1 To 10\n c.Add n\nNext\nSet a=New Collection\na.Add "c"\na.Add "d"');
 add('v=Empty\nOn Error Resume Next\nErr.Clear\nc.Add "duplicate","LONG"');
 check('Err.Number=457 And Err.Description="This key is already associated with an element of this collection"','duplicate keys fail with the native error description without publishing another node');
 add('n=c.Count');
 check('Err.Number=457 And n=11','successful Collection calls preserve the caller error rather than clearing it');
 add('Err.Clear\nc.Add "bad",before:=1,after:=1');check('Err.Number=5 And c.Count=11','conflicting insertion positions leave the collection unchanged');
 add('Err.Clear\nc.Remove 0');check('Err.Number=5 And c.Count=11','out-of-range removal is rejected before changing links');
 add('Err.Clear\nc.Add "bad",before:="missing"');check('Err.Number=5 And c.Count=11','unresolved relative keys cannot publish partial entries');
 add('Err.Clear\nc.Add "bad",Null');check('Err.Number=94 And c.Count=11','Null keys raise the native invalid-use-of-Null error');
 add('Err.Clear\nSet b=Nothing\ns=b(1)');check('Err.Number=91 And TypeName(b)="Nothing"','null receivers raise error 91 and remain typed null references');
 add('Err.Clear\nErr.Raise 901,"custom source","custom description","custom help",42\nn=c.Count');
 check('Err.Number=901 And Err.Source="custom source" And Err.Description="custom description" And Err.HelpFile="custom help" And Err.HelpContext=42','private service calls preserve complete owned caller error metadata');
 add('Err.Clear\nLeaf\nn=c.Count');check('Err.Number=902 And Err.Description="raising leaf"','cleanup of a raising callee does not erase or replace its pending error');
 add('Err.Clear\nOn Error GoTo 0\nTake a');check('a.Count=3 And a(3)="shared"','ByVal Collection parameters share object identity without sharing their variable slot');
 add('Clear (a)');check('a.Count=3','parenthesized ByRef Collection arguments mutate an isolated reference slot');
 add('Set b=Identity(a)\nClear a');check('b.Count=3 And a Is Nothing','function-return transfer and ordinary ByRef replacement preserve independent owners');
 add('Set a=New Collection\na.Add "one"\ns=""\nWith a\n .Add "two"\n s=.Item(1) & .Item(2)\nEnd With');check('s="onetwo" And a.Count=2','With pins a typed Collection for member calls and default values');
 add('sequence=0\nSet receiver=New Collection\nSet kept=receiver\nreceiver.Add key:=Mark(1,"key"),item:=ReplaceReceiver()');
 check('sequence=12 And kept.Count=1 And receiver.Count=0 And kept("key")="snapshot"','named operands evaluate once in source order after the receiver has been pinned');
 add('Set receiver=Nothing\nSet kept=Nothing\nSet a=New Collection\na.Add "a"\na.Add "c"\ns=""\nFor Each item In a\n s=s & CStr(item)\n If item="a" Then\n  a.Add "b",before:=2\n  a.Remove 1\n End If\nNext');check('s="abc"','enumeration remains valid while the current member is removed and a pending member is inserted');
 add('n=0\nFor Each item In a\n For Each nested In a\n  n=n+1\n  Exit For\n Next\nNext');check('n=2','nested enumerators have independent positions and Exit For cleanup');
 add('s=""\nFor Each item In a\n Set a=Nothing\n s=s & CStr(item)\nNext');check('s="bc" And a Is Nothing','an active cursor retains its collection after the last authored reference is released');
 add('Set a=New Collection\na.Add "temporary"\nFor Each item In a\n Set a=Nothing\n GoTo Finished\nNext\nFinished:');check('a Is Nothing','an explicit jump out of enumeration releases its cursor without resuming a dead iterator');
 add('n=Len(StaticText())+Len(StaticText())');check('n=3','static Collection variables retain their own state between activations');
 add('For n=1 To 150\n Set a=New Collection\n a.Add String$(2048,"z"),"value"\n a.Remove "value"\n Set a=Nothing\nNext');check('a Is Nothing And b.Count=3','repeated native allocation/removal/release leaves other aliases usable');
 add('Set a=Nothing\nSet b=Nothing\nSet c=Nothing');
 return finish('Private receiver As Collection,kept As Collection,sequence As Long',`Private Sub Take(ByVal c As Collection)
 c.Add "shared"
 Set c=Nothing
End Sub
Private Sub Clear(ByRef c As Collection)
 Set c=Nothing
End Sub
Private Function Identity(ByVal c As Collection) As Collection
 Set Identity=c
End Function
Private Sub Leaf()
 Dim c As New Collection
 c.Add "owned by pending failure"
 Err.Raise 902,"leaf","raising leaf"
End Sub
Private Function Mark(ByVal digit As Long,ByVal value As String) As String
 sequence=sequence*10+digit
 Mark=value
End Function
Private Function ReplaceReceiver() As String
 sequence=sequence*10+2
 Set receiver=New Collection
 ReplaceReceiver="snapshot"
End Function
Private Function StaticText() As String
 Static c As New Collection
 c.Add "x"
 If c.Count=1 Then StaticText="x" Else StaticText="xx"
End Function`);
}
