// Procedure records come from the existing incremental SourceEditor index.
export function procedureAtLine(procedures,line) {
  let lo=0,hi=procedures.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(procedures[mid].line<=line)lo=mid+1;else hi=mid;}
  return lo-1;
}
export function filterProcedures(procedures,query='') {
  const terms=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return procedures.filter(p=>terms.every(term=>(p.name+' '+p.kind).toLocaleLowerCase().includes(term)));
}
