/** Shared structural undo barriers over independent, bounded project histories.
 * A group change can be undone only after later edits in every participating
 * project have been undone. This prevents old group snapshots erasing peers.
 * Host views and function-valued sparse edits stay in memory, never in projects.
 */
import {workspaceProjects,selectWorkspaceProject,validateWorkspace} from './native-project.js';

export class WorkspaceHistory {
  constructor(history){this.history=history;this.sessions=new Map();this.activeId=null;}
  session(project){
    let state=this.sessions.get(project.id);
    if(!state){state={id:project.id,name:project.name,undo:[],redo:[],view:null};this.sessions.set(project.id,state);}
    state.name=project.name;return state;
  }
  remember(project,view){
    const state=this.session(project);state.undo=this.history.undoStack;state.redo=this.history.redoStack;
    if(view!==undefined)state.view=view;this.activeId=project.id;return state;
  }
  enter(project){const state=this.session(project);this.history.undoStack=state.undo;this.history.redoStack=state.redo;this.activeId=project.id;return state.view;}
  reset(){this.sessions.clear();this.activeId=null;}
  record(before,after,label='Edit project group'){
    validateWorkspace(before);validateWorkspace(after);
    const a=JSON.stringify(before),b=JSON.stringify(after);if(a===b)return false;
    this.remember(before);
    const members=new Map([...workspaceProjects(before),...workspaceProjects(after)].map(p=>[p.id,p]));
    const entry={kind:'workspace',before:a,after:b,label,participants:[...members.keys()]};
    // One immutable snapshot pair is shared by all histories, not copied N times.
    for(const p of members.values()){
      const state=this.session(p);state.undo.push(entry);state.redo=[];
      let size=state.undo.reduce((n,e)=>n+(e.bytes??(e.before.length+e.after.length)*2),0);
      while(state.undo.length>1&&(state.undo.length>this.history.limit||size>this.history.maxBytes)){const e=state.undo.shift();size-=e.bytes??(e.before.length+e.after.length)*2;}
    }
    this.enter(after);this.history.emit('change');return true;
  }
  /** Returns null for an ordinary project edit; throws before mutating on conflict. */
  step(method,current){
    if(!['undo','redo'].includes(method))throw new Error('Unknown history direction');
    this.remember(current);
    const from=method==='undo'?'undo':'redo',to=method==='undo'?'redo':'undo',entry=this.session(current)[from].at(-1);
    if(entry?.kind!=='workspace')return null;
    for(const id of entry.participants){
      const state=this.sessions.get(id);
      if(state?.[from].at(-1)!==entry)throw new Error('Cannot '+method+' this group change: '+(state?.name||'a project')+' has later or discarded history. '+(method==='undo'?'Undo its later edits first.':'Redo the required earlier edits first.'));
    }
    let result=JSON.parse(method==='undo'?entry.before:entry.after);validateWorkspace(result);
    // Keep the active project when it exists on both sides of the barrier.
    const same=workspaceProjects(result).find(p=>p.id===current.id);
    if(same&&result.nativeWorkspace)result=selectWorkspaceProject(result,same.nativeProject.path);
    for(const id of entry.participants){const state=this.sessions.get(id);state[from].pop();state[to].push(entry);}
    this.enter(result);this.history.emit('change');return result;
  }
}
