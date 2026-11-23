// Two-finger pinch/pan math for the canvas stage.
// Positions are relative to the stage centre, matching how `pan` offsets the image.

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Captures the gesture's starting state from the two touch points. */
export function startPinch(a, b, zoom, pan) {
  return { mid: midpoint(a, b), dist: Math.max(1, distance(a, b)), zoom, pan };
}

/**
 * Zoom and pan for the current finger positions: scales by the change in finger
 * distance and keeps the image point that was under the starting midpoint under
 * the current midpoint.
 */
export function updatePinch(start, a, b, { minZoom = MIN_ZOOM, maxZoom = MAX_ZOOM } = {}) {
  const mid = midpoint(a, b);
  const rawZoom = start.zoom * (distance(a, b) / start.dist);
  const zoom = Math.min(maxZoom, Math.max(Math.min(minZoom, start.zoom), rawZoom));
  const ratio = zoom / start.zoom;
  return {
    zoom,
    pan: {
      x: mid.x - (start.mid.x - start.pan.x) * ratio,
      y: mid.y - (start.mid.y - start.pan.y) * ratio,
    },
  };
}
