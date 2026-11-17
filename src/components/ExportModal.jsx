import React, { useState } from 'react';
import { X, Download, Check } from 'lucide-react';

export default function ExportModal({ isOpen, onClose, imageSize, onExport }) {
  const [format, setFormat] = useState('image/jpeg');
  const [quality, setQuality] = useState(92);
  const [scale, setScale] = useState(1);
  const [fileName, setFileName] = useState('LKMagic-Export');

  if (!isOpen) return null;

  const outW = Math.round((imageSize?.width || 0) * scale);
  const outH = Math.round((imageSize?.height || 0) * scale);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#181b24] border border-[#2c3344] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#262c3b] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100">Xuất ảnh chất lượng cao</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Kích thước đầu ra: {outW} × {outH} px
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#252b39] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Tên file
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#111319] border border-[#2c3344] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Định dạng
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'image/jpeg', label: 'JPG', desc: 'Nhẹ, phổ biến' },
                { id: 'image/png', label: 'PNG', desc: 'Trong suốt / Nét' },
                { id: 'image/webp', label: 'WebP', desc: 'Tối ưu web' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFormat(item.id)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    format === item.id
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-[#111319] border-[#2c3344] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    {item.label}
                    {format === item.id && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {format !== 'image/png' && (
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium">Chất lượng nén</span>
                <span className="text-amber-400 font-mono">{quality}%</span>
              </div>
              <input
                type="range"
                min={40}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="studio-slider"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Tỷ lệ kích thước
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: 1, label: '100% (Gốc)' },
                { v: 0.75, label: '75%' },
                { v: 0.5, label: '50%' },
              ].map((s) => (
                <button
                  key={s.v}
                  onClick={() => setScale(s.v)}
                  className={`py-2 rounded-lg border text-xs font-medium transition cursor-pointer ${
                    scale === s.v
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-[#111319] border-[#2c3344] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 bg-[#13161e] border-t border-[#262c3b] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#232836] hover:bg-[#2d3344] text-xs font-medium text-slate-300 cursor-pointer"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              onExport({ format, quality: quality / 100, scale, fileName });
              onClose();
            }}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-[#0f1116] text-xs font-bold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Tải ảnh về
          </button>
        </div>
      </div>
    </div>
  );
}
