/** Runtime containment uses object identity, not the shared name of an array.
 * These plans are DOM-independent so validation completes before side effects.
 */
import {VBError} from '../language/lexer.js';
import {controlParents} from './tab-model.js';

export const isRuntimeContainer = control => ['Frame', 'PictureBox', 'TabStrip', 'SSTab'].includes(control?.type);

export function resolveRuntimeParent(form, model) {
  if (!model.parent) return null;
  const name = String(model.parent).toLowerCase();
  const candidates = form.controls.filter(c => !c.disposed && String(c.model.name).toLowerCase() === name);
  const parent = candidates.find(c => c.model.id === model.nativeParentId) || (candidates.length === 1 ? candidates[0] : null);
  if (!parent || !isRuntimeContainer(parent)) throw new VBError('Missing, ambiguous or invalid control container: ' + model.parent, 380);
  return parent;
}

export function validateRuntimeContainer(form, child, parent) {
  if (parent && (!form.controls.includes(parent) || parent.disposed || !isRuntimeContainer(parent))) throw new VBError('Invalid control container', 380);
  const seen = new Set(child ? [child.model.id] : []);
  for (let at = parent; at; at = resolveRuntimeParent(form, at.model)) {
    if (seen.has(at.model.id)) throw new VBError('Cyclic control container', 380);
    seen.add(at.model.id);
  }
  return parent;
}

/** Return child-first removal order only after every descendant is removable.
 * Refusing a design-time grandchild must not dispose an earlier dynamic sibling.
 */
export function runtimeRemovalPlan(form, target) {
  if (!target || target.disposed || !form.controls.includes(target)) throw new VBError('Control not found', 35601);
  if (!target.dynamic) throw new VBError('Cannot unload a design-time control', 365);
  const parents = controlParents({controls: form.controls.map(c => c.model)}), children = new Map();
  for (const control of form.controls) {
    const parent = parents.get(control.model.id);
    if (!parent) continue;
    const group = children.get(parent.id) || []; group.push(control); children.set(parent.id, group);
  }
  const order = [target], seen = new Set([target.model.id]);
  for (let i = 0; i < order.length; i++) for (const child of children.get(order[i].model.id) || []) {
    if (seen.has(child.model.id)) throw new VBError('Cyclic control container', 380);
    if (!child.dynamic) throw new VBError('Container includes design-time controls', 365);
    seen.add(child.model.id); order.push(child);
  }
  return order.reverse();
}
