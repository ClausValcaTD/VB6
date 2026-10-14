/** Frame-local owners reused only across instruction cleanup boundaries. Every
 * temporary in one instruction still gets a distinct slot. The generated
 * checkpoint clears the complete high-water set before any later instruction,
 * including error-handler, branch, GoSub and Resume destinations. Return slots,
 * locals, With pins, loop state and procedure setup are never put in this pool.
 * Returning descriptor copies prevents a caller's metadata edits from mutating
 * another instruction's address while retaining one canonical cleanup owner.
 */
export function beginNativeTemporaryStatement(context){
 context.nativeTemporaryPool ||= {string:[],variant:[]};
 context.nativeTemporaryCursor={string:0,variant:0};
}
export function endNativeTemporaryStatements(context){context.nativeTemporaryCursor=null;}
export function nativeStatementTemporary(context,kind,allocate){
 if(!context?.nativeTemporaryCursor)return allocate();
 const index=context.nativeTemporaryCursor[kind]++,pool=context.nativeTemporaryPool[kind];
 if(index===pool.length)pool.push(allocate());
 return {...pool[index]};
}
