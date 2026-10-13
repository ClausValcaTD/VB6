import {el} from '../../core/core.js';
import {propertySections,PROPERTY_SECTIONS} from './property-model.js';

export function createFigmaPropertyPanel(workspace) {
  const inspector=workspace.ide.inspector;
  const search=el('input',{type:'search',placeholder:'Search properties…',
    'aria-label':'Search VB6 properties',maxlength:256,spellcheck:false});
  const count=el('span',{class:'figma-muted','aria-live':'polite'});
  const state=new Map(),previous=inspector.presentation;
  const expand=value=>{
    for(const group of PROPERTY_SECTIONS)state.set(group.id,value);
    inspector.render();
    workspace.scheduleSync();
  };
  const bar=el('div',{class:'figma-property-search'},
    search,el('div',{class:'figma-property-search-actions'},count,
      el('button',{'aria-label':'Expand property sections',title:'Expand property sections',onclick:()=>expand(true)},'+'),
      el('button',{'aria-label':'Collapse property sections',title:'Collapse property sections',onclick:()=>expand(false)},'−')));
  const presentation={
    tabThrough:true,
    render({keys,fontKeys,props,target}) {
      const allKeys=keys.flatMap(key=>key==='Font'?['Font',...fontKeys]:[key]);
      const groups=propertySections(allKeys,{query:search.value,
        describe:key=>workspace.ide.controlRegistry?.property?.(target.type,key)?.description||''});
      const matches=groups.reduce((n,g)=>n+g.keys.length,0);
      const text=matches+' / '+allKeys.length+' properties';
      if(count.textContent!==text)count.textContent=text;
      for(const group of groups) {
        const details=el('details',{class:'figma-inspector-section figma-property-section',
          'data-property-section':group.id,open:search.value.trim()?true:state.get(group.id)??group.open});
        const summary=el('summary',{},group.title,el('span',{class:'figma-muted'},String(group.keys.length)));
        const rows=el('div',{role:'rowgroup'});
        details.append(summary,rows);
        for(const key of group.keys)rows.append(inspector.row(key,props[key],target,false));
        // A Font aggregate opens the real dialog. Individual attributes are
        // already projected; its classic expander must not mutate classic state.
        rows.querySelector('.font-expander')?.remove();
        details.addEventListener('toggle',()=>{
          if(details.isConnected&&!search.value.trim())state.set(group.id,details.open);
        });
        inspector.grid.append(details);
      }
      if(!matches)inspector.grid.append(el('p',{class:'figma-help',role:'status'},'No matching properties.'));
    }
  };
  inspector.presentation=presentation;
  inspector.wrapper.before(bar);
  search.addEventListener('input',()=>inspector.render());
  search.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();search.value='';inspector.render();}
    else if(event.key==='Enter'){
      event.preventDefault();
      [...inspector.fields.values()].find(field=>!field.disabled&&!field.readOnly)?.focus();
    }
  });
  inspector.render();
  return {bar,search,dispose(){
    inspector.presentation=previous;
    bar.remove();
    inspector.render();
  }};
}
