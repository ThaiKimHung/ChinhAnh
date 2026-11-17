import React from 'react';
import {
  Sparkles,
  Upload,
  Undo2,
  Redo2,
  SplitSquareHorizontal,
  Eye,
  ZoomIn,
  ZoomOut,
  Download,
  RotateCcw,
  Images,
} from 'lucide-react';

export default function TopBar({
  hasImage,
  onOpenFile,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  splitView,
  onToggleSplit,
  onCompareStart,
  onCompareEnd,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onResetAll,
  onOpenExport,
  showFilmstrip,
  onToggleFilmstrip,
  imageCount,
}) {
  return (
    <header className="h-13 shrink-0 bg-[#14171f] border-b border-[#252a37] px-3 flex items-center justify-between gap-2">
      {/* Brand + Open */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pr-3 border-r border-[#252a37]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Sparkles className="w-4 h-4 text-[#0f1116]" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-wide text-slate-100">
              LK Magic <span className="text-amber-400">Web</span>
            </div>
            <div className="text-[10px] text-slate-400">Studio Chỉnh Ảnh AI</div>
          </div>
        </div>

        <button
          onClick={onOpenFile}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202532] hover:bg-[#293041] text-slate-200 text-xs font-medium border border-[#2f3647] transition cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-amber-400" />
          <span>Mở ảnh</span>
        </button>

        {imageCount > 0 && (
          <button
            onClick={onToggleFilmstrip}
            title="Hiện/Ẩn danh sách ảnh"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
              showFilmstrip
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-[#202532] border-[#2f3647] text-slate-300 hover:bg-[#293041]'
            }`}
          >
            <Images className="w-3.5 h-3.5" />
            <span>{imageCount}</span>
          </button>
        )}
      </div>

      {/* Center: Undo/Redo & Before/After & Zoom */}
      {hasImage && (
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-[#1b1f29] rounded-lg p-0.5 border border-[#282e3d]">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Hoàn tác (Ctrl+Z)"
              className="p-1.5 rounded-md text-slate-300 hover:bg-[#262c3b] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="Làm lại (Ctrl+Y)"
              className="p-1.5 rounded-md text-slate-300 hover:bg-[#262c3b] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center bg-[#1b1f29] rounded-lg p-0.5 border border-[#282e3d]">
            <button
              onClick={onToggleSplit}
              title="So sánh chia đôi Trước / Sau"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                splitView
                  ? 'bg-amber-500 text-[#0f1116]'
                  : 'text-slate-300 hover:bg-[#262c3b]'
              }`}
            >
              <SplitSquareHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chia đôi</span>
            </button>
            <button
              onMouseDown={onCompareStart}
              onMouseUp={onCompareEnd}
              onMouseLeave={onCompareEnd}
              onTouchStart={onCompareStart}
              onTouchEnd={onCompareEnd}
              title="Nhấn giữ để xem ảnh gốc"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:bg-[#262c3b] active:bg-amber-500/20 active:text-amber-300 transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Giữ xem gốc</span>
            </button>
          </div>

          <div className="flex items-center bg-[#1b1f29] rounded-lg p-0.5 border border-[#282e3d]">
            <button
              onClick={onZoomOut}
              title="Thu nhỏ"
              className="p-1.5 rounded-md text-slate-300 hover:bg-[#262c3b] transition cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onZoomFit}
              title="Vừa màn hình"
              className="px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-amber-300 cursor-pointer"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={onZoomIn}
              title="Phóng to"
              className="p-1.5 rounded-md text-slate-300 hover:bg-[#262c3b] transition cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Right: Reset & Export */}
      <div className="flex items-center gap-2">
        {hasImage && (
          <>
            <button
              onClick={onResetAll}
              title="Đặt lại toàn bộ về ảnh gốc"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#202532] hover:bg-rose-500/15 hover:border-rose-500/40 hover:text-rose-300 text-slate-300 text-xs font-medium border border-[#2f3647] transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Khôi phục gốc</span>
            </button>
            <button
              onClick={onOpenExport}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-[#0f1116] text-xs font-bold shadow-md shadow-amber-500/20 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất ảnh</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
