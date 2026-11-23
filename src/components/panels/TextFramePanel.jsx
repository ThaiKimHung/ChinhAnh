import React from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { DEFAULT_LOGO } from '../../engine/imagePipeline';
import { SliderRow } from './controls';

export default function TextFramePanel({
  onCommitHistory,
  textConfig,
  setTextConfig,
  frameConfig,
  setFrameConfig,
  logoConfig,
  setLogoConfig,
  onUploadLogo,
}) {
  return (
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
              onReset={() => setLogoConfig((l) => ({ ...l, x: DEFAULT_LOGO.x }))}
              onCommit={onCommitHistory}
            />
            <SliderRow
              label="Vị trí dọc (Y%)"
              min={5}
              max={95}
              value={logoConfig.y}
              onChange={(v) => setLogoConfig((l) => ({ ...l, y: v }))}
              onReset={() => setLogoConfig((l) => ({ ...l, y: DEFAULT_LOGO.y }))}
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
  );
}
