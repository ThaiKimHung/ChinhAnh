import React from 'react';
import {
  Palette,
  Sparkles,
  Wand2,
  Eraser,
  Scissors,
  Crop,
  Type,
} from 'lucide-react';

const TABS = [
  { id: 'color', label: 'Chỉnh màu', icon: Palette },
  { id: 'portrait', label: 'Chân dung', icon: Sparkles },
  { id: 'liquify', label: 'Nắn bóp', icon: Wand2 },
  { id: 'erase', label: 'Xóa vật thể', icon: Eraser },
  { id: 'background', label: 'Tách nền', icon: Scissors },
  { id: 'crop', label: 'Cắt & Xoay', icon: Crop },
  { id: 'text', label: 'Chữ & Khung', icon: Type },
];

export default function LeftNav({ activeTab, onSelectTab }) {
  return (
    <aside className="w-[74px] shrink-0 bg-[#14171f] border-r border-[#252a37] flex flex-col items-center py-3 gap-1.5">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`w-[60px] py-2.5 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition cursor-pointer border ${
              active
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-inner'
                : 'bg-transparent border-transparent text-slate-400 hover:bg-[#1e222d] hover:text-slate-200'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium text-center leading-tight">
              {tab.label}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
