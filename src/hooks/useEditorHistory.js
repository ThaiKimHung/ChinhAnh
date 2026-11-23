import { useCallback, useMemo, useRef, useState } from 'react';
import { appendHistoryEntry, historyBudgetBytes } from '../engine/history';

/**
 * Undo/redo stack kept in refs (so async commits never read stale state) with a
 * small piece of React state for the toolbar buttons. Memory is bounded by
 * `historyBudgetBytes`, scaled to the device's reported RAM.
 */
export function useEditorHistory() {
  const entriesRef = useRef([]);
  const indexRef = useRef(-1);
  const [meta, setMeta] = useState({ canUndo: false, canRedo: false });
  const maxBytes = useMemo(() => historyBudgetBytes(globalThis.navigator?.deviceMemory), []);

  const sync = useCallback(() => {
    setMeta({
      canUndo: indexRef.current > 0,
      canRedo: indexRef.current < entriesRef.current.length - 1,
    });
  }, []);

  const reset = useCallback((entries = [], index = entries.length - 1) => {
    entriesRef.current = entries;
    indexRef.current = index;
    sync();
  }, [sync]);

  const append = useCallback((entry) => {
    const next = appendHistoryEntry(entriesRef.current, indexRef.current, entry, { maxBytes });
    entriesRef.current = next.entries;
    indexRef.current = next.index;
    sync();
  }, [maxBytes, sync]);

  const current = useCallback(() => entriesRef.current[indexRef.current], []);

  /** Moves the cursor by `delta` and returns the entry to restore, or null at either end. */
  const step = useCallback((delta) => {
    const nextIndex = indexRef.current + delta;
    if (nextIndex < 0 || nextIndex >= entriesRef.current.length) return null;
    indexRef.current = nextIndex;
    sync();
    return entriesRef.current[nextIndex];
  }, [sync]);

  const snapshot = useCallback(() => ({ history: entriesRef.current, historyIdx: indexRef.current }), []);

  return useMemo(
    () => ({ meta, reset, append, current, step, snapshot }),
    [meta, reset, append, current, step, snapshot]
  );
}
