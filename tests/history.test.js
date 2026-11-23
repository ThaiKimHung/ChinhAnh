import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendHistoryEntry,
  applyStyleToSession,
  historyBudgetBytes,
  historyBytes,
  HISTORY_MAX_ENTRIES,
} from '../src/engine/history.js';

const pixels = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });

function entry(workData, extra = {}) {
  return { workData, origData: null, origCanvas: null, cutoutAlpha: null, ...extra };
}

test('shared pixel buffers are only counted once', () => {
  const a = pixels(10, 10);
  const b = pixels(10, 10);
  assert.equal(historyBytes([entry(a), entry(a), entry(b)]), 800);
});

test('original data, canvas and cutout mask are part of the memory cost', () => {
  const orig = pixels(10, 10);
  const canvas = { width: 10, height: 10 };
  const alpha = new Uint8ClampedArray(100);
  const e = entry(pixels(10, 10), { origData: orig, origCanvas: canvas, cutoutAlpha: alpha });
  assert.equal(historyBytes([e, { ...e }]), 400 + 400 + 400 + 100);
});

test('appending drops the redo branch and moves the cursor to the new entry', () => {
  const a = entry(pixels(1, 1));
  const b = entry(pixels(1, 1));
  const c = entry(pixels(1, 1));
  const result = appendHistoryEntry([a, b], 0, c, { maxBytes: Infinity });
  assert.deepEqual(result.entries, [a, c]);
  assert.equal(result.index, 1);
});

test('oldest pixel snapshots are dropped once the memory budget is exceeded', () => {
  let entries = [];
  let index = -1;
  for (let i = 0; i < 10; i++) {
    ({ entries, index } = appendHistoryEntry(entries, index, entry(pixels(10, 10)), { maxBytes: 1200 }));
  }
  assert.equal(entries.length, 3);
  assert.equal(index, 2);
  assert.ok(historyBytes(entries) <= 1200);
});

test('at least one undo step survives even when a single snapshot is over budget', () => {
  let entries = [];
  let index = -1;
  for (let i = 0; i < 4; i++) {
    ({ entries, index } = appendHistoryEntry(entries, index, entry(pixels(100, 100)), { maxBytes: 10 }));
  }
  assert.equal(entries.length, 2);
  assert.equal(index, 1);
});

test('parameter-only steps share pixels and stay cheap', () => {
  const shared = pixels(10, 10);
  let entries = [];
  let index = -1;
  for (let i = 0; i < 40; i++) {
    ({ entries, index } = appendHistoryEntry(entries, index, entry(shared), { maxBytes: 1000 }));
  }
  assert.equal(entries.length, HISTORY_MAX_ENTRIES);
});

test('an applied batch style adds an undo step without copying the photo or its mask', () => {
  const work = pixels(10, 10);
  const latest = pixels(10, 10);
  const alpha = new Uint8ClampedArray(100);
  const start = entry(work, {
    cutoutAlpha: alpha,
    activePreset: 'original',
    adjustments: { exposure: 0 },
    beauty: { skinSmooth: 0 },
    textConfig: { content: 'Trước khi lưu' },
  });
  const session = {
    ...start,
    workData: latest,
    activePreset: 'custom',
    adjustments: { exposure: 16 },
    beauty: { skinSmooth: 10 },
    textConfig: { content: 'Bản nháp hiện tại' },
    history: [start, entry(pixels(10, 10))],
    historyIdx: 0,
  };
  const styled = applyStyleToSession(session, {
    activePreset: 'warm',
    adjustments: { exposure: 25 },
    beauty: { skinSmooth: 42 },
  });
  assert.equal(styled.historyIdx, 1);
  assert.equal(styled.history.length, 2);
  assert.equal(styled.history[0].adjustments.exposure, 16);
  assert.equal(styled.history[1].adjustments.exposure, 25);
  assert.equal(styled.beauty.skinSmooth, 42);
  assert.equal(styled.history[0].workData, latest);
  assert.equal(styled.history[1].workData, latest);
  assert.equal(styled.history[1].cutoutAlpha, alpha);
  assert.equal(styled.history[0].textConfig.content, 'Bản nháp hiện tại');
  assert.equal(styled.history[1].textConfig.content, 'Bản nháp hiện tại');
  assert.equal(session.history.length, 2);
});

test('the budget shrinks on low-memory devices', () => {
  assert.ok(historyBudgetBytes(2) < historyBudgetBytes(8));
  assert.equal(historyBudgetBytes(undefined), historyBudgetBytes(8));
  assert.ok(historyBudgetBytes(64) <= 512 * 1024 * 1024);
});
