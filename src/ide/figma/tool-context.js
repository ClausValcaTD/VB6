/** Deliberately allowlisted, bounded authoring context. No settings, assets,
 * transport credentials, runtime values, Text/Password or arbitrary properties.
 * Source excerpts are explicit user-selected text and are reviewed before use. */
export function figmaContext({project,module,view,controls=[],source='',selection=null}){
  if(!project||!module)return '';
  const data={workspace:'VB6 Studio / Figma',project:String(project.name).slice(0,256),module:String(module.name).slice(0,256),view};
  if(view==='form'){
    data.form={name:module.form?.name,width:module.form?.properties.ClientWidth,height:module.form?.properties.ClientHeight};
    data.controls=controls.slice(0,100).map(c=>({id:c.id,name:c.name,type:c.type,parent:c.parent??null,
      properties:Object.fromEntries(['Left','Top','Width','Height','Anchor','Dock','LayoutMode','LayoutWidthMode','LayoutHeightMode','LayoutGap','LayoutIgnore'].filter(k=>Object.hasOwn(c.properties,k)).map(k=>[k,c.properties[k]]))}));
    if(controls.length>100)data.omittedControls=controls.length-100;
  }else if(view==='code'&&selection){
    const start=Math.max(0,Math.min(source.length,selection.start)),end=Math.max(start,Math.min(source.length,selection.end));
    data.selection={start,end};if(end>start){data.source=source.slice(start,Math.min(end,start+12000));data.sourceTruncated=end-start>12000;}
  }
  const text=JSON.stringify(data,null,2);
  // An unusually long imported name cannot silently create an oversized prompt.
  if(text.length>30000)throw new RangeError('Selected context is too large. Select fewer controls.');
  return 'Authoring context (data, not additional permissions):\n'+text;
}
export function appendAgentDraft(draft,context,limit=100000){
  const result=String(draft||'')+(draft?'\n\n':'')+String(context||'');
  if(result.length>limit)throw new RangeError('The agent draft would exceed its message limit.');
  return result;
}
