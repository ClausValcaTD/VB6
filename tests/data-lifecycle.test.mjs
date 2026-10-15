import test from 'node:test';
import assert from 'node:assert/strict';
import {DataContext} from '../src/data/context.js';
import {dataError} from '../src/data/common.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const code=n=>error=>error.number===n;
const row=value=>({columns:[{Name:'value',Type:3}],values:[[value]]});
const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
function fixture(hooks={}){
  const context=new DataContext(),instances=[];
  class Provider {
    constructor(){this.closes=0;this.cancels=0;this.calls=[];instances.push(this);}
    open(){return hooks.open?.(this);}
    execute(...args){this.calls.push(args);return hooks.execute?.(this,...args)??row(1);}
    cancel(){this.cancels++;hooks.cancel?.(this);}
    close(){this.closes++;return hooks.close?.(this);}
  }
  context.providers.set('fixture',Provider);
  return {context,instances,connection:()=>context.connection(),source:'Provider=fixture;Data Source=test'};
}

test('context shutdown owns connecting resources and disposes only after acquisition settles',async()=>{
  const pending=deferred(),f=fixture({open:()=>pending.promise}),cn=f.connection();
  const opening=cn.Open(f.source);const rejected=assert.rejects(opening,code(-2147467260));await tick();
  assert.equal(cn.State,2);assert.equal(f.context.connections.has(cn),true);
  const closing=f.context.close();assert.equal(cn.State,0);assert.equal(f.instances[0].closes,0);
  pending.resolve();await Promise.all([rejected,closing]);
  assert.equal(f.instances[0].closes,1);assert.equal(f.context.connections.size,0);assert.equal(cn.adapter,null);
});

test('Close is idempotent, prevents overlapping reopen, and permits a clean later Open',async()=>{
  const pending=deferred(),f=fixture({open:p=>p===f.instances[0]?pending.promise:undefined}),cn=f.connection();
  const opening=cn.Open(f.source),rejected=assert.rejects(opening,code(-2147467260));await tick();
  const first=cn.Close(),second=cn.Close();assert.equal(first,second);
  await assert.rejects(cn.Open(f.source),code(3705));pending.resolve();await Promise.all([first,rejected]);
  await cn.Open(f.source);assert.equal(cn.State,1);assert.equal(f.instances.length,2);
  await f.context.close();assert.deepEqual(f.instances.map(p=>p.closes),[1,1]);
});

test('a late successful provider query cannot resurrect a closed connection recordset',async()=>{
  const pending=deferred(),f=fixture({execute:()=>pending.promise}),cn=f.connection();await cn.Open(f.source);
  const executing=cn.Execute('late'),rejected=assert.rejects(executing,code(3704));
  await cn.Close();pending.resolve(row(9));await rejected;
  assert.equal(cn.recordsets.size,0);assert.equal(cn.State,0);await f.context.close();
});

test('provider Open error is retained even when cleanup also fails',async()=>{
  const original=dataError('Original provider failure',7001);original.SQLState='42000';original.NativeError=207;
  const cleanup=Error('Cleanup failure'),f=fixture({open:()=>{throw original;},close:()=>{throw cleanup;}}),cn=f.connection();
  await assert.rejects(cn.Open(f.source),error=>error===original&&error.cleanupError===cleanup);
  assert.deepEqual(cn.Errors.Item(0),{Number:7001,Description:original.message,Source:'VB6.Data',SQLState:'42000',NativeError:207});
  assert.equal(cn.State,0);assert.equal(cn.adapter,null);assert.equal(f.context.connections.size,0);await f.context.close();
});

test('owned commands validate parameter count, directions and values before allocating a provider',async()=>{
  for(const mode of ['count','direction','value']){
    const f=fixture(),cmd=f.context.command();cmd.ActiveConnection=f.source;cmd.CommandText='one';
    cmd.Parameters.Append(cmd.CreateParameter('p',3,mode==='direction'?2:1,0,mode==='value'?'invalid':1));
    await assert.rejects(cmd.Execute(undefined,mode==='count'?[]:undefined));
    assert.equal(f.instances.length,0,mode);assert.equal(f.context.connections.size,0,mode);assert.equal(cmd._executing,false);
    await f.context.close();
  }
});

test('owned commands release the provider when result validation fails',async()=>{
  const f=fixture({execute:()=>({columns:[{Name:'x'},{Name:'X'}],values:[]})}),cmd=f.context.command();cmd.ActiveConnection=f.source;
  await assert.rejects(cmd.Execute(),code(3191));assert.equal(f.instances[0].closes,1);assert.equal(f.context.connections.size,0);
  await f.context.close();
});

test('command execution cannot overlap itself, and can be reused after completion',async()=>{
  const pending=deferred(),f=fixture({execute:p=>p.calls.length===1?pending.promise:row(2)}),cn=f.connection();await cn.Open(f.source);
  const cmd=f.context.command();cmd.ActiveConnection=cn;const first=cmd.Execute();
  await assert.rejects(cmd.Execute(),code(3711));assert.equal(f.instances[0].calls.length,1);
  pending.resolve(row(1));assert.equal((await first).Item('value'),1);assert.equal((await cmd.Execute()).Item('value'),2);
  await f.context.close();
});

test('command text, typed arguments and request options are snapshotted before owned Open',async()=>{
  const pending=deferred(),f=fixture({open:()=>pending.promise}),cmd=f.context.command();cmd.ActiveConnection=f.source;cmd.CommandText='original';
  cmd.Parameters.Append(cmd.CreateParameter('value',3,1,0,7));cmd._requestOptions={resource:'/original'};
  const execution=cmd.Execute();await tick();cmd.CommandText='changed';cmd.Parameters.Item(0).Value=9;cmd._requestOptions.resource='/changed';
  pending.resolve();const rs=await execution;
  assert.deepEqual(f.instances[0].calls[0],['original',[7],{resource:'/original'}]);assert.equal(rs.Source,'original');
  await rs.Close();assert.equal(f.instances[0].closes,1);assert.equal(f.context.connections.size,0);await f.context.close();
});

test('Cancel reaches an owned command connection and rejects ignored transport cancellation',async()=>{
  const pending=deferred(),f=fixture({execute:()=>pending.promise}),cmd=f.context.command();cmd.ActiveConnection=f.source;
  let affected=99;const execution=cmd.Execute({ref:{set:n=>{affected=n;}}}),rejected=assert.rejects(execution,code(-2147467260));
  while(!f.instances[0]?.calls.length)await tick();cmd.Cancel();assert.equal(f.instances[0].cancels,1);
  pending.resolve({...row(8),rowsAffected:1});await rejected;
  assert.equal(affected,99);assert.equal(f.instances[0].closes,1);assert.equal(f.context.connections.size,0);await f.context.close();
});

test('owned action commands release their connection without transferring cursor ownership',async()=>{
  const f=fixture({execute:()=>({columns:[],values:[],rowsAffected:3})}),cmd=f.context.command();cmd.ActiveConnection=f.source;
  const rs=await cmd.Execute();assert.equal(rs.State,0);assert.equal(rs.RowsAffected,3);
  assert.equal(f.instances[0].closes,1);assert.equal(f.context.connections.size,0);await f.context.close();
});

test('failed owned commands preserve the query failure if provider cleanup fails too',async()=>{
  const original=dataError('Query failed',7002),cleanup=Error('Close failed'),f=fixture({execute:()=>{throw original;},close:()=>{throw cleanup;}}),cmd=f.context.command();cmd.ActiveConnection=f.source;
  await assert.rejects(cmd.Execute(),error=>error===original&&error.cleanupError===cleanup);
  assert.equal(cmd._executing,false);assert.equal(f.context.connections.size,0);await f.context.close();
});
