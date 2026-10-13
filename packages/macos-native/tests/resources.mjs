/** Portable RES/FRX fixtures; no platform image generation or proprietary assets. */
import {setResource,setResourceString} from '../../../src/project/res.js';
import {toBase64,writeFRXRecord} from '../../../src/project/frx.js';
export function bitmapBytes(){
  const b=new Uint8Array(70),v=new DataView(b.buffer);b.set([66,77]);v.setUint32(2,b.length,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,2,true);v.setInt32(22,2,true);v.setUint16(26,1,true);v.setUint16(28,24,true);
  b.set([255,0,0,255,255,255,0,0,0,0,255,0,255,0,0,0],54);return b;
}
export function iconBytes(cursor=false){
  const size=16,stride=4,b=new Uint8Array(22+40+size*size*4+stride*size),v=new DataView(b.buffer);
  v.setUint16(2,cursor?2:1,true);v.setUint16(4,1,true);b[6]=b[7]=size;v.setUint16(10,cursor?3:1,true);v.setUint16(12,cursor?5:32,true);v.setUint32(14,b.length-22,true);v.setUint32(18,22,true);
  v.setUint32(22,40,true);v.setInt32(26,size,true);v.setInt32(30,size*2,true);v.setUint16(34,1,true);v.setUint16(36,32,true);
  for(let i=0;i<size*size;i++)b.set([0,0,255,255],62+i*4);return b;
}
export function resourceModel(){
  let m=setResourceString(null,0,'zero');m=setResourceString(m,65535,'last');m=setResourceString(m,101,'English',1033);m=setResourceString(m,101,'Zażółć\0🙂',1045);
  for(const [name,type,data]of [[101,10,new Uint8Array([0,1,127,128,255])],['101',10,new Uint8Array([33])],['日本語🙂','CUSTOM Ω',new Uint8Array([9,0,8])],['empty',10,new Uint8Array()],[202,2,bitmapBytes().slice(14)]])m=setResource(m,{type,name,data:toBase64(data)});
  for(const cursor of [false,true]){
    const ico=iconBytes(cursor),image=ico.slice(22),component=cursor?new Uint8Array([3,0,5,0,...image]):image,group=new Uint8Array(20),v=new DataView(group.buffer);
    v.setUint16(2,cursor?2:1,true);v.setUint16(4,1,true);if(cursor){v.setUint16(6,16,true);v.setUint16(8,16,true);}else group.set([16,16],6);
    v.setUint16(10,1,true);v.setUint16(12,32,true);v.setUint32(14,component.length,true);v.setUint16(18,cursor?12:11,true);
    m=setResource(m,{type:cursor?1:3,name:cursor?12:11,language:1045,data:toBase64(component)});
    m=setResource(m,{type:cursor?12:14,name:cursor?204:203,language:1045,data:toBase64(group)});
  }
  return m;
}
export function resourceModule(){return {name:'NativeResourceChecks',kind:'module',code:`Option Explicit
Public Sub CheckNativeResources()
  Dim id As Long, format As Long, data() As Byte, other() As Byte
  id = 101
  format = 10
  Debug.Assert LoadResString(index:=id) = "Zażółć" & ChrW(0) & "🙂"
  Debug.Assert Len(LoadResString(id)) = 9
  Debug.Assert LoadResString(0) = "zero"
  Debug.Assert LoadResString(65535) = "last"
  Debug.Assert LoadResString(102) = ""
  data = LoadResData(format:=format, index:=id)
  Debug.Assert LBound(data) = 0
  Debug.Assert UBound(data) = 4
  Debug.Assert VarType(data) = 8209
  Debug.Assert TypeName(data) = "Byte()"
  Debug.Assert data(0) = 0 And data(4) = 255
  data(0) = 88
  other = LoadResData(id, format)
  Debug.Assert other(0) = 0
  ReDim Preserve data(0 To 6)
  Debug.Assert UBound(other) = 4
  other = LoadResData("101", format)
  Debug.Assert other(0) = 33
  other = LoadResData("日本語🙂", "CUSTOM Ω")
  Debug.Assert UBound(other) = 2 And other(1) = 0
  other = LoadResData("empty", 10)
  Debug.Assert IsArray(other)
  Debug.Assert UBound(other) = -1
  On Error Resume Next
  Debug.Print LoadResString(999)
  On Error GoTo 0
  Debug.Assert Err.Number = 326
  Err.Clear
  On Error Resume Next
  Debug.Print LoadResString(-1)
  On Error GoTo 0
  Debug.Assert Err.Number = 5
  Err.Clear
  On Error Resume Next
  Debug.Print LoadResString("101")
  On Error GoTo 0
  Debug.Assert Err.Number = 13
  Err.Clear
  Debug.Print "NATIVE_RESOURCES_OK"
End Sub`};}
export function resourceProject(){return {schema:1,name:'NativeResources',startup:'Sub Main',settings:{resourceLanguage:1045},resources:resourceModel(),modules:[resourceModule(),{name:'Main',kind:'module',code:'Sub Main()\nCheckNativeResources\nEnd Sub'}]};}
export function resourceFormProject(){
  const p=resourceProject();p.name='NativeResourceForm';p.modules[1].code='Sub Main()\nCheckNativeResources\nLoad Form1\nEnd Sub';
  const pic=writeFRXRecord(bitmapBytes(),'picture'),text=writeFRXRecord('Résumé\r\nResource text','text32'),list=writeFRXRecord(['Alpha','Bêta'],'list');
  const frx=new Uint8Array(pic.length+text.length+list.length);frx.set(pic);frx.set(text,pic.length);frx.set(list,pic.length+text.length);
  p.assets={'Forms/Form1.frx':{encoding:'base64',data:toBase64(frx)}};
  const rectangle={Left:0,Top:0,Width:1800,Height:900,Visible:true,Enabled:true};
  const model=(name,type,properties)=>({name,type,properties:{...rectangle,...properties}});
  p.modules.push({name:'Form1',kind:'form',sourcePath:'Forms/Form1.frm',form:{name:'Form1',type:'Form',properties:{Caption:'Native resource fidelity',ClientWidth:4500,ClientHeight:3000,Icon:'data:image/x-icon;base64,'+toBase64(iconBytes())},controls:[
    model('Image1','Image',{Stretch:true,Picture:{resource:'Form1.frx',offset:'0000'},MousePointer:99,MouseIcon:'data:image/x-cursor;base64,'+toBase64(iconBytes(true))}),
    model('Picture1','PictureBox',{Picture:{resource:'Form1.frx',offset:'0000'}}),
    model('Button1','CommandButton',{Caption:'Picture button',Picture:{resource:'Form1.frx',offset:'0000'},Style:1}),
    model('Text1','TextBox',{MultiLine:true,Text:{resource:'Form1.frx',offset:pic.length,text:true}}),
    model('List1','ListBox',{List:{resource:'Form1.frx',offset:pic.length+text.length}})
  ]},code:`Private Sub Form_Load()
  Debug.Assert Image1.Picture.Type = 1
  Debug.Assert Image1.Picture.Width = 53
  Debug.Assert Picture1.Picture.Height = 53
  Debug.Assert Button1.Picture.Handle <> 0
  Debug.Assert Me.Icon.Type = 3
  Debug.Assert Image1.MouseIcon.Type = 3
  Debug.Assert Text1.Text = "Résumé" & vbCrLf & "Resource text"
  Debug.Assert List1.ListCount = 2
  Debug.Assert List1.List(1) = "Bêta"
  Dim pic As Object, copied As Object
  Set pic = LoadResPicture(202)
  Debug.Assert pic.Type = 1
  Set Image1.Picture = pic
  Set Picture1.Picture = Image1.Picture
  Set copied = Picture1.Picture
  Set pic = Nothing
  Set Image1.Picture = Nothing
  Debug.Assert copied.Handle <> 0
  Debug.Assert copied.Width = 53
  Set pic = LoadResPicture(format:=vbResIcon, index:=203)
  Debug.Assert pic.Type = 3
  Set Me.Icon = pic
  Set Image1.MouseIcon = LoadResPicture(204, vbResCursor)
  On Error Resume Next
  Set Me.Icon = copied
  On Error GoTo 0
  Debug.Assert Err.Number = 485
  Err.Clear
  Debug.Assert Me.Icon Is pic
  SavePicture pic, "native-resource-icon.ico"
  Set pic = LoadPicture("native-resource-icon.ico")
  Debug.Assert pic.Type = 3
  Kill "native-resource-icon.ico"
  SavePicture Image1.MouseIcon, "native-resource-cursor.cur"
  Set pic = LoadPicture("native-resource-cursor.cur")
  Debug.Assert pic.Type = 3
  Set Image1.MouseIcon = pic
  Kill "native-resource-cursor.cur"
  SavePicture copied, "native-resource-picture.png"
  Set pic = LoadPicture("native-resource-picture.png")
  Debug.Assert pic.Type = 1
  Debug.Assert pic.Width = 53
  Debug.Assert pic.Height = 53
  Kill "native-resource-picture.png"
  Set pic = LoadPicture()
  Debug.Assert pic.Type = 0
  Debug.Print "NATIVE_RESOURCE_FORM_OK"
  Unload Me
End Sub`});return p;
}
