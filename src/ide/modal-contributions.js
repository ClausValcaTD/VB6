/** Small synchronous extension point for staged option fields. Contributors
 * decorate a fresh button descriptor array; Cancel never invokes accept actions.
 * Shared across the session, including dialogs hosted in detached IDE windows. */
const contributions=new Map();
export function registerModalContribution(title,contribute){
  if(typeof contribute!=='function')throw new TypeError('A modal contributor must be a function');
  if(!contributions.has(title))contributions.set(title,new Set());
  contributions.get(title).add(contribute);
  return ()=>{const set=contributions.get(title);set?.delete(contribute);if(!set?.size)contributions.delete(title);};
}
export function applyModalContributions(title,context){for(const contribute of contributions.get(title)||[])contribute(context);}
