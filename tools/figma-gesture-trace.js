/** Read-only test evidence. Install before workspace listeners so capture-phase
 * records show the state presented to handlers, not only their final cleanup.
 * Never drives input, redraws, repairs a gesture or changes its expected result. */
(() => {
  const records = [];
  const label = node => node?.nodeType === 1 ? {
    tag: node.tagName, classes: node.className?.baseVal ?? node.className,
    grip: node.dataset?.assetGrip, control: node.dataset?.controlId,
  } : {tag: node === window ? 'window' : node?.nodeName};
  const capture = (event, phase = 'capture') => {
    const ide = window.vb6Studio, workspace = ide?.figmaMode, d = ide?.designer;
    const point = Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
    const under = point ? document.elementFromPoint(event.clientX, event.clientY) : null;
    const chain = [];
    for (let n = under; n && chain.length < 6; n = n.parentElement) chain.push(label(n));
    const rect = d?.formView?.content?.getBoundingClientRect();
    records.push({event: event.type, phase, time: performance.now(),
      x: event.clientX, y: event.clientY, pointer: event.pointerId,
      button: event.button, buttons: event.buttons, prevented: event.defaultPrevented,
      target: label(event.target), under: chain,
      active: !!workspace?.ui?.assets?.active,
      currentDesigner: workspace?.currentDesigner() === d,
      captured: event.pointerId != null && !!ide?.root.hasPointerCapture(event.pointerId),
      inContent: !!under && !!d?.formView?.content?.contains(under),
      content: rect && {x: rect.x, y: rect.y, w: rect.width, h: rect.height},
      viewport: workspace?.viewports?.get(d)?.state,
      revision: ide?.visualRevision, runState: ide?.runState,
      preview: document.querySelector('.figma-asset-ghost')?.textContent,
      previewHidden: document.querySelector('.figma-asset-ghost')?.hidden,
      modal: !!document.querySelector('.ide-modal-cover'),
    });
    if (records.length > 256) records.shift();
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'gotpointercapture', 'lostpointercapture', 'dragstart', 'dragend']) {
    document.addEventListener(type, event => capture(event), true);
  }
  window.addEventListener('blur', event => capture(event));
  window.testAssetGestureRecords = records;
})();
