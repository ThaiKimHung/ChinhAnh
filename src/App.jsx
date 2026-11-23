import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import TopBar from './components/TopBar';
import LeftNav from './components/LeftNav';
import RightPanel from './components/RightPanel';
import CanvasStage from './components/CanvasStage';
import ExportModal from './components/ExportModal';
import samplePortraitUrl from './assets/studio-portrait-sample.jpg';
import { hydrateSession, loadDraft, saveDraft, serializeSession } from './engine/drafts';
import { createImageJobGuard } from './engine/imageJobs';
import { advanceBrushStroke, createBrushStroke, finishBrushStroke } from './engine/brushStroke';
import { inpaintInWorker } from './engine/inpaintJob';
import { applyCutoutMatte } from './engine/cutout';
import {
  buildOriginalSource,
  createZip,
  downloadBlob,
  encodeCanvas,
  extensionForFormat,
  getTransformedSize,
  isSupportedCanvasSize,
  sanitizeExportName,
  transformImageCanvas,
  uniqueExportName,
} from './engine/exportImage';
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_BEAUTY,
  DEFAULT_BG_STATE,
  DEFAULT_TEXT,
  DEFAULT_LOGO,
  DEFAULT_FRAME,
  processImagePipeline,
  applyLiquifyStroke,
  applySkinBrushStroke,
  applyAlphaMaskBrushStroke,
  computeAutoEnhance,
  computeHistogram,
  compositeWithBackground,
  renderTextAndFrame,
  generateIdPhotoSheetCanvas,
} from './engine/imagePipeline';
import { applyCloneStampStroke } from './engine/inpaint';

const CUSTOM_PRESETS_KEY = 'lkmagic_custom_presets_v1';
const DRAFT_HISTORY_LIMIT = 6;

function cloneImageData(imgData) {
  return new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height);
}

function imageDataToCanvas(imgData) {
  const c = document.createElement('canvas');
  c.width = imgData.width;
  c.height = imgData.height;
  c.getContext('2d', { willReadFrequently: true }).putImageData(imgData, 0, 0);
  return c;
}

function readImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
    image.src = url;
  });
}

function canvasToBlob(canvas, format) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Không thể tạo tệp ảnh.'));
    }, format);
  });
}

function imageSizeOf(image) {
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function workingSizeOf(size, maxDimension) {
  const limit = maxDimension || (isSupportedCanvasSize(size) ? 0 : 2400);
  const scale = limit ? Math.min(1, limit / Math.max(size.width, size.height)) : 1;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

function renderCompositeCanvas({
  workData,
  origCanvas,
  cutoutAlpha,
  adjustments,
  beauty,
  bgState,
  textConfig,
  frameConfig,
  logoConfig,
  resolutionScale = 1,
}) {
  const processed = processImagePipeline(workData, adjustments, beauty);
  const fgCanvas = document.createElement('canvas');
  fgCanvas.width = processed.width;
  fgCanvas.height = processed.height;
  const fgCtx = fgCanvas.getContext('2d');

  const useCutout =
    cutoutAlpha &&
    bgState.mode !== 'original' &&
    cutoutAlpha.length === processed.width * processed.height;

  if (useCutout) {
    applyCutoutMatte(processed, cutoutAlpha, {
      feather: bgState.feather ?? 0,
      resolutionScale,
      decontaminate: bgState.decontaminate !== false,
    });
  }

  fgCtx.putImageData(processed, 0, 0);

  let finalCanvas = fgCanvas;
  if (useCutout) {
    const backdropSrc = bgState.mode === 'bokeh' ? imageDataToCanvas(workData) : origCanvas;
    finalCanvas = compositeWithBackground(fgCanvas, backdropSrc, bgState, resolutionScale);
  }

  const outCtx = finalCanvas.getContext('2d');
  renderTextAndFrame(outCtx, finalCanvas.width, finalCanvas.height, textConfig, frameConfig, logoConfig);
  return finalCanvas;
}

function loadSavedPresets() {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const fileInputRef = useRef(null);
  const bgFileInputRef = useRef(null);
  const logoFileInputRef = useRef(null);

  // Loaded images list (filmstrip) & per-image sessions
  const [images, setImages] = useState([]);
  const [activeImageId, setActiveImageId] = useState(null);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [workMaxDim, setWorkMaxDim] = useState(1600);
  const sessionsRef = useRef({});
  const pendingStyleByIdRef = useRef({});
  const imageJobs = useRef(createImageJobGuard()).current;
  const loadedImageIdRef = useRef(null);
  const geometryRef = useRef([]);
  const [geometry, setGeometry] = useState([]);
  const [sourceSize, setSourceSize] = useState(null);
  const [imageLoadStatus, setImageLoadStatus] = useState('');
  const [draftStatus, setDraftStatus] = useState('loading');
  const draftReadyRef = useRef(false);
  const draftAvailableRef = useRef(true);
  const draftDirtyRef = useRef(false);
  const draftRevisionRef = useRef(null);
  const draftWritesRef = useRef(Promise.resolve());
  const draftWriteVersion = useRef(0);

  // Editor core buffers
  const origDataRef = useRef(null);
  const workDataRef = useRef(null);
  const origCanvasRef = useRef(null);
  const cutoutAlphaRef = useRef(null);
  const [originalCanvasState, setOriginalCanvasState] = useState(null);
  const [hasCutoutMask, setHasCutoutMask] = useState(false);

  // Undo / Redo history
  const historyRef = useRef([]);
  const historyIdxRef = useRef(-1);
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });

  // Display canvas & histogram passed to CanvasStage / RightPanel
  const [displayCanvas, setDisplayCanvas] = useState(null);
  const [histogram, setHistogram] = useState(null);
  const [imageSize, setImageSize] = useState(null);
  const [renderTick, setRenderTick] = useState(0);

  // UI & Tool states
  const [activeTab, setActiveTab] = useState('color');
  const [zoom, setZoom] = useState(0.65);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [splitView, setSplitView] = useState(false);
  const [isComparingOriginal, setIsComparingOriginal] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const viewportRef = useRef(null);
  const fitActiveRef = useRef(true);

  // Adjustments, Beauty & Presets
  const [activePreset, setActivePreset] = useState('original');
  const [adjustments, setAdjustments] = useState({ ...DEFAULT_ADJUSTMENTS });
  const [beauty, setBeauty] = useState({ ...DEFAULT_BEAUTY });
  const [customPresets, setCustomPresets] = useState(loadSavedPresets);
  const [copiedStyle, setCopiedStyle] = useState(null);

  // Brush & Liquify
  const [brushTool, setBrushTool] = useState('none');
  const [liquifyMode, setLiquifyMode] = useState('push');
  const [brushSize, setBrushSize] = useState(44);
  const [brushStrength, setBrushStrength] = useState(60);
  const brushStrokeRef = useRef(null);
  const brushEditedRef = useRef(false);

  // Object Removal (Magic Eraser + Clone Stamp)
  const [eraseMode, setEraseMode] = useState('magic');
  const eraseMaskRef = useRef(null);
  const eraseMaskCanvasRef = useRef(null);
  const [eraseMaskCanvasState, setEraseMaskCanvasState] = useState(null);
  const [eraseMaskVersion, setEraseMaskVersion] = useState(0);
  const [hasEraseMask, setHasEraseMask] = useState(false);
  const [eraseProcessing, setEraseProcessing] = useState(false);
  const eraseJobRef = useRef(null);
  const [cloneSource, setCloneSource] = useState(null);
  const [pickingCloneSource, setPickingCloneSource] = useState(false);
  const cloneOffsetRef = useRef(null);

  // Background removal & refinement brush
  const [bgState, setBgState] = useState({ ...DEFAULT_BG_STATE });
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgProgress, setBgProgress] = useState('');
  const bgJobRef = useRef(null);
  const [bgMaskBrush, setBgMaskBrush] = useState('none'); // 'none' | 'keep' | 'erase'

  // Crop & Straighten
  const [cropActive, setCropActive] = useState(false);
  const [cropAspect, setCropAspect] = useState('free');
  const [cropRect, setCropRect] = useState({ x: 10, y: 10, w: 80, h: 80 });
  const [straightenAngle, setStraightenAngle] = useState(0);

  // Text, Frame & Logo
  const [textConfig, setTextConfig] = useState({ ...DEFAULT_TEXT });
  const [frameConfig, setFrameConfig] = useState({ ...DEFAULT_FRAME });
  const [logoConfig, setLogoConfig] = useState({ ...DEFAULT_LOGO });
  const [editorNotice, setEditorNotice] = useState('');

  const markDraftDirty = useCallback(() => {
    draftDirtyRef.current = true;
    draftWriteVersion.current++;
  }, []);

  const cancelEraseJob = useCallback(() => {
    if (!eraseJobRef.current) return;
    const { controller } = eraseJobRef.current;
    eraseJobRef.current = null;
    controller.abort();
    setEraseProcessing(false);
  }, []);

  useEffect(() => () => eraseJobRef.current?.controller.abort(), []);

  const updateGeometry = useCallback((operations) => {
    geometryRef.current = operations;
    setGeometry(operations);
  }, []);

  // Latest params ref so async/event commits never read stale state
  const latestParamsRef = useRef({
    adjustments,
    activePreset,
    beauty,
    bgState,
    textConfig,
    frameConfig,
    logoConfig,
    imageSize,
    sourceSize,
  });
  useEffect(() => {
    latestParamsRef.current = {
      adjustments,
      activePreset,
      beauty,
      bgState,
      textConfig,
      frameConfig,
      logoConfig,
      imageSize,
      sourceSize,
    };
  }, [adjustments, activePreset, beauty, bgState, textConfig, frameConfig, logoConfig, imageSize, sourceSize]);

  const updateHistoryMeta = useCallback(() => {
    setHistoryMeta({
      canUndo: historyIdxRef.current > 0,
      canRedo: historyIdxRef.current < historyRef.current.length - 1,
    });
  }, []);

  const pushSnapshot = useCallback(
    (includePixels = false, paramOverrides = {}) => {
      if (!workDataRef.current) return;
      markDraftDirty();
      const p = latestParamsRef.current;
      const prevEntry = historyRef.current[historyIdxRef.current];

      const entry = {
        workData: includePixels || !prevEntry ? cloneImageData(workDataRef.current) : prevEntry.workData,
        origData: origDataRef.current,
        origCanvas: includePixels || !prevEntry ? origCanvasRef.current : prevEntry.origCanvas,
        cutoutAlpha:
          includePixels || !prevEntry
            ? cutoutAlphaRef.current
              ? new Uint8ClampedArray(cutoutAlphaRef.current)
              : null
            : prevEntry.cutoutAlpha,
        adjustments: { ...(paramOverrides.adjustments ?? p.adjustments) },
        activePreset: paramOverrides.activePreset ?? p.activePreset,
        beauty: { ...(paramOverrides.beauty ?? p.beauty) },
        bgState: { ...(paramOverrides.bgState ?? p.bgState) },
        textConfig: { ...(paramOverrides.textConfig ?? p.textConfig) },
        frameConfig: { ...(paramOverrides.frameConfig ?? p.frameConfig) },
        logoConfig: { ...(paramOverrides.logoConfig ?? p.logoConfig) },
        geometry: geometryRef.current,
      };

      const next = historyRef.current.slice(0, historyIdxRef.current + 1);
      next.push(entry);
      if (next.length > 25) next.shift();
      historyRef.current = next;
      historyIdxRef.current = next.length - 1;
      updateHistoryMeta();
    },
    [markDraftDirty, updateHistoryMeta]
  );

  const fitZoomToScreen = useCallback((w, h) => {
    fitActiveRef.current = true;
    const viewport = viewportRef.current;
    if (viewport?.width && viewport?.height) {
      const availW = Math.max(1, viewport.width - 32);
      const availH = Math.max(1, viewport.height - 32);
      setZoom(Math.min(availW / w, availH / h, 1));
    }
    setPan({ x: 0, y: 0 });
  }, []);

  const handleViewportResize = useCallback((viewport) => {
    viewportRef.current = viewport;
    const data = workDataRef.current;
    if (data && fitActiveRef.current) fitZoomToScreen(data.width, data.height);
  }, [fitZoomToScreen]);

  const changeZoom = useCallback((value) => {
    fitActiveRef.current = false;
    setZoom(value);
  }, []);

  const captureCurrentSession = useCallback(() => {
    if (!workDataRef.current) return null;
    const p = latestParamsRef.current;
    return {
      origData: origDataRef.current,
      workData: workDataRef.current,
      origCanvas: origCanvasRef.current,
      cutoutAlpha: cutoutAlphaRef.current,
      hasCutoutMask: !!cutoutAlphaRef.current,
      eraseMask: eraseMaskRef.current,
      eraseMaskCanvas: eraseMaskCanvasRef.current,
      hasEraseMask,
      cloneSource,
      imageSize: p.imageSize,
      sourceSize: p.sourceSize,
      adjustments: { ...p.adjustments },
      activePreset: p.activePreset,
      beauty: { ...p.beauty },
      bgState: { ...p.bgState },
      textConfig: { ...p.textConfig },
      frameConfig: { ...p.frameConfig },
      logoConfig: { ...p.logoConfig },
      history: historyRef.current,
      historyIdx: historyIdxRef.current,
      geometry: geometryRef.current,
    };
  }, [hasEraseMask, cloneSource]);

  const saveCurrentSession = useCallback((imgId) => {
    if (!imgId || loadedImageIdRef.current !== imgId) return;
    const session = captureCurrentSession();
    if (session) sessionsRef.current[imgId] = session;
  }, [captureCurrentSession]);

  const restoreSession = useCallback(
    (imgId) => {
      const s = sessionsRef.current[imgId];
      if (!s) return false;

      origDataRef.current = s.origData;
      workDataRef.current = cloneImageData(s.workData);
      origCanvasRef.current = s.origCanvas;
      updateGeometry(s.geometry || []);
      setOriginalCanvasState(s.origCanvas);
      cutoutAlphaRef.current = s.cutoutAlpha ? new Uint8ClampedArray(s.cutoutAlpha) : null;
      setHasCutoutMask(s.hasCutoutMask);

      eraseMaskRef.current = new Uint8Array(s.eraseMask);
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = s.workData.width;
      maskCanvas.height = s.workData.height;
      if (s.eraseMaskCanvas) maskCanvas.getContext('2d').drawImage(s.eraseMaskCanvas, 0, 0);
      eraseMaskCanvasRef.current = maskCanvas;
      setEraseMaskCanvasState(maskCanvas);
      setHasEraseMask(s.hasEraseMask);
      setEraseMaskVersion((v) => v + 1);
      setCloneSource(s.cloneSource);
      setPickingCloneSource(false);

      historyRef.current = s.history;
      historyIdxRef.current = s.historyIdx;
      updateHistoryMeta();

      const pending = pendingStyleByIdRef.current[imgId];
      if (pending) {
        delete pendingStyleByIdRef.current[imgId];
        setAdjustments({ ...pending.adjustments });
        setActivePreset(pending.activePreset);
        setBeauty({ ...pending.beauty });
      } else {
        setAdjustments(s.adjustments);
        setActivePreset(s.activePreset);
        setBeauty(s.beauty);
      }

      setBgState(s.bgState);
      setTextConfig(s.textConfig);
      setFrameConfig(s.frameConfig);
      setLogoConfig(s.logoConfig || { ...DEFAULT_LOGO });
      setBgMaskBrush('none');
      setImageSize(s.imageSize);
      setSourceSize(s.sourceSize ?? s.imageSize);
      setCropActive(false);
      setStraightenAngle(0);
      loadedImageIdRef.current = imgId;
      setImageLoadStatus('');
      if (s.imageSize) fitZoomToScreen(s.imageSize.width, s.imageSize.height);
      setRenderTick((t) => t + 1);
      return true;
    },
    [fitZoomToScreen, updateGeometry, updateHistoryMeta]
  );

  const loadImageFromUrl = useCallback(
    async (url, targetId, maxDimension = workMaxDim, persistOnLoad = true) => {
      const job = imageJobs.start();
      setImageLoadStatus('Đang mở ảnh…');
      try {
        const img = await readImage(url);
        if (!imageJobs.isCurrent(job)) return;
        const originalSize = imageSizeOf(img);
        if (!maxDimension && !isSupportedCanvasSize(originalSize)) {
          setEditorNotice('Ảnh gốc quá lớn cho canvas. Ảnh được mở ở chế độ chỉnh tối đa 2400 px.');
        }
        const { width: w, height: h } = workingSizeOf(originalSize, maxDimension);

        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);

        origDataRef.current = imgData;
        workDataRef.current = cloneImageData(imgData);
        origCanvasRef.current = c;
        updateGeometry([]);
        setOriginalCanvasState(c);
        cutoutAlphaRef.current = null;
        setHasCutoutMask(false);

        const mc = document.createElement('canvas');
        mc.width = w;
        mc.height = h;
        eraseMaskCanvasRef.current = mc;
        setEraseMaskCanvasState(mc);
        eraseMaskRef.current = new Uint8Array(w * h);
        setHasEraseMask(false);
        setEraseMaskVersion((v) => v + 1);
        setCloneSource(null);
        setPickingCloneSource(false);

        const pending = targetId ? pendingStyleByIdRef.current[targetId] : null;
        if (pending && targetId) delete pendingStyleByIdRef.current[targetId];

        const initAdj = pending ? { ...pending.adjustments } : { ...DEFAULT_ADJUSTMENTS };
        const initPreset = pending ? pending.activePreset : 'original';
        const initBeauty = pending ? { ...pending.beauty } : { ...DEFAULT_BEAUTY };
        const initBg = { ...DEFAULT_BG_STATE };
        const initText = { ...DEFAULT_TEXT };
        const initFrame = { ...DEFAULT_FRAME };
        const initLogo = { ...DEFAULT_LOGO };

        historyRef.current = [
          {
            workData: cloneImageData(imgData),
            origData: imgData,
            origCanvas: c,
            cutoutAlpha: null,
            adjustments: initAdj,
            activePreset: initPreset,
            beauty: initBeauty,
            bgState: initBg,
            textConfig: initText,
            frameConfig: initFrame,
            logoConfig: initLogo,
            geometry: [],
          },
        ];
        historyIdxRef.current = 0;
        updateHistoryMeta();

        setImageSize({ width: w, height: h });
        setSourceSize(originalSize);
        setAdjustments(initAdj);
        setActivePreset(initPreset);
        setBeauty(initBeauty);
        setBgState(initBg);
        setTextConfig(initText);
        setFrameConfig(initFrame);
        setLogoConfig(initLogo);
        setBgMaskBrush('none');
        setCropActive(false);
        setStraightenAngle(0);
        setCropRect({ x: 10, y: 10, w: 80, h: 80 });
        loadedImageIdRef.current = targetId;
        if (persistOnLoad) markDraftDirty();
        setImageLoadStatus('');
        fitZoomToScreen(w, h);
        setRenderTick((t) => t + 1);
      } catch {
        if (imageJobs.isCurrent(job)) {
          setImageLoadStatus('Không mở được ảnh này. Hãy chọn một ảnh JPG, PNG hoặc WebP khác.');
        }
      }
    },
    [fitZoomToScreen, imageJobs, markDraftDirty, updateGeometry, updateHistoryMeta, workMaxDim]
  );

  const showImage = useCallback((item, maxDimension, persistOnLoad) => {
    cancelEraseJob();
    imageJobs.select(item?.id ?? null);
    brushStrokeRef.current = null;
    brushEditedRef.current = false;
    loadedImageIdRef.current = null;
    setActiveImageId(item?.id ?? null);
    setEditorNotice('');
    setImageLoadStatus('');
    setBgProgress(bgJobRef.current ? 'Đang hoàn tất ảnh trước…' : '');
    setDisplayCanvas(null);
    setHistogram(null);
    if (item && restoreSession(item.id)) return;

    origDataRef.current = null;
    workDataRef.current = null;
    origCanvasRef.current = null;
    cutoutAlphaRef.current = null;
    eraseMaskRef.current = null;
    eraseMaskCanvasRef.current = null;
    updateGeometry([]);
    historyRef.current = [];
    historyIdxRef.current = -1;
    setOriginalCanvasState(null);
    setDisplayCanvas(null);
    setHistogram(null);
    setImageSize(null);
    setSourceSize(null);
    setHasCutoutMask(false);
    setHasEraseMask(false);
    updateHistoryMeta();
    if (item) void loadImageFromUrl(item.url, item.id, maxDimension, persistOnLoad);
  }, [cancelEraseJob, imageJobs, loadImageFromUrl, restoreSession, updateGeometry, updateHistoryMeta]);

  const handleSelectImage = useCallback(
    (item) => {
      if (!draftReadyRef.current || item.id === loadedImageIdRef.current) return;
      markDraftDirty();
      saveCurrentSession(imageJobs.activeId);
      showImage(item);
    },
    [imageJobs, markDraftDirty, saveCurrentSession, showImage]
  );

  const handleFilesSelected = useCallback(
    (fileList) => {
      const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
      if (!files.length || !draftReadyRef.current) return;
      markDraftDirty();
      saveCurrentSession(imageJobs.activeId);

      const newItems = files.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        url: URL.createObjectURL(f),
        isObjectUrl: true,
        blob: f,
      }));
      setImages((prev) => [...prev, ...newItems]);
      showImage(newItems[0]);
    },
    [imageJobs, markDraftDirty, saveCurrentSession, showImage]
  );

  const handleLoadSample = useCallback(() => {
    if (!draftReadyRef.current) return;
    markDraftDirty();
    saveCurrentSession(imageJobs.activeId);
    const item = {
      id: `sample-${Date.now()}`,
      name: 'Chân dung mẫu.jpg',
      url: samplePortraitUrl,
      isObjectUrl: false,
    };
    setImages((prev) => [...prev, item]);
    showImage(item);
  }, [imageJobs, markDraftDirty, saveCurrentSession, showImage]);

  const handleRemoveImage = useCallback(
    (e, item) => {
      e.stopPropagation();
      markDraftDirty();
      if (item.isObjectUrl) {
        URL.revokeObjectURL(item.url);
      }
      delete sessionsRef.current[item.id];
      delete pendingStyleByIdRef.current[item.id];

      const remaining = images.filter((x) => x.id !== item.id);
      setImages(remaining);

      if (item.id === imageJobs.activeId) showImage(remaining[0]);
    },
    [images, imageJobs, markDraftDirty, showImage]
  );

  useEffect(() => {
    if (draftReadyRef.current) return;
    let cancelled = false;

    async function restoreDraft() {
      try {
        const draft = await loadDraft();
        if (cancelled) return;
        draftRevisionRef.current = draft?.revision ?? null;
        if (!draft) {
          draftReadyRef.current = true;
          setDraftStatus('idle');
          return;
        }

        const sessions = await Promise.all(Object.entries(draft.sessions).map(async ([id, session]) => {
          return [id, await hydrateSession(session, readImage)];
        }));
        if (cancelled) return;
        const items = draft.images.map((item) => ({
          ...item,
          url: item.blob ? URL.createObjectURL(item.blob) : samplePortraitUrl,
          isObjectUrl: !!item.blob,
        }));
        sessionsRef.current = Object.fromEntries(sessions);
        pendingStyleByIdRef.current = draft.pendingStyles ?? {};
        draftReadyRef.current = true;
        setImages(items);
        setWorkMaxDim(draft.workMaxDim);
        showImage(items.find((item) => item.id === draft.activeImageId) ?? items[0], draft.workMaxDim, false);
        setDraftStatus(items.length ? 'restored' : 'idle');
      } catch {
        if (cancelled) return;
        draftAvailableRef.current = false;
        draftReadyRef.current = true;
        setDraftStatus('unavailable');
      }
    }

    void restoreDraft();
    return () => { cancelled = true; };
  }, [showImage]);

  useEffect(() => {
    if (!draftReadyRef.current || !draftAvailableRef.current || !draftDirtyRef.current) return;
    const version = draftWriteVersion.current;
    let queued = false;

    function persistDraft() {
      if (queued || draftWriteVersion.current !== version) return;
      queued = true;
      const activeSession = loadedImageIdRef.current === activeImageId ? captureCurrentSession() : null;
      const sessions = {};
      for (const item of images) {
        let session = item.id === activeImageId && activeSession ? activeSession : sessionsRef.current[item.id];
        if (!session) continue;
        if (session === activeSession) {
          session = {
            ...session,
            workData: cloneImageData(session.workData),
            eraseMask: new Uint8Array(session.eraseMask),
            cutoutAlpha: session.cutoutAlpha?.slice() ?? null,
          };
        }
        const start = Math.max(0, session.historyIdx - DRAFT_HISTORY_LIMIT + 2);
        sessions[item.id] = serializeSession({
          ...session,
          history: session.history.slice(start, start + DRAFT_HISTORY_LIMIT),
          historyIdx: session.historyIdx - start,
        });
      }

      const draft = {
        revision: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        images: images.map(({ id, name, blob }) => ({ id, name, blob })),
        activeImageId,
        workMaxDim,
        sessions,
        pendingStyles: { ...pendingStyleByIdRef.current },
      };
      draftWritesRef.current = draftWritesRef.current.then(async () => {
        if (!draftAvailableRef.current) return;
        await saveDraft(draft, draftRevisionRef.current);
        draftRevisionRef.current = draft.revision;
        if (draftWriteVersion.current !== version) return;
        draftDirtyRef.current = false;
        setDraftStatus(images.length ? 'saved' : 'idle');
      }).catch((error) => {
        if (error.code === 'DRAFT_CONFLICT') {
          draftAvailableRef.current = false;
          setDraftStatus('conflict');
        } else if (draftWriteVersion.current === version) {
          setDraftStatus('error');
        }
      });
    }

    setDraftStatus('saving');
    const timer = setTimeout(persistDraft, 350);
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') persistDraft();
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', persistDraft);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', persistDraft);
    };
  }, [
    activeImageId, activePreset, adjustments, beauty, bgState, captureCurrentSession,
    copiedStyle, eraseMaskVersion, frameConfig, historyMeta, images, logoConfig, renderTick, textConfig, workMaxDim,
  ]);

  // Re-render pipeline throttled with requestAnimationFrame
  useEffect(() => {
    const workData = workDataRef.current;
    if (!workData || loadedImageIdRef.current !== activeImageId) return;

    const rafId = requestAnimationFrame(() => {
      if (loadedImageIdRef.current !== activeImageId || workDataRef.current !== workData) return;
      const finalCanvas = renderCompositeCanvas({
        workData,
        origCanvas: origCanvasRef.current,
        cutoutAlpha: cutoutAlphaRef.current,
        adjustments,
        beauty,
        bgState,
        textConfig,
        frameConfig,
        logoConfig,
      });

      setDisplayCanvas(finalCanvas);
      setHistogram(computeHistogram(finalCanvas));
    });

    return () => cancelAnimationFrame(rafId);
  }, [activeImageId, adjustments, beauty, bgState, textConfig, frameConfig, logoConfig, renderTick, hasCutoutMask]);

  // Apply history entry helper
  const restoreHistoryEntry = useCallback(
    (entry) => {
      if (!entry) return;
      cancelEraseJob();
      markDraftDirty();
      workDataRef.current = cloneImageData(entry.workData);
      origDataRef.current = entry.origData;
      origCanvasRef.current = entry.origCanvas;
      setOriginalCanvasState(entry.origCanvas);
      cutoutAlphaRef.current = entry.cutoutAlpha ? new Uint8ClampedArray(entry.cutoutAlpha) : null;
      updateGeometry(entry.geometry || []);
      imageJobs.invalidate();
      setHasCutoutMask(!!entry.cutoutAlpha);

      const w = entry.workData.width;
      const h = entry.workData.height;
      const prevSize = latestParamsRef.current.imageSize;
      if (!prevSize || prevSize.width !== w || prevSize.height !== h) {
        const mc = document.createElement('canvas');
        mc.width = w;
        mc.height = h;
        eraseMaskCanvasRef.current = mc;
        setEraseMaskCanvasState(mc);
        eraseMaskRef.current = new Uint8Array(w * h);
        setHasEraseMask(false);
        setEraseMaskVersion((v) => v + 1);
        setImageSize({ width: w, height: h });
        fitZoomToScreen(w, h);
      }

      setAdjustments({ ...entry.adjustments });
      setActivePreset(entry.activePreset);
      setBeauty({ ...entry.beauty });
      setBgState({ ...entry.bgState });
      setTextConfig({ ...entry.textConfig });
      setFrameConfig({ ...entry.frameConfig });
      setLogoConfig(entry.logoConfig ? { ...entry.logoConfig } : { ...DEFAULT_LOGO });
      setRenderTick((t) => t + 1);
    },
    [cancelEraseJob, fitZoomToScreen, imageJobs, markDraftDirty, updateGeometry]
  );

  // Undo / Redo handlers
  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    restoreHistoryEntry(historyRef.current[historyIdxRef.current]);
    updateHistoryMeta();
  }, [restoreHistoryEntry, updateHistoryMeta]);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    restoreHistoryEntry(historyRef.current[historyIdxRef.current]);
    updateHistoryMeta();
  }, [restoreHistoryEntry, updateHistoryMeta]);

  // Global keyboard shortcuts & Clipboard paste (Ctrl+V)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target instanceof Element && e.target.closest('dialog[open]')) return;
      const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';

      if (!inInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (!inInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (workDataRef.current) setExportOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if (!inInput && e.key === '[') {
        setBrushSize((s) => Math.max(8, s - 6));
      } else if (!inInput && e.key === ']') {
        setBrushSize((s) => Math.min(180, s + 6));
      } else if (!inInput && e.key === '\\') {
        setIsComparingOriginal(true);
      }
    };
    const onKeyUp = (e) => {
      if (e.key === '\\') {
        setIsComparingOriginal(false);
      }
    };
    const onPaste = (e) => {
      if (e.target instanceof Element && e.target.closest('dialog[open]')) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) pastedFiles.push(f);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        handleFilesSelected(pastedFiles);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('paste', onPaste);
    };
  }, [handleUndo, handleRedo, handleFilesSelected]);

  // Brush / Liquify / Erase / Background Mask strokes
  const isBrushActive =
    (activeTab === 'portrait' && brushTool !== 'none') ||
    activeTab === 'liquify' ||
    activeTab === 'erase' ||
    (activeTab === 'background' && hasCutoutMask && bgState.mode !== 'original' && bgMaskBrush !== 'none');

  const paintEraseMaskSegment = useCallback(
    (x0, y0, x1, y1) => {
      const mask = eraseMaskRef.current;
      const mc = eraseMaskCanvasRef.current;
      if (!mask || !mc) return;
      markDraftDirty();
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
    [brushSize, markDraftDirty]
  );

  const handleClearEraseMask = useCallback(() => {
    markDraftDirty();
    if (eraseMaskRef.current) eraseMaskRef.current.fill(0);
    if (eraseMaskCanvasRef.current) {
      const mc = eraseMaskCanvasRef.current;
      mc.getContext('2d').clearRect(0, 0, mc.width, mc.height);
    }
    setHasEraseMask(false);
    setEraseMaskVersion((v) => v + 1);
  }, [markDraftDirty]);

  const handleApplyEraseMask = useCallback(async () => {
    const source = workDataRef.current;
    const mask = eraseMaskRef.current;
    if (!source || !mask || eraseJobRef.current) return;
    const job = { token: imageJobs.start(), controller: new AbortController() };
    eraseJobRef.current = job;
    setEraseProcessing(true);
    setEditorNotice('');
    try {
      const pixels = await inpaintInWorker(source, mask, job.controller.signal);
      if (eraseJobRef.current !== job || !imageJobs.isCurrent(job.token)) return;
      if (!pixels) {
        setEditorNotice('Chưa đủ vùng nền để lấp chỗ đã tô. Hãy chừa nền xung quanh và thử vùng nhỏ hơn.');
        return;
      }
      workDataRef.current = new ImageData(pixels, source.width, source.height);
      imageJobs.invalidate();
      pushSnapshot(true);
      handleClearEraseMask();
      setRenderTick((t) => t + 1);
    } catch {
      if (eraseJobRef.current === job && imageJobs.isCurrent(job.token) && !job.controller.signal.aborted) {
        setEditorNotice('Không thể xử lý vùng đã tô. Hãy thử với vùng nhỏ hơn.');
      }
    } finally {
      if (eraseJobRef.current === job) {
        eraseJobRef.current = null;
        setEraseProcessing(false);
      }
    }
  }, [handleClearEraseMask, imageJobs, pushSnapshot]);

  const applyBrushDab = useCallback((fromX, fromY, x, y) => {
    const workData = workDataRef.current;
    if (!workData) return false;
    const strength = brushStrength / 100;
    if (activeTab === 'portrait' && brushTool !== 'none') {
      applySkinBrushStroke(workData, origDataRef.current, x, y, brushSize, strength, brushTool);
    } else if (activeTab === 'liquify') {
      if (liquifyMode === 'push' && fromX === x && fromY === y) return false;
      applyLiquifyStroke(workData, origDataRef.current, fromX, fromY, x, y, brushSize, strength, liquifyMode);
    } else if (activeTab === 'erase' && eraseMode === 'clone' && cloneOffsetRef.current) {
      const { dx, dy } = cloneOffsetRef.current;
      applyCloneStampStroke(workData, x, y, dx, dy, brushSize, strength);
    } else if (activeTab === 'background' && bgMaskBrush !== 'none' && cutoutAlphaRef.current) {
      const { width, height } = workData;
      applyAlphaMaskBrushStroke(cutoutAlphaRef.current, width, height, x, y, brushSize, strength, bgMaskBrush);
    } else {
      return false;
    }
    return true;
  }, [activeTab, bgMaskBrush, brushSize, brushStrength, brushTool, eraseMode, liquifyMode]);

  const updateBrushPreview = useCallback(() => {
    brushEditedRef.current = true;
    imageJobs.invalidate();
    markDraftDirty();
    setRenderTick((t) => t + 1);
  }, [imageJobs, markDraftDirty]);

  const handleStrokeStart = useCallback((x, y) => {
    if (!workDataRef.current) return;
    cancelEraseJob();
    brushEditedRef.current = false;
    brushStrokeRef.current = createBrushStroke(x, y, brushSize);
    if (activeTab === 'erase' && eraseMode === 'magic') {
      paintEraseMaskSegment(x, y, x, y);
      return;
    }
    cloneOffsetRef.current = cloneSource ? { dx: cloneSource.x - x, dy: cloneSource.y - y } : null;
    if (applyBrushDab(x, y, x, y)) updateBrushPreview();
  }, [activeTab, applyBrushDab, brushSize, cancelEraseJob, cloneSource, eraseMode, paintEraseMaskSegment, updateBrushPreview]);

  const handleStrokeMove = useCallback((x0, y0, x1, y1) => {
    const stroke = brushStrokeRef.current;
    if (!stroke || !workDataRef.current) return;
    if (activeTab === 'erase' && eraseMode === 'magic') {
      paintEraseMaskSegment(x0, y0, x1, y1);
      return;
    }
    let applied = false;
    advanceBrushStroke(stroke, x1, y1, (...dab) => {
      applied = applyBrushDab(...dab) || applied;
    });
    if (applied) updateBrushPreview();
  }, [activeTab, applyBrushDab, eraseMode, paintEraseMaskSegment, updateBrushPreview]);

  const handleStrokeEnd = useCallback(() => {
    if (activeTab === 'liquify' && liquifyMode === 'push') {
      finishBrushStroke(brushStrokeRef.current, (...dab) => {
        if (applyBrushDab(...dab)) updateBrushPreview();
      });
    }
    brushStrokeRef.current = null;
    cloneOffsetRef.current = null;
    if (brushEditedRef.current && workDataRef.current) pushSnapshot(true);
    brushEditedRef.current = false;
  }, [activeTab, applyBrushDab, liquifyMode, pushSnapshot, updateBrushPreview]);

  // AI Background Removal via @imgly/background-removal (runs on current workData so liquify/erase stay aligned)
  const handleRunAiBgRemoval = async () => {
    if (!workDataRef.current || bgJobRef.current) return;
    const job = imageJobs.start();
    bgJobRef.current = job;
    setBgProcessing(true);
    setBgProgress('Đang tải AI...');
    setEditorNotice('');
    let resultUrl;
    try {
      const source = imageDataToCanvas(workDataRef.current);
      const blob = await canvasToBlob(source, 'image/png');
      const { removeBackground } = await import('@imgly/background-removal');
      if (!imageJobs.isCurrent(job)) return;
      const resultBlob = await removeBackground(blob, {
        progress: (_key, current, total) => {
          if (imageJobs.isCurrent(job) && total > 0) {
            const pct = Math.min(100, Math.round((current / total) * 100));
            setBgProgress(`${pct}%`);
          }
        },
      });

      if (!imageJobs.isCurrent(job)) return;
      resultUrl = URL.createObjectURL(resultBlob);
      const img = await readImage(resultUrl);
      if (!imageJobs.isCurrent(job)) return;
      const { width, height } = source;
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, width, height);
      const maskData = ctx.getImageData(0, 0, width, height).data;
      const alpha = new Uint8ClampedArray(width * height);
      for (let i = 0, p = 0; i < maskData.length; i += 4, p++) {
        alpha[p] = maskData[i + 3];
      }
      cutoutAlphaRef.current = alpha;
      setHasCutoutMask(true);
      const current = latestParamsRef.current.bgState;
      const nextBg = { ...current, mode: current.mode === 'original' ? 'transparent' : current.mode };
      setBgState(nextBg);
      pushSnapshot(true, { bgState: nextBg });
      setRenderTick((t) => t + 1);
    } catch (err) {
      if (imageJobs.isCurrent(job)) {
        console.error('AI BG Removal failed:', err);
        setEditorNotice('Không thể tách nền. Hãy kiểm tra kết nối mạng để tải mô hình AI rồi thử lại.');
      }
    } finally {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (bgJobRef.current === job) {
        bgJobRef.current = null;
        setBgProcessing(false);
        setBgProgress('');
      }
    }
  };

  // Rotate, Flip, Straighten & Crop
  const applyTransformCanvas = (operation) => {
    if (!workDataRef.current || !origDataRef.current) return;
    cancelEraseJob();
    const oldW = origDataRef.current.width;
    const oldH = origDataRef.current.height;
    const transformOne = (imgData) => {
      const src = imageDataToCanvas(imgData);
      const dst = transformImageCanvas(src, operation);
      return {
        canvas: dst,
        data: dst.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, dst.width, dst.height),
      };
    };

    const nextOrig = transformOne(origDataRef.current);
    const nextWork = transformOne(workDataRef.current);
    origDataRef.current = nextOrig.data;
    origCanvasRef.current = nextOrig.canvas;
    setOriginalCanvasState(nextOrig.canvas);
    workDataRef.current = nextWork.data;
    updateGeometry([...geometryRef.current, operation]);
    imageJobs.invalidate();

    // Transform cutoutAlpha mask alongside image if present
    if (cutoutAlphaRef.current && cutoutAlphaRef.current.length === oldW * oldH) {
      const mSrc = document.createElement('canvas');
      mSrc.width = oldW;
      mSrc.height = oldH;
      const mCtx = mSrc.getContext('2d');
      const mImg = mCtx.createImageData(oldW, oldH);
      const md = mImg.data;
      const alpha = cutoutAlphaRef.current;
      for (let p = 0, i = 0; p < alpha.length; p++, i += 4) {
        md[i] = 255;
        md[i + 1] = 255;
        md[i + 2] = 255;
        md[i + 3] = alpha[p];
      }
      mCtx.putImageData(mImg, 0, 0);
      const mDst = transformImageCanvas(mSrc, operation);
      const mOut = mDst.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mDst.width, mDst.height).data;
      const nextAlpha = new Uint8ClampedArray(mDst.width * mDst.height);
      for (let p = 0, i = 0; p < nextAlpha.length; p++, i += 4) {
        nextAlpha[p] = mOut[i + 3];
      }
      cutoutAlphaRef.current = nextAlpha;
    }

    const mc = document.createElement('canvas');
    mc.width = nextWork.data.width;
    mc.height = nextWork.data.height;
    eraseMaskCanvasRef.current = mc;
    setEraseMaskCanvasState(mc);
    eraseMaskRef.current = new Uint8Array(nextWork.data.width * nextWork.data.height);
    setHasEraseMask(false);
    setEraseMaskVersion((v) => v + 1);
    setCloneSource(null);
    setPickingCloneSource(false);

    setImageSize({ width: nextWork.data.width, height: nextWork.data.height });
    pushSnapshot(true);
    fitZoomToScreen(nextWork.data.width, nextWork.data.height);
    setRenderTick((t) => t + 1);
  };

  const handleRotate = (deg) => {
    applyTransformCanvas({ type: 'rotate', degrees: deg });
  };

  const handleFlip = (dir) => {
    applyTransformCanvas({ type: 'flip', direction: dir });
  };

  const handleApplyStraighten = () => {
    if (straightenAngle === 0) return;
    const angle = straightenAngle;
    setStraightenAngle(0);
    applyTransformCanvas({ type: 'straighten', angle });
  };

  const handleSelectCropAspect = (aspectId) => {
    setCropAspect(aspectId);
    setCropActive(true);
    if (aspectId === 'free' || !imageSize?.width || !imageSize?.height) {
      setCropRect({ x: 8, y: 8, w: 84, h: 84 });
      return;
    }
    const [aw, ah] = aspectId.split(':').map(Number);
    const targetRatio = aw / ah;
    const imgRatio = imageSize.width / imageSize.height;
    // hPct = wPct * (imgRatio / targetRatio)
    const pctRatio = imgRatio / targetRatio;
    let w = 84;
    let h = w * pctRatio;
    if (h > 88) {
      h = 88;
      w = h / pctRatio;
    }
    setCropRect({
      x: (100 - w) / 2,
      y: (100 - h) / 2,
      w,
      h,
    });
  };

  const handleApplyCrop = () => {
    if (!cropActive || !workDataRef.current) return;
    applyTransformCanvas({ type: 'crop', rect: cropRect });
    setCropActive(false);
    setCropRect({ x: 10, y: 10, w: 80, h: 80 });
  };

  const handleResetAll = () => {
    if (!origDataRef.current) return;
    cancelEraseJob();
    imageJobs.invalidate();
    workDataRef.current = cloneImageData(origDataRef.current);
    const nextAdj = { ...DEFAULT_ADJUSTMENTS };
    const nextBeauty = { ...DEFAULT_BEAUTY };
    const nextBg = { ...DEFAULT_BG_STATE };
    const nextText = { ...DEFAULT_TEXT };
    const nextFrame = { ...DEFAULT_FRAME };
    const nextLogo = { ...DEFAULT_LOGO };
    setAdjustments(nextAdj);
    setActivePreset('original');
    setBeauty(nextBeauty);
    setBgState(nextBg);
    setTextConfig(nextText);
    setFrameConfig(nextFrame);
    setLogoConfig(nextLogo);
    pushSnapshot(true, {
      adjustments: nextAdj,
      activePreset: 'original',
      beauty: nextBeauty,
      bgState: nextBg,
      textConfig: nextText,
      frameConfig: nextFrame,
      logoConfig: nextLogo,
    });
    setRenderTick((t) => t + 1);
  };

  // Auto Enhance, Custom Presets, Copy/Paste Style
  const handleAutoEnhance = () => {
    if (!workDataRef.current) return;
    const autoVals = computeAutoEnhance(workDataRef.current);
    setAdjustments(autoVals);
    setActivePreset('custom');
    pushSnapshot(false, { adjustments: autoVals, activePreset: 'custom' });
  };

  const handleSaveCustomPreset = (name) => {
    const newPreset = {
      id: `custom-${Date.now()}`,
      name,
      values: { ...adjustments },
    };
    const next = [...customPresets, newPreset];
    setCustomPresets(next);
    setActivePreset(newPreset.id);
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  };

  const handleDeleteCustomPreset = (id) => {
    const next = customPresets.filter((p) => p.id !== id);
    setCustomPresets(next);
    if (activePreset === id) setActivePreset('custom');
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  };

  const handleCopyStyle = () => {
    setCopiedStyle({
      adjustments: { ...adjustments },
      activePreset,
      beauty: { ...beauty },
    });
  };

  const handlePasteStyle = () => {
    if (!copiedStyle) return;
    const nextAdj = { ...copiedStyle.adjustments };
    const nextBeauty = { ...copiedStyle.beauty };
    setAdjustments(nextAdj);
    setActivePreset(copiedStyle.activePreset);
    setBeauty(nextBeauty);
    pushSnapshot(false, {
      adjustments: nextAdj,
      activePreset: copiedStyle.activePreset,
      beauty: nextBeauty,
    });
  };

  const handleApplyStyleAll = () => {
    markDraftDirty();
    const style = {
      adjustments: { ...adjustments },
      activePreset,
      beauty: { ...beauty },
    };
    setCopiedStyle(style);
    images.forEach((img) => {
      if (img.id === activeImageId) return;
      if (sessionsRef.current[img.id]) {
        sessionsRef.current[img.id] = {
          ...sessionsRef.current[img.id],
          adjustments: { ...style.adjustments },
          activePreset: style.activePreset,
          beauty: { ...style.beauty },
        };
      } else {
        pendingStyleByIdRef.current[img.id] = style;
      }
    });
  };

  const activeItem = images.find((item) => item.id === activeImageId);
  const defaultFileName = activeItem ? activeItem.name.replace(/\.[^/.]+$/, '') + '-edited' : 'LKMagic-Export';
  const fullResolutionSize = getTransformedSize(sourceSize, geometry);

  async function renderForExport(item, session, resolution, style) {
    if (session && resolution === 'working') return renderCompositeCanvas(session);

    const image = await readImage(item.url);
    const settings = session ?? {
      adjustments: style?.adjustments ?? DEFAULT_ADJUSTMENTS,
      beauty: style?.beauty ?? DEFAULT_BEAUTY,
      bgState: DEFAULT_BG_STATE,
      textConfig: DEFAULT_TEXT,
      frameConfig: DEFAULT_FRAME,
      logoConfig: DEFAULT_LOGO,
    };
    if (resolution === 'original') {
      const fullSize = getTransformedSize(imageSizeOf(image), session?.geometry);
      if (session && fullSize.width === session.workData.width && fullSize.height === session.workData.height) {
        return renderCompositeCanvas(session);
      }
      return renderCompositeCanvas({ ...settings, ...buildOriginalSource(image, session ?? {}) });
    }

    const { width, height } = workingSizeOf(imageSizeOf(image), workMaxDim);
    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = width;
    originalCanvas.height = height;
    const context = originalCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Trình duyệt không đủ bộ nhớ để mở ảnh.');
    context.drawImage(image, 0, 0, width, height);
    return renderCompositeCanvas({
      ...settings,
      workData: context.getImageData(0, 0, width, height),
      origCanvas: originalCanvas,
    });
  }

  async function activeExportCanvas(resolution, idSheetGrid) {
    if (!activeItem || loadedImageIdRef.current !== activeItem.id || !displayCanvas) {
      throw new Error('Hãy mở ảnh cần xuất trước.');
    }
    const source = resolution === 'original'
      ? await renderForExport(activeItem, captureCurrentSession(), resolution)
      : displayCanvas;
    if (!idSheetGrid) return source;
    const [cols, rows] = idSheetGrid.split('x').map(Number);
    return generateIdPhotoSheetCanvas(source, cols, rows);
  }

  const handleExport = async ({ format, quality, scale, fileName, idSheetGrid, resolution }) => {
    const canvas = await activeExportCanvas(resolution, idSheetGrid);
    const blob = await encodeCanvas(canvas, format, quality, idSheetGrid ? 1 : scale);
    const suffix = idSheetGrid ? '-IDSheet-' + idSheetGrid : '';
    const name = fileName?.trim().replace(/\.(?:jpe?g|png|webp)$/i, '');
    downloadBlob(blob, sanitizeExportName(name, defaultFileName) + suffix + '.' + extensionForFormat(format));
  };

  const handleExportBatch = async ({ format, quality, scale, fileName, resolution, onProgress }) => {
    saveCurrentSession(activeImageId);
    const selected = images.map((item) => ({
      item,
      session: sessionsRef.current[item.id],
      style: pendingStyleByIdRef.current[item.id],
    }));
    const entries = [];
    const failed = [];
    const usedNames = new Set();
    let firstError;
    for (const [index, { item, session, style }] of selected.entries()) {
      try {
        const canvas = await renderForExport(item, session, resolution, style);
        const blob = await encodeCanvas(canvas, format, quality, scale);
        const name = uniqueExportName(item.name.replace(/\.[^/.]+$/, '') + '-edited', format, usedNames);
        entries.push({ name, blob });
      } catch (error) {
        firstError ??= error;
        failed.push(item.name);
      }
      onProgress?.(index + 1, selected.length);
    }
    if (!entries.length) throw firstError ?? new Error('Không có ảnh để xuất.');
    return {
      failed,
      blob: await createZip(entries),
      name: sanitizeExportName(fileName?.trim().replace(/\.zip$/i, ''), 'LKMagic-Album') + '.zip',
    };
  };

  const handleCopyToClipboard = async (scale = 1, idSheetGrid = null, resolution = 'working') => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
    const imageBlob = activeExportCanvas(resolution, idSheetGrid)
      .then((canvas) => encodeCanvas(canvas, 'image/png', 1, idSheetGrid ? 1 : scale));
    try {
      await Promise.all([
        imageBlob,
        navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })]),
      ]);
      return true;
    } catch {
      await imageBlob.catch(() => {});
      return false;
    }
  };

  const loadOverlayImage = async (file, kind) => {
    if (!file || !workDataRef.current) return;
    const job = imageJobs.start();
    const url = URL.createObjectURL(file);
    try {
      const image = await readImage(url);
      if (!imageJobs.isCurrent(job)) return;
      if (kind === 'background') {
        const next = {
          ...latestParamsRef.current.bgState,
          mode: 'image',
          customBgUrl: null,
          customBgImg: image,
          customBgBlob: file,
        };
        setBgState(next);
        pushSnapshot(false, { bgState: next });
      } else {
        const next = {
          ...latestParamsRef.current.logoConfig,
          enabled: true,
          url: null,
          img: image,
          blob: file,
        };
        setLogoConfig(next);
        pushSnapshot(false, { logoConfig: next });
      }
    } catch {
      if (imageJobs.isCurrent(job)) setEditorNotice('Không đọc được ảnh đã chọn. Hãy thử một tệp khác.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const draftMessage = {
    saving: 'Đang lưu bản nháp…',
    saved: 'Đã lưu bản nháp trên thiết bị',
    restored: 'Đã khôi phục bản nháp',
    unavailable: 'Trình duyệt này hiện không thể lưu bản nháp',
    error: 'Chưa lưu được bản nháp. Bạn vẫn có thể xuất ảnh.',
    conflict: 'Bản nháp đã thay đổi ở tab khác. Hãy xuất ảnh trước khi tải lại trang.',
  }[draftStatus];

  return (
    <div className="relative h-dvh w-full flex flex-col bg-[#0f1116] text-slate-100 overflow-hidden">
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
          void loadOverlayImage(e.target.files?.[0], 'background');
          e.target.value = '';
        }}
      />
      <input
        ref={logoFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void loadOverlayImage(e.target.files?.[0], 'logo');
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
        onZoomIn={() => changeZoom((z) => Math.min(4, z * 1.25))}
        onZoomOut={() => changeZoom((z) => Math.max(Math.min(0.02, z), z / 1.25))}
        onZoomFit={() => imageSize && fitZoomToScreen(imageSize.width, imageSize.height)}
        onResetAll={handleResetAll}
        onOpenExport={() => setExportOpen(true)}
        showFilmstrip={showFilmstrip}
        onToggleFilmstrip={() => setShowFilmstrip((s) => !s)}
        imageCount={images.length}
        workMaxDim={workMaxDim}
        onChangeWorkMaxDim={(nextDimension) => {
          if (nextDimension === workMaxDim) return;
          markDraftDirty();
          setWorkMaxDim(nextDimension);
        }}
      />

      <div className="flex-1 flex min-h-0 flex-col md:flex-row">
        <LeftNav
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setMobilePanelOpen(true);
            if (tab !== 'crop') {
              setCropActive(false);
              setStraightenAngle(0);
            }
            if (tab !== 'background') {
              setBgMaskBrush('none');
            }
          }}
        />

        <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
          <CanvasStage
            hasImage={!!displayCanvas}
            displayCanvas={displayCanvas}
            originalCanvas={originalCanvasState}
            imageSize={imageSize}
            zoom={zoom}
            setZoom={changeZoom}
            onViewportResize={handleViewportResize}
            pan={pan}
            setPan={setPan}
            splitView={splitView}
            isComparingOriginal={isComparingOriginal}
            isBrushActive={isBrushActive}
            brushSize={brushSize}
            onStrokeStart={handleStrokeStart}
            onStrokeMove={handleStrokeMove}
            onStrokeEnd={handleStrokeEnd}
            eraseMaskCanvas={activeTab === 'erase' && eraseMode === 'magic' ? eraseMaskCanvasState : null}
            eraseMaskVersion={eraseMaskVersion}
            cloneSource={activeTab === 'erase' && eraseMode === 'clone' ? cloneSource : null}
            pickingCloneSource={activeTab === 'erase' && eraseMode === 'clone' && pickingCloneSource}
            onPickCloneSource={
              activeTab === 'erase' && eraseMode === 'clone'
                ? (x, y) => {
                    markDraftDirty();
                    setCloneSource({ x, y });
                    setPickingCloneSource(false);
                  }
                : null
            }
            cropActive={cropActive && activeTab === 'crop'}
            cropRect={cropRect}
            setCropRect={setCropRect}
            cropAspect={cropAspect}
            straightenAngle={activeTab === 'crop' ? straightenAngle : 0}
            canDragText={activeTab === 'text' && textConfig.enabled && !textConfig.repeatWatermark}
            textPos={{ x: textConfig.x, y: textConfig.y }}
            onDragText={(x, y) => {
              markDraftDirty();
              setTextConfig((t) => ({ ...t, x, y }));
            }}
            onCommitText={() => pushSnapshot(false)}
            onDropFiles={handleFilesSelected}
            onOpenFile={() => fileInputRef.current?.click()}
            onLoadSample={handleLoadSample}
          />

          {(imageLoadStatus || editorNotice) && (
            <div className="pointer-events-none absolute z-30 inset-x-3 top-3 flex justify-center">
              <p
                role={imageLoadStatus === 'Đang mở ảnh…' ? 'status' : 'alert'}
                className="max-w-md rounded-lg border border-amber-400/40 bg-[#1d2029] px-3 py-2 text-center text-sm text-amber-100 shadow-lg"
              >
                {imageLoadStatus || editorNotice}
              </p>
            </div>
          )}

          {/* Bottom Filmstrip */}
          {showFilmstrip && images.length > 0 && (
            <div className="h-16 md:h-20 shrink-0 bg-[#13161e] border-t border-[#252a37] px-3 flex items-center gap-2 overflow-x-auto">
              {images.map((item) => {
                const active = item.id === activeImageId;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectImage(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleSelectImage(item);
                    }}
                    className={`group relative h-14 w-14 shrink-0 rounded-lg overflow-hidden border-2 transition cursor-pointer ${
                      active ? 'border-amber-400 shadow-md shadow-amber-500/20' : 'border-[#2a303e] opacity-75 hover:opacity-100'
                    }`}
                    title={item.name}
                  >
                    <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => handleRemoveImage(e, item)}
                      title="Xóa ảnh khỏi danh sách"
                      className="opacity-100 md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/75 text-slate-200 hover:text-rose-400 flex items-center justify-center transition cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
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
          {draftMessage && (
            <p
              role="status"
              className={`shrink-0 border-t border-[#252a37] bg-[#13161e] px-3 py-1 text-[11px] ${['unavailable', 'error', 'conflict'].includes(draftStatus) ? 'text-amber-200' : 'text-slate-400'}`}
            >
              {draftMessage}
            </p>
          )}
        </div>

        <RightPanel
          activeTab={activeTab}
          mobilePanelOpen={mobilePanelOpen}
          onCloseMobilePanel={() => setMobilePanelOpen(false)}
          hasImage={!!displayCanvas}
          histogram={histogram}
          adjustments={adjustments}
          onAdjustChange={(nextAdj) => {
            markDraftDirty();
            setAdjustments(nextAdj);
            setActivePreset('custom');
          }}
          onCommitHistory={(overrides) => pushSnapshot(false, overrides)}
          activePreset={activePreset}
          onSelectPreset={(id, vals) => {
            const nextAdj = { ...vals };
            setActivePreset(id);
            setAdjustments(nextAdj);
            pushSnapshot(false, { adjustments: nextAdj, activePreset: id });
          }}
          onAutoEnhance={handleAutoEnhance}
          customPresets={customPresets}
          onSaveCustomPreset={handleSaveCustomPreset}
          onDeleteCustomPreset={handleDeleteCustomPreset}
          hasCopiedStyle={!!copiedStyle}
          onCopyStyle={handleCopyStyle}
          onPasteStyle={handlePasteStyle}
          onApplyStyleAll={handleApplyStyleAll}
          imageCount={images.length}
          beauty={beauty}
          setBeauty={(value) => {
            markDraftDirty();
            setBeauty(value);
          }}
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
            cancelEraseJob();
            imageJobs.invalidate();
            workDataRef.current = cloneImageData(origDataRef.current);
            pushSnapshot(true);
            setRenderTick((t) => t + 1);
          }}
          eraseMode={eraseMode}
          setEraseMode={setEraseMode}
          hasEraseMask={hasEraseMask}
          eraseProcessing={eraseProcessing}
          onApplyEraseMask={handleApplyEraseMask}
          onClearEraseMask={() => {
            cancelEraseJob();
            setEditorNotice('');
            handleClearEraseMask();
          }}
          cloneSource={cloneSource}
          pickingCloneSource={pickingCloneSource}
          setPickingCloneSource={setPickingCloneSource}
          bgState={bgState}
          setBgState={(value) => {
            markDraftDirty();
            setBgState(value);
          }}
          hasCutoutMask={hasCutoutMask}
          bgProcessing={bgProcessing}
          bgProgress={bgProgress}
          bgMaskBrush={bgMaskBrush}
          setBgMaskBrush={setBgMaskBrush}
          onRunAiBgRemoval={handleRunAiBgRemoval}
          onUploadBgImage={() => bgFileInputRef.current?.click()}
          onRotate={handleRotate}
          onFlip={handleFlip}
          straightenAngle={straightenAngle}
          setStraightenAngle={setStraightenAngle}
          onApplyStraighten={handleApplyStraighten}
          cropAspect={cropAspect}
          onSelectCropAspect={handleSelectCropAspect}
          cropActive={cropActive}
          setCropActive={setCropActive}
          onApplyCrop={handleApplyCrop}
          textConfig={textConfig}
          setTextConfig={(value) => {
            markDraftDirty();
            setTextConfig(value);
          }}
          frameConfig={frameConfig}
          setFrameConfig={(value) => {
            markDraftDirty();
            setFrameConfig(value);
          }}
          logoConfig={logoConfig}
          setLogoConfig={(value) => {
            markDraftDirty();
            setLogoConfig(value);
          }}
          onUploadLogo={() => logoFileInputRef.current?.click()}
        />
      </div>

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        imageSize={imageSize}
        originalSize={sourceSize}
        fullResolutionSize={fullResolutionSize}
        defaultFileName={defaultFileName}
        displayCanvas={displayCanvas}
        imageCount={images.length}
        onExport={handleExport}
        onExportBatch={handleExportBatch}
        onCopyToClipboard={handleCopyToClipboard}
      />
      {draftStatus === 'loading' && (
        <div role="status" className="absolute inset-0 z-50 grid place-items-center bg-[#0f1116] text-sm text-slate-200">
          Đang mở bản nháp…
        </div>
      )}
    </div>
  );
}
