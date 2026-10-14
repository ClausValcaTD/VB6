/** Shared design-time geometry, identity, containment and tab-order rules. */
import {createControl, newId, CONTROL_DEFAULTS} from '../project/model.js';
import {activeTab, controlParents, materializeTabPages, tabPagePlan} from '../controls/tab-model.js';

const noTabIndex = new Set(['Menu', 'Timer', 'Data', 'Adodc', 'Image', 'Shape', 'Line', 'ImageList', 'CommonDialog']);
const fixedSize = new Set(['Timer', 'ImageList', 'CommonDialog']);
export const tabOrderEligible = control => !noTabIndex.has(control.type);
export const designContainer = control => ['Frame', 'PictureBox', 'SSTab'].includes(control?.type);
export function resizeAxes(control) {
  if (fixedSize.has(control.type)) return {x: false, y: false};
  return {x: true, y: !(control.type === 'DriveListBox' || control.type === 'ComboBox' && Number(control.properties.Style || 0) !== 1)};
}
export function normalizeSize(control, width, height) {
  const axes = resizeAxes(control), minimum = control.type === 'Line' ? 0 : 15;
  const defaults = CONTROL_DEFAULTS[control.type] || {}, p = control.properties || {};
  const currentWidth = Number(p.Width ?? defaults.Width ?? 1800), currentHeight = Number(p.Height ?? defaults.Height ?? 450);
  width = Number(width ?? currentWidth); height = Number(height ?? currentHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Invalid control size.');
  return {Width: axes.x ? Math.max(minimum, Math.min(300000, width)) : currentWidth,
    Height: axes.y ? Math.max(minimum, Math.min(300000, height)) : currentHeight};
}
export function tabOrderedControls(form) {
  return form.controls.filter(tabOrderEligible).map((control, order) => ({control, order})).sort((a, b) => (Number(a.control.properties.TabIndex) || 0) - (Number(b.control.properties.TabIndex) || 0) || a.order - b.order).map(({control}) => control);
}
export function normalizeTabOrder(form) {tabOrderedControls(form).forEach((c, i) => c.properties.TabIndex = i);}
export function setTabIndex(form, controls, value) {
  if (controls.some(c => !tabOrderEligible(c))) throw new Error('This control has no TabIndex.');
  const all = tabOrderedControls(form), selected = new Set(controls.map(c => c.id)), index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= all.length) throw new Error(`TabIndex must be between 0 and ${Math.max(0, all.length - 1)}.`);
  const order = all.filter(c => !selected.has(c.id));
  order.splice(Math.min(index, order.length), 0, ...all.filter(c => selected.has(c.id)));
  order.forEach((c, i) => c.properties.TabIndex = i);
}
export function descendantIds(form, selected) {
  const result = new Set(selected), children = new Map();
  for (const [id, parent] of controlParents(form)) {const list = children.get(parent.id) || []; list.push(id); children.set(parent.id, list);}
  const queue = [...result];
  for (let i = 0; i < queue.length; i++) for (const id of children.get(queue[i]) || []) if (!result.has(id)) {result.add(id); queue.push(id);}
  return result;
}
export function selectionRoots(form, controls) {
  const selected = new Set(controls.map(c => c.id)), parents = controlParents(form);
  return controls.filter(c => {
    const seen = new Set([c.id]);
    for (let parent = parents.get(c.id); parent; parent = parents.get(parent.id)) {
      if (selected.has(parent.id) || seen.has(parent.id)) return false;
      seen.add(parent.id);
    }
    return true;
  });
}
export function visibleDesignerIds(form, plan = tabPagePlan(form)) {
  const visible = new Map();
  for (const control of form.controls) {
    const trail = [], visiting = new Set(); let node = control, value = true;
    while (node && !visible.has(node.id)) {
      if (visiting.has(node.id)) {value = false; break;}
      visiting.add(node.id); trail.push(node);
      const binding = plan.bindings.get(node.id);
      if (binding && binding.page !== activeTab(binding.owner)) {value = false; break;}
      node = plan.parents.get(node.id);
    }
    if (node && visible.has(node.id)) value = visible.get(node.id);
    for (const item of trail) visible.set(item.id, value);
  }
  return new Set([...visible].filter(([, value]) => value).map(([id]) => id));
}
export function deleteControls(form, ids) {
  materializeTabPages(form);
  const remove = descendantIds(form, ids);
  form.controls = form.controls.filter(c => !remove.has(c.id));
  normalizeTabOrder(form);
}
export function copyControls(form, ids) {
  const copy = structuredClone(form); materializeTabPages(copy);
  const include = descendantIds(copy, ids);
  return copy.controls.filter(c => include.has(c.id));
}
export function pasteControls(form, clipboard, {sourceFormId, target = null, id = newId} = {}) {
  if (!clipboard.length) return [];
  if (form.controls.length + clipboard.length > 10000) throw new Error('Control limit exceeded (10,000).');
  materializeTabPages(form);
  const sourceParents = controlParents({controls: clipboard}), originals = new Map(clipboard.map(c => [c.id, c]));
  if (!designContainer(target) || originals.has(target?.id)) target = null;
  const existingParents = controlParents(form), existing = new Map(form.controls.map(c => [c.id, c]));
  const names = new Set(form.controls.map(c => c.name.toLowerCase())), nameMap = new Map(), idMap = new Map();
  for (const c of clipboard) {
    const key = c.name.toLowerCase();
    if (!nameMap.has(key)) {
      const base = c.name.replace(/\d+$/, '') || c.type; let suffix = 1, name;
      do {name = base + suffix++;} while (names.has(name.toLowerCase()));
      names.add(name.toLowerCase()); nameMap.set(key, name);
    }
    idMap.set(c.id, id());
  }
  const created = clipboard.map(item => {
    const control = structuredClone(item); control.id = idMap.get(item.id); control.name = nameMap.get(item.name.toLowerCase()); control.properties.Name = control.name;
    const copiedParent = sourceParents.get(item.id);
    if (copiedParent) {
      control.parent = nameMap.get(copiedParent.name.toLowerCase()); control.nativeParentId = idMap.get(copiedParent.id);
    } else {
      const candidates = form.controls.filter(c => c.name.toLowerCase() === String(item.parent || '').toLowerCase());
      const previousParent = sourceFormId === form.id ? existing.get(item.nativeParentId) || existingParents.get(item.id) || (candidates.length === 1 ? candidates[0] : null) : null;
      const parent = target || previousParent;
      control.parent = parent?.name ?? null; control.nativeParentId = parent?.id ?? null;
      control.properties.Left = Number(control.properties.Left || 0) + 240;
      control.properties.Top = Number(control.properties.Top || 0) + 240;
      if (parent?.type === 'SSTab') control.properties.TabPage = activeTab(parent);
      else delete control.properties.TabPage;
    }
    return control;
  });
  let tabIndex = tabOrderedControls(form).length;
  for (const control of created) if (tabOrderEligible(control)) control.properties.TabIndex = tabIndex++;
  form.controls.push(...created); normalizeTabOrder(form); return created;
}
export function addControl(form, type, name, bounds, parent = null, defaults = {}) {
  if (form.controls.length >= 10000) throw new Error('Control limit exceeded (10,000).');
  materializeTabPages(form);
  const control = createControl(type, name, bounds.Left, bounds.Top);
  Object.assign(control.properties, defaults, {Name: name, Left: bounds.Left, Top: bounds.Top});
  if (bounds.Width !== undefined) Object.assign(control.properties, normalizeSize(control, bounds.Width, bounds.Height));
  if (parent) {
    if (!designContainer(parent)) throw new Error('This control is not a designer container.');
    control.parent = parent.name; control.nativeParentId = parent.id;
    if (parent.type === 'SSTab') control.properties.TabPage = activeTab(parent);
  }
  if (tabOrderEligible(control)) control.properties.TabIndex = tabOrderedControls(form).length;
  form.controls.push(control); normalizeTabOrder(form); return control;
}
