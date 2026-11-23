import React, { useEffect, useRef, useState } from 'react';
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
  HelpCircle,
  Settings2,
  X,
} from 'lucide-react';

const SHORTCUTS = [
  { keys: 'Ctrl / ⌘ + O', desc: 'Mở ảnh từ máy' },
  { keys: 'Ctrl / ⌘ + V', desc: 'Dán ảnh trực tiếp từ Clipboard' },
  { keys: 'Ctrl / ⌘ + S', desc: 'Mở hộp thoại Xuất ảnh' },
  { keys: 'Ctrl / ⌘ + Z', desc: 'Hoàn tác (Undo)' },
  { keys: 'Ctrl / ⌘ + Y', desc: 'Làm lại (Redo)' },
  { keys: 'Space + Kéo', desc: 'Di chuyển khung nhìn (Pan)' },
  { keys: 'Cuộn chuột', desc: 'Phóng to / Thu nhỏ tại vị trí trỏ' },
  { keys: '[  /  ]', desc: 'Giảm / Tăng kích thước cọ' },
  { keys: 'Giữ phím \\', desc: 'Xem nhanh ảnh gốc' },
  { keys: 'Alt + Click', desc: 'Chọn điểm mẫu cho Clone Stamp' },
];

function ResolutionSelect({ value, onChange, className }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Độ phân giải tối đa khi nạp ảnh mới"
      className={`rounded-lg bg-[#1b1f29] border border-[#282e3d] text-slate-300 focus-visible:outline-amber-500 cursor-pointer ${className}`}
    >
      <option value={1600}>1600px (Mượt)</option>
      <option value={2400}>2400px (Nét)</option>
      <option value={0}>Độ phân giải gốc</option>
    </select>
  );
}

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
  workMaxDim,
  onChangeWorkMaxDim,
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);

  useEffect(() => {
    const dialog = helpRef.current;
    if (helpOpen && !dialog.open) dialog.showModal();
    if (!helpOpen && dialog.open) dialog.close();
  }, [helpOpen]);

  return (
    <>
      <header className="shrink-0 bg-[#14171f] border-b border-[#252a37] px-2 py-1.5 flex flex-wrap items-center justify-between gap-x-1 gap-y-1.5 md:h-13 md:flex-nowrap md:gap-2 md:px-3 md:py-0">
        {/* Brand + Open */}
        <div className="flex shrink-0 items-center gap-1.5 md:gap-2.5">
          <div className="flex items-center gap-2 md:pr-3 md:border-r md:border-[#252a37]">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20" aria-hidden="true">
              <Sparkles className="w-4 h-4 text-[#0f1116]" />
            </div>
            <div className={`${hasImage ? 'hidden min-[420px]:block' : ''} leading-tight`}>
              <div className="text-sm font-bold tracking-wide text-slate-100">
                LK Magic <span className="text-amber-400">Web</span>
              </div>
              <div className="hidden text-[10px] text-slate-400 md:block">Studio Chỉnh Ảnh AI</div>
            </div>
          </div>

          <button
            onClick={onOpenFile}
            className="flex min-h-10 items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#202532] hover:bg-[#293041] text-slate-200 text-xs font-medium border border-[#2f3647] transition cursor-pointer md:min-h-0 md:px-3"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Mở ảnh</span>
          </button>

          {imageCount > 0 && (
            <button
              onClick={onToggleFilmstrip}
              aria-label={`Danh sách ảnh (${imageCount})`}
              aria-pressed={showFilmstrip}
              title="Hiện/Ẩn danh sách ảnh"
              className={`flex min-h-10 items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer md:min-h-0 md:px-2.5 ${
                showFilmstrip
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#202532] border-[#2f3647] text-slate-300 hover:bg-[#293041]'
              }`}
            >
              <Images className="w-3.5 h-3.5" />
              <span>{imageCount}</span>
            </button>
          )}

          <ResolutionSelect
            value={workMaxDim}
            onChange={onChangeWorkMaxDim}
            className="hidden px-2 py-1.5 text-[11px] lg:block"
          />
        </div>

        {/* Center: Undo/Redo & Before/After & Zoom */}
        {hasImage && (
          <div className="order-last flex basis-full items-center justify-center gap-1 md:order-none md:basis-auto md:gap-1.5">
            <div className="flex items-center bg-[#1b1f29] rounded-lg p-0.5 border border-[#282e3d]">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                title="Hoàn tác (Ctrl+Z)"
                className="grid size-10 place-items-center p-1.5 rounded-md text-slate-300 hover:bg-[#262c3b] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer md:size-auto"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                title="Làm lại (Ctrl+Y)"
                className="grid size-10 place-items-center p-1.5 rounded-md text-slate-300 hover:bg-[#262c3b] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer md:size-auto"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center bg-[#1b1f29] rounded-lg p-0.5 border border-[#282e3d]">
              <button
                onClick={onToggleSplit}
                aria-label="Chia đôi"
                aria-pressed={splitView}
                title="So sánh chia đôi Trước / Sau"
                className={`flex size-10 items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer md:size-auto ${
                  splitView
                    ? 'bg-amber-500 text-[#0f1116]'
                    : 'text-slate-300 hover:bg-[#262c3b]'
                }`}
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Chia đôi</span>
              </button>
              <button
                onPointerDown={(e) => {
                  if (e.button === 0) onCompareStart();
                }}
                onPointerUp={onCompareEnd}
                onPointerLeave={onCompareEnd}
                onPointerCancel={onCompareEnd}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') onCompareStart();
                }}
                onKeyUp={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') onCompareEnd();
                }}
                onBlur={onCompareEnd}
                aria-label="Giữ xem gốc"
                title="Nhấn giữ (hoặc giữ \) để xem ảnh gốc"
                className="flex size-10 items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:bg-[#262c3b] active:bg-amber-500/20 active:text-amber-300 transition cursor-pointer md:size-auto"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Giữ xem gốc</span>
              </button>
            </div>

            <div className="flex items-center bg-[#1b1f29] rounded-lg p-0.5 border border-[#282e3d]">
              <button
                onClick={onZoomOut}
                title="Thu nhỏ"
                className="grid h-10 w-8 place-items-center p-1.5 rounded-md text-slate-300 hover:bg-[#262c3b] transition cursor-pointer md:size-auto"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onZoomFit}
                title="Vừa màn hình"
                aria-label={`Vừa màn hình (${Math.round(zoom * 100)}%)`}
                className="px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-amber-300 cursor-pointer"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={onZoomIn}
                title="Phóng to"
                className="grid h-10 w-8 place-items-center p-1.5 rounded-md text-slate-300 hover:bg-[#262c3b] transition cursor-pointer md:size-auto"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Right: Help, Reset & Export */}
        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            aria-label="Cài đặt và phím tắt"
            title="Cài đặt và phím tắt"
            className="grid size-10 place-items-center p-1.5 rounded-lg bg-[#1b1f29] hover:bg-[#262c3b] border border-[#282e3d] text-slate-400 hover:text-amber-300 transition cursor-pointer md:size-auto"
          >
            <Settings2 className="size-4 lg:hidden" />
            <HelpCircle className="hidden size-4 lg:block" />
          </button>

          {hasImage && (
            <>
              <button
                onClick={onResetAll}
                title="Đặt lại toàn bộ về ảnh gốc"
                className="hidden items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#202532] hover:bg-rose-500/15 hover:border-rose-500/40 hover:text-rose-300 text-slate-300 text-xs font-medium border border-[#2f3647] transition cursor-pointer md:flex"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Khôi phục gốc</span>
              </button>
              <button
                onClick={onOpenExport}
                className="flex min-h-10 items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-[#0f1116] text-xs font-bold shadow-md shadow-amber-500/20 transition cursor-pointer md:min-h-0 md:px-3.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Xuất ảnh</span>
              </button>
            </>
          )}
        </div>
      </header>

      <dialog
        ref={helpRef}
        onClose={() => setHelpOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setHelpOpen(false);
        }}
        aria-labelledby="studio-settings-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-[#2c3344] bg-[#181b24] shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center justify-between border-b border-[#262c3b] pl-5 pr-2">
          <h2 id="studio-settings-title" className="text-sm font-bold text-slate-100">Cài đặt và phím tắt</h2>
          <button
            onClick={() => setHelpOpen(false)}
            aria-label="Đóng cài đặt"
            className="grid size-11 place-items-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#252b39] cursor-pointer"
          >
            <X className="size-[18px]" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <label className="block space-y-1.5 text-xs text-slate-300 lg:hidden">
            <span>Độ phân giải tối đa khi nạp ảnh mới</span>
            <ResolutionSelect value={workMaxDim} onChange={onChangeWorkMaxDim} className="block w-full px-3 py-2.5 text-sm" />
          </label>
          {hasImage && (
            <button
              onClick={() => {
                onResetAll();
                setHelpOpen(false);
              }}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-[#2f3647] bg-[#202532] px-3 text-xs font-medium text-slate-300 hover:border-rose-500/40 hover:text-rose-300 md:hidden"
            >
              <RotateCcw className="size-4" />
              Khôi phục gốc
            </button>
          )}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-200">Phím tắt Studio</h3>
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between gap-2 rounded-lg border border-[#232836] bg-[#111319] px-2.5 py-1.5 text-xs">
                <span className="text-slate-300">{s.desc}</span>
                <kbd className="shrink-0 rounded border border-[#343b4f] bg-[#222736] px-2 py-0.5 font-mono text-[11px] text-amber-300">{s.keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
