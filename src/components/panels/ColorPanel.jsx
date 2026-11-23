import React, { useState } from 'react';
import { Wand2, Copy, ClipboardPaste, Plus, X } from 'lucide-react';
import { PRESETS, DEFAULT_ADJUSTMENTS, DEFAULT_HSL } from '../../engine/imagePipeline';
import { SliderRow, HistogramChart } from './controls';

const HSL_CHANNELS = [
  { key: 'red', label: 'Đỏ', color: '#ef4444' },
  { key: 'orange', label: 'Cam / Da', color: '#f97316' },
  { key: 'yellow', label: 'Vàng', color: '#eab308' },
  { key: 'green', label: 'Lục', color: '#22c55e' },
  { key: 'blue', label: 'Lam', color: '#38bdf8' },
  { key: 'purple', label: 'Tím', color: '#a855f7' },
];

export default function ColorPanel({
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
}) {
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [hslBand, setHslBand] = useState('red');
  const updateAdj = (key, val) => {
    onAdjustChange({ ...adjustments, [key]: val });
  };

  return (
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
  );
}
