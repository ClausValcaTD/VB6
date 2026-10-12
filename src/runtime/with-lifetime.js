import {ArrayLeaseScope} from './array-lifetime.js';
import {VBArray,VBCurrency,VBDecimal,VBErrorValue,NOTHING,MISSING,cloneValue,readScalar,unbox} from './values.js';
import {VBError} from '../language/errors.js';

// One activation per lexical With block. A GoSub/error handler may suspend
// activations outside its current lexical context; those leases stay live but
// must never become an unrelated leading-dot expression's receiver.
function visible(frame,force=false) {
  // Back-edges inside the same lexical With need no new arrays or sorting.
  const id=frame.proc.code[frame.pc]?.withId,scope=frame.withScopes?.get(id);
  if(!force&&id!==undefined&&frame.visibleWithIds?.at(-1)===id&&scope&&frame.withStack.at(-1)===scope.value)return;
  const scopes=[];
  for(const scope of frame.withScopes?.values()||[])if(frame.pc>=scope.start&&frame.pc<scope.end)scopes.push(scope);
  scopes.sort((a,b)=>a.start-b.start);
  frame.withStack=scopes.map(scope=>scope.value);frame.visibleWithIds=scopes.map(scope=>scope.id);
}
function close(frame,id) {
  const scope=frame.withScopes?.get(id);if(!scope)return;
  scope.leases.release();frame.withScopes.delete(id);
}
export function closeWithScopes(frame) {
  for(const id of frame.withScopes?.keys()||[])close(frame,id);
  frame.withStack.length=0;frame.visibleWithIds=[];
}
export function popWithScope(frame,id) {close(frame,id);visible(frame,true);}
export function unwindWithScopes(frame,count) {
  for(const id of (frame.visibleWithIds||[]).slice(-count))close(frame,id);
  visible(frame,true);
}
export function withValue(frame,instruction=frame?.activeInstruction) {
  if(!frame)throw new VBError('Object variable or With block variable not set',91);
  if(instruction?.withId!==undefined){
    const scope=frame.withScopes?.get(instruction.withId);
    if(!scope)throw new VBError('Object variable or With block variable not set',91);
    return scope.value;
  }
  if(!frame.withStack.length)throw new VBError('Object variable or With block variable not set',91);
  return frame.withStack.at(-1);
}
export async function pushWithScope(vm,frame,ins,current) {
  // Compiled IR carries the endpoint, and old hand-authored IR is scanned only
  // once on activation. No expression is evaluated to discover its category.
  const id=ins.id??'@with:'+current;
  close(frame,id);
  const leases=new ArrayLeaseScope();
  try {
    const resolved=ins.expr.kind==='group'?{value:await vm.evaluateScalar(ins.expr,frame,{raw:true})}:await vm.sourceOperand(ins.expr,frame);
    let value=unbox(resolved.ref?await readScalar(resolved.ref):await vm.expressionValue(resolved.value,frame));
    if(value?.__fields){
      if(resolved.ref){leases.reference(resolved.ref);leases.value(value);}
      else value=cloneValue(value);
    }else if(value!==NOTHING&&(!value||typeof value!=='object'||value instanceof VBArray||value instanceof Date||value===MISSING||value instanceof VBCurrency||value instanceof VBDecimal||value instanceof VBErrorValue)){
      throw new VBError('Object required',424);
    }
    let end=ins.target;
    if(end===undefined){let depth=1,index=current+1;for(;index<frame.proc.code.length&&depth;index++){if(frame.proc.code[index].op==='withPush')depth++;else if(frame.proc.code[index].op==='withPop')depth--;}end=index;}
    (frame.withScopes??=new Map()).set(id,{id,value,leases,code:frame.proc.code,start:current+1,end});
    visible(frame,true);
  }catch(error){leases.release();visible(frame,true);throw error;}
}
export function reconcileWithScopes(frame) {
  if(!frame.withScopes?.size)return;
  for(const [id,scope] of frame.withScopes){
    if(scope.code!==frame.proc.code){
      const index=frame.proc.code.findIndex(ins=>ins.op==='withPush'&&ins.id===id);
      if(index<0)throw new VBError('Restart required: active With block was removed',5);
      scope.code=frame.proc.code;scope.start=index+1;scope.end=frame.proc.code[index].target;
    }
    const start=scope.start,end=scope.end;
    if(frame.pc>=start&&frame.pc<end)continue;
    if(frame.errorActive&&frame.errorPc>=start&&frame.errorPc<end)continue;
    let suspended=false;for(const pc of frame.gosubStack)if(pc>=start&&pc<end){suspended=true;break;}
    if(!suspended)close(frame,id);
  }
  visible(frame);
}
