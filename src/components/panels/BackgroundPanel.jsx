import React from 'react';
import { Eraser, Paintbrush, Scissors, ImagePlus, Loader2, Check } from 'lucide-react';
import { SliderRow } from './controls';

export default function BackgroundPanel({
  onCommitHistory,
  brushSize,
  setBrushSize,
  brushStrength,
  setBrushStrength,
  bgState,
  setBgState,
  hasCutoutMask,
  bgProcessing,
  bgProgress,
  bgMaskBrush,
  setBgMaskBrush,
  onRunAiBgRemoval,
  onUploadBgImage,
}) {
  return (
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
  );
}
