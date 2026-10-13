import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {importFiles, sourceFiles, parseFRM, serializeFRM} from '../src/project/formats.js';
import {newProject, createForm, createControl} from '../src/project/model.js';
import {bytesOf, decodeNativeText} from '../src/project/native-text.js';
import {tabEntries, tabPagePlan, materializeTabPages, setTabCount, setTabEntry} from '../src/controls/tab-model.js';
const entries = () => new Map(['Main.frm', 'DesignerTabs.vbp'].map(name => [name, new Uint8Array(fs.readFileSync(new URL('./fixtures/designer-tabs/' + name, import.meta.url)))]));
const load = async () => (await importFiles(entries())).project;
const text = value => decodeNativeText(bytesOf(value)).text;

test('imported SSTab no-op source save retains exact FRM and VBP bytes', async () => {
  const project = await load(), before = JSON.stringify(project), output = sourceFiles(project);
  for (const [name, bytes] of entries()) assert.deepEqual(bytesOf(output[name]), bytes, name);
  assert.equal(JSON.stringify(project), before);
});
test('numeric SSTab Tabs survives canonical FRM serialization', async () => {
  const project = await load(), module = project.modules[0]; module.form.controls[0].properties.Tabs = 5;
  const result = parseFRM(serializeFRM(module)).module;
  assert.equal(result.form.controls[0].properties.Tabs, 5);
});
test('page selection, child edit and caption survive real native save and reimport', async () => {
  const project = await load(), form = project.modules[0].form, tab = form.controls[0];
  materializeTabPages(form); tab.properties.Tab = 1;
  const child = form.controls.find(c => c.name === 'Text1' && c.properties.Index === 1);
  child.properties.Left = 750; child.properties.Text = 'Edited'; setTabEntry(tab, 1, 'Caption', 'More details'); setTabCount(form, tab, 4);
  const before = JSON.stringify(project), output = sourceFiles(project), saved = text(output['Main.frm']);
  assert.match(saved, /' Synthetic regression/); assert.match(saved, /PreviousTab As Integer/); assert.doesNotMatch(saved, /^\s*TabPage\s*=/m);
  assert.equal(JSON.stringify(project), before);
  const reloaded = (await importFiles(new Map(Object.entries(output)))).project.modules[0].form, pages = tabPagePlan(reloaded);
  const owner = reloaded.controls[0], edited = reloaded.controls.find(c => c.name === 'Text1' && c.properties.Index === 1);
  assert.equal(owner.properties.Tab, 1); assert.equal(owner.properties.Tabs, 4); assert.equal(tabEntries(owner)[1].Caption, 'More details');
  assert.equal(pages.bindings.get(edited.id).left, 750); assert.equal(edited.properties.Text, 'Edited');
  assert.equal(reloaded.controls.find(c => c.name === 'Text1' && c.properties.Index === 0).properties.Left, -74700);
  assert.equal(reloaded.controls.find(c => c.name === 'Check1').properties.Left, 300);
});
test('array-backed SSTab editor pages serialize instead of being silently dropped', async () => {
  const project = await load(), form = project.modules[0].form, tab = form.controls[0]; materializeTabPages(form);
  tab.properties.Tabs = [{Caption: 'A', Enabled: -1}, {Caption: 'B', Enabled: 0}, {Caption: 'C', Visible: 0}];
  const output = sourceFiles(project), reloaded = (await importFiles(new Map(Object.entries(output)))).project.modules[0].form;
  assert.equal(tabEntries(reloaded.controls[0])[1].Enabled, false); assert.equal(tabEntries(reloaded.controls[0])[2].Visible, false);
});

test('new SSTab writes the registered ProgID and TABCTL32 dependency', () => {
  const project = newProject('Tabs'), module = createForm('Main'); project.modules = [module]; project.startup = 'Main';
  module.form.controls.push(createControl('SSTab', 'Pages'));
  const output = sourceFiles(project), source = text(output['Main.frm']);
  assert.match(source, /Begin TabDlg\.SSTab Pages/);
  assert.match(source, /BDC217C8-ED16-11CD-956C-0000C04E4C0A/);
  assert.match(text(output['Tabs.vbp']), /TABCTL32\.OCX/);
});
