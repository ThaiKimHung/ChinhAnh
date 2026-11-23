import React, { useState } from 'react';
import {
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Sparkles,
  Eraser,
  Paintbrush,
  Wand2,
  Move,
  Maximize2,
  Minimize2,
  Undo,
  Scissors,
  ImagePlus,
  Loader2,
  Check,
  Crosshair,
  Trash2,
  Copy,
  ClipboardPaste,
  Plus,
  X,
} from 'lucide-react';
import { PRESETS, DEFAULT_ADJUSTMENTS, DEFAULT_BEAUTY, DEFAULT_HSL } from '../engine/imagePipeline';
import { EDITOR_TABS } from './editor-tools';
import './editor-controls.css';

const HSL_CHANNELS = [
  { key: 'red', label: 'Đỏ', color: '#ef4444' },
  { key: 'orange', label: 'Cam / Da', color: '#f97316' },
  { key: 'yellow', label: 'Vàng', color: '#eab308' },
  { key: 'green', label: 'Lục', color: '#22c55e' },
  { key: 'blue', label: 'Lam', color: '#38bdf8' },
  { key: 'purple', label: 'Tím', color: '#a855f7' },
];

function SliderRow({ label, value, min = -100, max = 100, unit = '', onChange, onReset, onCommit }) {
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

function HistogramChart({ histogram }) {
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

export default function RightPanel({
  activeTab,
  hasImage,
  mobilePanelOpen,
  onCloseMobilePanel,
  histogram,
  adjustments,
  onAdjustChange,
  onCommitHistory,
  activePreset,
  onSelectPreset,
  onAutoEnhance,
  customPresets,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  hasCopiedStyle,
  onCopyStyle,
  onPasteStyle,
  onApplyStyleAll,
  imageCount,
  beauty,
  setBeauty,
  brushTool,
  setBrushTool,
  brushSize,
  setBrushSize,
  brushStrength,
  setBrushStrength,
  liquifyMode,
  setLiquifyMode,
  onResetLiquify,
  eraseMode,
  setEraseMode,
  hasEraseMask,
  eraseProcessing,
  onApplyEraseMask,
  onClearEraseMask,
  cloneSource,
  pickingCloneSource,
  setPickingCloneSource,
  bgState,
  setBgState,
  hasCutoutMask,
  bgProcessing,
  bgProgress,
  bgMaskBrush,
  setBgMaskBrush,
  onRunAiBgRemoval,
  onUploadBgImage,
  onRotate,
  onFlip,
  straightenAngle,
  setStraightenAngle,
  onApplyStraighten,
  cropAspect,
  onSelectCropAspect,
  cropActive,
  setCropActive,
  onApplyCrop,
  textConfig,
  setTextConfig,
  frameConfig,
  setFrameConfig,
  logoConfig,
  setLogoConfig,
  onUploadLogo,
}) {
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [hslBand, setHslBand] = useState('red');

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

  const updateAdj = (key, val) => {
    onAdjustChange({ ...adjustments, [key]: val });
  };

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
        {activeTab === 'color' && (
          <>
            <HistogramChart histogram={histogram} />

            {/* Quick Actions: Auto Enhance & Copy/Paste Style */}
            <div className="space-y-2">
              <button
                onClick={onAutoEnhance}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-400/15 hover:from-amber-500/30 hover:to-amber-400/25 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Tự động cân bằng sáng &amp; màu</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={onCopyStyle}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-[#1b1f29] hover:bg-[#232938] border border-[#282f40] text-[11px] font-medium text-slate-300 flex items-center justify-center gap-1 cursor-pointer"
                  title="Sao chép thông số màu & làm đẹp da"
                >
                  <Copy className="w-3 h-3 text-amber-400" />
                  <span>Chép màu</span>
                </button>
                <button
                  onClick={onPasteStyle}
                  disabled={!hasCopiedStyle}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-[#1b1f29] hover:bg-[#232938] disabled:opacity-40 border border-[#282f40] text-[11px] font-medium text-slate-300 flex items-center justify-center gap-1 cursor-pointer"
                  title="Dán thông số màu đã sao chép"
                >
                  <ClipboardPaste className="w-3 h-3 text-amber-400" />
                  <span>Dán màu</span>
                </button>
                {imageCount > 1 && (
                  <button
                    onClick={onApplyStyleAll}
                    className="py-1.5 px-2.5 rounded-lg bg-[#1b1f29] hover:bg-[#232938] border border-[#282f40] text-[11px] font-medium text-amber-300 cursor-pointer"
                    title="Áp dụng bộ màu này cho tất cả ảnh trong Filmstrip"
                  >
                    Tất cả
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Preset màu Studio
                </h3>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setSavingPreset((v) => !v)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5 cursor-pointer"
                    title="Lưu thành Preset cá nhân"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Lưu</span>
                  </button>
                  <button
                    onClick={() => onSelectPreset('original', DEFAULT_ADJUSTMENTS)}
                    className="text-[11px] text-slate-400 hover:text-amber-400 cursor-pointer"
                  >
                    Đặt lại
                  </button>
                </div>
              </div>

              {savingPreset && (
                <div className="mb-2.5 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Tên preset của bạn..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#111319] border border-[#2c3344] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={() => {
                      if (!presetName.trim()) return;
                      onSaveCustomPreset(presetName.trim());
                      setPresetName('');
                      setSavingPreset(false);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-[#0f1116] text-xs font-bold cursor-pointer"
                  >
                    Lưu
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map((p) => {
                  const selected = activePreset === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelectPreset(p.id, p.values)}
                      title={p.name}
                      className={`px-2.5 py-2 rounded-lg border text-left text-xs flex items-center gap-2 transition cursor-pointer ${
                        selected
                          ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 font-semibold'
                          : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.badge }}
                      />
                      <span className="md:truncate">{p.name}</span>
                    </button>
                  );
                })}

                {customPresets.map((p) => {
                  const selected = activePreset === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`group relative px-2.5 py-2 rounded-lg border text-left text-xs flex items-center gap-2 transition ${
                        selected
                          ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 font-semibold'
                          : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                      }`}
                    >
                      <button
                        onClick={() => onSelectPreset(p.id, p.values)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-400" />
                        <span className="truncate">{p.name}</span>
                      </button>
                      <button
                        onClick={() => onDeleteCustomPreset(p.id)}
                        className="md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Xóa preset"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-[#232836] space-y-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Ánh sáng &amp; Màu sắc
              </h3>
              <SliderRow
                label="Phơi sáng (Exposure)"
                value={adjustments.exposure}
                onChange={(v) => updateAdj('exposure', v)}
                onReset={() => updateAdj('exposure', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Tương phản (Contrast)"
                value={adjustments.contrast}
                onChange={(v) => updateAdj('contrast', v)}
                onReset={() => updateAdj('contrast', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Vùng sáng (Highlights)"
                value={adjustments.highlights}
                onChange={(v) => updateAdj('highlights', v)}
                onReset={() => updateAdj('highlights', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Vùng tối (Shadows)"
                value={adjustments.shadows}
                onChange={(v) => updateAdj('shadows', v)}
                onReset={() => updateAdj('shadows', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Nhiệt độ màu (Temp)"
                value={adjustments.temperature}
                onChange={(v) => updateAdj('temperature', v)}
                onReset={() => updateAdj('temperature', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Sắc thái (Tint)"
                value={adjustments.tint}
                onChange={(v) => updateAdj('tint', v)}
                onReset={() => updateAdj('tint', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Độ bão hòa (Saturation)"
                value={adjustments.saturation}
                onChange={(v) => updateAdj('saturation', v)}
                onReset={() => updateAdj('saturation', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Độ rực màu (Vibrance)"
                value={adjustments.vibrance}
                onChange={(v) => updateAdj('vibrance', v)}
                onReset={() => updateAdj('vibrance', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Độ khối (Clarity)"
                min={-50}
                max={100}
                value={adjustments.clarity ?? 0}
                onChange={(v) => updateAdj('clarity', v)}
                onReset={() => updateAdj('clarity', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Màu film mờ (Fade)"
                min={0}
                max={100}
                value={adjustments.fade ?? 0}
                onChange={(v) => updateAdj('fade', v)}
                onReset={() => updateAdj('fade', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Nhiễu hạt phim (Grain)"
                min={0}
                max={100}
                value={adjustments.grain ?? 0}
                onChange={(v) => updateAdj('grain', v)}
                onReset={() => updateAdj('grain', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Độ nét (Sharpen)"
                min={0}
                max={100}
                value={adjustments.sharpen}
                onChange={(v) => updateAdj('sharpen', v)}
                onReset={() => updateAdj('sharpen', 0)}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Tối góc (Vignette)"
                min={0}
                max={100}
                value={adjustments.vignette}
                onChange={(v) => updateAdj('vignette', v)}
                onReset={() => updateAdj('vignette', 0)}
                onCommit={onCommitHistory}
              />
            </div>

            {/* HSL Mixer */}
            <div className="pt-3 border-t border-[#232836] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  HSL từng kênh màu
                </h3>
                <button
                  onClick={() => {
                    const nextAdj = {
                      ...adjustments,
                      hsl: {
                        red: [...DEFAULT_HSL.red],
                        orange: [...DEFAULT_HSL.orange],
                        yellow: [...DEFAULT_HSL.yellow],
                        green: [...DEFAULT_HSL.green],
                        blue: [...DEFAULT_HSL.blue],
                        purple: [...DEFAULT_HSL.purple],
                      },
                    };
                    onAdjustChange(nextAdj);
                    onCommitHistory({ adjustments: nextAdj, activePreset: 'custom' });
                  }}
                  className="text-[11px] text-slate-400 hover:text-amber-400 cursor-pointer"
                >
                  Đặt lại HSL
                </button>
              </div>
              <div className="flex items-center justify-between gap-1 bg-[#1b1f29] p-1.5 rounded-xl border border-[#262c3b]">
                {HSL_CHANNELS.map((ch) => {
                  const active = hslBand === ch.key;
                  const vals = adjustments.hsl?.[ch.key] || [0, 0, 0];
                  const modified = vals[0] !== 0 || vals[1] !== 0 || vals[2] !== 0;
                  return (
                    <button
                      key={ch.key}
                      onClick={() => setHslBand(ch.key)}
                      title={ch.label}
                      className={`relative flex-1 py-1.5 rounded-lg flex flex-col items-center gap-1 cursor-pointer transition ${
                        active ? 'bg-[#282e3e] ring-1 ring-amber-400/70' : 'hover:bg-[#222736]'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: ch.color }} />
                      {modified && <span className="w-1 h-1 rounded-full bg-amber-400" />}
                    </button>
                  );
                })}
              </div>

              {(() => {
                const cur = adjustments.hsl?.[hslBand] || [0, 0, 0];
                const chLabel = HSL_CHANNELS.find((c) => c.key === hslBand)?.label || '';
                const setBandIdx = (idx, v) => {
                  const base = adjustments.hsl || DEFAULT_HSL;
                  const nextBand = [...(base[hslBand] || [0, 0, 0])];
                  nextBand[idx] = v;
                  onAdjustChange({
                    ...adjustments,
                    hsl: { ...base, [hslBand]: nextBand },
                  });
                };
                return (
                  <div className="space-y-2.5">
                    <div className="text-[11px] text-amber-300 font-medium">Kênh: {chLabel}</div>
                    <SliderRow
                      label="Tông màu (Hue)"
                      min={-100}
                      max={100}
                      value={cur[0]}
                      onChange={(v) => setBandIdx(0, v)}
                      onReset={() => setBandIdx(0, 0)}
                      onCommit={onCommitHistory}
                    />
                    <SliderRow
                      label="Độ bão hòa (Sat)"
                      min={-100}
                      max={100}
                      value={cur[1]}
                      onChange={(v) => setBandIdx(1, v)}
                      onReset={() => setBandIdx(1, 0)}
                      onCommit={onCommitHistory}
                    />
                    <SliderRow
                      label="Độ sáng (Lum)"
                      min={-100}
                      max={100}
                      value={cur[2]}
                      onChange={(v) => setBandIdx(2, v)}
                      onReset={() => setBandIdx(2, 0)}
                      onCommit={onCommitHistory}
                    />
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {activeTab === 'portrait' && (
          <>
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Làm đẹp da tự động
                </h3>
                <button
                  onClick={() => {
                    setBeauty({ ...DEFAULT_BEAUTY });
                    onCommitHistory({ beauty: { ...DEFAULT_BEAUTY } });
                  }}
                  className="text-[11px] text-slate-400 hover:text-amber-400 cursor-pointer"
                >
                  Đặt lại
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Tự động nhận diện vùng da và làm mịn giữ chi tiết mắt/tóc.
              </p>
              <SliderRow
                label="Làm mịn da (Skin Smooth)"
                min={0}
                max={100}
                value={beauty.skinSmooth}
                onChange={(v) => setBeauty((b) => ({ ...b, skinSmooth: v }))}
                onReset={() => setBeauty((b) => ({ ...b, skinSmooth: 0 }))}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Làm sáng da (Brighten)"
                min={0}
                max={100}
                value={beauty.skinBrighten}
                onChange={(v) => setBeauty((b) => ({ ...b, skinBrighten: v }))}
                onReset={() => setBeauty((b) => ({ ...b, skinBrighten: 0 }))}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Da hồng hào (Rosy)"
                min={0}
                max={100}
                value={beauty.skinRosy}
                onChange={(v) => setBeauty((b) => ({ ...b, skinRosy: v }))}
                onReset={() => setBeauty((b) => ({ ...b, skinRosy: 0 }))}
                onCommit={onCommitHistory}
              />
            </div>

            <div className="pt-4 border-t border-[#232836] space-y-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Cọ Retouch thủ công
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'smooth', label: 'Mịn da', icon: Paintbrush },
                  { id: 'heal', label: 'Xóa mụn', icon: Sparkles },
                  { id: 'restore', label: 'Khôi phục', icon: Eraser },
                ].map((tool) => {
                  const Icon = tool.icon;
                  const active = brushTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => setBrushTool(active ? 'none' : tool.id)}
                      className={`py-2 px-1.5 rounded-lg border text-[11px] font-medium flex flex-col items-center gap-1 transition cursor-pointer ${
                        active
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tool.label}</span>
                    </button>
                  );
                })}
              </div>

              <SliderRow
                label="Kích thước cọ ( [ / ] )"
                min={8}
                max={120}
                value={brushSize}
                onChange={setBrushSize}
                onReset={() => setBrushSize(36)}
              />
              <SliderRow
                label="Độ mạnh cọ"
                min={10}
                max={100}
                value={brushStrength}
                onChange={setBrushStrength}
                onReset={() => setBrushStrength(65)}
              />
              <div className="text-[11px] text-slate-400 bg-[#1b1f29] p-2.5 rounded-lg border border-[#262c3b]">
                {brushTool === 'none'
                  ? 'Chọn một loại cọ ở trên rồi tô trực tiếp lên vùng da trên ảnh.'
                  : 'Đang bật cọ: kéo chuột trực tiếp lên ảnh để xử lý.'}
              </div>
            </div>
          </>
        )}

        {activeTab === 'liquify' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Nắn bóp khuôn mặt &amp; dáng
              </h3>
              <button
                onClick={onResetLiquify}
                title="Đưa mọi chỉnh sửa trực tiếp trên pixel về ảnh gốc"
                className="text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer"
              >
                Khôi phục pixel toàn ảnh
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'push', label: 'Đẩy (Bóp mặt/eo)', icon: Move },
                { id: 'pinch', label: 'Thu nhỏ', icon: Minimize2 },
                { id: 'bloat', label: 'Phóng to (Mắt/Môi)', icon: Maximize2 },
                { id: 'restore', label: 'Khôi phục vùng', icon: Undo },
              ].map((m) => {
                const Icon = m.icon;
                const active = liquifyMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setLiquifyMode(m.id)}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition cursor-pointer ${
                      active
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                        : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>

            <SliderRow
              label="Kích thước vùng nắn ( [ / ] )"
              min={15}
              max={180}
              value={brushSize}
              onChange={setBrushSize}
              onReset={() => setBrushSize(55)}
            />
            <SliderRow
              label="Cường độ nắn"
              min={10}
              max={100}
              value={brushStrength}
              onChange={setBrushStrength}
              onReset={() => setBrushStrength(55)}
            />

            <div className="text-[11px] text-slate-400 bg-[#1b1f29] p-3 rounded-xl border border-[#262c3b] leading-relaxed">
              <Wand2 className="w-3.5 h-3.5 text-amber-400 inline mr-1.5" />
              Kéo nhẹ trên ảnh để bóp gọn hàm, chỉnh mũi, nâng vai hoặc chỉnh dáng tự nhiên.
            </div>
          </div>
        )}

        {activeTab === 'erase' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Xóa vật thể thừa
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setEraseMode('magic');
                  setPickingCloneSource(false);
                }}
                className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  eraseMode === 'magic'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                    : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tô xóa tự động</span>
              </button>
              <button
                onClick={() => setEraseMode('clone')}
                className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  eraseMode === 'clone'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                    : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Nhân bản vùng</span>
              </button>
            </div>

            <SliderRow
              label="Kích thước cọ ( [ / ] )"
              min={8}
              max={140}
              value={brushSize}
              onChange={setBrushSize}
              onReset={() => setBrushSize(36)}
            />

            {eraseMode === 'magic' ? (
              <div className="space-y-2.5 pt-1">
                <button
                  onClick={onApplyEraseMask}
                  disabled={!hasEraseMask || eraseProcessing}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-45 text-[#0f1116] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer"
                >
                  {eraseProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang xử lý xóa...</span>
                    </>
                  ) : (
                    <>
                      <Eraser className="w-4 h-4" />
                      <span>Xóa vật thể đã tô</span>
                    </>
                  )}
                </button>

                {hasEraseMask && (
                  <button
                    onClick={onClearEraseMask}
                    className="w-full py-2 px-3 rounded-lg bg-[#202532] hover:bg-[#2a3041] border border-[#2f3647] text-xs font-medium text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa vùng tô đỏ</span>
                  </button>
                )}

                <div className="text-[11px] text-slate-400 bg-[#1b1f29] p-3 rounded-xl border border-[#262c3b] leading-relaxed">
                  Tô đỏ lên dây điện, rác, vết bẩn hoặc người thừa cần xóa trên ảnh rồi bấm{' '}
                  <strong className="text-slate-200">Xóa vật thể đã tô</strong>. Thuật toán sẽ tự ghép kết cấu nền xung quanh vào vùng đã chọn.
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <SliderRow
                  label="Độ phủ cọ nhân bản"
                  min={10}
                  max={100}
                  value={brushStrength}
                  onChange={setBrushStrength}
                  onReset={() => setBrushStrength(85)}
                />

                <button
                  onClick={() => setPickingCloneSource((v) => !v)}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                    pickingCloneSource
                      ? 'bg-sky-500 text-[#0f1116] border-sky-400'
                      : 'bg-[#202532] hover:bg-[#2a3041] border-[#323a4f] text-slate-200'
                  }`}
                >
                  <Crosshair className="w-4 h-4" />
                  <span>
                    {pickingCloneSource
                      ? 'Click vào vùng sạch trên ảnh...'
                      : 'Chọn điểm mẫu trên ảnh'}
                  </span>
                </button>

                <div className="text-[11px] text-slate-400 bg-[#1b1f29] p-3 rounded-xl border border-[#262c3b] leading-relaxed space-y-1">
                  <div>
                    Trạng thái:{' '}
                    <span className={cloneSource ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                      {cloneSource
                        ? `Đã lấy mẫu (${Math.round(cloneSource.x)}, ${Math.round(cloneSource.y)})`
                        : 'Chưa chọn điểm mẫu'}
                    </span>
                  </div>
                  <div>
                    Mẹo: Giữ <strong className="text-slate-200">Alt + Click</strong> vào vùng nền sạch để lấy mẫu nhanh, sau đó kéo chuột đè lên vật thể cần xóa.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'background' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Tách nền AI &amp; Hậu cảnh
            </h3>

            <button
              onClick={onRunAiBgRemoval}
              disabled={bgProcessing}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-60 text-[#0f1116] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              {bgProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang tách nền AI... {bgProgress}</span>
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4" />
                  <span>{hasCutoutMask ? 'Chạy lại Tách nền AI' : 'Tách nền AI tự động'}</span>
                </>
              )}
            </button>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Chạy mô hình AI trực tiếp trên trình duyệt (lần đầu sẽ tải model khoảng vài chục MB và lưu cache).
            </p>

            {hasCutoutMask && (
              <div className="pt-3 border-t border-[#232836] space-y-3">
                <div className="text-xs font-semibold text-slate-300">Kiểu hậu cảnh</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'transparent', label: 'Trong suốt (PNG)' },
                    { id: 'bokeh', label: 'Xóa phông Bokeh' },
                    { id: 'color', label: 'Nền màu đơn sắc' },
                    { id: 'image', label: 'Ghép ảnh nền' },
                    { id: 'original', label: 'Ảnh gốc (Tắt)' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        const nextBg = { ...bgState, mode: m.id };
                        setBgState(nextBg);
                        onCommitHistory({ bgState: nextBg });
                      }}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-medium text-left flex items-center justify-between transition cursor-pointer ${
                        bgState.mode === m.id
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                      }`}
                    >
                      <span className="truncate">{m.label}</span>
                      {bgState.mode === m.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  ))}
                </div>

                {bgState.mode !== 'original' && (
                  <>
                    <SliderRow
                      label="Làm mềm viền tách nền"
                      min={0}
                      max={8}
                      unit="px"
                      value={bgState.feather ?? 2}
                      onChange={(v) => setBgState((s) => ({ ...s, feather: v }))}
                      onReset={() => setBgState((s) => ({ ...s, feather: 2 }))}
                      onCommit={onCommitHistory}
                    />

                    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-slate-300">
                      <span>Khử màu nền cũ quanh viền</span>
                      <input
                        type="checkbox"
                        checked={bgState.decontaminate !== false}
                        className="size-4 accent-amber-400"
                        onChange={(event) => {
                          const next = { ...bgState, decontaminate: event.target.checked };
                          setBgState(next);
                          onCommitHistory({ bgState: next });
                        }}
                      />
                    </label>

                    <div className="pt-2 border-t border-[#232836] space-y-2.5">
                      <div className="text-xs font-semibold text-slate-300">
                        Cọ tinh chỉnh vùng tách nền
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => setBgMaskBrush(bgMaskBrush === 'keep' ? 'none' : 'keep')}
                          className={`py-2 px-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                            bgMaskBrush === 'keep'
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                              : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                          }`}
                        >
                          <Paintbrush className="w-3.5 h-3.5" />
                          <span>Giữ lại vùng</span>
                        </button>
                        <button
                          onClick={() => setBgMaskBrush(bgMaskBrush === 'erase' ? 'none' : 'erase')}
                          className={`py-2 px-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                            bgMaskBrush === 'erase'
                              ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                              : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                          }`}
                        >
                          <Eraser className="w-3.5 h-3.5" />
                          <span>Xóa bớt nền</span>
                        </button>
                      </div>
                      {bgMaskBrush !== 'none' && (
                        <>
                          <SliderRow
                            label="Kích thước cọ ( [ / ] )"
                            min={8}
                            max={140}
                            value={brushSize}
                            onChange={setBrushSize}
                            onReset={() => setBrushSize(36)}
                          />
                          <SliderRow
                            label="Độ mạnh cọ"
                            min={15}
                            max={100}
                            value={brushStrength}
                            onChange={setBrushStrength}
                            onReset={() => setBrushStrength(70)}
                          />
                        </>
                      )}
                    </div>
                  </>
                )}

                {bgState.mode === 'bokeh' && (
                  <SliderRow
                    label="Độ mờ hậu cảnh (Bokeh)"
                    min={2}
                    max={40}
                    value={bgState.blurAmount}
                    onChange={(v) => setBgState((s) => ({ ...s, blurAmount: v }))}
                    onReset={() => setBgState((s) => ({ ...s, blurAmount: 14 }))}
                    onCommit={onCommitHistory}
                  />
                )}

                {bgState.mode === 'color' && (
                  <div className="space-y-2">
                    <div className="text-[11px] text-slate-400">Chọn màu nền (Ảnh thẻ / Studio)</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {['#ffffff', '#1d4ed8', '#38bdf8', '#dc2626', '#111827', '#e5e7eb'].map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            const nextBg = { ...bgState, color: c };
                            setBgState(nextBg);
                            onCommitHistory({ bgState: nextBg });
                          }}
                          className={`w-7 h-7 rounded-full border-2 cursor-pointer transition ${
                            bgState.color === c ? 'border-amber-400 scale-110' : 'border-slate-600'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      <input
                        type="color"
                        value={bgState.color}
                        onChange={(e) => setBgState((s) => ({ ...s, color: e.target.value }))}
                        onBlur={() => onCommitHistory()}
                        className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                        title="Chọn màu tùy ý"
                      />
                    </div>
                  </div>
                )}

                {bgState.mode === 'image' && (
                  <div>
                    <button
                      onClick={onUploadBgImage}
                      className="w-full py-2 px-3 rounded-lg bg-[#202532] hover:bg-[#2a3142] border border-[#323a4f] text-xs font-medium text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ImagePlus className="w-4 h-4 text-amber-400" />
                      <span>Chọn ảnh nền từ máy</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'crop' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Xoay &amp; Lật ảnh
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onRotate(-90)}
                className="py-2 px-3 rounded-lg bg-[#1b1f29] hover:bg-[#232938] border border-[#282f40] text-xs font-medium text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>Xoay trái 90°</span>
              </button>
              <button
                onClick={() => onRotate(90)}
                className="py-2 px-3 rounded-lg bg-[#1b1f29] hover:bg-[#232938] border border-[#282f40] text-xs font-medium text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCw className="w-4 h-4 text-amber-400" />
                <span>Xoay phải 90°</span>
              </button>
              <button
                onClick={() => onFlip('h')}
                className="py-2 px-3 rounded-lg bg-[#1b1f29] hover:bg-[#232938] border border-[#282f40] text-xs font-medium text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <FlipHorizontal className="w-4 h-4 text-amber-400" />
                <span>Lật ngang</span>
              </button>
              <button
                onClick={() => onFlip('v')}
                className="py-2 px-3 rounded-lg bg-[#1b1f29] hover:bg-[#232938] border border-[#282f40] text-xs font-medium text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <FlipVertical className="w-4 h-4 text-amber-400" />
                <span>Lật dọc</span>
              </button>
            </div>

            <div className="pt-3 border-t border-[#232836] space-y-2.5">
              <SliderRow
                label="Nắn thẳng góc nghiêng"
                min={-45}
                max={45}
                unit="°"
                value={straightenAngle}
                onChange={setStraightenAngle}
                onReset={() => setStraightenAngle(0)}
              />
              {straightenAngle !== 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setStraightenAngle(0)}
                    className="flex-1 py-1.5 rounded-lg bg-[#232836] hover:bg-[#2d3344] text-xs font-medium text-slate-300 cursor-pointer"
                  >
                    Hủy góc
                  </button>
                  <button
                    onClick={onApplyStraighten}
                    className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0f1116] text-xs font-bold cursor-pointer"
                  >
                    Áp dụng xoay
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#232836] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Cắt ảnh (Crop)
                </h3>
                <button
                  onClick={() => setCropActive(!cropActive)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    cropActive
                      ? 'bg-amber-500 text-[#0f1116]'
                      : 'bg-[#202532] text-slate-300 hover:bg-[#2b3244]'
                  }`}
                >
                  {cropActive ? 'Đang bật khung cắt' : 'Bật khung cắt'}
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'free', label: 'Tự do' },
                  { id: '1:1', label: '1:1' },
                  { id: '4:3', label: '4:3' },
                  { id: '3:2', label: '3:2' },
                  { id: '16:9', label: '16:9' },
                  { id: '9:16', label: '9:16' },
                  { id: '3:4', label: '3:4 Thẻ' },
                  { id: '2:3', label: '4:6 Thẻ' },
                ].map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onSelectCropAspect(r.id)}
                    className={`py-1.5 px-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      cropAspect === r.id && cropActive
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                        : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {cropActive && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setCropActive(false)}
                    className="flex-1 py-2 rounded-lg bg-[#232836] hover:bg-[#2d3344] text-xs font-medium text-slate-300 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={onApplyCrop}
                    className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0f1116] text-xs font-bold cursor-pointer"
                  >
                    Áp dụng cắt
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'text' && (
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Thêm chữ / Watermark
                </h3>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={textConfig.enabled}
                    onChange={(e) => {
                      const next = { ...textConfig, enabled: e.target.checked };
                      setTextConfig(next);
                      onCommitHistory({ textConfig: next });
                    }}
                    className="accent-amber-500"
                  />
                  <span>Hiện chữ</span>
                </label>
              </div>

              <input
                type="text"
                value={textConfig.content}
                onChange={(e) => setTextConfig((t) => ({ ...t, content: e.target.value, enabled: true }))}
                onBlur={() => onCommitHistory()}
                placeholder="Nhập nội dung chữ..."
                className="w-full px-3 py-2 rounded-lg bg-[#111319] border border-[#2c3344] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />

              <div className="flex items-center gap-1.5">
                <select
                  value={textConfig.fontFamily || 'Inter, system-ui, sans-serif'}
                  onChange={(e) => {
                    const next = { ...textConfig, fontFamily: e.target.value };
                    setTextConfig(next);
                    onCommitHistory({ textConfig: next });
                  }}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#111319] border border-[#2c3344] text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="Inter, system-ui, sans-serif">Hiện đại (Sans)</option>
                  <option value="Georgia, 'Times New Roman', serif">Cổ điển (Serif)</option>
                  <option value="'Courier New', monospace">Máy chữ (Mono)</option>
                  <option value="cursive">Chữ ký (Script)</option>
                </select>
                <button
                  onClick={() => {
                    const next = { ...textConfig, bold: textConfig.bold === false };
                    setTextConfig(next);
                    onCommitHistory({ textConfig: next });
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                    textConfig.bold !== false
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-[#1b1f29] border-[#262c3b] text-slate-400'
                  }`}
                >
                  B
                </button>
                <button
                  onClick={() => {
                    const next = { ...textConfig, italic: !textConfig.italic };
                    setTextConfig(next);
                    onCommitHistory({ textConfig: next });
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs italic font-serif cursor-pointer ${
                    textConfig.italic
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-[#1b1f29] border-[#262c3b] text-slate-400'
                  }`}
                >
                  I
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!textConfig.repeatWatermark}
                  onChange={(e) => {
                    const next = { ...textConfig, repeatWatermark: e.target.checked, enabled: true };
                    setTextConfig(next);
                    onCommitHistory({ textConfig: next });
                  }}
                  className="accent-amber-500"
                />
                <span>Watermark lặp chéo toàn ảnh</span>
              </label>

              <SliderRow
                label="Cỡ chữ"
                min={14}
                max={120}
                value={textConfig.fontSize}
                onChange={(v) => setTextConfig((t) => ({ ...t, fontSize: v }))}
                onReset={() => setTextConfig((t) => ({ ...t, fontSize: 42 }))}
                onCommit={onCommitHistory}
              />
              <SliderRow
                label="Độ mờ (Opacity)"
                min={10}
                max={100}
                value={textConfig.opacity}
                onChange={(v) => setTextConfig((t) => ({ ...t, opacity: v }))}
                onReset={() => setTextConfig((t) => ({ ...t, opacity: 85 }))}
                onCommit={onCommitHistory}
              />
              {!textConfig.repeatWatermark && (
                <>
                  <SliderRow
                    label="Vị trí ngang (X%)"
                    min={5}
                    max={95}
                    value={textConfig.x}
                    onChange={(v) => setTextConfig((t) => ({ ...t, x: v }))}
                    onReset={() => setTextConfig((t) => ({ ...t, x: 50 }))}
                    onCommit={onCommitHistory}
                  />
                  <SliderRow
                    label="Vị trí dọc (Y%)"
                    min={5}
                    max={95}
                    value={textConfig.y}
                    onChange={(v) => setTextConfig((t) => ({ ...t, y: v }))}
                    onReset={() => setTextConfig((t) => ({ ...t, y: 90 }))}
                    onCommit={onCommitHistory}
                  />
                </>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Màu chữ</span>
                <input
                  type="color"
                  value={textConfig.color}
                  onChange={(e) => setTextConfig((t) => ({ ...t, color: e.target.value }))}
                  onBlur={() => onCommitHistory()}
                  className="w-8 h-7 rounded bg-transparent border-0 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!textConfig.strokeEnabled}
                    onChange={(e) => {
                      const next = { ...textConfig, strokeEnabled: e.target.checked };
                      setTextConfig(next);
                      onCommitHistory({ textConfig: next });
                    }}
                    className="accent-amber-500"
                  />
                  <span>Viền chữ</span>
                </label>
                {textConfig.strokeEnabled && (
                  <input
                    type="color"
                    value={textConfig.strokeColor || '#000000'}
                    onChange={(e) => setTextConfig((t) => ({ ...t, strokeColor: e.target.value }))}
                    onBlur={() => onCommitHistory()}
                    className="w-8 h-7 rounded bg-transparent border-0 cursor-pointer"
                  />
                )}
              </div>
            </div>

            {/* Logo / Sticker PNG Watermark */}
            <div className="pt-4 border-t border-[#232836] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Logo / Sticker PNG
                </h3>
                {logoConfig?.img && (
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={logoConfig.enabled}
                      onChange={(e) => {
                        const next = { ...logoConfig, enabled: e.target.checked };
                        setLogoConfig(next);
                        onCommitHistory({ logoConfig: next });
                      }}
                      className="accent-amber-500"
                    />
                    <span>Hiện logo</span>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onUploadLogo}
                  className="flex-1 py-2 px-3 rounded-lg bg-[#202532] hover:bg-[#2a3142] border border-[#323a4f] text-xs font-medium text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4 text-amber-400" />
                  <span>{logoConfig?.img ? 'Đổi Logo PNG' : 'Tải Logo / Sticker'}</span>
                </button>
                {logoConfig?.img && (
                  <button
                    onClick={() => {
                      const next = { ...logoConfig, enabled: false, img: null, url: null, blob: null };
                      setLogoConfig(next);
                      onCommitHistory({ logoConfig: next });
                    }}
                    title="Gỡ Logo"
                    className="p-2 rounded-lg bg-[#202532] hover:bg-rose-500/20 border border-[#323a4f] text-slate-300 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {logoConfig?.enabled && logoConfig?.img && (
                <div className="space-y-2.5">
                  <SliderRow
                    label="Kích thước Logo"
                    min={5}
                    max={60}
                    unit="%"
                    value={logoConfig.scale}
                    onChange={(v) => setLogoConfig((l) => ({ ...l, scale: v }))}
                    onReset={() => setLogoConfig((l) => ({ ...l, scale: 18 }))}
                    onCommit={onCommitHistory}
                  />
                  <SliderRow
                    label="Độ mờ Logo"
                    min={10}
                    max={100}
                    value={logoConfig.opacity}
                    onChange={(v) => setLogoConfig((l) => ({ ...l, opacity: v }))}
                    onReset={() => setLogoConfig((l) => ({ ...l, opacity: 90 }))}
                    onCommit={onCommitHistory}
                  />
                  <SliderRow
                    label="Vị trí ngang (X%)"
                    min={5}
                    max={95}
                    value={logoConfig.x}
                    onChange={(v) => setLogoConfig((l) => ({ ...l, x: v }))}
                    onReset={() => setLogoConfig((l) => ({ ...l, x: 84 }))}
                    onCommit={onCommitHistory}
                  />
                  <SliderRow
                    label="Vị trí dọc (Y%)"
                    min={5}
                    max={95}
                    value={logoConfig.y}
                    onChange={(v) => setLogoConfig((l) => ({ ...l, y: v }))}
                    onReset={() => setLogoConfig((l) => ({ ...l, y: 84 }))}
                    onCommit={onCommitHistory}
                  />
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#232836] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Khung viền ảnh
                </h3>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={frameConfig.enabled}
                    onChange={(e) => {
                      const next = { ...frameConfig, enabled: e.target.checked };
                      setFrameConfig(next);
                      onCommitHistory({ frameConfig: next });
                    }}
                    className="accent-amber-500"
                  />
                  <span>Bật khung</span>
                </label>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'classic', label: 'Cơ bản' },
                  { id: 'polaroid', label: 'Polaroid' },
                  { id: 'rounded', label: 'Bo góc' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      const next = { ...frameConfig, style: s.id, enabled: true };
                      setFrameConfig(next);
                      onCommitHistory({ frameConfig: next });
                    }}
                    className={`py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                      (frameConfig.style || 'classic') === s.id && frameConfig.enabled
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                        : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <SliderRow
                label="Độ dày viền"
                min={4}
                max={80}
                value={frameConfig.width}
                onChange={(v) => setFrameConfig((f) => ({ ...f, width: v, enabled: true }))}
                onReset={() => setFrameConfig((f) => ({ ...f, width: 24 }))}
                onCommit={onCommitHistory}
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Màu khung</span>
                <input
                  type="color"
                  value={frameConfig.color}
                  onChange={(e) => setFrameConfig((f) => ({ ...f, color: e.target.value }))}
                  onBlur={() => onCommitHistory()}
                  className="w-8 h-7 rounded bg-transparent border-0 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
