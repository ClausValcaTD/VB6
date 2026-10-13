// One bounded publication task per live document renderer, not an idle loop.
const publications = new WeakMap();
const active = (document, renderer) => renderer && !renderer.disposed && renderer.driver && !renderer.printing && !document.hidden;

/** Publish a workspace transaction at a rendering opportunity and resolve after
 * the following opportunity. A synchronous draw/flush submits GPU work but does
 * not establish that the browser compositor has presented the canvas. Retained
 * scenes must not skip the one requested publication draw merely because their
 * commands already match a preceding synchronous submission.
 *
 * Concurrent requests coalesce; a newer transaction during the settle frame is
 * painted before any waiter resolves. Hidden/closed/printing documents cancel
 * their task. Driver, atlas, policy, and the normal fallback chain stay owned by
 * the existing renderer. No timeout, GPU readback, or perpetual RAF is required.
 */
export function commitWorkspacePresentation(documents, rendererForDocument) {
  return Promise.all(documents.map(document => {
    const renderer = rendererForDocument(document);
    if (!active(document, renderer)) return;
    renderer.invalidateStyles();
    // Transfer the scheduled frame to this transaction boundary rather than
    // build/draw once in the normal queue and immediately again in our callback.
    renderer.cancelFrame();
    const current = publications.get(renderer);
    if (current) { current.version++; return current.promise; }
    const view = document.defaultView;
    let resolve;
    const task = {version: 0, painted: -1, frame: null, promise: new Promise(done => { resolve = done; })};
    publications.set(renderer, task);
    const finish = () => {
      if (publications.get(renderer) !== task) return;
      publications.delete(renderer);
      if (task.frame !== null) view.cancelAnimationFrame(task.frame);
      task.frame = null;
      document.removeEventListener('visibilitychange', visibility);
      view.removeEventListener('pagehide', finish);
      view.removeEventListener('beforeprint', finish);
      resolve();
    };
    const visibility = () => { if (!active(document, renderer)) finish(); };
    const schedule = () => {
      if (publications.get(renderer) !== task) return;
      if (!active(document, renderer)) { finish(); return; }
      task.frame = view.requestAnimationFrame(publish);
    };
    const publish = () => {
      task.frame = null;
      if (publications.get(renderer) !== task) return;
      if (!active(document, renderer) || task.painted === task.version) { finish(); return; }
      const version = task.version;
      try { renderer.renderNow({force: true}); task.painted = version; }
      catch (error) {
        renderer.fallback(error.message || String(error));
        Promise.resolve(renderer.ready).then(schedule, finish);
        return;
      }
      // This is a completion barrier for this transaction, not a polling timer.
      schedule();
    };
    document.addEventListener('visibilitychange', visibility);
    view.addEventListener('pagehide', finish);
    view.addEventListener('beforeprint', finish);
    schedule();
    return task.promise;
  }));
}
