/** Win32 standard DLGTEMPLATE, in dialog units, with original system controls.
 * Source emits the template, not a captured executable or HTML dialog.
 * https://learn.microsoft.com/windows/win32/api/winuser/ns-winuser-dlgtemplate
 */
export function nativeInputBoxTemplate(section,label){
 section.align(4).label(label).u32(0x80c800c0).u32(0).u16(4).u16(0).u16(0).u16(250).u16(105)
  .u16(0).u16(0).u16(0).u16(8).utf16('MS Shell Dlg');
 const item=(id,klass,text,x,y,w,h,style,ex=0)=>{
  section.align(4).u32(style).u32(ex).u16(x).u16(y).u16(w).u16(h).u16(id)
   .u16(0xffff).u16(klass).utf16(text).u16(0);
 };
 item(1001,0x82,'',7,7,173,62,0x50000080); // SS_NOPREFIX: prompt ampersands are text.
 item(1002,0x81,'',7,82,236,14,0x50010080,0x200); // one-line, tab stop, auto-scroll.
 item(1,0x80,'OK',187,7,56,14,0x50010001);
 item(2,0x80,'Cancel',187,27,56,14,0x50010000);
 return label;
}
