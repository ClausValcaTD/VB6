import {el} from '../core/core.js';
import {modal, alertDialog} from './ui.js';
import {collectionDefinition, defaultCollectionItem, validateCollection} from '../designer/collections.js';
import {matrixText, matrixFromText} from '../designer/matrix-text.js';
import {activeTab, materializeTabPages, setTabCount, setTabEntry, tabEntries} from '../controls/tab-model.js';

/** Edit a private draft. Cancel and failed validation never modify a control. */
export async function collectionDialog(control, name, value) {
  const schema = collectionDefinition(control, name); if (!schema) throw new Error('Unsupported collection.');
  let draft = structuredClone(value || []), result;
  if (schema.matrix) {
    const content = el('textarea', {class: 'designer-grid-data', 'aria-label': 'Grid data', value: matrixText(draft)});
    await modal(name + ' - ' + control.name, {width: 680, content: el('div', {}, el('p', {}, 'Rows are separated by newlines; columns by tabs. Fields containing tabs, quotes or newlines use double-quote escaping.'), content), buttons: [
      {label: 'OK', value: true, primary: true, action: () => {result = matrixFromText(control, content.value, draft);}}, {label: 'Cancel', value: false}]}); return result;
  }
  const list = el('select', {size: 10, 'aria-label': name + ' items'}), fields = el('div', {class: 'dialog-grid designer-item-fields'}), toolbar = el('div', {class: 'designer-collection-actions'});
  const content = el('div', {class: 'designer-collection-editor'}, el('div', {class: 'designer-collection-list'}, list, toolbar), fields);
  let index = draft.length ? 0 : -1, editors = new Map();
  const save = () => {
    if (index < 0 || !draft[index]) return;
    const item = draft[index], previousKey = item.Key;
    for (const f of schema.fields) {
      const input = editors.get(f.name); if (!input || input.readOnly) continue;
      item[f.name] = f.type === 'boolean' ? input.checked ? -1 : 0 : f.type === 'number' ? Number(input.value) : f.type === 'lines' ? input.value === '' ? [] : input.value.split(/\r?\n/) : ['Image', 'SelectedImage', 'Icon', 'SmallIcon'].includes(f.name) && /^#\d+$/.test(input.value) ? Number(input.value.slice(1)) : input.value;
    }
    if (name === 'Nodes' && previousKey && item.Key !== previousKey) for (const node of draft) if (String(node.Parent || '').toLowerCase() === String(previousKey).toLowerCase()) node.Parent = item.Key;
  };
  const render = () => {
    list.replaceChildren(...draft.map((item, i) => el('option', {value: i}, `${i + 1} - ${item.Caption || item.Text || item.Key || '(new item)'}`))); list.value = String(index);
    fields.replaceChildren(); editors = new Map();
    if (index < 0 || !draft[index]) {fields.append(el('p', {}, 'No items. Choose Add to create one.')); return;}
    const item = draft[index];
    for (const f of schema.fields) {
      const value = item[f.name] ?? f.value, resource = value?.resource;
      const input = f.type === 'boolean' ? el('input', {type: 'checkbox', checked: !!value, 'aria-label': f.name}) : f.type === 'lines' ? el('textarea', {'aria-label': f.name, value: value.join('\n')}) : el('input', {type: f.type === 'number' ? 'number' : 'text', 'aria-label': f.name, value: resource ? `(Resource: ${value.resource})` : typeof value === 'number' && ['Image', 'SelectedImage', 'Icon', 'SmallIcon'].includes(f.name) ? '#' + value : String(value), readonly: !!resource});
      const label = el('label', {}, f.name + ':'); const id = `collection-${name}-${f.name}`; input.id = id; label.htmlFor = id; fields.append(label, input); editors.set(f.name, input);
    }
  };
  list.addEventListener('change', () => {const next = Number(list.value); save(); index = next; render();});
  const action = (label, fn) => toolbar.append(el('button', {type: 'button', 'aria-label': label + ' ' + name + ' item', onclick: () => {save(); fn(); render();}}, label));
  action('Add', () => {if (draft.length >= 10000) return; draft.push(defaultCollectionItem(control, name)); index = draft.length - 1;});
  action('Remove', () => {
    if (index < 0) return;
    const remove = new Set([draft[index]]);
    if (name === 'Nodes') {
      const keys = new Set(draft[index].Key ? [String(draft[index].Key).toLowerCase()] : []);
      for (let changed = true; changed;) {changed = false; for (const item of draft) if (!remove.has(item) && item.Parent && keys.has(String(item.Parent).toLowerCase())) {remove.add(item); if (item.Key) keys.add(String(item.Key).toLowerCase()); changed = true;}}
    }
    draft = draft.filter(item => !remove.has(item)); index = Math.min(index, draft.length - 1);
  });
  action('Move Up', () => {if (index > 0) {[draft[index - 1], draft[index]] = [draft[index], draft[index - 1]]; index--;}});
  action('Move Down', () => {if (index >= 0 && index + 1 < draft.length) {[draft[index + 1], draft[index]] = [draft[index], draft[index + 1]]; index++;}});
  render();
  await modal(name + ' - ' + control.name, {width: 660, content, buttons: [
    {label: 'OK', value: true, primary: true, action: () => {save(); result = validateCollection(control, name, draft);}}, {label: 'Cancel', value: false}
  ]}); return result;
}

/** A built-in page editor, separate from arbitrary OCX property-page hosting. */
export async function sstabPropertyPages(ide, control) {
  const module = ide.activeModule, before = JSON.stringify(module.form), form = structuredClone(module.form);
  materializeTabPages(form); const owner = form.controls.find(c => c.id === control.id); if (!owner) return;
  const pages = el('select', {size: 8, 'aria-label': 'SSTab pages'}), caption = el('input', {'aria-label': 'Page caption'}), picture = el('input', {'aria-label': 'Page picture'}), enabled = el('input', {type: 'checkbox', 'aria-label': 'Page enabled'}), visible = el('input', {type: 'checkbox', 'aria-label': 'Page visible'});
  const count = el('input', {type: 'number', min: 1, max: 32767, value: tabEntries(owner).length, 'aria-label': 'Number of tabs'});
  const orientation = el('select', {'aria-label': 'Tab orientation'}, ...['Top', 'Bottom', 'Left', 'Right'].map((label, i) => el('option', {value: i}, label))); orientation.value = String(owner.properties.TabOrientation || 0);
  const rows = el('input', {type: 'number', min: 1, max: 32767, value: owner.properties.TabsPerRow || 3, 'aria-label': 'Tabs per row'});
  const height = el('input', {type: 'number', min: 0, max: 300000, value: owner.properties.TabHeight ?? 360, 'aria-label': 'Tab height'});
  const maxWidth = el('input', {type: 'number', min: 0, max: 300000, value: owner.properties.TabMaxWidth || 0, 'aria-label': 'Maximum tab width'});
  const style = el('select', {'aria-label': 'Tab style'}, el('option', {value: 0}, 'Tabbed Dialog'), el('option', {value: 1}, 'Property Page')); style.value = String(owner.properties.Style || 0);
  let page = activeTab(owner), resourcePicture = null;
  const savePage = () => {setTabEntry(owner, page, 'Caption', caption.value); if (!picture.readOnly) setTabEntry(owner, page, 'Picture', picture.value); setTabEntry(owner, page, 'Enabled', enabled.checked ? -1 : 0); setTabEntry(owner, page, 'Visible', visible.checked ? -1 : 0);};
  const render = () => {
    const entries = tabEntries(owner), entry = entries[page]; pages.replaceChildren(...entries.map((tab, i) => el('option', {value: i}, i + ' - ' + tab.Caption))); pages.value = String(page);
    caption.value = entry.Caption; resourcePicture = entry.Picture?.resource; picture.readOnly = !!resourcePicture; picture.value = resourcePicture ? `(Resource: ${resourcePicture})` : entry.Picture || ''; enabled.checked = entry.Enabled; visible.checked = entry.Visible;
  };
  pages.addEventListener('change', () => {const next = Number(pages.value); savePage(); page = next; render();});
  const applyCount = () => {savePage(); setTabCount(form, owner, Number(count.value)); page = Math.min(page, tabEntries(owner).length - 1); render();};
  const content = el('div', {class: 'designer-sstab-properties'}, el('fieldset', {}, el('legend', {}, 'General'), el('div', {class: 'dialog-grid'}, el('label', {}, 'Tabs:'), count, el('label', {}, 'Orientation:'), orientation, el('label', {}, 'Tabs per row:'), rows, el('label', {}, 'Tab height (twips):'), height, el('label', {}, 'Maximum width (twips):'), maxWidth, el('label', {}, 'Style:'), style), el('button', {onclick: () => {try {applyCount();} catch (e) {count.value = String(tabEntries(owner).length); alertDialog(e.message, 'Invalid tab count');}}}, 'Apply tab count to preview')),
    el('fieldset', {}, el('legend', {}, 'Pages'), el('div', {class: 'designer-collection-editor'}, pages, el('div', {class: 'dialog-grid'}, el('label', {}, 'Caption:'), caption, el('label', {}, 'Picture asset:'), picture, el('label', {}, 'Enabled:'), enabled, el('label', {}, 'Visible at run time:'), visible))));
  render(); let accepted = false;
  await modal('Property Pages - ' + control.name, {width: 650, content, buttons: [
    {label: 'OK', value: true, primary: true, action: () => {
      applyCount(); const numbers = {TabsPerRow: [rows, 1, 32767], TabHeight: [height, 0, 300000], TabMaxWidth: [maxWidth, 0, 300000]};
      for (const [name, [input, min, max]] of Object.entries(numbers)) {const value = Number(input.value); if (!Number.isInteger(value) || value < min || value > max) throw new Error(name + ' is outside its valid range.'); owner.properties[name] = value;}
      Object.assign(owner.properties, {Tab: page, TabOrientation: Number(orientation.value), Style: Number(style.value)});
      if (ide.runState !== 'design' || ide.designer.locked || ide.activeModule !== module || JSON.stringify(module.form) !== before) throw new Error('The form changed while the property pages were open. Reopen the editor before applying.');
      accepted = true;
    }}, {label: 'Cancel', value: false}]
  });
  if (accepted) {ide.designer.transaction('Edit SSTab property pages', () => {module.form = form;}); ide.designer.render();}
}
