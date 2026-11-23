import React from 'react';
import { RotateCw, RotateCcw, FlipHorizontal, FlipVertical } from 'lucide-react';
import { SliderRow } from './controls';

export default function CropPanel({
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
}) {
  return (
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
  );
}
