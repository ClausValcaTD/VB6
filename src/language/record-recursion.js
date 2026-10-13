/** Return every field participating in a recursive project-record dependency.
 * References use the declaring module's visibility/shadowing rules. Object,
 * Variant and unresolved library types are not inline record dependencies.
 * Iterative Kosaraju traversal is O(records + fields), with no
 * JavaScript recursion and no state retained on cached declaration objects. */
export function recursiveRecordFields(index) {
  const definitions=[];
  for(const local of index.local.values())for(const definition of local.values())definitions.push(definition);
  const count=definitions.length;if(!count)return [];
  const ids=new Map(definitions.map((definition,id)=>[definition,id]));
  const edges=Array.from({length:count},()=>[]),reverse=Array.from({length:count},()=>[]);
  let edgeCount=0;
  for(let from=0;from<count;from++){
    const definition=definitions[from];
    for(const field of definition.fields){
      const target=index.resolve(field.type,definition.owner);if(!target)continue;
      const to=ids.get(target);if(to===undefined)continue;
      edges[from].push({to,field});reverse[to].push(from);edgeCount++;
    }
  }
  if(!edgeCount)return [];
  const seen=new Uint8Array(count),order=[];
  for(let root=0;root<count;root++){
    if(seen[root])continue;
    const nodes=[root],positions=[0];seen[root]=1;
    while(nodes.length){
      const top=nodes.length-1,node=nodes[top],position=positions[top];
      if(position===edges[node].length){order.push(node);nodes.pop();positions.pop();continue;}
      positions[top]++;const next=edges[node][position].to;
      if(!seen[next]){seen[next]=1;nodes.push(next);positions.push(0);}
    }
  }
  const components=new Int32Array(count).fill(-1),sizes=[];
  for(let i=order.length-1;i>=0;i--){
    const root=order[i];if(components[root]!==-1)continue;
    const component=sizes.length,stack=[root];components[root]=component;let size=0;
    while(stack.length){
      const node=stack.pop();size++;
      for(const next of reverse[node])if(components[next]===-1){components[next]=component;stack.push(next);}
    }
    sizes.push(size);
  }
  // Original declaration/field order, independent of traversal/component order.
  const result=[];
  for(let from=0;from<count;from++)for(const {to,field}of edges[from]){
    if(components[from]===components[to]&&(from===to||sizes[components[from]]>1))result.push({definition:definitions[from],field,target:definitions[to]});
  }
  return result;
}
