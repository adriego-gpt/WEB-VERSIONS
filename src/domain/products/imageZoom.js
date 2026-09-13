export function clampImagePan(pan, scale, width, height) {
  const maxX = Math.max(0, width * (scale - 1) / 2);
  const maxY = Math.max(0, height * (scale - 1) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}

// Keep the image point under the pointer stationary as the scale changes.
// All coordinates and translations are viewport pixels, not scaled pixels.
export function zoomImageAtPoint({ scale, nextScale, pan, point, center }) {
  const ratio = nextScale / scale;
  return {
    x: point.x - center.x - (point.x - center.x - pan.x) * ratio,
    y: point.y - center.y - (point.y - center.y - pan.y) * ratio,
  };
}
