import {el} from '../../core/core.js';
import {modal} from '../ui.js';
import {registerModalContribution} from '../modal-contributions.js';

function optionsFields(workspace){
  const group=el('fieldset',{class:'options-group figma-workspace-options'}),fields={};group.append(el('legend',{},'Workspace'));
  for(const [key,label,values]of [['mode','Workspace mode',[['classic','Classic VB6'],['figma','Figma']]],['scheme','Figma color scheme',[['light','Light'],['dark','Dark'],['system','System']]],['units','Figma position units',[['px','Pixels (15 twips per CSS pixel)'],['twips','VB6 twips']]]]){
    const select=el('select',{'aria-label':label},...values.map(([value,text])=>el('option',{value},text)));select.value=workspace.settings[key];fields[key]=select;group.append(el('label',{class:'option-field'},el('span',{},label),select));
  }
  group.append(el('p',{class:'option-note'},'Figma changes the IDE workspace, not your VB6 application theme, source, or control types. Auto layout and anchoring are separate project extensions.'));
  return {group,read:()=>Object.fromEntries(Object.entries(fields).map(([key,node])=>[key,node.value]))};
}
export function installFigmaOptions(workspace){
  const unregister=registerModalContribution('Options',({content,buttons})=>{
    const general=content?.querySelector('[data-tab-page="general"]');if(!general)return;
    const fields=optionsFields(workspace);general.prepend(fields.group);
    for(const button of buttons)if(button.value===true){const original=button.action;button.action=async()=>{const result=await original?.();if(result!==false)workspace.configure(fields.read());return result;};}
  });
  workspace.options=()=>{const fields=optionsFields(workspace);return modal('Figma Workspace Options',{width:540,content:fields.group,buttons:[{label:'OK',value:true,primary:true,action:()=>workspace.configure(fields.read())},{label:'Cancel',value:false}]});};
  return unregister;
}
