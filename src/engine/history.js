// Undo/redo history with a memory budget.
//
// Pixel edits (erase, liquify, brushes, crop…) store a full copy of the working
// pixels. On a 24 MP photo each copy is ~96 MB, so a fixed step count alone can
// exhaust the tab's memory. Entries that only change parameters reuse the
// previous entry's buffers and cost almost nothing.

export const HISTORY_MAX_ENTRIES = 25;
const MIN_ENTRIES = 2; // current state + one undo step
const MB = 1024 * 1024;

/** Memory allowed for undo snapshots, scaled by `navigator.deviceMemory` (GB, capped at 8 by browsers). */
export function historyBudgetBytes(deviceMemoryGB) {
  const gb = Number.isFinite(deviceMemoryGB) && deviceMemoryGB > 0 ? deviceMemoryGB : 8;
  return Math.min(512, Math.max(128, gb * 48)) * MB;
}

function addBuffer(seen, key, bytes) {
  if (!key || seen.has(key)) return 0;
  seen.add(key);
  return bytes;
}

/** Bytes held by the entries, counting every shared buffer once. */
export function historyBytes(entries) {
  const seen = new Set();
  let total = 0;
  for (const e of entries) {
    if (e.workData) total += addBuffer(seen, e.workData.data ?? e.workData, e.workData.width * e.workData.height * 4);
    if (e.origData) total += addBuffer(seen, e.origData.data ?? e.origData, e.origData.width * e.origData.height * 4);
    if (e.origCanvas) total += addBuffer(seen, e.origCanvas, e.origCanvas.width * e.origCanvas.height * 4);
    if (e.cutoutAlpha) total += addBuffer(seen, e.cutoutAlpha, e.cutoutAlpha.byteLength ?? e.cutoutAlpha.length);
  }
  return total;
}

/**
 * Appends `entry` after `index` (dropping any redo branch), then trims the
 * oldest entries until both the step limit and the memory budget are met.
 */
export function appendHistoryEntry(
  entries,
  index,
  entry,
  { maxEntries = HISTORY_MAX_ENTRIES, maxBytes = historyBudgetBytes() } = {}
) {
  const next = entries.slice(0, index + 1);
  next.push(entry);
  while (next.length > maxEntries) next.shift();
  while (next.length > MIN_ENTRIES && historyBytes(next) > maxBytes) next.shift();
  return { entries: next, index: next.length - 1 };
}
