import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, Sparkles } from 'lucide-react';
import { MAX_ZOOM, MIN_ZOOM, startPinch, updatePinch } from '../engine/pinch';
import { normalizeRect } from '../engine/patch';
import { resetFrameScroll } from '../engine/canvasUtils';
import { cropPercentRatio, dragCropRect } from '../engine/cropDrag';
import { drawStage } from '../engine/stageDraw';
import { useResizeReport, useSpaceHeld } from '../hooks/useStageInput';

const CROP_HANDLES = [
  { id: 'nw', cls: '-left-2 -top-2 cursor-nwse-resize' },
  { id: 'n', cls: 'left-1/2 -translate-x-1/2 -top-1.5 cursor-ns-resize' },
  { id: 'ne', cls: '-right-2 -top-2 cursor-nesw-resize' },
  { id: 'e', cls: '-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { id: 'se', cls: '-right-2 -bottom-2 cursor-nwse-resize' },
  { id: 's', cls: 'left-1/2 -translate-x-1/2 -bottom-1.5 cursor-ns-resize' },
  { id: 'sw', cls: '-left-2 -bottom-2 cursor-nesw-resize' },
  { id: 'w', cls: '-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize' },
];

const INSPECTION_BACKGROUNDS = [
  { value: 'checkerboard', label: 'Caro', className: 'checkerboard-bg' },
  { value: 'white', label: 'Trắng', className: 'bg-white' },
  { value: 'black', label: 'Đen', className: 'bg-black' },
];

const INSPECTION_BUTTON = 'min-h-9 rounded-md px-2 text-xs font-medium hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-amber-400 aria-pressed:bg-amber-400 aria-pressed:text-[#0f1116]';

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
  inspectionBackground,
  onInspectionBackground,
  onInspectionZoom,
  onZoomFit,
  isBrushActive,
  brushSize,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
  eraseMaskCanvas,
  eraseMaskVersion,
  skinOverlayCanvas = null,
  faceMarks = null,
  cloneSource,
  pickingCloneSource,
  onPickCloneSource,
  cropActive,
  cropRect,
  setCropRect,
  cropAspect,
  straightenAngle = 0,
  canDragText = false,
  textPos = null,
  onDragText,
  onCommitText,
  onDropFiles,
  onOpenFile,
  onLoadSample,
  onViewportResize,
  patchActive = false,
  patchRect = null,
  patchOffset = { dx: 0, dy: 0 },
  patchFlip = false,
  onPatchChange,
}) {
  const stageRef = useRef(null);
  const viewCanvasRef = useRef(null);

  const [splitPos, setSplitPos] = useState(50);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cursorPos, setCursorPos] = useState(null);
  const [cropDrag, setCropDrag] = useState(null);
  const [draggingText, setDraggingText] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const lastImgPosRef = useRef(null);
  const touchesRef = useRef(new Map());
  const pinchRef = useRef(null);
  const patchDragRef = useRef(null);

  useResizeReport(stageRef, onViewportResize);

  const stopPanning = useCallback(() => setIsPanning(false), []);
  const spaceDown = useSpaceHeld(stopPanning);

  // The photo (or original / split view) plus the active tool's overlays.
  useEffect(() => {
    const canvas = viewCanvasRef.current;
    if (!canvas || !displayCanvas) return;
    drawStage(canvas, {
      display: displayCanvas,
      original: originalCanvas,
      compare: isComparingOriginal,
      splitAt: splitView ? splitPos : null,
      skinOverlay: skinOverlayCanvas,
      eraseMask: eraseMaskCanvas,
      patch: patchRect ? { rect: patchRect, offset: patchOffset, flip: patchFlip } : null,
      zoom,
    });
  }, [displayCanvas, originalCanvas, splitView, splitPos, isComparingOriginal, eraseMaskCanvas, eraseMaskVersion, skinOverlayCanvas, patchRect, patchOffset, patchFlip, zoom]);

  const clientToImageCoords = useCallback((clientX, clientY) => {
    const canvas = viewCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }, []);

  const handleWheel = (e) => {
    if (!hasImage) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((zoom * factor).toFixed(3))));
    if (nextZoom === zoom) return;

    const stageRect = stageRef.current?.getBoundingClientRect();
    if (stageRect) {
      const mx = e.clientX - (stageRect.left + stageRect.width / 2);
      const my = e.clientY - (stageRect.top + stageRect.height / 2);
      const ratio = nextZoom / zoom;
      setPan({
        x: mx - (mx - pan.x) * ratio,
        y: my - (my - pan.y) * ratio,
      });
    }
    setZoom(nextZoom);
  };

  const stagePoint = (e) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - (rect.left + rect.width / 2), y: e.clientY - (rect.top + rect.height / 2) };
  };

  // Two-finger touch: pinch to zoom, drag to pan. Any stroke started by the first
  // finger is finished so the gesture never paints.
  const trackTouch = (e) => {
    if (e.pointerType !== 'touch' || !hasImage) return false;
    const touches = touchesRef.current;
    touches.set(e.pointerId, stagePoint(e));
    if (touches.size !== 2 || pinchRef.current) return touches.size >= 2;
    if (isDrawing) {
      setIsDrawing(false);
      lastImgPosRef.current = null;
      onStrokeEnd?.();
    }
    setIsPanning(false);
    setCropDrag(null);
    setDraggingText(false);
    setCursorPos(null);
    const [a, b] = [...touches.values()];
    pinchRef.current = startPinch(a, b, zoom, pan);
    return true;
  };

  const releaseTouch = (e) => {
    if (e.pointerType !== 'touch') return false;
    touchesRef.current.delete(e.pointerId);
    if (!pinchRef.current) return false;
    if (touchesRef.current.size === 0) pinchRef.current = null;
    return true;
  };

  const handlePointerDown = (e) => {
    if (trackTouch(e)) return;
    if (!hasImage || !e.isPrimary) return;
    if ((e.altKey || pickingCloneSource) && onPickCloneSource && e.button === 0) {
      const pt = clientToImageCoords(e.clientX, e.clientY);
      if (pt) onPickCloneSource(pt.x, pt.y);
      return;
    }
    if (patchActive && e.button === 0 && !spaceDown && onPatchChange) {
      const pt = clientToImageCoords(e.clientX, e.clientY);
      if (!pt) return;
      const r = patchRect;
      const inside = r
        && pt.x >= r.x + patchOffset.dx && pt.x <= r.x + patchOffset.dx + r.w
        && pt.y >= r.y + patchOffset.dy && pt.y <= r.y + patchOffset.dy + r.h;
      patchDragRef.current = inside
        ? { type: 'move', start: pt, offset: patchOffset, rect: r }
        : { type: 'select', start: pt };
      if (!inside) onPatchChange(null);
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
    if (pinchRef.current && e.pointerType === 'touch') {
      touchesRef.current.set(e.pointerId, stagePoint(e));
      const points = [...touchesRef.current.values()];
      if (points.length >= 2) {
        const next = updatePinch(pinchRef.current, points[0], points[1]);
        setZoom(next.zoom);
        setPan(next.pan);
      }
      return;
    }
    if (!e.isPrimary) return;
    const patchDrag = patchDragRef.current;
    if (patchDrag && imageSize) {
      const pt = clientToImageCoords(e.clientX, e.clientY);
      if (!pt) return;
      if (patchDrag.type === 'select') {
        const rect = normalizeRect(
          { x: patchDrag.start.x, y: patchDrag.start.y, w: pt.x - patchDrag.start.x, h: pt.y - patchDrag.start.y },
          imageSize.width,
          imageSize.height,
        );
        onPatchChange(rect, { dx: 0, dy: 0 });
      } else {
        onPatchChange(patchDrag.rect, {
          dx: Math.round(patchDrag.offset.dx + pt.x - patchDrag.start.x),
          dy: Math.round(patchDrag.offset.dy + pt.y - patchDrag.start.y),
        });
      }
      return;
    }
    if (draggingSplit && viewCanvasRef.current) {
      const rect = viewCanvasRef.current.getBoundingClientRect();
      const pct = Math.min(98, Math.max(2, ((e.clientX - rect.left) / rect.width) * 100));
      setSplitPos(pct);
      return;
    }

    if (draggingText && viewCanvasRef.current && onDragText) {
      const rect = viewCanvasRef.current.getBoundingClientRect();
      const xp = Math.min(95, Math.max(5, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
      const yp = Math.min(95, Math.max(5, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
      onDragText(xp, yp);
      return;
    }

    if (cropDrag && viewCanvasRef.current && cropRect) {
      const rect = viewCanvasRef.current.getBoundingClientRect();
      const dxPct = ((e.clientX - cropDrag.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - cropDrag.startY) / rect.height) * 100;
      const ratio = cropDrag.type === 'move' ? null : cropPercentRatio(cropAspect, imageSize?.width, imageSize?.height);
      setCropRect(dragCropRect(cropDrag.origRect, cropDrag.type, dxPct, dyPct, ratio));
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

  const handlePointerUp = (e) => {
    if (releaseTouch(e)) return;
    if (!e.isPrimary) return;
    patchDragRef.current = null;
    setDraggingSplit(false);
    setCropDrag(null);
    setIsPanning(false);
    if (draggingText) {
      setDraggingText(false);
      onCommitText?.();
    }
    if (isDrawing) {
      setIsDrawing(false);
      lastImgPosRef.current = null;
      onStrokeEnd?.();
    }
  };

  const displayBrushPx = brushSize * 2 * zoom;
  const backgroundClass = INSPECTION_BACKGROUNDS.find(({ value }) => value === inspectionBackground)?.className ?? 'checkerboard-bg';

  return (
    <main
      ref={stageRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={(e) => {
        setCursorPos(null);
        handlePointerUp(e);
      }}
      onPointerLeave={(e) => {
        setCursorPos(null);
        handlePointerUp(e);
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
      onScroll={resetFrameScroll}
      className={`min-h-0 flex-1 relative frame-clip bg-[#0c0e13] flex items-center justify-center ${hasImage ? 'touch-none' : ''} ${
        spaceDown || isPanning || inspectionBackground
          ? 'cursor-grab active:cursor-grabbing'
          : pickingCloneSource || patchActive
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

      {hasImage && inspectionBackground && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-30 flex justify-center">
          <div
            role="group"
            aria-label="Soi viền và chi tiết ảnh"
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-lg border border-slate-600 bg-[#14171f]/95 p-1 text-slate-200 shadow-lg"
          >
            <button type="button" className={INSPECTION_BUTTON} onClick={onZoomFit}>Vừa khung</button>
            {[1, 2].map((level) => (
              <button
                key={level}
                type="button"
                className={INSPECTION_BUTTON}
                aria-pressed={zoom === level}
                onClick={() => onInspectionZoom(level)}
              >
                {level * 100}%
              </button>
            ))}
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-slate-600" />
            {INSPECTION_BACKGROUNDS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-label={`Nền soi ${label.toLocaleLowerCase('vi')}`}
                aria-pressed={inspectionBackground === value}
                className={INSPECTION_BUTTON}
                onClick={() => onInspectionBackground(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasImage ? (
        <div
          className={`relative z-10 max-w-md w-full mx-4 p-5 rounded-2xl border-2 border-dashed transition text-center md:p-8 ${
            dragOver
              ? 'border-amber-400 bg-amber-500/10'
              : 'border-[#2c3345] bg-[#141720]/90'
          }`}
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-4">
            <Upload className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">
            <span className="md:hidden">Mở ảnh để bắt đầu</span>
            <span className="hidden md:inline">Kéo thả ảnh vào đây</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Hỗ trợ JPG, PNG, WebP. Toàn bộ quá trình chỉnh màu, làm đẹp da, nắn bóp và tách nền AI xử lý ngay trên trình duyệt của bạn.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 md:mt-6 md:gap-3">
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
          className={`relative shrink-0 shadow-2xl overflow-hidden ${backgroundClass}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <canvas
            ref={viewCanvasRef}
            role="img"
            aria-label="Ảnh xem trước"
            style={{
              width: imageSize ? `${imageSize.width * zoom}px` : 'auto',
              height: imageSize ? `${imageSize.height * zoom}px` : 'auto',
              display: 'block',
              imageRendering: inspectionBackground && zoom > 1 && Number.isInteger(zoom) ? 'pixelated' : undefined,
              transform: straightenAngle !== 0 ? `rotate(${straightenAngle}deg) scale(${1 + Math.abs(straightenAngle) * 0.018})` : undefined,
              transition: straightenAngle !== 0 ? 'transform 0.05s linear' : undefined,
            }}
          />

          {/* People in the photo: numbered boxes; the number picks who face edits apply to. */}
          {faceMarks && !isComparingOriginal && faceMarks.faces.map((f, i) => {
            const picked = faceMarks.selected === i;
            return (
              <div
                key={i}
                className={`absolute pointer-events-none z-20 rounded-md border-2 ${picked ? 'border-amber-400' : 'border-dashed border-white/60'}`}
                style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
              >
                <button
                  type="button"
                  aria-pressed={picked}
                  aria-label={`Chọn Người ${i + 1}`}
                  title={picked ? 'Bỏ chọn, chỉnh tất cả' : `Chỉnh riêng Người ${i + 1}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => faceMarks.onSelect(picked ? null : i)}
                  className={`pointer-events-auto absolute -left-3 -top-3 grid h-6 min-w-6 cursor-pointer place-items-center rounded-full px-1 text-xs font-bold shadow ring-1 ring-black/40 focus-visible:outline-2 focus-visible:outline-amber-300 ${picked ? 'bg-amber-400 text-[#0f1116]' : 'bg-[#0f1116]/85 text-white hover:bg-[#1f2430]'}`}
                >
                  {i + 1}
                </button>
              </div>
            );
          })}

          {/* Straighten alignment grid */}
          {straightenAngle !== 0 && !isComparingOriginal && (
            <div className="absolute inset-0 pointer-events-none z-20 grid grid-cols-4 grid-rows-4">
              {Array.from({ length: 16 }).map((_, idx) => (
                <div key={idx} className="border border-amber-400/25" />
              ))}
            </div>
          )}

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

          {/* Direct Text Drag Handle */}
          {canDragText && textPos && !isComparingOriginal && (
            <div
              onPointerDown={(e) => {
                if (!e.isPrimary) return;
                e.stopPropagation();
                setDraggingText(true);
              }}
              style={{
                left: `${(displayCanvas?.textAnchor ?? textPos).x}%`,
                top: `${(displayCanvas?.textAnchor ?? textPos).y}%`,
              }}
              title="Kéo để di chuyển chữ trực tiếp"
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 px-2.5 py-1 rounded-full border border-dashed border-amber-400 bg-black/45 text-[10px] font-semibold text-amber-300 cursor-move hover:bg-amber-500/20 select-none"
            >
              ✛ Kéo chữ
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
                  if (!e.isPrimary) return;
                  e.stopPropagation();
                  setDraggingSplit(true);
                }}
                style={{ left: `${splitPos}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 cursor-ew-resize z-20 shadow-[0_0_8px_rgba(0,0,0,0.8)]"
              >
                <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-10 rounded-full bg-amber-400 text-[#0f1116] font-bold text-xs flex items-center justify-center shadow-lg md:size-7">
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

          {/* Interactive 8-Handle Crop Overlay */}
          {cropActive && cropRect && (
            <div className="absolute inset-0 z-20 pointer-events-none">
              <div
                onPointerDown={(e) => {
                  if (!e.isPrimary) return;
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

                {/* Live pixel dimensions badge */}
                {imageSize && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-mono text-amber-300 whitespace-nowrap pointer-events-none">
                    {Math.round((imageSize.width * cropRect.w) / 100)} × {Math.round((imageSize.height * cropRect.h) / 100)} px
                  </div>
                )}

                {CROP_HANDLES.map((h) => (
                  <div
                    key={h.id}
                    onPointerDown={(e) => {
                      if (!e.isPrimary) return;
                      e.stopPropagation();
                      setCropDrag({
                        type: h.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        origRect: cropRect,
                      });
                    }}
                    className={`absolute w-3.5 h-3.5 rounded-sm bg-amber-400 border border-[#0f1116] ${h.cls}`}
                  />
                ))}
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
