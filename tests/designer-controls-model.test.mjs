import test from 'node:test';
import assert from 'node:assert/strict';
import {createControl, createForm, CONTROL_DEFAULTS} from '../src/project/model.js';
import {controlParents, tabPagePlan} from '../src/controls/tab-model.js';
import {addControl, copyControls, deleteControls, descendantIds, normalizeSize, pasteControls, resizeAxes, selectionRoots, setTabIndex, tabOrderEligible, visibleDesignerIds} from '../src/designer/control-model.js';
import {designerPropertyValues, editDesignerProperties} from '../src/designer/property-model.js';
import {validateCollection} from '../src/designer/collections.js';
function nested() {
  const form = createForm().form, a = createControl('Frame', 'Frame1'), b = createControl('Frame', 'Frame1'), inner = createControl('PictureBox', 'Pic1'), child = createControl('TextBox', 'Text1');
  a.properties.Index = 0; b.properties.Index = 1; inner.parent = a.name; inner.nativeParentId = a.id; child.parent = inner.name; child.nativeParentId = inner.id;
  form.controls = [child, b, inner, a]; return {form, a, b, inner, child};
}
test('deletion uses exact identities, includes arbitrary-order descendants, preserves sibling array elements', () => {
  const {form, a, b, inner, child} = nested(); assert.deepEqual(descendantIds(form, [a.id]), new Set([a.id, inner.id, child.id]));
  deleteControls(form, [a.id]); assert.deepEqual(form.controls.map(c => c.id), [b.id]);
});
test('copy/paste retains nested offsets, remaps all parent IDs, and offsets roots once', () => {
  const {form, a, inner, child} = nested(), before = JSON.stringify(form), clipboard = copyControls(form, [a.id]);
  assert.equal(clipboard.length, 3); assert.equal(JSON.stringify(form), before);
  const created = pasteControls(form, clipboard, {sourceFormId: form.id}), root = created.find(c => c.type === 'Frame'), parent = created.find(c => c.type === 'PictureBox'), leaf = created.find(c => c.type === 'TextBox');
  assert.equal(root.properties.Left, a.properties.Left + 240); assert.equal(parent.properties.Left, inner.properties.Left); assert.equal(leaf.properties.Left, child.properties.Left);
  assert.equal(parent.nativeParentId, root.id); assert.equal(leaf.nativeParentId, parent.id); assert.equal(controlParents(form).get(leaf.id), parent);
});
test('array copy retains one shared new name and all distinct indices', () => {
  const {form, a, b} = nested(), copies = pasteControls(form, copyControls(form, [a.id, b.id]), {sourceFormId: form.id}).filter(c => c.type === 'Frame');
  assert.equal(copies.length, 2); assert.equal(copies[0].name, copies[1].name); assert.notEqual(copies[0].name, a.name); assert.deepEqual(new Set(copies.map(c => c.properties.Index)), new Set([0, 1]));
});
test('cross-form paste detaches external parents; same-form cut retains valid external parents', () => {
  const {form, inner, child} = nested(), clipboard = copyControls(form, [child.id]); deleteControls(form, [child.id]);
  const [same] = pasteControls(form, clipboard, {sourceFormId: form.id}); assert.equal(same.nativeParentId, inner.id);
  const other = createForm().form, [cross] = pasteControls(other, clipboard, {sourceFormId: form.id}); assert.equal(cross.parent, null); assert.equal(cross.nativeParentId, null);
});
test('moving selected parents and descendants uses only roots', () => {
  const {form, a, inner, child} = nested(); assert.deepEqual(selectionRoots(form, [child, a, inner]), [a]);
});
test('tab-order edits are dense, shift siblings, exclude non-tab controls and retain Label/Frame', () => {
  const form = createForm().form; form.controls = ['TextBox', 'Frame', 'Label', 'Timer', 'Image', 'Data', 'CommandButton'].map((type, i) => {const c = createControl(type); c.properties.TabIndex = i; return c;});
  setTabIndex(form, [form.controls[6]], 0);
  assert.equal(form.controls[6].properties.TabIndex, 0); assert.equal(form.controls[0].properties.TabIndex, 1); assert.equal(form.controls[2].properties.TabIndex, 3);
  assert.throws(() => setTabIndex(form, [form.controls[3]], 0), /no TabIndex/);
});
test('all built-in controls have designer geometry, capabilities and property defaults', () => {
  for (const type of Object.keys(CONTROL_DEFAULTS)) {
    const control = createControl(type), form = createForm().form; form.controls.push(control);
    const values = designerPropertyValues(control, form); assert.equal(values.Name, control.name, type); assert.equal(values.Left, 300, type);
    const next = editDesignerProperties(form, [control.id], {Left: 450, Top: 600}); assert.equal(next.controls[0].properties.Left, 450, type); assert.equal(form.controls[0].properties.Left, 300, type);
    const axes = resizeAxes(control), size = normalizeSize(control, 900, 750); assert.equal(size.Width, axes.x ? 900 : control.properties.Width, type); assert.equal(size.Height, axes.y ? 750 : control.properties.Height, type);
    if (!tabOrderEligible(control)) assert.equal('TabIndex' in values, false, type);
  }
});
test('invalid multi-selection size and Index updates leave the form untouched', () => {
  const {form, a, b} = nested(), before = JSON.stringify(form);
  assert.throws(() => editDesignerProperties(form, [a.id, b.id], {Left: 750, Height: -1}), /geometry/);
  assert.throws(() => editDesignerProperties(form, [a.id], {Index: 1}), /already exists/);
  assert.throws(() => editDesignerProperties(form, [a.id], {Index: undefined}), /already exists/);
  assert.equal(JSON.stringify(form), before);
});
test('SSTab edits apply count before selection and aliases; active pages govern new children', () => {
  const form = createForm().form, owner = createControl('SSTab', 'Pages'); form.controls = [owner];
  const next = editDesignerProperties(form, [owner.id], {Caption: 'Fourth', Tab: 3, Tabs: 4});
  assert.equal(designerPropertyValues(next.controls[0], next).Caption, 'Fourth');
  const child = addControl(next, 'TextBox', 'Text1', {Left: 300, Top: 600}, next.controls[0]); assert.equal(child.properties.TabPage, 3);
  next.controls[0].properties.Tab = 0; assert.equal(visibleDesignerIds(next).has(child.id), false);
  next.controls[0].properties.Tab = 3; assert.equal(visibleDesignerIds(next).has(child.id), true);
  const clipboard = copyControls(next, [child.id]); next.controls[0].properties.Tab = 1;
  const [copy] = pasteControls(next, clipboard, {sourceFormId: next.id, target: next.controls[0]}); assert.equal(tabPagePlan(next).bindings.get(copy.id).page, 1);
});
test('structured collection validation preserves extra fields and rejects duplicate keys and node cycles', () => {
  const control = createControl('TreeView'); const value = [{Key: 'child', Parent: 'root', Text: 'C', Vendor: {x: 1}}, {Key: 'root', Text: 'R'}];
  const result = validateCollection(control, 'Nodes', value); assert.deepEqual(result[0].Vendor, {x: 1}); assert.equal(value[0].Expanded, undefined);
  assert.throws(() => validateCollection(control, 'Nodes', [{Key: 'A'}, {Key: 'a'}]), /unique/);
  assert.throws(() => validateCollection(control, 'Nodes', [{Key: 'A', Parent: 'B'}, {Key: 'B', Parent: 'A'}]), /cycle/);
  assert.throws(() => validateCollection(control, 'Nodes', [{Key: 'A', Parent: 'missing'}]), /existing/);
});
