import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { EDITOR_TABS } from './editor-tools';
import ColorPanel from './panels/ColorPanel';
import PortraitPanel from './panels/PortraitPanel';
import LiquifyPanel from './panels/LiquifyPanel';
import ErasePanel from './panels/ErasePanel';
import BackgroundPanel from './panels/BackgroundPanel';
import CropPanel from './panels/CropPanel';
import TextFramePanel from './panels/TextFramePanel';
import './editor-controls.css';

const PANELS = {
  color: ColorPanel,
  portrait: PortraitPanel,
  liquify: LiquifyPanel,
  erase: ErasePanel,
  background: BackgroundPanel,
  crop: CropPanel,
  text: TextFramePanel,
};

export default function RightPanel({ activeTab, hasImage, mobilePanelOpen, onCloseMobilePanel, ...panelProps }) {
  if (!hasImage) {
    return (
      <aside className="hidden w-[300px] shrink-0 bg-[#14171f] border-l border-[#252a37] p-5 md:flex flex-col items-center justify-center text-center">
        <Sparkles className="w-8 h-8 text-amber-400/50 mb-3" />
        <div className="text-sm font-medium text-slate-300">Chưa có ảnh nào được mở</div>
        <p className="text-xs text-slate-500 mt-1">
          Hãy kéo thả ảnh vào giữa màn hình hoặc bấm &ldquo;Mở ảnh&rdquo; để bắt đầu chỉnh sửa.
        </p>
      </aside>
    );
  }

  const Panel = PANELS[activeTab];

  return (
    <aside
      className={`${mobilePanelOpen ? 'flex' : 'hidden'} editor-controls shrink-0 flex-col max-h-[40dvh] overflow-hidden border-t border-[#252a37] bg-[#14171f] md:flex md:h-full md:max-h-none md:w-[310px] md:border-t-0 md:border-l`}
      aria-label="Bảng điều chỉnh ảnh"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[#252a37] pl-4 pr-2 md:hidden">
        <h2 className="text-sm font-semibold text-slate-100">{EDITOR_TABS.find((tab) => tab.id === activeTab)?.label}</h2>
        <button
          type="button"
          onClick={onCloseMobilePanel}
          className="grid size-11 place-items-center rounded-lg text-slate-300 hover:bg-[#252b39]"
          aria-label="Đóng bảng điều chỉnh"
        >
          <X className="size-[18px]" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-5 md:p-4">
        {Panel && <Panel {...panelProps} />}
      </div>
    </aside>
  );
}
