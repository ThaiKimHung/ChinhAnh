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

/**
 * Splits a caption into balanced lines when it is wider than `maxWidth`
 * (at most `maxLines`; whatever still does not fit is scaled by fitOverlay).
 * `measure(text)` returns the rendered width.
 */
export function wrapCaption(text, measure, maxWidth, maxLines = 3) {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean || measure(clean) <= maxWidth) return [clean];
  const words = clean.split(' ');
  if (words.length === 1) return [clean];
  const total = measure(clean);
  const longestWord = Math.max(...words.map(measure));
  const pack = (limit) => {
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > limit) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  for (let n = 2; n <= maxLines; n++) {
    const lines = pack(Math.max(longestWord, (total / n) * 1.08));
    if (lines.length <= n && lines.every((l) => measure(l) <= maxWidth)) return lines;
  }
  // Too long even for maxLines lines: keep maxLines (extra words join the last
  // line) and let the renderer scale the block down.
  const lines = pack(Math.max(longestWord, (total / maxLines) * 1.08));
  return lines.length <= maxLines ? lines : [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
}
