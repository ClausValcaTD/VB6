import test from 'node:test';import assert from 'node:assert/strict';
import {gridBindingMachine,defineRecordset} from './support/native-grid-binding-machine.mjs';
for(const optimization of [0,1,2]){
 test(`whole native Recordset binding preserves cursor, sort, owned text and source identity O${optimization}`,t=>{
  const h=gridBindingMachine(t,`Set rs=CreateObject("Fake.Recordset")
G.DataSource=rs
If G.DataSource Is rs Then n=1`,optimization),r=defineRecordset(h);
  h.run();assert.equal(h.number('n'),1);assert.equal(h.get('rows'),3);assert.equal(h.get('cols'),2);
  assert.deepEqual([h.text(0,0),h.text(0,1),h.text(1,0),h.text(1,1),h.text(2,0),h.text(2,1)],['ID','Name','1','Alpha','2','Zulu']);
  assert.equal(r.records[0].cursor,1);assert.equal(r.records[1].sort,'Name ASC');assert.equal(r.records[1].closed,true);
  assert.equal(h.refs(),2,'one authored source plus the bound-source owner');assert.equal(h.arrays.size,7,'format and six data/metadata vectors; scalar grid state is inline');
  assert.equal(h.counts.SafeArrayAccessData,10,'constant bulk cell/metadata array lock count');
  h.drop();assert.equal(h.refs(),0);assert.equal(h.arrays.size,0,'all owned arrays are released');
 });
 test(`native bound text handles empty, Null, Unicode and counted embedded NUL O${optimization}`,t=>{
  const h=gridBindingMachine(t,'Set rs=CreateObject("Fake.Recordset")\nSet G.DataSource=rs',optimization);
  defineRecordset(h,{sort:'',rows:[[null,'Ω\0中'],[3,true]]});h.run();assert.equal(h.text(1,0),'');assert.equal(h.text(1,1),'Ω\0中');assert.equal(h.text(2,1),'True');h.drop();assert.equal(h.refs(),0);
 });
 test(`empty Recordset binds headers without trying to read past EOF O${optimization}`,t=>{
  const h=gridBindingMachine(t,'Set rs=CreateObject("Fake.Recordset")\nG.DataSource=rs',optimization),r=defineRecordset(h,{rows:[]});h.run();
  assert.equal(h.get('rows'),1);assert.equal(h.text(0,0),'ID');assert.ok(!h.trace.some(e=>e.name==='getrows'));assert.equal(r.records[0].cursor,1);h.drop();assert.equal(h.refs(),0);
 });
 test(`unsupported cell conversion rolls back the entire native grid and bound source O${optimization}`,t=>{
  const h=gridBindingMachine(t,`Set rs=CreateObject("Fake.Recordset")
On Error Resume Next
G.DataSource=rs
n=Err.Number
Err.Clear`,optimization);
  defineRecordset(h,{rows:[[1,{tag:10,value:13}]],sort:''});h.put(1,1,'previous');const version=h.get('version'),count=h.arrays.size,draws=h.invalidations.length;
  h.run();assert.equal(h.number('n'),13);assert.equal(h.text(1,1),'previous');assert.equal(h.get('version'),version);assert.equal(h.arrays.size,count);assert.equal(h.invalidations.length,draws);assert.equal(h.refs(),1);
  h.drop();assert.equal(h.refs(),0);
 });
}
for(const optimization of [0,1,2]){
 for(let nth=1;nth<=6;nth++)test(`native binding allocation #${nth} failure preserves data, source and resource counts O${optimization}`,t=>{
  const h=gridBindingMachine(t,`Set rs=CreateObject("Fake.Recordset")
On Error Resume Next
G.DataSource=rs
n=Err.Number
Err.Clear`,optimization);defineRecordset(h);h.put(1,1,'old');const arrays=h.arrays.size,version=h.get('version');
  h.fail('SafeArrayCreateVector',nth);h.run();assert.equal(h.number('n'),7);assert.equal(h.text(1,1),'old');assert.equal(h.get('version'),version);assert.equal(h.refs(),1);assert.equal(h.arrays.size,arrays);
  for(const a of h.arrays.values())assert.equal(h.m.read(a.handle+8),0);h.drop();assert.equal(h.refs(),0);assert.equal(h.arrays.size,0);
 });
 test(`failed second binding retains the previous external source owner and snapshot O${optimization}`,t=>{
  const h=gridBindingMachine(t,`Set rs=CreateObject("Fake.Good")
G.DataSource=rs
Set rs=CreateObject("Fake.Bad")
On Error Resume Next
G.DataSource=rs
n=Err.Number
Err.Clear
If Not (G.DataSource Is rs) Then n=n+100`,optimization);
  const good=defineRecordset(h,{progid:'Fake.Good'}),bad=defineRecordset(h,{progid:'Fake.Bad',rows:[[1,{tag:10,value:13}]],sort:''});
  h.run();assert.equal(h.number('n'),113);assert.equal(h.text(1,1),'Alpha');assert.equal(h.objects.get(good.pointer).refs,1);assert.equal(h.objects.get(bad.pointer).refs,1);assert.equal(h.arrays.size,7);
  h.drop();assert.equal(h.refs(),0);assert.equal(h.arrays.size,0);
 });
 test(`filter is explicitly restored on a clone without altering source selection O${optimization}`,t=>{
  const h=gridBindingMachine(t,'Set rs=CreateObject("Fake.Recordset")\nG.DataSource=rs',optimization),rs=defineRecordset(h,{filter:'ID=2'});
  h.run();assert.equal(h.get('rows'),2);assert.equal(h.text(1,0),'2');assert.equal(h.text(1,1),'Zulu');assert.equal(rs.records[0].cursor,1);assert.equal(rs.records[1].filter,'ID=2');h.drop();
 });
 for(const mutation of ['edit','recreate'])test(`native grid transaction rejects reentrant ${mutation} during COM traversal O${optimization}`,t=>{
  const h=gridBindingMachine(t,`Set rs=CreateObject("Fake.Recordset")
On Error Resume Next
G.DataSource=rs
n=Err.Number
Err.Clear`,optimization);let epoch=h.epoch;
  defineRecordset(h,{onCall:(e,state)=>{if(e.name==='getrows')h.reenter(()=>{
   if(mutation==='recreate'){h.gridCall('Initialize',[0,101,3,3]);epoch=h.gridCall('Stamp',[0]);h.m.write(h.state+80,epoch);}
   const p=h.m.string('inner');h.gridCall('SetText',[0,101,epoch,1,1,p]);h.m.free(p-4);
  });}});
  h.run();assert.equal(h.number('n'),mutation==='edit'?5:91);const text=h.gridCall('GetText',[0,101,epoch,1,1]);assert.equal(h.m.bstr(text),'inner');h.m.free(text-4);
  assert.equal(h.refs(),1);assert.equal(h.arrays.size,7);h.drop();assert.equal(h.refs(),0);assert.equal(h.arrays.size,0);
 });
 test(`native binding propagates provider error details without replacing existing cells O${optimization}`,t=>{
  const h=gridBindingMachine(t,`Set rs=CreateObject("Fake.Recordset")
On Error Resume Next
G.DataSource=rs
n=Err.Number
result=Err.Source & "/" & Err.Description
Err.Clear`,optimization);
  defineRecordset(h,{onCall:e=>e.name==='getrows'?{hr:0x80020009,scode:0x800a0cc1,source:'provider Ω',description:'snapshot failed',deferred:true}:null});h.put(1,1,'kept');h.run();
  assert.equal(h.number('n'),3265);assert.equal(h.string('result'),'provider Ω/snapshot failed');assert.equal(h.text(1,1),'kept');assert.equal(h.arrays.size,7);assert.equal(h.refs(),1);h.drop();assert.equal(h.refs(),0);
 });
}
