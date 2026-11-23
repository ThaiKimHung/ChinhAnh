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

/**
 * Normalised box blur of the RGB of pixels selected by `include`: a smooth
 * estimate of the local background colour. Returns the colour field and its
 * coverage (0 where no selected pixel is within `radius`).
 */
function localColorField(data, alpha, width, height, radius, include) {
  const n = width * height;
  const sum = new Float32Array(n * 4);
  for (let p = 0; p < n; p++) {
    if (data[p * 4 + 3] !== 255 || !include(alpha[p])) continue;
    sum[p * 4] = data[p * 4];
    sum[p * 4 + 1] = data[p * 4 + 1];
    sum[p * 4 + 2] = data[p * 4 + 2];
    sum[p * 4 + 3] = 1;
  }
  const blur = (src, horizontal) => {
    const out = new Float32Array(src.length);
    const outer = horizontal ? height : width;
    const inner = horizontal ? width : height;
    for (let o = 0; o < outer; o++) {
      const acc = [0, 0, 0, 0];
      const at = (k) => (horizontal ? o * width + k : k * width + o) * 4;
      for (let k = 0; k <= Math.min(inner - 1, radius); k++) for (let c = 0; c < 4; c++) acc[c] += src[at(k) + c];
      for (let k = 0; k < inner; k++) {
        const i = at(k);
        for (let c = 0; c < 4; c++) out[i + c] = acc[c];
        const add = k + radius + 1;
        const rem = k - radius;
        if (add < inner) for (let c = 0; c < 4; c++) acc[c] += src[at(add) + c];
        if (rem >= 0) for (let c = 0; c < 4; c++) acc[c] -= src[at(rem) + c];
      }
    }
    return out;
  };
  return blur(blur(sum, true), false);
}

/**
 * Hair and other fine detail: un-mix each semi-transparent pixel from the
 * local background colour (I = a·F + (1 − a)·B ⇒ F), and fade out low-alpha
 * “haze” that is indistinguishable from the old background. Returns a per-pixel
 * opacity multiplier and marks the pixels it handled.
 */
function recoverFineDetail(data, alpha, width, height, scale, handled) {
  const radius = Math.min(48, Math.max(4, Math.round(10 * scale)));
  const field = localColorField(data, alpha, width, height, radius, (a) => a <= 8);
  // Mattes often leave a wide semi-transparent band around hair; look further
  // out for clean background when none is close.
  const farField = localColorField(data, alpha, width, height, Math.min(160, radius * 4), (a) => a <= 8);
  const fgField = localColorField(data, alpha, width, height, radius * 2, (a) => a >= 247);
  const opacity = new Float32Array(width * height).fill(1);
  for (let p = 0; p < alpha.length; p++) {
    const a8 = alpha[p];
    const i = p * 4;
    if (a8 <= 8 || a8 >= 247 || data[i + 3] !== 255) continue;
    const near = field[i + 3] >= 1;
    const source = near ? field : farField;
    const coverage = source[i + 3];
    if (coverage < 1) continue;
    const B = [source[i] / coverage, source[i + 1] / coverage, source[i + 2] / coverage];
    const difference = Math.max(Math.abs(data[i] - B[0]), Math.abs(data[i + 1] - B[1]), Math.abs(data[i + 2] - B[2]));
    let a = a8 / 255;
    // Where solid subject colour is known nearby, the pixel's position between
    // background and subject colour tells how opaque it really is. AI mattes
    // often make fine strands too opaque; trust the colour when it says less.
    const fgCoverage = fgField[i + 3];
    let thinned = 1;
    if (fgCoverage >= 1) {
      const F = [fgField[i] / fgCoverage, fgField[i + 1] / fgCoverage, fgField[i + 2] / fgCoverage];
      const fb = [F[0] - B[0], F[1] - B[1], F[2] - B[2]];
      const contrast = fb[0] * fb[0] + fb[1] * fb[1] + fb[2] * fb[2];
      if (contrast >= 40 * 40) {
        const ib = [data[i] - B[0], data[i + 1] - B[1], data[i + 2] - B[2]];
        const t = (ib[0] * fb[0] + ib[1] * fb[1] + ib[2] * fb[2]) / contrast;
        // Only when the pixel really is a blend of these two colours (e.g. not a
        // skin-coloured edge next to dark hair).
        const residual = ib[0] * ib[0] + ib[1] * ib[1] + ib[2] * ib[2] - Math.max(0, t) * t * contrast;
        const fromColour = Math.min(1, Math.max(0, t * 1.15 + 0.03));
        if (residual < 0.15 * contrast + 200 && fromColour < a) {
          thinned = fromColour / a;
          a = Math.max(fromColour, 0.02);
        }
      }
    }
    // Pixels that look exactly like the old background are matte haze. At low
    // alpha they fade fully; towards opaque the fade eases off so a subject
    // whose colour happens to match the backdrop keeps a solid edge.
    const backgroundLike = Math.min(1, Math.max(0, (difference - 6) / 18));
    const trust = a8 < 128 ? 0 : ((a8 - 128) / 119) ** 2;
    opacity[p] = (backgroundLike + (1 - backgroundLike) * trust) * thinned;
    for (let c = 0; c < 3; c++) {
      const F = (data[i + c] - (1 - a) * B[c]) / a;
      data[i + c] = F < 0 ? 0 : F > 255 ? 255 : F;
    }
    handled[p] = 1;
  }
  return opacity;
}

function cleanEdgeColors(data, alpha, width, height, scale, handled) {
  const radii = [...new Set([1, 2, 4, 8].map((radius) => Math.min(24, Math.max(1, Math.round(radius * scale)))))];

  // Leave confidently opaque pixels and sources with their own alpha untouched.
  for (let y = 0, pixel = 0; y < height; y++) {
    for (let x = 0; x < width; x++, pixel++) {
      const opacity = alpha[pixel];
      const i = pixel * 4;
      if (opacity < 16 || opacity > 244 || data[i + 3] !== 255 || handled[pixel]) continue;
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
  let opacityScale = null;
  if (decontaminate) {
    const handled = new Uint8Array(width * height);
    opacityScale = recoverFineDetail(data, rawAlpha, width, height, scale, handled);
    cleanEdgeColors(data, rawAlpha, width, height, scale, handled);
  }

  const radius = Math.min(64, Math.round(feather * scale));
  const blurred = radius > 0 ? featherAlphaMask(rawAlpha, width, height, radius) : rawAlpha;
  const softness = Math.min(0.48, Math.max(0, feather / 16));
  // Outward softening is coloured with the nearby subject, never the old background.
  const outwardAmount = Math.min(1, feather / 6);
  const subjectColour = radius > 0 && outwardAmount > 0
    ? localColorField(data, rawAlpha, width, height, radius + 2, (a) => a >= 200)
    : null;
  for (let p = 0; p < rawAlpha.length; p++) {
    const raw = rawAlpha[p];
    // Inside: soften toward the subject without turning fine strands into a blur.
    const inward = raw - Math.max(0, raw - blurred[p]) * softness;
    // Outside a broad edge (thin strands never reach the 35% threshold).
    let outward = 0;
    if (subjectColour && blurred[p] > raw) {
      const t = (blurred[p] / 255 - 0.35) / 0.65;
      if (t > 0) outward = t * 255 * outwardAmount;
    }
    const i = p * 4;
    let opacity = Math.max(inward, outward);
    if (outward > inward) {
      const c = subjectColour[i + 3];
      if (c >= 1) {
        data[i] = subjectColour[i] / c;
        data[i + 1] = subjectColour[i + 1] / c;
        data[i + 2] = subjectColour[i + 2] / c;
      } else {
        opacity = inward;
      }
    }
    opacity *= opacityScale ? opacityScale[p] : 1;
    data[i + 3] = Math.round((data[i + 3] * opacity) / 255);
  }
  return imageData;
}
