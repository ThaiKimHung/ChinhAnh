import React from 'react';

export function SliderRow({ label, value, min = -100, max = 100, unit = '', onChange, onReset, onCommit }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span
          onDoubleClick={() => {
            onReset();
            onCommit?.();
          }}
          title="Nhấp đúp để đặt lại"
          className="text-slate-300 cursor-pointer hover:text-amber-300 transition"
        >
          {label}
        </span>
        <span className="font-mono text-[11px] text-amber-400">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => onCommit?.()}
        onKeyUp={() => onCommit?.()}
        className="studio-slider"
      />
    </div>
  );
}

export function HistogramChart({ histogram }) {
  if (!histogram) return null;
  const { r, g, b, l } = histogram;
  const n = l.length;
  const w = 260;
  const h = 58;

  const buildPath = (arr) => {
    const pts = arr.map((v, idx) => {
      const x = (idx / (n - 1)) * w;
      const y = h - v * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M0,${h} L${pts.join(' L')} L${w},${h} Z`;
  };

  return (
    <div className="rounded-xl bg-[#10131a] border border-[#242938] p-2">
      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 px-0.5">
        <span>Histogram</span>
        <span className="font-mono">RGB / Luma</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14 block overflow-visible">
        <path d={buildPath(r)} fill="rgba(244, 63, 94, 0.25)" stroke="rgba(244, 63, 94, 0.7)" strokeWidth="1" />
        <path d={buildPath(g)} fill="rgba(16, 185, 129, 0.22)" stroke="rgba(16, 185, 129, 0.7)" strokeWidth="1" />
        <path d={buildPath(b)} fill="rgba(56, 189, 248, 0.22)" stroke="rgba(56, 189, 248, 0.7)" strokeWidth="1" />
        <path d={buildPath(l)} fill="rgba(241, 245, 249, 0.14)" stroke="rgba(241, 245, 249, 0.65)" strokeWidth="1.2" />
      </svg>
    </div>
  );
}
