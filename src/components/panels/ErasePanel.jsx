import React from 'react';
import { Sparkles, Eraser, Loader2, Crosshair, Trash2 } from 'lucide-react';
import { SliderRow } from './controls';

export default function ErasePanel({
  brushSize,
  setBrushSize,
  brushStrength,
  setBrushStrength,
  eraseMode,
  setEraseMode,
  hasEraseMask,
  eraseProcessing,
  onApplyEraseMask,
  onClearEraseMask,
  cloneSource,
  pickingCloneSource,
  setPickingCloneSource,
  cloneToneMatch,
  setCloneToneMatch,
}) {
  return (
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

          <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={cloneToneMatch}
              onChange={(e) => setCloneToneMatch(e.target.checked)}
              className="mt-0.5 accent-amber-500"
            />
            <span>
              Hòa sáng tối theo vùng đích
              <span className="block text-[11px] text-slate-500">Tránh mảng vá sáng/tối hơn xung quanh. Tắt khi cần chép y nguyên.</span>
            </span>
          </label>

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
  );
}
