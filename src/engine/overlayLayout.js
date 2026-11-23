export function fitOverlay(canvasWidth, canvasHeight, width, height, centerX, centerY) {
  const margin = Math.min(canvasWidth, canvasHeight) * 0.025;
  const scale = Math.min(1, (canvasWidth - margin * 2) / width, (canvasHeight - margin * 2) / height);
  const fittedWidth = width * scale;
  const fittedHeight = height * scale;
  return {
    x: Math.max(margin, Math.min(canvasWidth - margin - fittedWidth, canvasWidth * centerX / 100 - fittedWidth / 2)),
    y: Math.max(margin, Math.min(canvasHeight - margin - fittedHeight, canvasHeight * centerY / 100 - fittedHeight / 2)),
    width: fittedWidth,
    height: fittedHeight,
    scale,
  };
}
