import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateSession, loadDraft, saveDraft, serializeSession } from '../src/engine/drafts.js';

function pixelData() {
  return { data: new Uint8ClampedArray([12, 34, 56, 255, 78, 90, 12, 255]), width: 2, height: 1 };
}

test('draft sessions keep cloneable pixels and assets while omitting live canvas and image elements', () => {
  const canvas = { draw() {} };
  const original = pixelData();
  const work = pixelData();
  const bgBlob = new Blob(['test backdrop']);
  const logoBlob = new Blob(['test logo']);
  const session = {
    origData: original,
    origCanvas: canvas,
    workData: work,
    eraseMaskCanvas: canvas,
    bgState: { mode: 'image', customBgBlob: bgBlob, customBgImg: canvas, customBgUrl: 'blob:backdrop' },
    logoConfig: { enabled: true, blob: logoBlob, img: canvas, url: 'blob:logo' },
    history: [{ origCanvas: canvas, origData: pixelData(), workData: work }],
  };

  const saved = serializeSession(session);
  assert.equal(saved.origCanvas, undefined);
  assert.equal(saved.eraseMaskCanvas, undefined);
  assert.equal(saved.bgState.customBgImg, undefined);
  assert.equal(saved.bgState.customBgUrl, undefined);
  assert.equal(saved.logoConfig.img, undefined);
  assert.equal(saved.logoConfig.url, undefined);
  assert.equal(saved.history[0].origCanvas, undefined);
  assert.equal(saved.origData, original);
  assert.equal(saved.history[0].origData, original);
  assert.equal(saved.workData, work);
  assert.equal(saved.history[0].workData, work);
  assert.equal(saved.bgState.customBgBlob, bgBlob);
  assert.equal(saved.logoConfig.blob, logoBlob);
  assert.doesNotThrow(() => structuredClone(saved));
  assert.equal(session.origCanvas, canvas);
});

test('draft hydration restores canvas dimensions, erase mask, and shared history assets', async (t) => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else delete globalThis.document;
  });
  globalThis.document = {
    createElement() {
      const canvas = {};
      canvas.getContext = () => ({
        createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: (image) => { canvas.image = image; },
      });
      return canvas;
    },
  };

  const origData = pixelData();
  const workData = pixelData();
  const blob = new Blob(['shared asset']);
  const bgState = { mode: 'image', customBgBlob: blob };
  const logoConfig = { enabled: true, blob };
  const loadedUrls = [];
  const restored = await hydrateSession({
    origData,
    workData,
    bgState,
    logoConfig,
    hasEraseMask: true,
    eraseMask: new Uint8Array([0, 1]),
    history: [{ origData, workData, bgState, logoConfig }],
  }, async (url) => {
    loadedUrls.push(url);
    return { src: url };
  });

  assert.equal(loadedUrls.length, 1);
  assert.equal(restored.origCanvas.width, 2);
  assert.equal(restored.origCanvas.height, 1);
  assert.equal(restored.origCanvas.image, origData);
  assert.equal(restored.origCanvas, restored.history[0].origCanvas);
  assert.equal(restored.bgState.customBgImg, restored.history[0].bgState.customBgImg);
  assert.equal(restored.logoConfig.img, restored.bgState.customBgImg);
  assert.deepEqual([...restored.eraseMaskCanvas.image.data], [0, 0, 0, 0, 239, 68, 68, 255]);
});

test('draft writes and deletions compare revisions in the same transaction', async (t) => {
  let persisted;
  let transactions = Promise.resolve();
  const database = {
    transaction() {
      let nextValue;
      let aborted = false;
      const requests = [];
      const enqueue = (readOrWrite) => {
        const request = {};
        requests.push(() => {
          request.result = readOrWrite();
          request.onsuccess?.();
        });
        return request;
      };
      const transaction = {
        abort: () => { aborted = true; },
        objectStore: () => ({
          get: () => enqueue(() => structuredClone(nextValue)),
          put: (value) => enqueue(() => { nextValue = structuredClone(value); }),
          delete: () => enqueue(() => { nextValue = undefined; }),
        }),
      };
      transactions = transactions.then(() => {
        nextValue = persisted;
        for (const request of requests) {
          if (aborted) break;
          request();
        }
        if (aborted) {
          transaction.onabort?.();
        } else {
          persisted = nextValue;
          transaction.oncomplete?.();
        }
      });
      return transaction;
    },
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open() {
        const request = { result: database };
        queueMicrotask(() => request.onsuccess());
        return request;
      },
    },
  });
  t.after(() => {
    database.onclose?.();
    if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
    else delete globalThis.indexedDB;
  });

  assert.equal(await loadDraft(), null);
  await saveDraft({ revision: 'initial' }, null);
  const [first, second] = await Promise.allSettled([
    saveDraft({ revision: 'first' }, 'initial'),
    saveDraft({ revision: 'second' }, 'initial'),
  ]);
  assert.equal(first.status, 'fulfilled');
  assert.equal(second.status, 'rejected');
  assert.equal(second.reason.code, 'DRAFT_CONFLICT');
  await assert.rejects(saveDraft(null, null), { code: 'DRAFT_CONFLICT' });
  assert.deepEqual(await loadDraft(), { revision: 'first' });
  assert.equal(await saveDraft(null, 'first'), undefined);
  assert.equal(await loadDraft(), null);
  await saveDraft({ version: 1 }, null);
  await saveDraft({ revision: 'upgraded' }, null);
  assert.deepEqual(await loadDraft(), { revision: 'upgraded' });
});
