import { useEffect, useRef } from 'react';

function isTextInput(target) {
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/**
 * Global shortcuts: Ctrl/Cmd+Z / Shift+Z / Y (undo/redo), Ctrl/Cmd+S (export),
 * Ctrl/Cmd+O (open), [ and ] (brush size), hold \ (compare), and pasting images.
 */
export function useEditorShortcuts(handlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target instanceof Element && e.target.closest('dialog[open]')) return;
      const h = handlersRef.current;
      const inInput = isTextInput(e.target);
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (!inInput && mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) h.onRedo();
        else h.onUndo();
      } else if (!inInput && mod && key === 'y') {
        e.preventDefault();
        h.onRedo();
      } else if (mod && key === 's') {
        e.preventDefault();
        h.onExport();
      } else if (mod && key === 'o') {
        e.preventDefault();
        h.onOpenFile();
      } else if (!inInput && e.key === '[') {
        h.onBrushSize(-6);
      } else if (!inInput && e.key === ']') {
        h.onBrushSize(6);
      } else if (!inInput && e.key === '\\') {
        h.onCompare(true);
      }
    };
    const onKeyUp = (e) => {
      if (e.key === '\\') handlersRef.current.onCompare(false);
    };
    const onPaste = (e) => {
      if (e.target instanceof Element && e.target.closest('dialog[open]')) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handlersRef.current.onPasteFiles(files);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('paste', onPaste);
    };
  }, []);
}
