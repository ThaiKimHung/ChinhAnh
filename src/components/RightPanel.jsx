import React from 'react';
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
} from 'lucide-react';
import { PRESETS, DEFAULT_ADJUSTMENTS, DEFAULT_BEAUTY } from '../engine/imagePipeline';

function SliderRow({ label, value, min = -100, max = 100, onChange, onReset }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span
          onDoubleClick={onReset}
          title="Nhấp đúp để đặt lại 0"
          className="text-slate-300 cursor-pointer hover:text-amber-300 transition"
        >
          {label}
        </span>
        <span className="font-mono text-[11px] text-amber-400">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="studio-slider"
      />
    </div>
  );
}

export default function RightPanel({
  activeTab,
  hasImage,
  adjustments,
  setAdjustments,
  activePreset,
  onSelectPreset,
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
  onRunAiBgRemoval,
  onUploadBgImage,
  onRotate,
  onFlip,
  cropAspect,
  setCropAspect,
  cropActive,
  setCropActive,
  onApplyCrop,
  textConfig,
  setTextConfig,
  frameConfig,
  setFrameConfig,
}) {
  if (!hasImage) {
    return (
      <aside className="w-[300px] shrink-0 bg-[#14171f] border-l border-[#252a37] p-5 flex flex-col items-center justify-center text-center">
        <Sparkles className="w-8 h-8 text-amber-400/50 mb-3" />
        <div className="text-sm font-medium text-slate-300">Chưa có ảnh nào được mở</div>
        <p className="text-xs text-slate-500 mt-1">
          Hãy kéo thả ảnh vào giữa màn hình hoặc bấm &ldquo;Mở ảnh&rdquo; để bắt đầu chỉnh sửa.
        </p>
      </aside>
    );
  }

  return (
    <aside className="w-[310px] shrink-0 bg-[#14171f] border-l border-[#252a37] flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'color' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Preset màu Studio
                </h3>
                <button
                  onClick={() => {
                    onSelectPreset('original', DEFAULT_ADJUSTMENTS);
                  }}
                  className="text-[11px] text-slate-400 hover:text-amber-400 cursor-pointer"
                >
                  Đặt lại
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map((p) => {
                  const selected = activePreset === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelectPreset(p.id, p.values)}
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
                      <span className="truncate">{p.name}</span>
                    </button>
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
                onChange={(v) => setAdjustments((a) => ({ ...a, exposure: v }))}
                onReset={() => setAdjustments((a) => ({ ...a, exposure: 0 }))}
              />
              <SliderRow
                label="Tương phản (Contrast)"
                value={adjustments.contrast}
                onChange={(v) => setAdjustments((a) => ({ ...a, contrast: v }))}
                onReset={() => setAdjustments((a) => ({ ...a, contrast: 0 }))}
              />
              <SliderRow
                label="Vùng sáng (Highlights)"
                value={adjustments.highlights}
                onChange={(v) => setAdjustments((a) => ({ ...a, highlights: v }))}
                onReset={() => setAdjustments((a) => ({ ...a, highlights: 0 }))}
              />
              <SliderRow
                label="Vùng tối (Shadows)"
                value={adjustments.shadows}
                onChange={(v) => setAdjustments((a) => ({ ...a, shadows: v }))}
                onReset={() => setAdjustments((a) => ({ ...a, shadows: 0 }))}
              />
              <SliderRow
                label="Nhiệt độ màu (Temp)"
                value={adjustments.temperature}
                onChange={(v) => setAdjustments((a) => ({ ...a, temperature: v }))}
                onReset={() => setAdjustments((a) => ({ ...a, temperature: 0 }))}
              />
              <SliderRow
                label="Sắc thái (Tint)"
                value={adjustments.tint}
                onChange={(v) => setAdjustments((a) => ({ ...a, tint: v }))}
                onReset={() => setAdjustments((a) => ({ ...a, tint: 0 }))}
              />
              <SliderRow
                label="Độ bão hòa (Saturation)"
                value={adjustments.saturation}
                onChange={(v) => setAdjustments((a) => ({ ...a, saturation: v }))}
                onReset={() => setAdjustments((a) => ({ ...a, saturation: 0 }))}
              />
              <SliderRow
                label="Độ rực màu (Vibrance)"
                value={adjustments.vibrance}
                onChange={(v) => setAdjustments((a) => ({ ...a, vibrance: v }))}
                onReset={() => setAdjustments((a) => ({ ...a, vibrance: 0 }))}
              />
              <SliderRow
                label="Độ nét (Sharpen)"
                min={0}
                max={100}
                value={adjustments.sharpen}
                onChange={(v) => setAdjustments((a) => ({ ...a, sharpen: v }))}
                onReset={() => setAdjustments((a) => ({ ...a, sharpen: 0 }))}
              />
              <SliderRow
                label="Tối góc (Vignette)"
                min={0}
                max={100}
                value={adjustments.vignette}
                onChange={(v) => setAdjustments((a) => ({ ...a, vignette: v }))}
                onReset={() => setAdjustments((a) => ({ ...a, vignette: 0 }))}
              />
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
                  onClick={() => setBeauty({ ...DEFAULT_BEAUTY })}
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
              />
              <SliderRow
                label="Làm sáng da (Brighten)"
                min={0}
                max={100}
                value={beauty.skinBrighten}
                onChange={(v) => setBeauty((b) => ({ ...b, skinBrighten: v }))}
                onReset={() => setBeauty((b) => ({ ...b, skinBrighten: 0 }))}
              />
              <SliderRow
                label="Da hồng hào (Rosy)"
                min={0}
                max={100}
                value={beauty.skinRosy}
                onChange={(v) => setBeauty((b) => ({ ...b, skinRosy: v }))}
                onReset={() => setBeauty((b) => ({ ...b, skinRosy: 0 }))}
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
                label="Kích thước cọ"
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
                className="text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer"
              >
                Reset nét nắn
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
              label="Kích thước vùng nắn"
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
              label="Kích thước cọ"
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
                      onClick={() => setBgState((s) => ({ ...s, mode: m.id }))}
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

                {bgState.mode === 'bokeh' && (
                  <SliderRow
                    label="Độ mờ hậu cảnh (Bokeh)"
                    min={2}
                    max={40}
                    value={bgState.blurAmount}
                    onChange={(v) => setBgState((s) => ({ ...s, blurAmount: v }))}
                    onReset={() => setBgState((s) => ({ ...s, blurAmount: 14 }))}
                  />
                )}

                {bgState.mode === 'color' && (
                  <div className="space-y-2">
                    <div className="text-[11px] text-slate-400">Chọn màu nền (Ảnh thẻ / Studio)</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {['#ffffff', '#1d4ed8', '#38bdf8', '#dc2626', '#111827', '#e5e7eb'].map((c) => (
                        <button
                          key={c}
                          onClick={() => setBgState((s) => ({ ...s, color: c }))}
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

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'free', label: 'Tự do' },
                  { id: '1:1', label: '1 : 1' },
                  { id: '4:3', label: '4 : 3' },
                  { id: '3:2', label: '3 : 2' },
                  { id: '16:9', label: '16 : 9' },
                  { id: '9:16', label: '9 : 16' },
                ].map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setCropAspect(r.id);
                      setCropActive(true);
                    }}
                    className={`py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
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
                    onChange={(e) => setTextConfig((t) => ({ ...t, enabled: e.target.checked }))}
                    className="accent-amber-500"
                  />
                  <span>Hiện chữ</span>
                </label>
              </div>

              <input
                type="text"
                value={textConfig.content}
                onChange={(e) => setTextConfig((t) => ({ ...t, content: e.target.value, enabled: true }))}
                placeholder="Nhập nội dung chữ..."
                className="w-full px-3 py-2 rounded-lg bg-[#111319] border border-[#2c3344] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />

              <SliderRow
                label="Cỡ chữ"
                min={14}
                max={120}
                value={textConfig.fontSize}
                onChange={(v) => setTextConfig((t) => ({ ...t, fontSize: v }))}
                onReset={() => setTextConfig((t) => ({ ...t, fontSize: 42 }))}
              />
              <SliderRow
                label="Độ mờ (Opacity)"
                min={10}
                max={100}
                value={textConfig.opacity}
                onChange={(v) => setTextConfig((t) => ({ ...t, opacity: v }))}
                onReset={() => setTextConfig((t) => ({ ...t, opacity: 85 }))}
              />
              <SliderRow
                label="Vị trí ngang (X%)"
                min={5}
                max={95}
                value={textConfig.x}
                onChange={(v) => setTextConfig((t) => ({ ...t, x: v }))}
                onReset={() => setTextConfig((t) => ({ ...t, x: 50 }))}
              />
              <SliderRow
                label="Vị trí dọc (Y%)"
                min={5}
                max={95}
                value={textConfig.y}
                onChange={(v) => setTextConfig((t) => ({ ...t, y: v }))}
                onReset={() => setTextConfig((t) => ({ ...t, y: 90 }))}
              />

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Màu chữ</span>
                <input
                  type="color"
                  value={textConfig.color}
                  onChange={(e) => setTextConfig((t) => ({ ...t, color: e.target.value }))}
                  className="w-8 h-7 rounded bg-transparent border-0 cursor-pointer"
                />
              </div>
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
                    onChange={(e) => setFrameConfig((f) => ({ ...f, enabled: e.target.checked }))}
                    className="accent-amber-500"
                  />
                  <span>Bật khung</span>
                </label>
              </div>
              <SliderRow
                label="Độ dày viền"
                min={4}
                max={80}
                value={frameConfig.width}
                onChange={(v) => setFrameConfig((f) => ({ ...f, width: v, enabled: true }))}
                onReset={() => setFrameConfig((f) => ({ ...f, width: 24 }))}
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Màu khung</span>
                <input
                  type="color"
                  value={frameConfig.color}
                  onChange={(e) => setFrameConfig((f) => ({ ...f, color: e.target.value }))}
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
