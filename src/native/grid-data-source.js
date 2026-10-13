/** ADO Recordset -> native grid binding. Clone traversal preserves the authored
 * cursor. Headers/GetRows become one bounded owned String vector; publication
 * checks the captured HWND, generation and grid data version before swapping.
 * The original sample's assignment syntax is retained (with or without Set).
 */
import {emitNativeGridDataPack} from './grid-data-pack.js';
import {NATIVE_GRID_FIELDS as F} from './control-grid-contract.js';
import {mem32} from './x86-operands.js';
const key=v=>String(v).toLowerCase(),arg=argument=>({argument}),at=(base,displacement=0)=>mem32({base,displacement});
const source=`Option Explicit
Private Function Pack(ByRef output As Long, ByRef headers() As String, ByVal body As Variant, ByVal columns As Long, ByVal records As Long) As Long
End Function
Private Sub CheckResult(ByVal result As Long)
End Sub
Private Sub FreeCells(ByVal cells As Long)
End Sub
Private Function EmptyCells() As Long
End Function
Private Sub Publish(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal version As Long, ByRef cells As Long, ByVal rows As Long, ByVal columns As Long)
End Sub
Private Sub Bind(ByVal id As Long, ByVal hwnd As Long, ByVal epoch As Long, ByVal version As Long, ByVal recordset As Variant)
 Dim reader As Variant, fields As Variant, body As Variant, headers() As String
 Dim columns As Long, records As Long, limit As Long, i As Long, cells As Long, hr As Long
 Dim code As Long, description As String, origin As String, helpfile As String, helpcontext As Long
 On Error GoTo Failed
 If recordset Is Nothing Then
  cells=EmptyCells()
  Publish id,hwnd,epoch,version,cells,0,1
 Else
  Set reader=recordset.Clone(1)
  reader.Filter=recordset.Filter
  reader.Sort=recordset.Sort
  Set fields=reader.Fields
  columns=CLng(fields.Count)
  If columns<1 Or columns>10000 Then Err.Raise 380
  limit=1048576 \\ columns-1
  If limit>100000 Then limit=100000
  ReDim headers(0 To columns-1)
  For i=0 To columns-1
   headers(i)=CStr(fields.Item((i)).Name)
  Next
  If Not (reader.BOF And reader.EOF) Then
   reader.MoveFirst
   body=reader.GetRows((limit+1))
   If Not IsArray(body) Then Err.Raise 13
   records=UBound(body,2)-LBound(body,2)+1
   If records>limit Then Err.Raise 7
  End If
  hr=Pack(cells,headers,body,columns,records)
  CheckResult hr
  reader.Close
  Set fields=Nothing
  Set reader=Nothing
  Publish id,hwnd,epoch,version,cells,records+1,columns
 End If
 Exit Sub
Failed:
 code=Err.Number
 description=Err.Description
 origin=Err.Source
 helpfile=Err.HelpFile
 helpcontext=Err.HelpContext
 On Error Resume Next
 FreeCells cells
 Set fields=Nothing
 Set reader=Nothing
 On Error GoTo 0
 Err.Raise code,origin,description,helpfile,helpcontext
End Sub`;
function boundControl(c,node){return node?.kind==='member'&&key(node.name)==='datasource'&&c.isNativeGrid(c.object(node.object))?c.object(node.object):null;}
function storage(c,control){
 if(!control.nativeBoundSource){
  c.useVariant();const label='grid-data-source:'+control.gridIndex;
  c.data.align(4).label(label).u32(9).zero(12);control.nativeBoundSource={label,type:'Variant'};
 }
 return control.nativeBoundSource;
}
function kernel(c){
 if(c.nativeGridDataKernel)return c.nativeGridDataKernel;
 const publish=c.gridProc('PublishData'),free=c.gridProc('bufferfree'),empty=c.gridProc('buffernew');
 const hosts={pack:emitNativeGridDataPack,
  checkresult:(c,p)=>c.x.label(p.label).enter().value(arg(8)).call('native:variant:check').leave(4),
  freecells:(c,p)=>c.x.label(p.label).enter().push(arg(8)).call(free.label).leave(4),
  emptycells:(c,p)=>c.x.label(p.label).enter().push(8).push(0).call(empty.label).leave(),
  publish:(c,p)=>{
   const x=c.x;x.label(p.label).enter().api('user32.dll','GetWindowLongW',[arg(12),-21]).test().branch('e','error:91')
    .cmp(at('eax',108),0).branch('ne','error:5'); // Preserve an active editor on rejected rebind.
   for(let i=6;i>=0;i--)x.push(arg(8+i*4));x.call(publish.label);c.checkNativeError('native:error:propagate');x.leave(28);
  }
 };
 c.nativeGridDataKernel=c.privateNativeKernel('NativeGridDataSource',source,hosts);return c.nativeGridDataKernel;
}
export function nativeGridDataType(c,node){return boundControl(c,node)?'variant':null;}
export function nativeGridDataGet(c,node){const control=boundControl(c,node);if(!control)return false;c.ensure(control);c.loadVariant(storage(c,control));return true;}
export function nativeGridDataAssignment(c,ins){
 if(ins.op!=='assign')return false;const control=boundControl(c,ins.target);if(!control)return false;
 if(!c.nativeAutomationMode)c.fail('Native grid DataSource requires an Automation Recordset');
 const x=c.x,bound=storage(c,control);c.ensure(control);
 // Capture grid identity/version before the RHS can call arbitrary COM code.
 const receiver=c.gridArgs(control).map(node=>{c.numeric(node);const v=c.arrayWorkspace(4,'grid-bind-receiver');x.mov(at('ebp',v.offset),'eax');return c.nativeKernelStorage(v);});
 c.invokeGrid('GetField',[...receiver,{kind:'literal',value:F.version}]);const version=c.arrayWorkspace(4,'grid-bind-version');x.mov(at('ebp',version.offset),'eax');
 const value=c.temporaryVariant();c.boxVariant(ins.expr);c.automationUse();x.call('native:automation:check-object');c.storeVariant(value);
 const k=kernel(c);c.invokePrivateNative(k,'Bind',[...receiver,c.nativeKernelStorage(version),c.nativeKernelStorage(value)]);
 // Move both owners without another COM allocation between data and source
 // publication. The old source is released by normal statement cleanup.
 const old=c.temporaryVariant();c.rawStorageAddress(old);x.mov('edi','eax');c.rawStorageAddress(bound);x.mov('esi','eax').mov('ecx',4).cld().repMove(32);
 c.rawStorageAddress(bound);x.mov('edi','eax');c.rawStorageAddress(value);x.mov('esi','eax').mov('ecx',4).repMove(32);
 c.rawStorageAddress(value);for(const offset of [0,4,8,12])x.mov(at('eax',offset),0);
 return true;
}
