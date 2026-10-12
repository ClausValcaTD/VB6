/** Publish chrome and retained paint together after a workspace transaction.
 * MutationObserver delivery alone leaves a window in which native input/text
 * has new geometry/colors but the covering canvas still contains old pixels.
 * Reuse the live driver/atlas; never rewrite the user's rendering policy.
 * Called only by the coalesced workspace sync or the mode-off boundary.
 */
export function commitWorkspacePresentation(documents, rendererForDocument) {
  for (const document of documents) {
    const renderer = rendererForDocument(document);
    if (!renderer || renderer.disposed || !renderer.driver || renderer.printing || document.hidden) continue;
    renderer.invalidateStyles();
    try { renderer.renderNow(); }
    catch (error) { renderer.fallback(error.message || String(error)); }
  }
}
