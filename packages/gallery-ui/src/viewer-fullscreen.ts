// Keep fullscreen on the document so photo route changes do not destroy its target.
let owned = false;
let pending = false;

function restoreModalLayer() {
  // Fullscreen promotes the document above existing dialogs in the browser's
  // top layer. Reopen the live dialogs after that promotion (a photo route may
  // have replaced the original viewer while the fullscreen request was pending).
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[data-gallery-viewer]:modal')) {
    const focused = document.activeElement;
    // This close only changes stacking order. Its queued event must not run the
    // viewer's real close handler, which would clear the photo and navigate away.
    dialog.addEventListener('close', (event) => event.stopImmediatePropagation(), { once: true, capture: true });
    dialog.close();
    dialog.showModal();
    if (focused instanceof HTMLElement && dialog.contains(focused)) focused.focus({ preventScroll: true });
  }
}

export async function enterViewerFullscreen() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  owned = true;
  if (pending) return;
  pending = true;
  try {
    await document.documentElement.requestFullscreen();
    if (!owned) {
      // The user may leave the viewer before the browser grants fullscreen.
      if (document.fullscreenElement) await document.exitFullscreen();
      return;
    }
    restoreModalLayer();
  } catch {
    owned = false;
  } finally {
    pending = false;
  }
}
export async function exitViewerFullscreen() {
  if (!owned) return;
  owned = false;
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      /* Viewport mode still exits. */
    }
  }
}
