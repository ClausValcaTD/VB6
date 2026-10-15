import {el,clone} from '../../core/core.js';
import {procedureAtLine,filterProcedures} from './code-model.js';

/** A view over the active SourceEditor, including its optional advanced adapter.
 * No parallel parser, source buffer, edits or breakpoint collection. */
export function createFigmaCodePanel(workspace) {
  const {ide}=workspace,view=ide.root.ownerDocument.defaultView;
  const root=el('section',{class:'figma-code-inspector','aria-label':'Code inspector',hidden:true});
  const title=el('strong',{}),status=el('p',{class:'figma-help'}),position=el('span',{class:'figma-muted'});
  const search=el('input',{type:'search',placeholder:'Search procedures…','aria-label':'Search code outline',maxlength:256});
  const list=el('div',{class:'figma-code-outline',role:'listbox','aria-label':'Code outline',tabindex:0});
  const content=el('div',{class:'figma-code-outline-content'});list.append(content);
  const action=(label,callback)=>el('button',{'aria-label':label,onclick:()=>workspace.safe(()=>{
    if(!workspace.currentCodeEditor())return;const result=callback();workspace.scheduleSync();return result;
  })},label);
  const openDesign=action('Open form designer',()=>ide.command('viewForm'));
  const find=action('Find in code',()=>ide.command('find'));
  const replace=action('Replace in code',()=>ide.command('replace'));
  const split=action('Split code editor',()=>{
    const surface=ide.advancedEditor?.runtime?.active();
    if(surface)surface.setSplit(surface.views.length===1);
    else ide.editor.toggleSplit();
  });
  const editAction=(label,command)=>action(label,()=>{
    if(!workspace.currentCodeEditor()?.readOnly)return ide.command(command);
  });
  const format=editAction('Format module','formatCode');
  const comment=editAction('Comment selection','comment');
  const uncomment=editAction('Uncomment selection','uncomment');
  const bookmark=action('Toggle code bookmark',()=>{
    if(ide.runState==='design')return ide.command('toggleBookmark');
  });
  const nextBookmark=action('Next code bookmark',()=>ide.command('nextBookmark'));
  const previousBookmark=action('Previous code bookmark',()=>ide.command('previousBookmark'));
  const breakpoint=action('Toggle code breakpoint',()=>ide.command('breakpoint'));
  const mode=el('select' ,{'aria-label':'Code view mode'},
    el('option',{value:'module'},'Full module'),el('option',{value:'procedure'},'Current procedure'));
  mode.addEventListener('change',()=>workspace.safe(()=>{
    const editor=workspace.currentCodeEditor();if(editor&&!ide.advancedEditor?.runtime?.active()){
      editor.setViewMode(mode.value);workspace.scheduleSync();
    }
  }));
  const numbers=el('input',{type:'checkbox','aria-label':'Code line numbers'});
  numbers.addEventListener('change',()=>workspace.safe(()=>{
    if(!workspace.currentCodeEditor()||ide.runState!=='design')return;
    const before=clone(ide.project);ide.project.settings.lineNumbers=numbers.checked;
    ide.record(before,'Set code line numbers');
  }));
  const line=el('input',{type:'number',min:1,step:1,'aria-label':'Go to code line',value:1});
  const go=action('Go to line',()=>{const editor=workspace.currentCodeEditor(),n=Number(line.value);if(editor&&Number.isSafeInteger(n)&&n>=1)editor.goToLine(n);});
  line.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();go.click();}});
  root.append(el('div',{class:'figma-section-title'},title,position),status,openDesign,
    el('div',{class:'figma-code-actions'},find,replace,split),
    el('div',{class:'figma-code-actions'},comment,uncomment,format),
    el('div',{class:'figma-code-actions'},bookmark,previousBookmark,nextBookmark,breakpoint),
    el('div',{class:'figma-code-options'},mode,el('label',{},numbers,' Line numbers')),
    el('div',{class:'figma-code-goto'},line,go),
    el('div',{class:'figma-section-title'},el('strong',{},'Outline')),search,list);
  ide.propertiesPanel.append(root);
  let editor=null,subscriptions=[],index=null,query=null,rows=[],active=null,focused=0,frame=0,paintKey='',disposed=false;
  const height=32;
  function navigate(row){
    if(workspace.currentCodeEditor()!==editor||editor.procedureIndex!==index)return sync();
    editor.goToLine(row.line);workspace.scheduleSync();
  }
  function paint(){
    if(disposed||root.hidden)return;
    const start=Math.max(0,Math.floor(list.scrollTop/height)-4);
    const end=Math.min(rows.length,start+Math.ceil((list.clientHeight||320)/height)+8);
    const key=[start,end,focused,active?.line,rows.slice(start,end).map(p=>p.line+':'+p.name+':'+p.kind).join('|')].join(';');
    if(key===paintKey)return;paintKey=key;
    const hadFocus=content.contains(root.ownerDocument.activeElement);
    content.style.height=rows.length*height+'px';const nodes=[];
    for(let i=start;i<end;i++){
      const p=rows[i],button=el('button',{class:'figma-code-symbol',role:'option',
        tabindex:i===focused?0:-1,'aria-selected':String(p===active),'aria-posinset':i+1,'aria-setsize':rows.length,
        'aria-label':p.name+' — '+p.kind+' — line '+p.line,'data-outline-index':i,
        title:p.kind+' '+p.name+' · line '+p.line,style:{top:i*height+'px'},onclick:()=>navigate(p)},
        el('span',{class:'figma-code-symbol-name'},p.name),el('span',{class:'figma-muted'},String(p.line)));
      button.addEventListener('focus',()=>{focused=i;});
      nodes.push(button);
    }
    if(!rows.length)nodes.push(el('p',{class:'figma-help'},search.value?'No matching procedures.':'No procedures in this module.'));
    content.replaceChildren(...nodes);
    if(hadFocus)(content.querySelector('[data-outline-index="'+focused+'"]')||list).focus({preventScroll:true});
  }
  function focusAt(i){
    focused=Math.max(0,Math.min(rows.length-1,i));
    if(focused*height<list.scrollTop)list.scrollTop=focused*height;
    else if((focused+1)*height>list.scrollTop+list.clientHeight)list.scrollTop=(focused+1)*height-list.clientHeight;
    paint();content.querySelector('[data-outline-index="'+focused+'"]')?.focus({preventScroll:true});
  }
  function sync(){
    const next=workspace.currentCodeEditor();root.hidden=!next;
    if(!next){for(const off of subscriptions)off();subscriptions=[];editor=null;index=null;return;}
    if(editor!==next){
      for(const off of subscriptions)off();editor=next;
      subscriptions=['change','cursor'].map(event=>editor.on(event,workspace.scheduleSync));index=null;
    }
    const cursor=editor.cursor(),surface=ide.advancedEditor?.runtime?.active();
    title.textContent=ide.activeModule.name;position.textContent=cursor.line+':'+cursor.column;
    status.textContent=(ide.activeModule.form?'Form code':ide.activeModule.kind||'Module')+' · '+
      editor.index.lines.length+' lines · '+editor.procedureIndex.length+' procedures'+(editor.readOnly?' · Read only':'');
    openDesign.hidden=!ide.activeModule.form;replace.disabled=!!editor.readOnly;
    for(const button of [comment,uncomment,format])button.disabled=!!editor.readOnly;
    bookmark.disabled=ide.runState!=='design';
    bookmark.setAttribute('aria-pressed',String(!!ide.activeModule.bookmarks?.includes(cursor.line)));
    breakpoint.setAttribute('aria-pressed',String(ide.breakpoints.some(bp=>
      bp.module.toLowerCase()===ide.activeModule.name.toLowerCase()&&bp.line===cursor.line)));
    const hasBookmarks=ide.project.modules.some(module=>module.bookmarks?.length);
    nextBookmark.disabled=previousBookmark.disabled=!hasBookmarks;
    split.setAttribute('aria-pressed',String(surface?surface.views.length>1:!!editor.secondary));
    mode.disabled=!!surface;mode.title=surface?'Advanced editor uses its native folding and navigation':'';
    mode.value=surface?'module':editor.activePane.mode;numbers.checked=!!ide.project.settings.lineNumbers;
    numbers.disabled=ide.runState!=='design';line.max=editor.index.lines.length;
    if(root.ownerDocument.activeElement!==line)line.value=cursor.line;
    if(index!==editor.procedureIndex||query!==search.value){
      index=editor.procedureIndex;query=search.value;rows=filterProcedures(index,query);
      focused=0;list.scrollTop=0;paintKey='';
    }
    active=index[procedureAtLine(index,cursor.line)]||null;paint();
  }
  search.addEventListener('input',()=>sync());
  search.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();search.value='';sync();}
    else if(event.key==='ArrowDown'||event.key==='Enter'){event.preventDefault();focusAt(0);}
  });
  list.addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      focusAt(event.key==='Home'?0:event.key==='End'?rows.length-1:focused+(event.key==='ArrowDown'?1:-1));
    }else if(event.key==='Enter'&&event.target===list&&rows[focused]){event.preventDefault();navigate(rows[focused]);}
  });
  const schedulePaint=()=>{if(!disposed&&!frame)frame=view.requestAnimationFrame(()=>{frame=0;if(!disposed)paint();});};
  list.addEventListener('scroll',schedulePaint);
  const observer=new view.ResizeObserver(schedulePaint);observer.observe(list);
  return {root,sync,dispose(){disposed=true;for(const off of subscriptions)off();observer.disconnect();view.cancelAnimationFrame(frame);root.remove();}};
}
