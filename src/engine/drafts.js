const DATABASE_NAME = 'lkmagic-drafts';
const DATABASE_VERSION = 1;
const STORE_NAME = 'drafts';
const WORKSPACE_KEY = 'workspace';

let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('IndexedDB is unavailable.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('The draft database is blocked by another tab.'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      database.onclose = () => { databasePromise = undefined; };
      resolve(database);
    };
  }).catch((error) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

async function runDraftRequest(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    let abortReason;
    const abortWith = (error) => {
      abortReason = error;
      transaction.abort();
    };
    const request = action(transaction.objectStore(STORE_NAME), abortWith);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(abortReason ?? transaction.error ?? new Error('Draft transaction was aborted.'));
  });
}

export async function loadDraft() {
  return (await runDraftRequest('readonly', (store) => store.get(WORKSPACE_KEY))) ?? null;
}

export async function saveDraft(draft, expectedRevision) {
  const compareRevision = arguments.length > 1;
  await runDraftRequest('readwrite', (store, abortWith) => {
    const write = () => (draft === null ? store.delete(WORKSPACE_KEY) : store.put(draft, WORKSPACE_KEY));
    if (!compareRevision) return write();

    const previous = store.get(WORKSPACE_KEY);
    previous.onsuccess = () => {
      if ((previous.result?.revision ?? null) !== expectedRevision) {
        abortWith(Object.assign(new Error('The draft was modified by another tab.'), { code: 'DRAFT_CONFLICT' }));
        return;
      }
      try {
        write();
      } catch (error) {
        abortWith(error);
      }
    };
    return previous;
  });
}

export function serializeSession(session) {
  const originalByCanvas = new WeakMap();
  const serializeEntry = (entry) => {
    const saved = { ...entry };
    if (entry.origCanvas) {
      // History entries can share the same unedited canvas even if the editor cloned its pixels.
      if (!originalByCanvas.has(entry.origCanvas)) {
        originalByCanvas.set(entry.origCanvas, entry.origData);
      }
      saved.origData = originalByCanvas.get(entry.origCanvas);
    }
    delete saved.origCanvas;
    delete saved.eraseMaskCanvas;
    if (entry.bgState) {
      saved.bgState = { ...entry.bgState };
      delete saved.bgState.customBgImg;
      delete saved.bgState.customBgUrl;
    }
    if (entry.logoConfig) {
      saved.logoConfig = { ...entry.logoConfig };
      delete saved.logoConfig.img;
      delete saved.logoConfig.url;
    }
    return saved;
  };

  const saved = serializeEntry(session);
  saved.history = session.history?.map(serializeEntry) ?? [];
  return saved;
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function restoreEraseMaskCanvas(workData, eraseMask, hasEraseMask) {
  const { width, height } = workData;
  const canvas = makeCanvas(width, height);
  if (hasEraseMask && eraseMask?.length === width * height) {
    const context = canvas.getContext('2d');
    const image = context.createImageData(width, height);
    for (let i = 0; i < eraseMask.length; i++) {
      if (!eraseMask[i]) continue;
      const pixel = i * 4;
      image.data[pixel] = 239;
      image.data[pixel + 1] = 68;
      image.data[pixel + 2] = 68;
      image.data[pixel + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }
  return canvas;
}

async function decodeImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function hydrateSession(session, loadImage = decodeImage) {
  const originalCanvases = new WeakMap();
  const imagePromises = new WeakMap();
  const getOriginalCanvas = (original) => {
    if (!originalCanvases.has(original)) {
      const canvas = makeCanvas(original.width, original.height);
      canvas.getContext('2d').putImageData(original, 0, 0);
      originalCanvases.set(original, canvas);
    }
    return originalCanvases.get(original);
  };
  const getImage = (blob) => {
    if (!blob) return null;
    if (!imagePromises.has(blob)) {
      const decoded = (async () => {
        const url = URL.createObjectURL(blob);
        try {
          return await loadImage(url);
        } finally {
          URL.revokeObjectURL(url);
        }
      })();
      imagePromises.set(blob, decoded);
    }
    return imagePromises.get(blob);
  };
  const hydrateEntry = async (saved) => {
    const [backgroundImage, logoImage] = await Promise.all([
      getImage(saved.bgState?.customBgBlob),
      getImage(saved.logoConfig?.blob),
    ]);
    return {
      ...saved,
      origCanvas: getOriginalCanvas(saved.origData),
      bgState: { ...saved.bgState, customBgUrl: null, customBgImg: backgroundImage },
      logoConfig: { ...saved.logoConfig, url: null, img: logoImage },
    };
  };

  const [current, history] = await Promise.all([
    hydrateEntry(session),
    Promise.all((session.history ?? []).map(hydrateEntry)),
  ]);
  const eraseMask = session.eraseMask ?? new Uint8Array(current.workData.width * current.workData.height);
  return {
    ...current,
    history,
    eraseMask,
    eraseMaskCanvas: restoreEraseMaskCanvas(current.workData, eraseMask, session.hasEraseMask),
  };
}
