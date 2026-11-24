import React, { useState } from 'react';
import { Wand2, Move, Maximize2, Minimize2, Undo, Eye, ScanFace } from 'lucide-react';
import { SliderRow } from './controls';
import FaceStatus from './FaceStatus';

export default function LiquifyPanel({
  brushSize,
  setBrushSize,
  brushStrength,
  setBrushStrength,
  liquifyMode,
  setLiquifyMode,
  onResetLiquify,
  hasCutoutMask,
  faceStatus,
  faceCount = 0,
  onFaceRetouch,
}) {
  const [faceAmount, setFaceAmount] = useState(50);
  const ready = faceStatus === 'found';
  return (
    <div className="space-y-4">
      <div className="space-y-2.5 rounded-xl border border-[#262c3b] bg-[#171a23] p-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Chỉnh khuôn mặt tự động</h3>
        <FaceStatus
          status={faceStatus}
          count={faceCount}
          foundText={(n) => (n > 1 ? `Đã nhận diện ${n} khuôn mặt — áp dụng cho tất cả.` : 'Đã nhận diện khuôn mặt.')}
        />
        <SliderRow label="Mức độ" min={10} max={100} unit="%" value={faceAmount} onChange={setFaceAmount} onReset={() => setFaceAmount(50)} />
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onFaceRetouch('eyes', faceAmount / 100)}
            disabled={!ready}
            className="py-2 px-2 rounded-lg border border-[#2f3647] bg-[#202532] hover:bg-[#2a3041] disabled:opacity-45 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            <span>Mắt to</span>
          </button>
          <button
            onClick={() => onFaceRetouch('slim', faceAmount / 100)}
            disabled={!ready}
            className="py-2 px-2 rounded-lg border border-[#2f3647] bg-[#202532] hover:bg-[#2a3041] disabled:opacity-45 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ScanFace className="w-3.5 h-3.5 text-amber-400" />
            <span>Mặt thon</span>
          </button>
        </div>
        <p className="text-[11px] text-slate-500">Mỗi lần bấm chỉnh thêm một chút. Hoàn tác bằng Ctrl+Z.</p>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Nắn bóp khuôn mặt &amp; dáng
        </h3>
        <button
          onClick={onResetLiquify}
          title={hasCutoutMask ? 'Khôi phục pixel ảnh gốc và bỏ mặt nạ tách nền' : 'Khôi phục pixel ảnh gốc'}
          className="text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer"
        >
          Khôi phục pixel toàn ảnh
        </button>
      </div>
      {hasCutoutMask && (
        <p className="text-[11px] text-slate-400">
          Khôi phục toàn ảnh sẽ bỏ mặt nạ tách nền. Bạn có thể hoàn tác.
        </p>
      )}

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
  );
}
