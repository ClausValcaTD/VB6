import test from 'node:test';
import assert from 'node:assert/strict';
import {createForm, createControl} from '../src/project/model.js';
import {activeTab, tabEntries, tabPagePlan, materializeTabPages, setTabCount, setTabEntry, formWithSavedTabs, controlParents} from '../src/controls/tab-model.js';
function fixture() {
  const form = createForm().form, tab = createControl('SSTab', 'Pages'), a = createControl('TextBox', 'Text1'), b = createControl('TextBox', 'Text1');
  Object.assign(tab.properties, {Tabs: 2, 'TabCaption(0)': '&First', 'TabCaption(1)': 'Second', 'Tab(0).Control(0)': 'Text1(2)', 'Tab(1).Control(0)': 'text1(9)', 'Tab(0).ControlCount': 1, 'Tab(1).ControlCount': 1});
  for (const c of [a, b]) {c.parent = tab.name; c.nativeParentId = tab.id;}
  a.properties.Index = 2; b.properties.Index = 9; b.properties.Left = -74700;
  form.controls = [tab, a, b]; return {form, tab, a, b};
}
test('imported SSTab captions, indexed ownership and offsets are read without mutation', () => {
  const {form, tab, a, b} = fixture(), before = JSON.stringify(form), plan = tabPagePlan(form);
  assert.equal(tabEntries(tab)[0].Caption, '&First');
  assert.equal(plan.bindings.get(a.id).page, 0); assert.equal(plan.bindings.get(b.id).page, 1); assert.equal(plan.bindings.get(b.id).left, 300);
  assert.equal(JSON.stringify(form), before); assert.deepEqual(plan.diagnostics, []);
});
test('materialization is idempotent and saves canonical page edits back to VB6 offsets', () => {
  const {form, tab, b} = fixture(); materializeTabPages(form); const first = JSON.stringify(form); materializeTabPages(form); assert.equal(JSON.stringify(form), first);
  assert.equal(b.properties.Left, 300); assert.equal(b.properties.TabPage, 1); assert.equal(tab.properties['Tab(1).Control(0)'], undefined);
  tab.properties.Tab = 1; b.properties.Left = 450;
  const saved = formWithSavedTabs(form);
  assert.equal(saved.controls[1].properties.Left, -74700); assert.equal(saved.controls[2].properties.Left, 450); assert.equal(saved.controls[2].properties.TabPage, undefined);
  assert.equal(saved.controls[0].properties['Tab(1).Control(0)'], 'Text1(9)'); assert.equal(b.properties.TabPage, 1);
});
test('ambiguous array references diagnose rather than assign a random element', () => {
  const {form, tab, b} = fixture(); tab.properties['Tab(1).Control(0)'] = 'Text1';
  assert.equal(tabPagePlan(form).bindings.has(b.id), false); assert.equal(tabPagePlan(form).diagnostics.length, 1);
  assert.throws(() => materializeTabPages(form), /ambiguous/);
});
test('indexed parent identity is respected, including array element zero', () => {
  const {form, tab, a} = fixture(), other = structuredClone(tab); other.id = 'other'; tab.properties.Index = 0; other.properties.Index = 1; form.controls.push(other);
  assert.equal(controlParents(form).get(a.id), tab); a.nativeParentId = null; assert.equal(controlParents(form).has(a.id), false);
});
test('nonempty page removal is atomic; safe resizing preserves active page and captions', () => {
  const {form, tab} = fixture(), before = JSON.stringify(form);
  assert.throws(() => setTabCount(form, tab, 1), /move controls/); assert.equal(JSON.stringify(form), before);
  setTabCount(form, tab, 4); assert.equal(tabEntries(tab).length, 4); assert.equal(activeTab(tab), 0);
  tab.properties.Tab = 3; setTabEntry(tab, 3, 'Caption', 'Fourth'); setTabCount(form, tab, 3); assert.equal(activeTab(tab), 2); assert.equal(tab.properties['TabCaption(3)'], undefined);
  for (const bad of [0, -1, 1.5, Infinity, 32768]) assert.throws(() => setTabCount(form, tab, bad), /Tabs/);
});
test('collection and raw formats agree, disabled and invisible page metadata survives', () => {
  const {form, tab, a, b} = fixture(); materializeTabPages(form);
  tab.properties.Tabs = [{Caption: 'A', Enabled: 0}, {Caption: 'B', Visible: 0}];
  const saved = formWithSavedTabs(form), entries = tabEntries(saved.controls[0]);
  assert.equal(entries[0].Enabled, false); assert.equal(entries[1].Visible, false);
  assert.equal(tabPagePlan(saved).bindings.get(a.id).page, 0); assert.equal(tabPagePlan(saved).bindings.get(b.id).page, 1);
});
test('TabStrip FRM property groups use their own captions, keys and count', () => {
  const control = {type: 'TabStrip', properties: {'Tabs.Count': 2, 'Tabs.Tab1.Caption': 'One', 'Tabs.Tab1.Key': 'one', 'Tabs.Tab2.Caption': 'Two'}};
  assert.deepEqual(tabEntries(control).map(t => t.Caption), ['One', 'Two']); assert.equal(tabEntries(control)[0].Key, 'one');
});
