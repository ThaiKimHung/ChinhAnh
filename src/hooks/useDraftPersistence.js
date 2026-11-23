import { useCallback, useEffect, useRef, useState } from 'react';
import { hydrateSession, loadDraft, saveDraft, serializeSession } from '../engine/drafts';
import { cloneImageData, readImage } from '../engine/canvasUtils';

const DRAFT_HISTORY_LIMIT = 6;
const SAVE_DELAY_MS = 350;

export const DRAFT_MESSAGES = {
  saving: 'Đang lưu bản nháp…',
  saved: 'Đã lưu bản nháp trên thiết bị',
  restored: 'Đã khôi phục bản nháp',
  unavailable: 'Trình duyệt này hiện không thể lưu bản nháp',
  error: 'Chưa lưu được bản nháp. Bạn vẫn có thể xuất ảnh.',
  conflict: 'Bản nháp đã thay đổi ở tab khác. Hãy xuất ảnh trước khi tải lại trang.',
};

export const DRAFT_WARNING_STATES = ['unavailable', 'error', 'conflict'];

/** Shared draft bookkeeping. `markDirty` must be called by every edit that should be saved. */
export function useDraftState() {
  const [status, setStatus] = useState('loading');
  const readyRef = useRef(false);
  const availableRef = useRef(true);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(null);
  const writesRef = useRef(Promise.resolve());
  const versionRef = useRef(0);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    versionRef.current++;
  }, []);

  return { status, setStatus, readyRef, availableRef, dirtyRef, revisionRef, writesRef, versionRef, markDirty };
}

/** Restores the saved draft (images, per-image sessions, pending styles) once on startup. */
export function useDraftRestore({ draft, sessionsRef, pendingStyleByIdRef, setImages, setWorkMaxDim, showImage, sampleUrl }) {
  const { readyRef, availableRef, revisionRef, setStatus } = draft;

  useEffect(() => {
    if (readyRef.current) return;
    let cancelled = false;

    async function restore() {
      try {
        const saved = await loadDraft();
        if (cancelled) return;
        revisionRef.current = saved?.revision ?? null;
        if (!saved) {
          readyRef.current = true;
          setStatus('idle');
          return;
        }

        const sessions = await Promise.all(
          Object.entries(saved.sessions).map(async ([id, session]) => [id, await hydrateSession(session, readImage)])
        );
        if (cancelled) return;
        const items = saved.images.map((item) => ({
          ...item,
          url: item.blob ? URL.createObjectURL(item.blob) : sampleUrl,
          isObjectUrl: !!item.blob,
        }));
        sessionsRef.current = Object.fromEntries(sessions);
        pendingStyleByIdRef.current = saved.pendingStyles ?? {};
        readyRef.current = true;
        setImages(items);
        setWorkMaxDim(saved.workMaxDim);
        showImage(items.find((item) => item.id === saved.activeImageId) ?? items[0], saved.workMaxDim, false);
        setStatus(items.length ? 'restored' : 'idle');
      } catch {
        if (cancelled) return;
        availableRef.current = false;
        readyRef.current = true;
        setStatus('unavailable');
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [availableRef, pendingStyleByIdRef, readyRef, revisionRef, sampleUrl, sessionsRef, setImages, setStatus, setWorkMaxDim, showImage]);
}

function trimSessionHistory(session) {
  const start = Math.max(0, session.historyIdx - DRAFT_HISTORY_LIMIT + 2);
  return {
    ...session,
    history: session.history.slice(start, start + DRAFT_HISTORY_LIMIT),
    historyIdx: session.historyIdx - start,
  };
}

/**
 * Debounced save to IndexedDB whenever any of `triggers` change while the draft is dirty.
 * Also flushes immediately when the tab is hidden or closed.
 */
export function useDraftAutosave({
  draft,
  images,
  activeImageId,
  workMaxDim,
  loadedImageIdRef,
  sessionsRef,
  pendingStyleByIdRef,
  captureCurrentSession,
  triggers,
}) {
  const { readyRef, availableRef, dirtyRef, revisionRef, writesRef, versionRef, setStatus } = draft;

  useEffect(() => {
    if (!readyRef.current || !availableRef.current || !dirtyRef.current) return;
    const version = versionRef.current;
    let queued = false;

    function persist() {
      if (queued || versionRef.current !== version) return;
      queued = true;
      const activeSession = loadedImageIdRef.current === activeImageId ? captureCurrentSession() : null;
      const sessions = {};
      for (const item of images) {
        let session = item.id === activeImageId && activeSession ? activeSession : sessionsRef.current[item.id];
        if (!session) continue;
        if (session === activeSession) {
          // The live buffers keep changing while the write is queued.
          session = {
            ...session,
            workData: cloneImageData(session.workData),
            eraseMask: new Uint8Array(session.eraseMask),
            cutoutAlpha: session.cutoutAlpha?.slice() ?? null,
          };
        }
        sessions[item.id] = serializeSession(trimSessionHistory(session));
      }

      const snapshot = {
        revision: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        images: images.map(({ id, name, blob }) => ({ id, name, blob })),
        activeImageId,
        workMaxDim,
        sessions,
        pendingStyles: { ...pendingStyleByIdRef.current },
      };
      writesRef.current = writesRef.current
        .then(async () => {
          if (!availableRef.current) return;
          await saveDraft(snapshot, revisionRef.current);
          revisionRef.current = snapshot.revision;
          if (versionRef.current !== version) return;
          dirtyRef.current = false;
          setStatus(images.length ? 'saved' : 'idle');
        })
        .catch((error) => {
          if (error.code === 'DRAFT_CONFLICT') {
            availableRef.current = false;
            setStatus('conflict');
          } else if (versionRef.current === version) {
            setStatus('error');
          }
        });
    }

    setStatus('saving');
    const timer = setTimeout(persist, SAVE_DELAY_MS);
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', persist);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', persist);
    };
    // `triggers` lists the editor state whose changes should schedule a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImageId, captureCurrentSession, images, workMaxDim, ...triggers]);
}
