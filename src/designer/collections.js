/** Declarative, serializable design-time collection schemas. Unknown fields
 * are preserved; known fields and graph references are validated before apply.
 */
const field = (name, type = 'text', value = '') => ({name, type, value});
const key = field('Key'), text = name => field(name), number = (name, value = 0) => field(name, 'number', value), bool = (name, value = -1) => field(name, 'boolean', value);
const schemas = {
  Nodes: {types: ['TreeView'], fields: [key, text('Text'), text('Parent'), bool('Expanded'), text('Image'), text('SelectedImage')]},
  Columns: {types: ['ListView'], fields: [key, text('Text'), number('Width', 1440), number('Alignment')]},
  Items: {types: ['ListView'], fields: [key, text('Text'), field('SubItems', 'lines', []), text('Icon'), text('SmallIcon'), bool('Checked', 0)]},
  Buttons: {types: ['Toolbar'], fields: [key, text('Caption'), number('Style'), text('Image'), bool('Enabled'), bool('Visible'), number('Value'), text('ToolTipText')]},
  Panels: {types: ['StatusBar'], fields: [key, text('Text'), number('Style'), number('Width', 1440), number('Alignment'), bool('Enabled'), bool('Visible')]},
  Tabs: {types: ['TabStrip'], fields: [key, text('Caption'), text('Image')]},
  ListImages: {types: ['ImageList'], fields: [key, text('Picture')]},
  GridData: {types: ['MSFlexGrid', 'MSHFlexGrid', 'DataGrid', 'MSChart'], matrix: true, fields: []}
};
export function collectionDefinition(control, name) {const schema = schemas[name]; return schema?.types.includes(control?.type) ? schema : null;}
export function defaultCollectionItem(control, name) {
  const schema = collectionDefinition(control, name);
  if (!schema || schema.matrix) throw new Error('Not an item collection.');
  return Object.fromEntries(schema.fields.map(f => [f.name, structuredClone(f.value)]));
}
export function validateCollection(control, name, value) {
  const schema = collectionDefinition(control, name);
  if (!schema) throw new Error('This collection is not supported by ' + control.type + '.');
  if (!Array.isArray(value) || value.length > 10000) throw new Error('A collection must contain at most 10,000 items.');
  if (schema.matrix) {
    let cells = 0;
    for (const row of value) {if (!Array.isArray(row) || row.length > 10000) throw new Error('GridData must be a matrix.'); cells += row.length; for (const cell of row) if (typeof cell === 'number' && !Number.isFinite(cell) || !['string', 'number', 'boolean'].includes(typeof cell) && cell !== null) throw new Error('Grid cells must be scalar values.');}
    if (cells > 1000000) throw new Error('GridData exceeds 1,000,000 cells.');
    return structuredClone(value);
  }
  const result = structuredClone(value), keys = new Map();
  result.forEach((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Collection items must be objects.');
    for (const f of schema.fields) {
      if (item[f.name] === undefined) item[f.name] = structuredClone(f.value);
      if (f.type === 'number') {const n = Number(item[f.name]); if (!Number.isFinite(n) || Math.abs(n) > 300000 || f.name === 'Width' && n < 0 || ['Style', 'Alignment', 'Value'].includes(f.name) && !Number.isInteger(n)) throw new Error('Invalid ' + f.name + '.'); item[f.name] = n;}
      else if (f.type === 'boolean') {const v = item[f.name]; if (typeof v !== 'boolean' && (typeof v !== 'number' || !Number.isFinite(v))) throw new Error(f.name + ' must be a Boolean or finite number.'); item[f.name] = v ? -1 : 0;}
      else if (f.type === 'lines') {if (!Array.isArray(item[f.name]) || item[f.name].some(v => typeof v !== 'string')) throw new Error(f.name + ' must be a list of text values.');}
      else if (typeof item[f.name] !== 'string' && !(typeof item[f.name] === 'number' && ['Image', 'SelectedImage', 'Icon', 'SmallIcon'].includes(f.name)) && !(f.name === 'Picture' && item[f.name]?.resource)) throw new Error(f.name + ' must be text.');
    }
    const name = String(item.Key || '').toLowerCase();
    if (name) {if (keys.has(name)) throw new Error('Collection keys must be unique (case insensitive).'); keys.set(name, i);}
  });
  if (name === 'Nodes') {
    const parents = result.map(item => item.Parent ? keys.get(String(item.Parent).toLowerCase()) : null), complete = new Set();
    for (let i = 0; i < result.length; i++) {
      if (result[i].Parent && parents[i] === undefined) throw new Error('A node Parent must name an existing Key.');
      const trail = new Set(); let at = i;
      while (at != null && !complete.has(at)) {if (trail.has(at)) throw new Error('Tree nodes cannot contain a parent cycle.'); trail.add(at); at = parents[at];}
      for (const n of trail) complete.add(n);
    }
  }
  return result;
}
