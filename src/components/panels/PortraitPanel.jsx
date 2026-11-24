import React from 'react';
import { Sparkles, Eraser, Paintbrush, Plus, Minus } from 'lucide-react';
import { DEFAULT_BEAUTY } from '../../engine/imagePipeline';
import { SliderRow } from './controls';
import FaceStatus from './FaceStatus';

export default function PortraitPanel({
  onCommitHistory,
  beauty,
  setBeauty,
  brushTool,
  setBrushTool,
  onResetSkinRegion,
  faceStatus,
  faceCount = 0,
  brushSize,
  setBrushSize,
  brushStrength,
  setBrushStrength,
}) {
  return (
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

      <div className="pt-4 border-t border-[#232836] space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Vùng làm đẹp da</h3>
          <button
            onClick={onResetSkinRegion}
            className="text-[11px] text-slate-400 hover:text-amber-400 cursor-pointer"
            title="Bỏ các chỉnh tay, dùng lại vùng da tự nhận diện"
          >
            Tự động
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'skin-add', label: 'Thêm vùng da', icon: Plus },
            { id: 'skin-remove', label: 'Bớt vùng da', icon: Minus },
          ].map((tool) => {
            const Icon = tool.icon;
            const active = brushTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => setBrushTool(active ? 'none' : tool.id)}
                aria-pressed={active}
                className={`py-2 px-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  active
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                    : 'bg-[#1b1f29] border-[#262c3b] text-slate-300 hover:bg-[#222736]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>
        <FaceStatus
          status={faceStatus}
          count={faceCount}
          foundText={(n) => `Màu da lấy theo ${n > 1 ? `${n} khuôn mặt` : 'khuôn mặt'} đã nhận diện.`}
        />
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Vùng được làm mịn, làm sáng và hồng hào hiện màu cam khi bật cọ. Tô thêm chỗ da bị bỏ sót (ảnh cháy sáng,
          da trong bóng tối) hoặc bớt chỗ không phải da (tóc, áo, tường cùng màu).
        </p>
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
  );
}
