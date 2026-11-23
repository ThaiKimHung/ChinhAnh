import React from 'react';
import { X } from 'lucide-react';

export default function Filmstrip({ images, activeImageId, onSelect, onRemove, onAdd }) {
  return (
    <div className="h-16 md:h-20 shrink-0 bg-[#13161e] border-t border-[#252a37] px-3 flex items-center gap-2 overflow-x-auto">
      {images.map((item) => {
        const active = item.id === activeImageId;
        return (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(item);
            }}
            className={`group relative h-14 w-14 shrink-0 rounded-lg overflow-hidden border-2 transition cursor-pointer ${
              active ? 'border-amber-400 shadow-md shadow-amber-500/20' : 'border-[#2a303e] opacity-75 hover:opacity-100'
            }`}
            title={item.name}
          >
            <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item);
              }}
              title="Xóa ảnh khỏi danh sách"
              className="opacity-100 md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/75 text-slate-200 hover:text-rose-400 flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        );
      })}
      <button
        onClick={onAdd}
        className="h-14 w-14 shrink-0 rounded-lg border border-dashed border-[#343b4e] hover:border-amber-400 text-slate-400 hover:text-amber-400 flex items-center justify-center text-xl cursor-pointer transition"
        title="Thêm ảnh"
      >
        +
      </button>
    </div>
  );
}
