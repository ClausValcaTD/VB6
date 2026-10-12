import test from 'node:test';
import assert from 'node:assert/strict';
import {recordField,makeRecord,Cell,cloneValue,VBArray,tagScalar} from '../src/runtime/values.js';
import {VirtualMachine} from '../src/runtime/vm.js';

test('Record field lookup preserves exact storage for all source casings',()=>{
 const fields=new Map([['Amount',new Cell('Currency','1.2345')],['Count',new Cell('Long',7)]]),record=makeRecord('R',fields);
 for(const name of ['Amount','amount','AMOUNT','aMoUnT'])assert.equal(recordField(record,name),fields.get('Amount'));
 recordField(record,'COUNT').set(8);assert.equal(record.Count,8);
 assert.equal(recordField(record,'missing'),undefined);assert.equal(recordField({},'Amount'),undefined);
});
test('Cloned records do not share lookup caches or cells',()=>{
 const original=makeRecord('R',new Map([['Value',new Cell('Variant',tagScalar(7,'integer',true))]]));
 recordField(original,'value');const copy=cloneValue(original);recordField(copy,'VALUE').set(tagScalar(8,'long',true));
 assert.equal(original.Value,7);assert.equal(copy.Value,8);assert.equal(recordField(original,'value').getScalar().type,'integer');assert.equal(recordField(copy,'value').getScalar().type,'long');
});
test('Field-map growth and same-key replacement do not return stale cells',()=>{
 const fields=new Map([['Value',new Cell('Long',7)]]),record=makeRecord('R',fields);recordField(record,'VALUE');
 fields.set('Value',new Cell('Long',8));assert.equal(recordField(record,'VALUE').get(),8);
 fields.set('Other',new Cell('Long',9));assert.equal(recordField(record,'OTHER').get(),9);
 fields.delete('Other');fields.set('NewName',new Cell('Long',10));assert.equal(recordField(record,'OTHER'),undefined);assert.equal(recordField(record,'newname').get(),10);
});
test('Record array assignment retains field aliases and exact tags after lookup',()=>{
 const record=value=>makeRecord('R',new Map([['Value',new Cell('Variant',value)]]));
 const a=new VBArray([[0,0]],'R',()=>record(tagScalar(7,'integer',true)));
 const alias=recordField(a.get(0),'VALUE');a.set([0],record(tagScalar(8,'long',true)));
 assert.equal(alias,recordField(a.get(0),'value'));assert.equal(alias.get(),8);assert.equal(alias.getScalar().type,'long');
});
test('Wide record reads, writes and ByRef calls are case-insensitive in source execution',async()=>{
 const fields=Array.from({length:64},(_,i)=>'Field'+i+' As Long').join('\n');
 const code=`Private Type Wide\n${fields}\nEnd Type\nSub Bump(ByRef value As Long)\nvalue = value + 1\nEnd Sub\nSub Main()\nDim value As Wide, i As Long\nWith value\nFor i = 1 To 20\n.FIELD63 = .field63 + i\nNext\nBump .fIeLd63\nDebug.Print .Field63, TypeName(.FIELD63)\nEnd With\nEnd Sub`;
 const vm=new VirtualMachine({name:'RecordLookup',startup:'Sub Main',modules:[{name:'M',kind:'module',code}]},{print:s=>output.push(s)}),output=[];
 assert.deepEqual(vm.program.diagnostics,[]);await vm.start();assert.notEqual(vm.state,'error',vm.lastError?.message);assert.deepEqual(output,['211 Long']);vm.stop();
});
