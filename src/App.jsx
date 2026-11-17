import React, { useState, useRef, useEffect, useCallback } from 'react';
import TopBar from './components/TopBar';
import LeftNav from './components/LeftNav';
import RightPanel from './components/RightPanel';
import CanvasStage from './components/CanvasStage';
import ExportModal from './components/ExportModal';
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_BEAUTY,
  DEFAULT_BG_STATE,
  DEFAULT_TEXT,
  DEFAULT_FRAME,
  processImagePipeline,
  applyLiquifyStroke,
  applySkinBrushStroke,
  compositeWithBackground,
  renderTextAndFrame,
  createSamplePortraitDataUrl,
} from './engine/imagePipeline';
import { inpaintMaskedRegion, applyCloneStampStroke } from './engine/inpaint';

const MAX_WORK_DIM = 1600;

function cloneImageData(imgData) {
  return new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height);
}

export default function App() {
  const fileInputRef = useRef(null);
  const bgFileInputRef = useRef(null);

  // Loaded images list (filmstrip)
  const [images, setImages] = useState([]);
  const [activeImageId, setActiveImageId] = useState(null);
  const [showFilmstrip, setShowFilmstrip] = useState(true);

  // Editor core buffers
  const origDataRef = useRef(null); // Original (or post-crop/rotate) ImageData
  const workDataRef = useRef(null); // Working ImageData (with Liquify + Skin Brush strokes)
  const origCanvasRef = useRef(null); // Canvas mirror of origDataRef for fast compare
  const cutoutAlphaRef = useRef(null); // Uint8ClampedArray alpha mask from AI BG removal
  const [hasCutoutMask, setHasCutoutMask] = useState(false);

  // Undo / Redo for pixel strokes & transforms
  const historyRef = useRef([]);
  const historyIdxRef = useRef(-1);
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });

  // Display canvas passed to CanvasStage
  const [displayCanvas, setDisplayCanvas] = useState(null);
  const [imageSize, setImageSize] = useState(null);
  const [renderTick, setRenderTick] = useState(0);

  // UI & Tool states
  const [activeTab, setActiveTab] = useState('color');
  const [zoom, setZoom] = useState(0.65);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [splitView, setSplitView] = useState(false);
  const [isComparingOriginal, setIsComparingOriginal] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Adjustments & Beauty
  const [activePreset, setActivePreset] = useState('original');
  const [adjustments, setAdjustments] = useState({ ...DEFAULT_ADJUSTMENTS });
  const [beauty, setBeauty] = useState({ ...DEFAULT_BEAUTY });

  // Brush & Liquify
  const [brushTool, setBrushTool] = useState('none'); // 'none' | 'smooth' | 'heal' | 'restore'
  const [liquifyMode, setLiquifyMode] = useState('push'); // 'push' | 'pinch' | 'bloat' | 'restore'
  const [brushSize, setBrushSize] = useState(44);
  const [brushStrength, setBrushStrength] = useState(60);

  // Object Removal (Magic Eraser + Clone Stamp)
  const [eraseMode, setEraseMode] = useState('magic'); // 'magic' | 'clone'
  const eraseMaskRef = useRef(null);
  const eraseMaskCanvasRef = useRef(null);
  const [eraseMaskVersion, setEraseMaskVersion] = useState(0);
  const [hasEraseMask, setHasEraseMask] = useState(false);
  const [eraseProcessing, setEraseProcessing] = useState(false);
  const [cloneSource, setCloneSource] = useState(null);
  const [pickingCloneSource, setPickingCloneSource] = useState(false);
  const cloneOffsetRef = useRef(null);

  // Background removal
  const [bgState, setBgState] = useState({ ...DEFAULT_BG_STATE });
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgProgress, setBgProgress] = useState('');

  // Crop
  const [cropActive, setCropActive] = useState(false);
  const [cropAspect, setCropAspect] = useState('free');
  const [cropRect, setCropRect] = useState({ x: 10, y: 10, w: 80, h: 80 });

  // Text & Frame
  const [textConfig, setTextConfig] = useState({ ...DEFAULT_TEXT });
  const [frameConfig, setFrameConfig] = useState({ ...DEFAULT_FRAME });

  const updateHistoryMeta = useCallback(() => {
    setHistoryMeta({
      canUndo: historyIdxRef.current > 0,
      canRedo: historyIdxRef.current < historyRef.current.length - 1,
    });
  }, []);

  const pushHistory = useCallback(
    (imgData) => {
      const next = historyRef.current.slice(0, historyIdxRef.current + 1);
      next.push(cloneImageData(imgData));
      if (next.length > 20) next.shift();
      historyRef.current = next;
      historyIdxRef.current = next.length - 1;
      updateHistoryMeta();
    },
    [updateHistoryMeta]
  );

  const fitZoomToScreen = useCallback((w, h) => {
    const availW = Math.max(300, window.innerWidth - 420);
    const availH = Math.max(300, window.innerHeight - 160);
    const fit = Math.min(availW / w, availH / h, 1);
    setZoom(Number(fit.toFixed(2)));
    setPan({ x: 0, y: 0 });
  }, []);

  const loadImageFromUrl = useCallback(
    (url, name = 'Photo') => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (Math.max(w, h) > MAX_WORK_DIM) {
          const scale = MAX_WORK_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);

        origDataRef.current = cloneImageData(imgData);
        workDataRef.current = cloneImageData(imgData);
        origCanvasRef.current = c;
        cutoutAlphaRef.current = null;
        setHasCutoutMask(false);

        const mc = document.createElement('canvas');
        mc.width = w;
        mc.height = h;
        eraseMaskCanvasRef.current = mc;
        eraseMaskRef.current = new Uint8Array(w * h);
        setHasEraseMask(false);
        setEraseMaskVersion((v) => v + 1);
        setCloneSource(null);
        setPickingCloneSource(false);

        historyRef.current = [cloneImageData(imgData)];
        historyIdxRef.current = 0;
        updateHistoryMeta();

        setImageSize({ width: w, height: h });
        setAdjustments({ ...DEFAULT_ADJUSTMENTS });
        setActivePreset('original');
        setBeauty({ ...DEFAULT_BEAUTY });
        setBgState({ ...DEFAULT_BG_STATE });
        setTextConfig({ ...DEFAULT_TEXT });
        setFrameConfig({ ...DEFAULT_FRAME });
        setCropActive(false);
        setCropRect({ x: 10, y: 10, w: 80, h: 80 });
        fitZoomToScreen(w, h);
        setRenderTick((t) => t + 1);
      };
      img.src = url;
    },
    [fitZoomToScreen, updateHistoryMeta]
  );

  const handleFilesSelected = useCallback(
    (fileList) => {
      const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      const newItems = files.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        url: URL.createObjectURL(f),
      }));
      setImages((prev) => [...prev, ...newItems]);
      setActiveImageId(newItems[0].id);
      loadImageFromUrl(newItems[0].url, newItems[0].name);
    },
    [loadImageFromUrl]
  );

  const handleLoadSample = useCallback(() => {
    const url = createSamplePortraitDataUrl();
    const item = { id: `sample-${Date.now()}`, name: 'Chân dung mẫu.jpg', url };
    setImages((prev) => [...prev, item]);
    setActiveImageId(item.id);
    loadImageFromUrl(url, item.name);
  }, [loadImageFromUrl]);

  // Re-render pipeline whenever adjustments, beauty, bgState, text, frame, or renderTick changes
  useEffect(() => {
    const workData = workDataRef.current;
    if (!workData) return;

    const processed = processImagePipeline(workData, adjustments, beauty);

    const fgCanvas = document.createElement('canvas');
    fgCanvas.width = processed.width;
    fgCanvas.height = processed.height;
    const fgCtx = fgCanvas.getContext('2d');

    if (
      cutoutAlphaRef.current &&
      bgState.mode !== 'original' &&
      cutoutAlphaRef.current.length === processed.width * processed.height
    ) {
      const alphaMask = cutoutAlphaRef.current;
      const d = processed.data;
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        d[i + 3] = Math.round((d[i + 3] * alphaMask[p]) / 255);
      }
    }

    fgCtx.putImageData(processed, 0, 0);

    let finalCanvas = fgCanvas;
    if (cutoutAlphaRef.current && bgState.mode !== 'original') {
      finalCanvas = compositeWithBackground(fgCanvas, origCanvasRef.current, bgState);
    }

    const outCtx = finalCanvas.getContext('2d');
    renderTextAndFrame(outCtx, finalCanvas.width, finalCanvas.height, textConfig, frameConfig);

    setDisplayCanvas(finalCanvas);
  }, [adjustments, beauty, bgState, textConfig, frameConfig, renderTick, hasCutoutMask]);

  // Undo / Redo handlers
  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    workDataRef.current = cloneImageData(historyRef.current[historyIdxRef.current]);
    updateHistoryMeta();
    setRenderTick((t) => t + 1);
  }, [updateHistoryMeta]);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    workDataRef.current = cloneImageData(historyRef.current[historyIdxRef.current]);
    updateHistoryMeta();
    setRenderTick((t) => t + 1);
  }, [updateHistoryMeta]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // Brush / Liquify / Erase strokes
  const isBrushActive =
    (activeTab === 'portrait' && brushTool !== 'none') ||
    activeTab === 'liquify' ||
    activeTab === 'erase';

  const paintEraseMaskSegment = useCallback(
    (x0, y0, x1, y1) => {
      const mask = eraseMaskRef.current;
      const mc = eraseMaskCanvasRef.current;
      if (!mask || !mc) return;
      const w = mc.width;
      const h = mc.height;
      const ctx = mc.getContext('2d');
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = brushSize * 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x1, y1, brushSize, 0, Math.PI * 2);
      ctx.fill();

      // Update Uint8Array mask along segment
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(2, brushSize * 0.35)));
      const r = brushSize;
      const r2 = r * r;
      for (let s = 0; s <= steps; s++) {
        const cx = x0 + ((x1 - x0) * s) / steps;
        const cy = y0 + ((y1 - y0) * s) / steps;
        const minX = Math.max(0, Math.floor(cx - r));
        const maxX = Math.min(w - 1, Math.ceil(cx + r));
        const minY = Math.max(0, Math.floor(cy - r));
        const maxY = Math.min(h - 1, Math.ceil(cy + r));
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) {
              mask[y * w + x] = 1;
            }
          }
        }
      }
      setHasEraseMask(true);
      setEraseMaskVersion((v) => v + 1);
    },
    [brushSize]
  );

  const handleClearEraseMask = useCallback(() => {
    if (eraseMaskRef.current) eraseMaskRef.current.fill(0);
    if (eraseMaskCanvasRef.current) {
      const mc = eraseMaskCanvasRef.current;
      mc.getContext('2d').clearRect(0, 0, mc.width, mc.height);
    }
    setHasEraseMask(false);
    setEraseMaskVersion((v) => v + 1);
  }, []);

  const handleApplyEraseMask = useCallback(() => {
    if (!workDataRef.current || !eraseMaskRef.current || eraseProcessing) return;
    setEraseProcessing(true);
    setTimeout(() => {
      try {
        const changed = inpaintMaskedRegion(workDataRef.current, eraseMaskRef.current);
        if (changed) {
          pushHistory(workDataRef.current);
          setRenderTick((t) => t + 1);
        }
        handleClearEraseMask();
      } finally {
        setEraseProcessing(false);
      }
    }, 20);
  }, [eraseProcessing, pushHistory, handleClearEraseMask]);

  const handleStrokeStart = useCallback(
    (x, y) => {
      if (!workDataRef.current) return;
      if (activeTab === 'portrait' && brushTool !== 'none') {
        applySkinBrushStroke(
          workDataRef.current,
          origDataRef.current,
          x,
          y,
          brushSize,
          brushStrength / 100,
          brushTool
        );
        setRenderTick((t) => t + 1);
      } else if (activeTab === 'liquify') {
        applyLiquifyStroke(
          workDataRef.current,
          origDataRef.current,
          x,
          y,
          x,
          y,
          brushSize,
          brushStrength / 100,
          liquifyMode
        );
        setRenderTick((t) => t + 1);
      } else if (activeTab === 'erase') {
        if (eraseMode === 'magic') {
          paintEraseMaskSegment(x, y, x, y);
        } else if (eraseMode === 'clone' && cloneSource) {
          cloneOffsetRef.current = { dx: cloneSource.x - x, dy: cloneSource.y - y };
          applyCloneStampStroke(
            workDataRef.current,
            x,
            y,
            cloneOffsetRef.current.dx,
            cloneOffsetRef.current.dy,
            brushSize,
            brushStrength / 100
          );
          setRenderTick((t) => t + 1);
        }
      }
    },
    [
      activeTab,
      brushTool,
      brushSize,
      brushStrength,
      liquifyMode,
      eraseMode,
      cloneSource,
      paintEraseMaskSegment,
    ]
  );

  const handleStrokeMove = useCallback(
    (x0, y0, x1, y1) => {
      if (!workDataRef.current) return;
      if (activeTab === 'portrait' && brushTool !== 'none') {
        applySkinBrushStroke(
          workDataRef.current,
          origDataRef.current,
          x1,
          y1,
          brushSize,
          brushStrength / 100,
          brushTool
        );
        setRenderTick((t) => t + 1);
      } else if (activeTab === 'liquify') {
        applyLiquifyStroke(
          workDataRef.current,
          origDataRef.current,
          x0,
          y0,
          x1,
          y1,
          brushSize,
          brushStrength / 100,
          liquifyMode
        );
        setRenderTick((t) => t + 1);
      } else if (activeTab === 'erase') {
        if (eraseMode === 'magic') {
          paintEraseMaskSegment(x0, y0, x1, y1);
        } else if (eraseMode === 'clone' && cloneOffsetRef.current) {
          applyCloneStampStroke(
            workDataRef.current,
            x1,
            y1,
            cloneOffsetRef.current.dx,
            cloneOffsetRef.current.dy,
            brushSize,
            brushStrength / 100
          );
          setRenderTick((t) => t + 1);
        }
      }
    },
    [activeTab, brushTool, brushSize, brushStrength, liquifyMode, eraseMode, paintEraseMaskSegment]
  );

  const handleStrokeEnd = useCallback(() => {
    if (activeTab === 'erase' && eraseMode === 'magic') {
      return; // Magic eraser pushes history when user clicks "Xóa vật thể đã tô"
    }
    if (workDataRef.current) {
      pushHistory(workDataRef.current);
    }
  }, [activeTab, eraseMode, pushHistory]);

  // AI Background Removal via @imgly/background-removal
  const handleRunAiBgRemoval = async () => {
    if (!origCanvasRef.current || bgProcessing) return;
    setBgProcessing(true);
    setBgProgress('Đang tải AI...');
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const blob = await new Promise((resolve) =>
        origCanvasRef.current.toBlob(resolve, 'image/png')
      );
      const resultBlob = await removeBackground(blob, {
        progress: (key, current, total) => {
          if (total > 0) {
            const pct = Math.min(100, Math.round((current / total) * 100));
            setBgProgress(`${pct}%`);
          }
        },
      });

      const resUrl = URL.createObjectURL(resultBlob);
      const img = new Image();
      img.onload = () => {
        const w = origCanvasRef.current.width;
        const h = origCanvasRef.current.height;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const maskData = ctx.getImageData(0, 0, w, h).data;
        const alpha = new Uint8ClampedArray(w * h);
        for (let i = 0, p = 0; i < maskData.length; i += 4, p++) {
          alpha[p] = maskData[i + 3];
        }
        cutoutAlphaRef.current = alpha;
        setHasCutoutMask(true);
        setBgState((s) => ({ ...s, mode: s.mode === 'original' ? 'transparent' : s.mode }));
        URL.revokeObjectURL(resUrl);
        setBgProcessing(false);
        setBgProgress('');
        setRenderTick((t) => t + 1);
      };
      img.src = resUrl;
    } catch (err) {
      console.error('AI BG Removal failed:', err);
      alert('Không thể chạy tách nền AI (vui lòng kiểm tra kết nối mạng lần đầu để tải model).');
      setBgProcessing(false);
      setBgProgress('');
    }
  };

  // Rotate & Flip
  const applyTransformCanvas = (transformFn) => {
    if (!workDataRef.current || !origDataRef.current) return;
    const transformOne = (imgData) => {
      const src = document.createElement('canvas');
      src.width = imgData.width;
      src.height = imgData.height;
      src.getContext('2d').putImageData(imgData, 0, 0);
      const dst = transformFn(src);
      return {
        canvas: dst,
        data: dst.getContext('2d').getImageData(0, 0, dst.width, dst.height),
      };
    };

    const nextOrig = transformOne(origDataRef.current);
    const nextWork = transformOne(workDataRef.current);
    origDataRef.current = nextOrig.data;
    origCanvasRef.current = nextOrig.canvas;
    workDataRef.current = nextWork.data;
    cutoutAlphaRef.current = null;
    setHasCutoutMask(false);
    setBgState((s) => ({ ...s, mode: 'original' }));

    const mc = document.createElement('canvas');
    mc.width = nextWork.data.width;
    mc.height = nextWork.data.height;
    eraseMaskCanvasRef.current = mc;
    eraseMaskRef.current = new Uint8Array(nextWork.data.width * nextWork.data.height);
    setHasEraseMask(false);
    setEraseMaskVersion((v) => v + 1);
    setCloneSource(null);
    setPickingCloneSource(false);

    setImageSize({ width: nextWork.data.width, height: nextWork.data.height });
    pushHistory(nextWork.data);
    fitZoomToScreen(nextWork.data.width, nextWork.data.height);
    setRenderTick((t) => t + 1);
  };

  const handleRotate = (deg) => {
    applyTransformCanvas((src) => {
      const dst = document.createElement('canvas');
      dst.width = src.height;
      dst.height = src.width;
      const ctx = dst.getContext('2d');
      ctx.translate(dst.width / 2, dst.height / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(src, -src.width / 2, -src.height / 2);
      return dst;
    });
  };

  const handleFlip = (dir) => {
    applyTransformCanvas((src) => {
      const dst = document.createElement('canvas');
      dst.width = src.width;
      dst.height = src.height;
      const ctx = dst.getContext('2d');
      ctx.translate(dir === 'h' ? dst.width : 0, dir === 'v' ? dst.height : 0);
      ctx.scale(dir === 'h' ? -1 : 1, dir === 'v' ? -1 : 1);
      ctx.drawImage(src, 0, 0);
      return dst;
    });
  };

  const handleApplyCrop = () => {
    if (!cropActive || !workDataRef.current) return;
    const { x, y, w, h } = cropRect;
    applyTransformCanvas((src) => {
      const sx = Math.round((src.width * x) / 100);
      const sy = Math.round((src.height * y) / 100);
      const sw = Math.max(20, Math.round((src.width * w) / 100));
      const sh = Math.max(20, Math.round((src.height * h) / 100));
      const dst = document.createElement('canvas');
      dst.width = sw;
      dst.height = sh;
      dst.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
      return dst;
    });
    setCropActive(false);
    setCropRect({ x: 10, y: 10, w: 80, h: 80 });
  };

  const handleResetAll = () => {
    if (!origDataRef.current) return;
    workDataRef.current = cloneImageData(origDataRef.current);
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
    setActivePreset('original');
    setBeauty({ ...DEFAULT_BEAUTY });
    setBgState({ ...DEFAULT_BG_STATE });
    setTextConfig({ ...DEFAULT_TEXT });
    setFrameConfig({ ...DEFAULT_FRAME });
    pushHistory(workDataRef.current);
    setRenderTick((t) => t + 1);
  };

  const handleExport = ({ format, quality, scale, fileName }) => {
    if (!displayCanvas) return;
    const w = Math.round(displayCanvas.width * scale);
    const h = Math.round(displayCanvas.height * scale);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(displayCanvas, 0, 0, w, h);
    const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
    const link = document.createElement('a');
    link.download = `${fileName || 'LKMagic-Export'}.${ext}`;
    link.href = out.toDataURL(format, quality);
    link.click();
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0f1116] text-slate-100 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            setBgState((s) => ({ ...s, mode: 'image', customBgUrl: url, customBgImg: img }));
          };
          img.src = url;
          e.target.value = '';
        }}
      />

      <TopBar
        hasImage={!!displayCanvas}
        onOpenFile={() => fileInputRef.current?.click()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyMeta.canUndo}
        canRedo={historyMeta.canRedo}
        splitView={splitView}
        onToggleSplit={() => setSplitView((v) => !v)}
        onCompareStart={() => setIsComparingOriginal(true)}
        onCompareEnd={() => setIsComparingOriginal(false)}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(4, Number((z + 0.15).toFixed(2))))}
        onZoomOut={() => setZoom((z) => Math.max(0.15, Number((z - 0.15).toFixed(2))))}
        onZoomFit={() => imageSize && fitZoomToScreen(imageSize.width, imageSize.height)}
        onResetAll={handleResetAll}
        onOpenExport={() => setExportOpen(true)}
        showFilmstrip={showFilmstrip}
        onToggleFilmstrip={() => setShowFilmstrip((s) => !s)}
        imageCount={images.length}
      />

      <div className="flex-1 flex min-h-0">
        <LeftNav activeTab={activeTab} onSelectTab={setActiveTab} />

        <div className="flex-1 flex flex-col min-w-0">
          <CanvasStage
            hasImage={!!displayCanvas}
            displayCanvas={displayCanvas}
            originalCanvas={origCanvasRef.current}
            imageSize={imageSize}
            zoom={zoom}
            setZoom={setZoom}
            pan={pan}
            setPan={setPan}
            splitView={splitView}
            isComparingOriginal={isComparingOriginal}
            isBrushActive={isBrushActive}
            brushSize={brushSize}
            onStrokeStart={handleStrokeStart}
            onStrokeMove={handleStrokeMove}
            onStrokeEnd={handleStrokeEnd}
            eraseMaskCanvas={activeTab === 'erase' && eraseMode === 'magic' ? eraseMaskCanvasRef.current : null}
            eraseMaskVersion={eraseMaskVersion}
            cloneSource={activeTab === 'erase' && eraseMode === 'clone' ? cloneSource : null}
            pickingCloneSource={activeTab === 'erase' && eraseMode === 'clone' && pickingCloneSource}
            onPickCloneSource={
              activeTab === 'erase' && eraseMode === 'clone'
                ? (x, y) => {
                    setCloneSource({ x, y });
                    setPickingCloneSource(false);
                  }
                : null
            }
            cropActive={cropActive && activeTab === 'crop'}
            cropRect={cropRect}
            setCropRect={setCropRect}
            cropAspect={cropAspect}
            onDropFiles={handleFilesSelected}
            onOpenFile={() => fileInputRef.current?.click()}
            onLoadSample={handleLoadSample}
          />

          {/* Bottom Filmstrip */}
          {showFilmstrip && images.length > 0 && (
            <div className="h-20 shrink-0 bg-[#13161e] border-t border-[#252a37] px-3 flex items-center gap-2 overflow-x-auto">
              {images.map((item) => {
                const active = item.id === activeImageId;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveImageId(item.id);
                      loadImageFromUrl(item.url, item.name);
                    }}
                    className={`relative h-14 w-14 shrink-0 rounded-lg overflow-hidden border-2 transition cursor-pointer ${
                      active ? 'border-amber-400 shadow-md shadow-amber-500/20' : 'border-[#2a303e] opacity-70 hover:opacity-100'
                    }`}
                    title={item.name}
                  >
                    <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                  </button>
                );
              })}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-14 w-14 shrink-0 rounded-lg border border-dashed border-[#343b4e] hover:border-amber-400 text-slate-400 hover:text-amber-400 flex items-center justify-center text-xl cursor-pointer transition"
                title="Thêm ảnh"
              >
                +
              </button>
            </div>
          )}
        </div>

        <RightPanel
          activeTab={activeTab}
          hasImage={!!displayCanvas}
          adjustments={adjustments}
          setAdjustments={setAdjustments}
          activePreset={activePreset}
          onSelectPreset={(id, vals) => {
            setActivePreset(id);
            setAdjustments({ ...vals });
          }}
          beauty={beauty}
          setBeauty={setBeauty}
          brushTool={brushTool}
          setBrushTool={setBrushTool}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          brushStrength={brushStrength}
          setBrushStrength={setBrushStrength}
          liquifyMode={liquifyMode}
          setLiquifyMode={setLiquifyMode}
          onResetLiquify={() => {
            if (!origDataRef.current) return;
            workDataRef.current = cloneImageData(origDataRef.current);
            pushHistory(workDataRef.current);
            setRenderTick((t) => t + 1);
          }}
          eraseMode={eraseMode}
          setEraseMode={setEraseMode}
          hasEraseMask={hasEraseMask}
          eraseProcessing={eraseProcessing}
          onApplyEraseMask={handleApplyEraseMask}
          onClearEraseMask={handleClearEraseMask}
          cloneSource={cloneSource}
          pickingCloneSource={pickingCloneSource}
          setPickingCloneSource={setPickingCloneSource}
          bgState={bgState}
          setBgState={setBgState}
          hasCutoutMask={hasCutoutMask}
          bgProcessing={bgProcessing}
          bgProgress={bgProgress}
          onRunAiBgRemoval={handleRunAiBgRemoval}
          onUploadBgImage={() => bgFileInputRef.current?.click()}
          onRotate={handleRotate}
          onFlip={handleFlip}
          cropAspect={cropAspect}
          setCropAspect={setCropAspect}
          cropActive={cropActive}
          setCropActive={setCropActive}
          onApplyCrop={handleApplyCrop}
          textConfig={textConfig}
          setTextConfig={setTextConfig}
          frameConfig={frameConfig}
          setFrameConfig={setFrameConfig}
        />
      </div>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        imageSize={imageSize}
        onExport={handleExport}
      />
    </div>
  );
}
