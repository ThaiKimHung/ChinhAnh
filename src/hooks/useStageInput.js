import { useEffect, useState } from 'react';

/** Reports the element's size to `onResize({ width, height })` now and whenever it changes. */
export function useResizeReport(ref, onResize) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !onResize) return;
    const report = () => onResize({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => observer.disconnect();
  }, [ref, onResize]);
}

/** Whether Space is held (hand tool). `onRelease` runs when it is let go. */
export function useSpaceHeld(onRelease) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') setHeld(true);
    };
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      setHeld(false);
      onRelease?.();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onRelease]);
  return held;
}
