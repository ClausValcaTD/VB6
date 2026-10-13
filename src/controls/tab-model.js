/** SSTab's saved page model, shared by the designer, browser and FRM writer.
 * No DOM, VM, or native compiler dependencies. Reads never mutate a project.
 * Microsoft VB6 reference: aa228576 (Tab), aa228561 (TabCaption), aa228581
 * (Tabs), aa228573 (TabOrientation). Original implementation; no copied code.
 */
const lower = value => String(value ?? '').toLowerCase();
const ownedKey = /^Tab\(\d+\)\.Control(?:\(\d+\)|Count|Enabled)$/i;
export const isTabControl = control => ['SSTab', 'TabStrip'].includes(control?.type);
export const controlReference = control => control.name + (control.properties?.Index == null ? '' : `(${control.properties.Index})`);
export function controlParents(form) {
  const byId = new Map(), byName = new Map(), parents = new Map();
  for (const c of form.controls || []) {
    byId.set(c.id, c);
    const name = lower(c.name), group = byName.get(name) || [];
    group.push(c); byName.set(name, group);
  }
  for (const c of form.controls || []) {
    if (!c.parent) continue;
    const explicit = byId.get(c.nativeParentId), group = byName.get(lower(c.parent)) || [];
    if (explicit && lower(explicit.name) === lower(c.parent)) parents.set(c.id, explicit);
    else if (group.length === 1) parents.set(c.id, group[0]);
  }
  return parents;
}
export function tabEntries(control) {
  const p = control.properties || {}, saved = new Map(Object.entries(p).map(([k, v]) => [lower(k), v]));
  const array = Array.isArray(p.Tabs) ? p.Tabs : null;
  const count = array?.length ?? Number(p.Tabs ?? saved.get('tabs.count') ?? 3);
  if (!Number.isInteger(count) || count < (control.type === 'SSTab' ? 1 : 0) || count > 32767) throw new RangeError('Tabs must be between 1 and 32767.');
  return Array.from({length: count}, (_, i) => {
    const item = array?.[i] || {}, group = `tabs.tab${i + 1}.`;
    return {...item, Key: item.Key ?? saved.get(group + 'key') ?? '',
      Caption: String(item.Caption ?? saved.get(`tabcaption(${i})`) ?? saved.get(group + 'caption') ?? `Tab ${control.type === 'SSTab' ? i : i + 1}`),
      Enabled: Number(item.Enabled ?? saved.get(`tabenabled(${i})`) ?? -1) !== 0,
      Visible: Number(item.Visible ?? saved.get(`tabvisible(${i})`) ?? -1) !== 0,
      Picture: item.Picture ?? saved.get(`tabpicture(${i})`) ?? '',
      Image: item.Image ?? saved.get(group + 'image')};
  });
}
export function activeTab(control) {
  const count = tabEntries(control).length, value = Number(control.properties?.Tab ?? 0);
  return count ? Math.max(0, Math.min(count - 1, Number.isInteger(value) ? value : 0)) : -1;
}
export function checkedTab(control, value) {
  const n = Number(value), count = tabEntries(control).length;
  if (!Number.isInteger(n) || n < 0 || n >= count) throw new RangeError(`Tab must be between 0 and ${count - 1}.`);
  return n;
}
/** Raw SSTab files put inactive children 75000 twips off-screen. Resolve only
 * explicit direct-child ownership; a bare array name must never pick an item.
 * Malformed legacy records stay visible and yield diagnostics rather than
 * silently hiding or moving an unrelated control.
 */
export function tabPagePlan(form, {strict = false} = {}) {
  const parents = controlParents(form), bindings = new Map(), diagnostics = [], owners = new Map();
  const problem = message => {if (strict) throw new Error(message); diagnostics.push(message);};
  const children = new Map();
  for (const c of form.controls || []) {const p = parents.get(c.id); if (p) {const list = children.get(p.id) || []; list.push(c); children.set(p.id, list);}}
  for (const owner of form.controls || []) {
    if (!isTabControl(owner)) continue;
    let entries;
    try {entries = tabEntries(owner);} catch (e) {problem(`${owner.name}: ${e.message}`); continue;}
    owners.set(owner.id, {owner, entries});
    const direct = children.get(owner.id) || [], references = new Map(direct.map(c => [lower(controlReference(c)), c]));
    const bind = (child, page, legacy = false) => {
      if (!child) {problem(`${owner.name}: missing or ambiguous tab child.`); return;}
      if (!Number.isInteger(page) || page < 0 || page >= entries.length) {problem(`${child.name}: invalid TabPage ${page}.`); return;}
      const previous = bindings.get(child.id);
      if (previous && (previous.page !== page || previous.owner.id !== owner.id)) {problem(`${child.name}: conflicting tab page ownership.`); return;}
      const shifted = legacy && owner.type === 'SSTab' && page !== activeTab(owner) && Number(child.properties.Left) <= -30000;
      bindings.set(child.id, {owner, child, page, left: shifted ? Number(child.properties.Left) + 75000 : previous?.left ?? Number(child.properties.Left || 0)});
    };
    const resolve = value => {
      if (value && typeof value === 'object') value = (value.name ?? value.Name) + ((value.index ?? value.Index) == null ? '' : `(${value.index ?? value.Index})`);
      return references.get(lower(String(value).trim().replace(/\(\s*(\d+)\s*\)$/, '($1)')));
    };
    for (const child of direct) if (child.properties?.TabPage !== undefined) bind(child, Number(child.properties.TabPage));
    for (let page = 0; page < entries.length; page++) {
      if (Array.isArray(entries[page].Controls)) for (const ref of entries[page].Controls) bind(resolve(ref), page);
    }
    for (const [name, value] of Object.entries(owner.properties || {})) {
      const m = name.match(/^Tab\((\d+)\)\.Control\((\d+)\)$/i);
      if (m) bind(resolve(value), Number(m[1]), true);
    }
  }
  return {parents, owners, bindings, diagnostics};
}
/** Convert legacy ownership to stable model IDs + TabPage before an edit.
 * Keep this inside the caller's undo transaction. Untouched imports are not
 * normalized merely by opening, selecting, or rendering the designer.
 */
export function materializeTabPages(form) {
  const plan = tabPagePlan(form, {strict: true});
  for (const {child, page, left} of plan.bindings.values()) {child.properties.Left = left; child.properties.TabPage = page;}
  for (const {owner} of plan.owners.values()) {
    for (const key of Object.keys(owner.properties)) if (ownedKey.test(key)) delete owner.properties[key];
    if (Array.isArray(owner.properties.Tabs)) for (const entry of owner.properties.Tabs) delete entry.Controls;
  }
  return plan;
}
export function setTabCount(form, owner, value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 32767) throw new RangeError('Tabs must be between 1 and 32767.');
  const plan = tabPagePlan(form, {strict: true});
  if ([...plan.bindings.values()].some(b => b.owner.id === owner.id && b.page >= count)) throw new Error('Remove or move controls from the pages being removed first.');
  const entries = tabEntries(owner);
  materializeTabPages(form);
  owner.properties.Tabs = Array.isArray(owner.properties.Tabs) ? Array.from({length: count}, (_, i) => owner.properties.Tabs[i] || {Caption: `Tab ${i}`}) : count;
  owner.properties.Tab = Math.min(activeTab({...owner, properties: {...owner.properties, Tabs: entries}}), count - 1);
  for (const key of Object.keys(owner.properties)) {
    const m = key.match(/^(?:TabCaption|TabEnabled|TabVisible|TabPicture)\((\d+)\)$/i);
    if (m && Number(m[1]) >= count) delete owner.properties[key];
  }
}
export function setTabEntry(owner, page, key, value) {
  page = checkedTab(owner, page);
  if (!['Caption', 'Enabled', 'Visible', 'Picture'].includes(key)) throw new Error('Unknown tab property: ' + key);
  if (Array.isArray(owner.properties.Tabs)) owner.properties.Tabs[page][key] = value;
  else {
    const name = `Tab${key}(${page})`;
    for (const old of Object.keys(owner.properties)) if (lower(old) === lower(name)) delete owner.properties[old];
    owner.properties[name] = value;
  }
}
/** Return a serialization-only clone with canonical SSTab page records and the
 * original VB6 inactive-page offsets. Never write browser TabPage into a FRM.
 */
export function formWithSavedTabs(form) {
  const output = structuredClone(form), plan = tabPagePlan(output, {strict: true});
  for (const {owner, entries} of plan.owners.values()) {
    if (owner.type !== 'SSTab') continue;
    const canonical = Array.isArray(owner.properties.Tabs) || [...plan.bindings.values()].some(b => b.owner.id === owner.id && b.child.properties.TabPage !== undefined);
    if (!canonical) continue;
    for (const key of Object.keys(owner.properties)) if (ownedKey.test(key)) delete owner.properties[key];
    owner.properties.Tabs = entries.length;
    for (let page = 0; page < entries.length; page++) {
      const entry = entries[page];
      owner.properties[`TabCaption(${page})`] = entry.Caption;
      owner.properties[`TabEnabled(${page})`] = entry.Enabled ? -1 : 0;
      owner.properties[`TabVisible(${page})`] = entry.Visible ? -1 : 0;
      if (entry.Picture) owner.properties[`TabPicture(${page})`] = entry.Picture;
      const pageChildren = [...plan.bindings.values()].filter(b => b.owner.id === owner.id && b.page === page);
      owner.properties[`Tab(${page}).ControlEnabled`] = page === activeTab(owner) ? -1 : 0;
      pageChildren.forEach((b, i) => {
        owner.properties[`Tab(${page}).Control(${i})`] = controlReference(b.child);
        b.child.properties.Left = b.left - (page === activeTab(owner) ? 0 : 75000);
        delete b.child.properties.TabPage;
      });
      owner.properties[`Tab(${page}).ControlCount`] = pageChildren.length;
    }
  }
  return output;
}
