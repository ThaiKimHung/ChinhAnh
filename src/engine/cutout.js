import { featherAlphaMask } from './imagePipeline.js';

const DIRECTIONS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

function edgeSamples(data, alpha, width, height, x, y, radii) {
  const center = (y * width + x) * 4;
  let foreground = -1;
  let background = -1;
  let foregroundDistance = Infinity;
  let backgroundDistance = Infinity;

  for (const radius of radii) {
    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx * radius;
      const ny = y + dy * radius;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const pixel = ny * width + nx;
      const i = pixel * 4;
      if (data[i + 3] !== 255 || (alpha[pixel] > 8 && alpha[pixel] < 247)) continue;
      const dr = data[i] - data[center];
      const dg = data[i + 1] - data[center + 1];
      const db = data[i + 2] - data[center + 2];
      const distance = dr * dr + dg * dg + db * db + radius * radius * 24;
      if (alpha[pixel] <= 8 && distance < backgroundDistance) {
        background = i;
        backgroundDistance = distance;
      } else if (alpha[pixel] >= 247 && distance < foregroundDistance) {
        foreground = i;
        foregroundDistance = distance;
      }
    }
    if (background >= 0 && foreground >= 0) return { background, foreground };
  }
  return null;
}

function removeBackgroundSpill(data, i, alpha, { background, foreground }) {
  const dr = data[background] - data[foreground];
  const dg = data[background + 1] - data[foreground + 1];
  const db = data[background + 2] - data[foreground + 2];
  const contrastSquared = dr * dr + dg * dg + db * db;
  if (contrastSquared < 400) return;

  const r = data[i] - data[foreground];
  const g = data[i + 1] - data[foreground + 1];
  const b = data[i + 2] - data[foreground + 2];
  const observedSpill = (r * dr + g * dg + b * db) / contrastSquared;
  if (observedSpill <= 0 || observedSpill > 1) return;

  // Preserve colors that do not fit a mixture of the two nearby samples.
  const residualSquared = Math.max(0, r * r + g * g + b * b - observedSpill ** 2 * contrastSquared);
  const confidence = Math.max(0, 1 - residualSquared / (200 + contrastSquared * 0.035));
  const spill = Math.min(observedSpill, 1 - alpha / 255) * confidence;
  data[i] -= dr * spill;
  data[i + 1] -= dg * spill;
  data[i + 2] -= db * spill;
}

function cleanEdgeColors(data, alpha, width, height, scale) {
  const radii = [...new Set([1, 2, 4, 8].map((radius) => Math.min(24, Math.max(1, Math.round(radius * scale)))))];

  // Leave confidently opaque pixels and sources with their own alpha untouched.
  for (let y = 0, pixel = 0; y < height; y++) {
    for (let x = 0; x < width; x++, pixel++) {
      const opacity = alpha[pixel];
      const i = pixel * 4;
      if (opacity < 16 || opacity > 244 || data[i + 3] !== 255) continue;
      const atEdge = (x > 0 && Math.abs(opacity - alpha[pixel - 1]) >= 8) ||
        (x + 1 < width && Math.abs(opacity - alpha[pixel + 1]) >= 8) ||
        (y > 0 && Math.abs(opacity - alpha[pixel - width]) >= 8) ||
        (y + 1 < height && Math.abs(opacity - alpha[pixel + width]) >= 8);
      if (!atEdge) continue;
      const samples = edgeSamples(data, alpha, width, height, x, y, radii);
      if (samples) removeBackgroundSpill(data, i, opacity, samples);
    }
  }
}

/**
 * Apply an editable matte to a rendered foreground in place. The matte is never
 * changed, so the same mask can be refined or used with another background.
 */
export function applyCutoutMatte(
  imageData,
  rawAlpha,
  { feather = 2, resolutionScale = 1, decontaminate = true } = {},
) {
  const { data, width, height } = imageData;
  if (!rawAlpha || rawAlpha.length !== width * height) return imageData;
  const scale = Math.max(1, resolutionScale);
  if (decontaminate) cleanEdgeColors(data, rawAlpha, width, height, scale);

  const radius = Math.min(64, Math.round(feather * scale));
  const blurred = radius > 0 ? featherAlphaMask(rawAlpha, width, height, radius) : rawAlpha;
  const softness = Math.min(0.48, Math.max(0, feather / 16));
  for (let p = 0; p < rawAlpha.length; p++) {
    // Soften toward the subject, without bringing back old background pixels
    // or turning very fine strands into a translucent blur.
    const opacity = rawAlpha[p] - Math.max(0, rawAlpha[p] - blurred[p]) * softness;
    const i = p * 4 + 3;
    data[i] = Math.round((data[i] * opacity) / 255);
  }
  return imageData;
}
