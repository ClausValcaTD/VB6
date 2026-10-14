// Plans contain declaration metadata only: never live Cells, values, frames or
// module instances. Replacing bytecode or rebinding implicit ReDim declarations
// invalidates the plan, including Edit and Continue and retained code revisions.
const plans=new WeakMap();

/** Classic Dim/Static/Const storage exists before the procedure body runs,
 * regardless of whether control reaches its declaration. MS-VBAL 5.3.1 step 4.
 * Keep bytecode and sequence points intact; only plan the initial storage here.
 * Nonclassic initialized-Dim extensions retain their existing statement timing.
 */
export function procedureLocalDeclarations(proc) {
  const previous=plans.get(proc);
  if(previous?.code===proc.code&&previous.redim===proc.redimDeclarations)return previous.declarations;
  const declarations=[],seen=new Set();
  for(const ins of proc.code)if(ins.op==='dim')for(const decl of ins.decls){
    const key=decl.name.toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);
    if(decl.initial&&!decl.constant)continue;
    declarations.push(Object.freeze({decl,static:!!ins.static}));
  }
  // Include declarative ReDim slots, but do not allocate explicitly declared
  // dynamic arrays twice. Parameters are excluded by the existing binder.
  for(const decl of proc.redimDeclarations||[]){
    const key=decl.name.toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);declarations.push(Object.freeze({decl,static:!!decl.static}));
  }
  Object.freeze(declarations);
  plans.set(proc,{code:proc.code,redim:proc.redimDeclarations,declarations});
  return declarations;
}
