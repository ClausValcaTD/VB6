import {layoutKey} from '../../layout/contract.js';

export const PROPERTY_SECTIONS = Object.freeze([
  {id:'content',title:'Content',open:true},
  {id:'appearance',title:'Appearance',open:true},
  {id:'typography',title:'Typography',open:true},
  {id:'behavior',title:'Behavior',open:false},
  {id:'data',title:'Data and binding',open:false},
  {id:'window',title:'Window',open:false},
  {id:'geometry',title:'Geometry · twips',open:false},
  {id:'layout',title:'Layout properties · twips',open:false},
  {id:'other',title:'More VB6 properties',open:false},
].map(Object.freeze));
const CONTENT = new Set('Caption Text Value List ToolTipText Tag PasswordChar'.split(' '));
const BEHAVIOR = new Set('Enabled Visible Locked TabStop TabIndex Index Default Cancel MultiLine MaxLength ScrollBars MultiSelect Sorted Interval Min Max SmallChange LargeChange KeyPreview'.split(' '));
const WINDOW = new Set('WindowState StartUpPosition MDIChild ControlBox MinButton MaxButton Moveable ShowInTaskbar NegotiateMenus LinkTopic LinkMode'.split(' '));
const GEOMETRY = new Set('Name Left Top Width Height ClientWidth ClientHeight X1 X2 Y1 Y2 ScaleLeft ScaleTop ScaleWidth ScaleHeight ScaleMode Align'.split(' '));

export function propertySection(key) {
  if (key === 'Font' || key.startsWith('Font')) return 'typography';
  if (layoutKey(key)) return 'layout';
  if (CONTENT.has(key)) return 'content';
  if (BEHAVIOR.has(key)) return 'behavior';
  if (WINDOW.has(key)) return 'window';
  if (GEOMETRY.has(key)) return 'geometry';
  if (/^(Data|Record|Connection)|^(Row|Col|FixedRow|FixedCol)/.test(key)) return 'data';
  if (/Color$|Style$|^(Appearance|Alignment|Picture|Image|Icon|MousePointer|MouseIcon|Shape|Stretch|AutoSize|AutoRedraw|DrawWidth|DrawMode)$/.test(key)) return 'appearance';
  return 'other';
}

/** Linear, deterministic projection of the canonical inspector's supported keys.
 * Values and custom descriptors remain owned by the inspector. Search labels,
 * section names and descriptor descriptions, never serialize resource payloads. */
export function propertySections(keys, {query='', describe=()=>''}={}) {
  const terms=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const groups=new Map(PROPERTY_SECTIONS.map(s=>[s.id,{...s,keys:[]}]));
  for (const key of new Set(keys)) {
    const group=groups.get(propertySection(key));
    const haystack=(key+' '+group.title+' '+describe(key)).toLocaleLowerCase();
    if (terms.every(term=>haystack.includes(term))) group.keys.push(key);
  }
  return [...groups.values()].filter(group=>group.keys.length);
}
