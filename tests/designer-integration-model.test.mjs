import test from 'node:test';
import assert from 'node:assert/strict';
import {createForm, createControl} from '../src/project/model.js';
import {tabPagePlan, materializeTabPages, formWithSavedTabs} from '../src/controls/tab-model.js';
import {designerPropertyValues} from '../src/designer/property-model.js';
import {deleteControls, normalizeSize} from '../src/designer/control-model.js';
import {renamedDesignerForm, captureDesignerEdit} from '../src/ide/designer-integration.js';
import {defaultEventSignature} from '../src/editor/language-service.js';

function fixture() {
  const form = createForm().form, owner = createControl('SSTab', 'Pages'), child = createControl('TextBox', 'Text1');
  child.parent = owner.name; child.nativeParentId = owner.id;
  Object.assign(owner.properties, {Tab: 0, 'Tab(1).Control(0)': child.name, 'Tab(1).ControlCount': 1});
  child.properties.Left = -74700; form.controls = [owner, child];
  return {form, owner, child};
}

test('FRM inactive offsets are decoded by ownership, not a guessed position threshold', () => {
  for (const left of [-74985, -15000, 10000]) {
    const {form, child} = fixture(); child.properties.Left = left;
    assert.equal(tabPagePlan(form).bindings.get(child.id).left, left + 75000);
    materializeTabPages(form); assert.equal(child.properties.Left, left + 75000);
    const saved = formWithSavedTabs(form); assert.equal(saved.controls[1].properties.Left, left);
  }
});
test('deleting the last page child retains explicit empty native page ownership', () => {
  const {form, child} = fixture(); deleteControls(form, [child.id]);
  const saved = formWithSavedTabs(form);
  for (let i = 0; i < 3; i++) assert.equal(saved.controls[0].properties[`Tab(${i}).ControlCount`], 0);
  assert.equal(saved.controls[0].properties['Tab(1).Control(0)'], undefined);
});
test('canonical live props never apply the inactive native offset twice', () => {
  const {form, owner, child} = fixture(); child.properties.TabPage = 1; child.properties.Left = 450;
  assert.equal(tabPagePlan(form).bindings.get(child.id).left, 450);
  materializeTabPages(form); owner.properties.Tab = 1;
  assert.equal(formWithSavedTabs(form).controls[1].properties.Left, 450);
});
test('array rename retains exact page ownership and updates each array member once', () => {
  const {form, owner, child} = fixture(); child.properties.Index = 0;
  owner.properties['Tab(1).Control(0)'] = 'Text1(0)';
  const another = structuredClone(child); another.id += '_copy'; another.properties.Index = 4;
  form.controls.push(another); owner.properties['Tab(1).Control(1)'] = 'Text1(4)';
  const before = JSON.stringify(form), renamed = renamedDesignerForm(form, child.id, 'Editor');
  assert.equal(JSON.stringify(form), before);
  assert.deepEqual(renamed.controls.slice(1).map(c => c.name), ['Editor', 'Editor']);
  assert.deepEqual(renamed.controls.slice(1).map(c => c.properties.Index), [0, 4]);
  const saved = formWithSavedTabs(renamed);
  assert.equal(saved.controls[0].properties['Tab(1).Control(0)'], 'Editor(0)');
  assert.equal(saved.controls[0].properties['Tab(1).Control(1)'], 'Editor(4)');
});
test('container rename updates exact child identity and rejects menu/form collisions atomically', () => {
  const {form, owner, child} = fixture(); form.menus.push({id:'menu',name:'mnuFile',type:'Menu',properties:{}});
  const next = renamedDesignerForm(form, owner.id, 'DialogTabs');
  assert.equal(next.controls[1].parent, 'DialogTabs'); assert.equal(next.controls[1].nativeParentId, owner.id);
  const before = JSON.stringify(form);
  for (const value of [form.name, 'mnuFile', 'bad name', '0Tabs']) assert.throws(() => renamedDesignerForm(form, child.id, value));
  assert.equal(JSON.stringify(form), before);
});
test('omitted native dimensions use control defaults when resizing', () => {
  assert.deepEqual(normalizeSize({type:'Timer',properties:{}}, 900, 900), {Width:420,Height:420});
  assert.deepEqual(normalizeSize({type:'ComboBox',properties:{}}, 3000, 900), {Width:3000,Height:315});
  assert.throws(() => normalizeSize({type:'TextBox',properties:{}}, NaN, 20), /size/);
});
test('native TabStrip property groups open as structured editable tabs', () => {
  const c = {id:'tab',name:'TabStrip1',type:'TabStrip',properties:{'Tabs.Count':2,'Tabs.Tab1.Caption':'One','Tabs.Tab2.Caption':'Two'}};
  assert.deepEqual(designerPropertyValues(c).Tabs.map(t=>t.Caption), ['One','Two']);
});
test('stale property dialogs cannot write through after a selection/form/state change', () => {
  const {form, child} = fixture(), module={form}, ide={project:{},activeModule:module,runState:'design',designer:{selected:()=>[child]}};
  const check = captureDesignerEdit(ide); check(); form.controls[0].properties.Tab=1;
  assert.throws(check,/changed/); form.controls[0].properties.Tab=0; check(); ide.runState='running'; assert.throws(check,/changed/);
});
test('SSTab default handler declares the PreviousTab ABI, not generic Click()', () => {
  assert.equal(defaultEventSignature('SSTab','Click'),'PreviousTab As Integer');
  assert.equal(defaultEventSignature('TabStrip','Click'),'');
});

import {validateCollection} from '../src/designer/collections.js';
import {matrixText, matrixFromText, parseMatrixText} from '../src/designer/matrix-text.js';
test('optional undefined collection fields get defaults, invalid booleans/numbers are rejected', () => {
  const tabs = {type:'TabStrip'}, toolbar = {type:'Toolbar'}, grid = {type:'MSFlexGrid'};
  assert.equal(validateCollection(tabs,'Tabs',[{Caption:'One',Image:undefined}])[0].Image, '');
  assert.throws(()=>validateCollection(toolbar,'Buttons',[{Enabled:'0'}]), /Boolean/);
  assert.throws(()=>validateCollection(grid,'GridData',[[Infinity]]), /scalar/);
  assert.throws(()=>validateCollection(grid,'GridData',[[NaN]]), /scalar/);
});
test('quoted matrix text round-trips tabs, quotes, multiline cells and scalar types without mutation', () => {
  const original = [['a\tb','a"b','line1\r\nline2',null,17,true],[],['']], control={type:'MSFlexGrid'};
  const text = matrixText(original), before = JSON.stringify(original);
  assert.deepEqual(matrixFromText(control,text.replace(/\r\n/g,'\n'),original),original);
  const changed = matrixFromText(control,text.replace('a\tb','changed\ttext'),original);
  assert.equal(changed[0][0],'changed\ttext'); assert.equal(changed[0][2],'line1\r\nline2'); assert.equal(changed[0][4],17);
  assert.equal(JSON.stringify(original),before);
  assert.deepEqual(parseMatrixText('a\tb\n"c\nd"\t"e""f"'),[['a','b'],['c\nd','e"f']]);
  assert.throws(()=>parseMatrixText('"unterminated'), /Unterminated/);
  assert.throws(()=>parseMatrixText('"a"trailing'), /Unexpected/);
  assert.throws(()=>matrixFromText({type:'MSChart'},'not a number'), /finite/);
});
test('locking controls while a property editor is open invalidates its commit', () => {
  const {form,child}=fixture(),ide={project:{},activeModule:{form},runState:'design',designer:{selected:()=>[child],locked:false}};
  const check=captureDesignerEdit(ide);check();ide.designer.locked=true;assert.throws(check,/changed/);
});
