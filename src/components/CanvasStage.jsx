import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, Sparkles } from 'lucide-react';

export default function CanvasStage({
  hasImage,
  displayCanvas,
  originalCanvas,
  imageSize,
  zoom,
  setZoom,
  pan,
  setPan,
  splitView,
  isComparingOriginal,
  isBrushActive,
  brushSize,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
  eraseMaskCanvas,
  eraseMaskVersion,
  cloneSource,
  pickingCloneSource,
  onPickCloneSource,
  cropActive,
  cropRect,
  setCropRect,
  cropAspect,
  onDropFiles,
  onOpenFile,
  onLoadSample,
}) {
  const stageRef = useRef(null);
  const viewCanvasRef = useRef(null);

  const [splitPos, setSplitPos] = useState(50);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cursorPos, setCursorPos] = useState(null);
  const [cropDrag, setCropDrag] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const lastImgPosRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        setSpaceDown(true);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        setSpaceDown(false);
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Draw displayCanvas (and optionally originalCanvas for split view / compare) onto viewCanvasRef
  useEffect(() => {
    const canvas = viewCanvasRef.current;
    if (!canvas || !displayCanvas) return;

    canvas.width = displayCanvas.width;
    canvas.height = displayCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isComparingOriginal && originalCanvas) {
      ctx.drawImage(originalCanvas, 0, 0);
      return;
    }

    if (splitView && originalCanvas) {
      const splitX = Math.round((canvas.width * splitPos) / 100);
      ctx.drawImage(displayCanvas, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, canvas.height);
      ctx.clip();
      ctx.drawImage(originalCanvas, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(displayCanvas, 0, 0);
    }

    if (eraseMaskCanvas && !isComparingOriginal) {
      ctx.save();
      ctx.globalAlpha = 0.52;
      ctx.drawImage(eraseMaskCanvas, 0, 0);
      ctx.restore();
    }
  }, [displayCanvas, originalCanvas, splitView, splitPos, isComparingOriginal, eraseMaskCanvas, eraseMaskVersion]);

  const clientToImageCoords = useCallback(
    (clientX, clientY) => {
      const canvas = viewCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * canvas.width;
      const y = ((clientY - rect.top) / rect.height) * canvas.height;
      return { x, y };
    },
    []
  );

  const handleWheel = (e) => {
    if (!hasImage) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.min(4, Math.max(0.15, Number((z * factor).toFixed(3)))));
  };

  const handlePointerDown = (e) => {
    if (!hasImage) return;
    if ((e.altKey || pickingCloneSource) && onPickCloneSource && e.button === 0) {
      const pt = clientToImageCoords(e.clientX, e.clientY);
      if (pt) onPickCloneSource(pt.x, pt.y);
      return;
    }
    if (e.button === 1 || spaceDown || (!isBrushActive && !cropActive && e.button === 0)) {
      setIsPanning(true);
      lastPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    if (isBrushActive && e.button === 0) {
      const pt = clientToImageCoords(e.clientX, e.clientY);
      if (!pt) return;
      setIsDrawing(true);
      lastImgPosRef.current = pt;
      onStrokeStart?.(pt.x, pt.y);
    }
  };

  const handlePointerMove = (e) => {
    if (draggingSplit && viewCanvasRef.current) {
      const rect = viewCanvasRef.current.getBoundingClientRect();
      const pct = Math.min(98, Math.max(2, ((e.clientX - rect.left) / rect.width) * 100));
      setSplitPos(pct);
      return;
    }

    if (cropDrag && viewCanvasRef.current && cropRect) {
      const rect = viewCanvasRef.current.getBoundingClientRect();
      const dxPct = ((e.clientX - cropDrag.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - cropDrag.startY) / rect.height) * 100;
      const orig = cropDrag.origRect;
      let { x, y, w, h } = orig;

      if (cropDrag.type === 'move') {
        x = Math.min(100 - w, Math.max(0, orig.x + dxPct));
        y = Math.min(100 - h, Math.max(0, orig.y + dyPct));
      } else if (cropDrag.type === 'se') {
        w = Math.min(100 - orig.x, Math.max(10, orig.w + dxPct));
        if (cropAspect !== 'free' && imageSize?.width && imageSize?.height) {
          const [aw, ah] = cropAspect.split(':').map(Number);
          const targetRatio = aw / ah;
          const imgRatio = imageSize.width / imageSize.height;
          h = Math.min(100 - orig.y, (w * imgRatio) / targetRatio);
        } else {
          h = Math.min(100 - orig.y, Math.max(10, orig.h + dyPct));
        }
      }
      setCropRect({ x, y, w, h });
      return;
    }

    if (isPanning) {
      setPan({
        x: e.clientX - lastPanRef.current.x,
        y: e.clientY - lastPanRef.current.y,
      });
      return;
    }

    if (isBrushActive) {
      const stageRect = stageRef.current?.getBoundingClientRect();
      if (stageRect) {
        setCursorPos({ x: e.clientX - stageRect.left, y: e.clientY - stageRect.top });
      }
      if (isDrawing) {
        const pt = clientToImageCoords(e.clientX, e.clientY);
        if (pt && lastImgPosRef.current) {
          onStrokeMove?.(lastImgPosRef.current.x, lastImgPosRef.current.y, pt.x, pt.y);
          lastImgPosRef.current = pt;
        }
      }
    }
  };

  const handlePointerUp = () => {
    setDraggingSplit(false);
    setCropDrag(null);
    setIsPanning(false);
    if (isDrawing) {
      setIsDrawing(false);
      lastImgPosRef.current = null;
      onStrokeEnd?.();
    }
  };

  const displayBrushPx = viewCanvasRef.current && imageSize?.width
    ? (brushSize * 2 * viewCanvasRef.current.getBoundingClientRect().width) / imageSize.width
    : brushSize * 2 * zoom;

  return (
    <main
      ref={stageRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        setCursorPos(null);
        handlePointerUp();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) {
          onDropFiles(e.dataTransfer.files);
        }
      }}
      className={`flex-1 relative overflow-hidden bg-[#0c0e13] flex items-center justify-center ${
        spaceDown || isPanning
          ? 'cursor-grab active:cursor-grabbing'
          : pickingCloneSource
          ? 'cursor-crosshair'
          : isBrushActive
          ? 'cursor-none'
          : 'cursor-default'
      }`}
    >
      {/* Subtle studio grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage: 'radial-gradient(#2c3345 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      {!hasImage ? (
        <div
          className={`relative z-10 max-w-md w-full mx-4 p-8 rounded-2xl border-2 border-dashed transition text-center ${
            dragOver
              ? 'border-amber-400 bg-amber-500/10'
              : 'border-[#2c3345] bg-[#141720]/90'
          }`}
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-4">
            <Upload className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Kéo thả ảnh vào đây</h2>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Hỗ trợ JPG, PNG, WebP. Toàn bộ quá trình chỉnh màu, làm đẹp da, nắn bóp và tách nền AI xử lý ngay trên trình duyệt của bạn.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={onOpenFile}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-[#0f1116] text-xs font-bold shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              Chọn ảnh từ máy
            </button>
            <button
              onClick={onLoadSample}
              className="px-4 py-2.5 rounded-xl bg-[#202532] hover:bg-[#2a3041] border border-[#32394c] text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Dùng ảnh mẫu
            </button>
          </div>
        </div>
      ) : (
        <div
          className="relative shadow-2xl checkerboard-bg"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <canvas
            ref={viewCanvasRef}
            style={{
              width: imageSize ? `${imageSize.width * zoom}px` : 'auto',
              height: imageSize ? `${imageSize.height * zoom}px` : 'auto',
              display: 'block',
            }}
          />

          {/* Clone Source Crosshair */}
          {cloneSource && imageSize && !isComparingOriginal && (
            <div
              className="absolute pointer-events-none z-20 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(cloneSource.x / imageSize.width) * 100}%`,
                top: `${(cloneSource.y / imageSize.height) * 100}%`,
              }}
            >
              <div className="w-5 h-5 rounded-full border-2 border-sky-400 shadow-[0_0_0_1px_rgba(0,0,0,0.8)] flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              </div>
            </div>
          )}

          {/* Compare Original badge */}
          {isComparingOriginal && (
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/75 text-amber-300 text-xs font-bold border border-amber-500/40 pointer-events-none">
              ẢNH GỐC
            </div>
          )}

          {/* Split View Divider */}
          {splitView && !isComparingOriginal && (
            <>
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingSplit(true);
                }}
                style={{ left: `${splitPos}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 cursor-ew-resize z-20 shadow-[0_0_8px_rgba(0,0,0,0.8)]"
              >
                <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-amber-400 text-[#0f1116] font-bold text-xs flex items-center justify-center shadow-lg">
                  ⇄
                </div>
              </div>
              <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/65 text-[11px] font-semibold text-slate-200 pointer-events-none">
                Trước
              </div>
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-black/65 text-[11px] font-semibold text-amber-300 pointer-events-none">
                Sau
              </div>
            </>
          )}

          {/* Interactive Crop Overlay */}
          {cropActive && cropRect && (
            <div className="absolute inset-0 z-20 pointer-events-none">
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setCropDrag({
                    type: 'move',
                    startX: e.clientX,
                    startY: e.clientY,
                    origRect: cropRect,
                  });
                }}
                style={{
                  left: `${cropRect.x}%`,
                  top: `${cropRect.y}%`,
                  width: `${cropRect.w}%`,
                  height: `${cropRect.h}%`,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.58)',
                }}
                className="absolute border-2 border-amber-400 cursor-move pointer-events-auto"
              >
                {/* Rule of thirds grid */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                  <div className="border-r border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-b border-white/25" />
                  <div className="border-r border-white/25" />
                  <div className="border-r border-white/25" />
                  <div />
                </div>
                {/* Resize Handle SE */}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setCropDrag({
                      type: 'se',
                      startX: e.clientX,
                      startY: e.clientY,
                      origRect: cropRect,
                    });
                  }}
                  className="absolute -right-2 -bottom-2 w-4 h-4 rounded-sm bg-amber-400 border border-[#0f1116] cursor-nwse-resize"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Brush Cursor Ring */}
      {hasImage && isBrushActive && cursorPos && !spaceDown && (
        <div
          className="absolute pointer-events-none rounded-full border-2 border-amber-400/90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)] z-30"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            width: Math.max(10, displayBrushPx),
            height: Math.max(10, displayBrushPx),
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </main>
  );
}
