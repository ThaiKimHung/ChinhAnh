export function createBrushStroke(x, y, radius) {
  const spacing = Math.max(2, radius * 0.4);
  return { x, y, lastX: x, lastY: y, spacing, nextDab: spacing };
}

export function advanceBrushStroke(stroke, x, y, stamp) {
  const dx = x - stroke.x;
  const dy = y - stroke.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return;

  let at = stroke.nextDab;
  while (at <= distance) {
    const stampX = stroke.x + dx * (at / distance);
    const stampY = stroke.y + dy * (at / distance);
    stamp(stroke.lastX, stroke.lastY, stampX, stampY);
    stroke.lastX = stampX;
    stroke.lastY = stampY;
    at += stroke.spacing;
  }
  stroke.nextDab = at - distance;
  stroke.x = x;
  stroke.y = y;
}

export function finishBrushStroke(stroke, stamp) {
  if (stroke && (stroke.lastX !== stroke.x || stroke.lastY !== stroke.y)) {
    stamp(stroke.lastX, stroke.lastY, stroke.x, stroke.y);
  }
}
