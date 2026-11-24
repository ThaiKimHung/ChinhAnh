import React from 'react';
import { Users } from 'lucide-react';

/**
 * Picks who a face edit applies to when the photo has several people:
 * "Tất cả" or one person (numbered left to right, as on the photo).
 * `customized` lists people with their own skin levels (marked with a dot).
 */
export default function FacePicker({ thumbs, selected, onSelect, customized = [] }) {
  if (!thumbs || thumbs.length < 2) return null;
  const base =
    'relative grid shrink-0 cursor-pointer place-items-center rounded-lg border text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-amber-400';
  const on = 'border-amber-400 bg-amber-400/15 text-amber-300';
  const off = 'border-[#2d3344] bg-[#1b1f29] text-slate-300 hover:border-slate-500';
  return (
    <div className="space-y-1.5" role="group" aria-label="Chọn người để chỉnh">
      <p className="text-[11px] text-slate-400">
        Chỉnh cho: <span className="text-slate-200">{selected === null ? `tất cả ${thumbs.length} người` : `Người ${selected + 1}`}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
          className={`${base} h-12 min-w-12 gap-0.5 px-2 ${selected === null ? on : off}`}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          <span className="text-[10px]">Tất cả</span>
        </button>
        {thumbs.map((src, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={selected === i}
            aria-label={`Người ${i + 1}${customized.includes(i) ? ' (có mức riêng)' : ''}`}
            title={`Người ${i + 1}`}
            onClick={() => onSelect(selected === i ? null : i)}
            className={`${base} h-12 w-12 overflow-hidden p-0 ${selected === i ? on : off}`}
          >
            {src ? <img src={src} alt="" className="h-full w-full object-cover" draggable="false" /> : null}
            <span className="absolute bottom-0 left-0 rounded-tr-md bg-[#0f1116]/85 px-1 text-[10px] leading-4 text-slate-100">{i + 1}</span>
            {customized.includes(i) && (
              <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-amber-400 ring-1 ring-[#0f1116]" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
