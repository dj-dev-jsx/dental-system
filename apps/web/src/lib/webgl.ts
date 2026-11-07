/**
 * Whether this browser can draw 3D. Older or locked-down clinic computers sometimes can't;
 * the chart then shows its flat version instead of an empty box.
 */
export function canShow3D() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
