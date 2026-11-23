import React from 'react';
import { EDITOR_TABS } from './editor-tools';

export default function LeftNav({ activeTab, onSelectTab }) {
  return (
    <nav
      aria-label="Công cụ chỉnh ảnh"
      className="order-last min-w-0 shrink-0 flex items-stretch gap-1 overflow-x-auto border-t border-[#252a37] bg-[#14171f] px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:order-first md:w-[74px] md:flex-col md:items-center md:gap-1.5 md:overflow-x-hidden md:overflow-y-auto md:border-t-0 md:border-r md:px-0 md:py-3"
    >
      {EDITOR_TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            aria-pressed={active}
            className={`min-h-12 min-w-[42px] flex-1 basis-0 px-0.5 py-1.5 rounded-lg flex flex-col items-center justify-center gap-1 transition cursor-pointer border md:w-[60px] md:flex-none md:rounded-xl md:px-1 md:py-2.5 ${
              active
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-inner'
                : 'bg-transparent border-transparent text-slate-400 hover:bg-[#1e222d] hover:text-slate-200'
            }`}
          >
            <Icon className="w-[18px] h-[18px] shrink-0 md:w-5 md:h-5" />
            <span className="text-[10px] font-medium text-center leading-tight">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
