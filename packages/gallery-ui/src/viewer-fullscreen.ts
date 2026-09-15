// Keep fullscreen on the document so photo route changes do not destroy its target.
let owned = false;
export async function enterViewerFullscreen() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  owned = true;
  try {
    await document.documentElement.requestFullscreen();
  } catch {
    owned = false;
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
