import { useCallback, useEffect, useState } from 'react';
import { pastePatch } from '../engine/patch';

const NO_OFFSET = { dx: 0, dy: 0 };

/**
 * Cut & paste ("Cắt dán che"): a rectangle selection that is dragged onto the
 * spot to cover. A selection only belongs to the photo, size and tool it was
 * made with, so `key` (null while the tool is off) scopes it.
 *
 * `onPasted()` runs after pixels in `workDataRef` changed; `beforePaste()` first.
 */
export function usePatchTool({ key, workDataRef, keyboardEnabled, beforePaste, onPasted }) {
  const [selection, setSelection] = useState(null); // { key, rect, offset, flip }
  const [feather, setFeather] = useState(16);
  const [toneMatch, setToneMatch] = useState(true);

  const live = key && selection?.key === key ? selection : null;
  const rect = live?.rect ?? null;
  const offset = live?.offset ?? NO_OFFSET;
  const flip = live?.flip ?? false;

  const cancel = useCallback(() => setSelection(null), []);
  const setFlip = (update) =>
    setSelection((p) => (p ? { ...p, flip: typeof update === 'function' ? update(p.flip) : update } : p));
  /** From the canvas: a new rectangle / offset, or null to clear. */
  const change = (nextRect, nextOffset) =>
    setSelection(nextRect ? { key, rect: nextRect, offset: nextOffset, flip } : null);

  const apply = useCallback(() => {
    const workData = workDataRef.current;
    if (!workData || !rect || (offset.dx === 0 && offset.dy === 0)) return;
    beforePaste();
    const changed = pastePatch(workData, rect, offset.dx, offset.dy, { feather, toneMatch, flip });
    cancel();
    if (changed) onPasted();
  }, [beforePaste, cancel, feather, flip, offset, onPasted, rect, toneMatch, workDataRef]);

  // Enter pastes, Escape drops the selection.
  useEffect(() => {
    if (!keyboardEnabled || !rect) return;
    const onKey = (e) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, dialog[open]')) return;
      if (e.key === 'Enter') {
        if (e.target instanceof Element && e.target.closest('button')) return;
        e.preventDefault();
        apply();
      } else if (e.key === 'Escape') {
        cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apply, cancel, keyboardEnabled, rect]);

  return { rect, offset, flip, setFlip, feather, setFeather, toneMatch, setToneMatch, change, apply, cancel };
}
