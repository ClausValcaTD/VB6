/** Boolean value types are independent of their physical -1/0 EAX encoding.
 * Keep predicates Boolean before Variant boxing and scalar string conversion.
 * Literal names are immutable BSTR constants; callers snapshot/own them through
 * ordinary String assignment/call rules. No allocation or locale state changes.
 * https://learn.microsoft.com/office/vba/language/concepts/getting-started/type-conversion-functions
 */
const collection=type=>['collection','vba.collection'].includes(type);
const reference=(c,node)=>c.nativeClassExpressionType(node)||collection(c.type(node));
export function nativeBooleanType(c,node){
 if(node.kind==='binary'&&['=','<>','<','<=','>','>='].includes(node.op))return 'boolean';
 if(node.kind==='binary'&&node.op==='is'&&(reference(c,node.left)||reference(c,node.right)))return 'boolean';
 if(node.kind==='typeof'&&reference(c,node.expr))return 'boolean';
 return null;
}
export function nativeBooleanText(c){
 const x=c.x,no=x.unique(),done=x.unique();
 x.test().branch('e',no).value(c.string('True')).jump(done).label(no).value(c.string('False')).label(done);
}
