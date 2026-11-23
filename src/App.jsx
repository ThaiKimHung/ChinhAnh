import React, { useState, useRef, useEffect, useCallback } from 'react';
import TopBar from './components/TopBar';
import LeftNav from './components/LeftNav';
import RightPanel from './components/RightPanel';
import CanvasStage from './components/CanvasStage';
import ExportModal from './components/ExportModal';
import Filmstrip from './components/Filmstrip';
import samplePortraitUrl from './assets/studio-portrait-sample.jpg';
import { createImageJobGuard } from './engine/imageJobs';
import { advanceBrushStroke, createBrushStroke, finishBrushStroke } from './engine/brushStroke';
import { inpaintInWorker } from './engine/inpaintJob';
import { applyStyleToSession, HISTORY_MAX_ENTRIES } from './engine/history';
import {
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
  applySkinBrushStroke,
  applyAlphaMaskBrushStroke,
  computeAutoEnhance,
  computeHistogram,
} from './engine/imagePipeline';
import { applyCloneStampStroke, dilateMask } from './engine/inpaint';
import { pastePatch } from './engine/patch';
import { generateIdSheet, withPrintDpi } from './engine/idPhoto';
import { createLiquifySession, liquifyDab } from './engine/liquify';
import { IMAGE_FILE_ACCEPT, isHeicFile, isImageFile, toEditableImageFile } from './engine/imageFiles';
import {
  canvasToBlob,
  cloneImageData,
  createBlankCanvas,
  imageDataToCanvas,
  imageSizeOf,
  rasterize,
  readImage,
  transformAlphaMask,
  workingSizeOf,
} from './engine/canvasUtils';
import { renderCompositeCanvas, renderForExport } from './engine/renderComposite';
import { useEditorHistory } from './hooks/useEditorHistory';
import { useCustomPresets } from './hooks/useCustomPresets';
import { useEditorShortcuts } from './hooks/useEditorShortcuts';
import {
  DRAFT_MESSAGES,
  DRAFT_WARNING_STATES,
  useDraftAutosave,
  useDraftRestore,
  useDraftState,
} from './hooks/useDraftPersistence';

const NO_OFFSET = { dx: 0, dy: 0 };

function queuedStyles(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
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
  const draft = useDraftState();
  const { readyRef: draftReadyRef, markDirty: markDraftDirty } = draft;

  // Editor core buffers
  const origDataRef = useRef(null);
  const workDataRef = useRef(null);
  const origCanvasRef = useRef(null);
  const cutoutAlphaRef = useRef(null);
  const [originalCanvasState, setOriginalCanvasState] = useState(null);
  const [hasCutoutMask, setHasCutoutMask] = useState(false);

  // Undo / Redo history (memory-bounded)
  const history = useEditorHistory();

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
  const [inspectionBackground, setInspectionBackground] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const viewportRef = useRef(null);
  const fitActiveRef = useRef(true);

  // Adjustments, Beauty & Presets
  const [activePreset, setActivePreset] = useState('original');
  const [adjustments, setAdjustments] = useState({ ...DEFAULT_ADJUSTMENTS });
  const [beauty, setBeauty] = useState({ ...DEFAULT_BEAUTY });
  const { customPresets, addPreset, deletePreset } = useCustomPresets();
  const [copiedStyle, setCopiedStyle] = useState(null);

  // Brush & Liquify
  const [brushTool, setBrushTool] = useState('none');
  const [liquifyMode, setLiquifyMode] = useState('push');
  const [brushSize, setBrushSize] = useState(44);
  const [brushStrength, setBrushStrength] = useState(60);
  const brushStrokeRef = useRef(null);
  // Liquify keeps a displacement field over the pixels as they were when the
  // session began; any other pixel edit (or undo) starts a new session.
  const liquifySessionRef = useRef(null);
  // Same idea for the smoothing brush: it smooths toward the pixels as they
  // were when the session began, so scrubbing does not flatten skin endlessly.
  const smoothSessionRef = useRef(null);
  const pixelEditVersionRef = useRef(0);
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
  const [cloneToneMatch, setCloneToneMatch] = useState(true);

  // Cut & paste (patch) tool: a rectangle of the photo moved over another spot
  const [patchSelection, setPatchSelection] = useState(null); // { key, rect, offset, flip }
  const [patchFeather, setPatchFeather] = useState(16);
  const [patchToneMatch, setPatchToneMatch] = useState(true);

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

  /** Replaces the magic-eraser mask with an empty one of the given size. */
  const resetEraseMask = useCallback((width, height) => {
    const mc = createBlankCanvas(width, height);
    eraseMaskCanvasRef.current = mc;
    setEraseMaskCanvasState(mc);
    eraseMaskRef.current = new Uint8Array(width * height);
    setHasEraseMask(false);
    setEraseMaskVersion((v) => v + 1);
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

  const pushSnapshot = useCallback(
    (includePixels = false, paramOverrides = {}) => {
      if (!workDataRef.current) return;
      markDraftDirty();
      pixelEditVersionRef.current++;
      const p = latestParamsRef.current;
      const prevEntry = history.current();

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

      history.append(entry);
    },
    [history, markDraftDirty]
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

  const inspecting = inspectionBackground !== null;
  const handleZoomFit = () => imageSize && fitZoomToScreen(imageSize.width, imageSize.height);
  const handleInspectionZoom = (level) => {
    const ratio = level / zoom;
    setPan(({ x, y }) => ({ x: x * ratio, y: y * ratio }));
    changeZoom(level);
  };

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
      ...history.snapshot(),
      geometry: geometryRef.current,
    };
  }, [hasEraseMask, cloneSource, history]);

  const saveCurrentSession = useCallback((imgId) => {
    if (!imgId || loadedImageIdRef.current !== imgId) return;
    const session = captureCurrentSession();
    if (session) sessionsRef.current[imgId] = session;
  }, [captureCurrentSession]);

  const restoreSession = useCallback(
    (imgId) => {
      const saved = sessionsRef.current[imgId];
      if (!saved) return false;
      const pending = queuedStyles(pendingStyleByIdRef.current[imgId]);
      const s = pending.reduce(applyStyleToSession, saved);
      if (pending.length) {
        delete pendingStyleByIdRef.current[imgId];
        sessionsRef.current[imgId] = s;
      }

      origDataRef.current = s.origData;
      workDataRef.current = cloneImageData(s.workData);
      origCanvasRef.current = s.origCanvas;
      updateGeometry(s.geometry || []);
      setOriginalCanvasState(s.origCanvas);
      cutoutAlphaRef.current = s.cutoutAlpha ? new Uint8ClampedArray(s.cutoutAlpha) : null;
      setHasCutoutMask(s.hasCutoutMask);

      eraseMaskRef.current = new Uint8Array(s.eraseMask);
      const maskCanvas = createBlankCanvas(s.workData.width, s.workData.height);
      if (s.eraseMaskCanvas) maskCanvas.getContext('2d').drawImage(s.eraseMaskCanvas, 0, 0);
      eraseMaskCanvasRef.current = maskCanvas;
      setEraseMaskCanvasState(maskCanvas);
      setHasEraseMask(s.hasEraseMask);
      setEraseMaskVersion((v) => v + 1);
      setCloneSource(s.cloneSource);
      setPickingCloneSource(false);

      history.reset(s.history, s.historyIdx);

      setAdjustments(s.adjustments);
      setActivePreset(s.activePreset);
      setBeauty(s.beauty);

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
    [fitZoomToScreen, history, updateGeometry]
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

        const { canvas: c, data: imgData } = rasterize(img, w, h);

        origDataRef.current = imgData;
        workDataRef.current = cloneImageData(imgData);
        origCanvasRef.current = c;
        updateGeometry([]);
        setOriginalCanvasState(c);
        cutoutAlphaRef.current = null;
        setHasCutoutMask(false);

        resetEraseMask(w, h);
        setCloneSource(null);
        setPickingCloneSource(false);

        const pending = queuedStyles(pendingStyleByIdRef.current[targetId]);
        delete pendingStyleByIdRef.current[targetId];

        const initBg = { ...DEFAULT_BG_STATE };
        const initText = { ...DEFAULT_TEXT };
        const initFrame = { ...DEFAULT_FRAME };
        const initLogo = { ...DEFAULT_LOGO };

        const original = {
          workData: cloneImageData(imgData),
          origData: imgData,
          origCanvas: c,
          cutoutAlpha: null,
          adjustments: { ...DEFAULT_ADJUSTMENTS },
          activePreset: 'original',
          beauty: { ...DEFAULT_BEAUTY },
          bgState: initBg,
          textConfig: initText,
          frameConfig: initFrame,
          logoConfig: initLogo,
          geometry: [],
        };
        const styled = pending.reduce(applyStyleToSession, {
          ...original,
          history: [original],
          historyIdx: 0,
        });
        history.reset(styled.history, styled.historyIdx);

        setImageSize({ width: w, height: h });
        setSourceSize(originalSize);
        setAdjustments(styled.adjustments);
        setActivePreset(styled.activePreset);
        setBeauty(styled.beauty);
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
    [fitZoomToScreen, history, imageJobs, markDraftDirty, resetEraseMask, updateGeometry, workMaxDim]
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
    history.reset();
    setOriginalCanvasState(null);
    setDisplayCanvas(null);
    setHistogram(null);
    setImageSize(null);
    setSourceSize(null);
    setHasCutoutMask(false);
    setHasEraseMask(false);
    if (item) void loadImageFromUrl(item.url, item.id, maxDimension, persistOnLoad);
  }, [cancelEraseJob, history, imageJobs, loadImageFromUrl, restoreSession, updateGeometry]);

  const handleSelectImage = useCallback(
    (item) => {
      if (!draftReadyRef.current || item.id === loadedImageIdRef.current) return;
      markDraftDirty();
      saveCurrentSession(imageJobs.activeId);
      showImage(item);
    },
    [draftReadyRef, imageJobs, markDraftDirty, saveCurrentSession, showImage]
  );

  const handleFilesSelected = useCallback(
    async (fileList) => {
      const picked = Array.from(fileList).filter(isImageFile);
      if (!picked.length || !draftReadyRef.current) return;
      if (picked.some(isHeicFile)) setImageLoadStatus('Đang chuyển ảnh HEIC…');
      const results = await Promise.allSettled(picked.map((f) => toEditableImageFile(f)));
      const files = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (files.length < picked.length) {
        setEditorNotice('Không đọc được một số ảnh HEIC. Hãy xuất ảnh sang JPG trên điện thoại rồi thử lại.');
      }
      if (!files.length) {
        setImageLoadStatus('');
        return;
      }
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
    [draftReadyRef, imageJobs, markDraftDirty, saveCurrentSession, showImage]
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
  }, [draftReadyRef, imageJobs, markDraftDirty, saveCurrentSession, showImage]);

  const handleRemoveImage = useCallback(
    (item) => {
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

  useDraftRestore({
    draft,
    sessionsRef,
    pendingStyleByIdRef,
    setImages,
    setWorkMaxDim,
    showImage,
    sampleUrl: samplePortraitUrl,
  });

  // Files opened with the installed app ("Open with…" / file handlers).
  const launchFilesRef = useRef([]);
  useEffect(() => {
    if (!('launchQueue' in window)) return;
    window.launchQueue.setConsumer(async ({ files }) => {
      if (!files?.length) return;
      launchFilesRef.current.push(...(await Promise.all(files.map((handle) => handle.getFile()))));
      if (draftReadyRef.current) {
        const pending = launchFilesRef.current.splice(0);
        void handleFilesSelected(pending);
      }
    });
  }, [draftReadyRef, handleFilesSelected]);
  useEffect(() => {
    if (draft.status === 'loading' || !launchFilesRef.current.length) return;
    void handleFilesSelected(launchFilesRef.current.splice(0));
  }, [draft.status, handleFilesSelected]);

  useDraftAutosave({
    draft,
    images,
    activeImageId,
    workMaxDim,
    loadedImageIdRef,
    sessionsRef,
    pendingStyleByIdRef,
    captureCurrentSession,
    triggers: [
      activePreset, adjustments, beauty, bgState, copiedStyle, eraseMaskVersion,
      frameConfig, history.meta, logoConfig, renderTick, textConfig,
    ],
  });

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
        resetEraseMask(w, h);
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
    [cancelEraseJob, fitZoomToScreen, imageJobs, markDraftDirty, resetEraseMask, updateGeometry]
  );

  // Undo / Redo handlers
  const handleUndo = useCallback(() => restoreHistoryEntry(history.step(-1)), [history, restoreHistoryEntry]);
  const handleRedo = useCallback(() => restoreHistoryEntry(history.step(1)), [history, restoreHistoryEntry]);

  useEditorShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onExport: () => {
      if (workDataRef.current) setExportOpen(true);
    },
    onOpenFile: () => fileInputRef.current?.click(),
    onBrushSize: (delta) => setBrushSize((s) => Math.min(180, Math.max(8, s + delta))),
    onCompare: setIsComparingOriginal,
    onPasteFiles: handleFilesSelected,
  });

  // Brush / Liquify / Erase / Background Mask strokes
  const patchActive = activeTab === 'erase' && eraseMode === 'patch';
  // A selection only belongs to the photo, size and tool it was made with.
  const patchKey = patchActive && imageSize ? `${activeImageId}:${imageSize.width}x${imageSize.height}` : null;
  const livePatch = patchKey && patchSelection?.key === patchKey ? patchSelection : null;
  const patchRect = livePatch?.rect ?? null;
  const patchOffset = livePatch?.offset ?? NO_OFFSET;
  const patchFlip = livePatch?.flip ?? false;
  const isBrushActive =
    (activeTab === 'portrait' && brushTool !== 'none') ||
    activeTab === 'liquify' ||
    (activeTab === 'erase' && !patchActive) ||
    (activeTab === 'background' && hasCutoutMask && bgState.mode !== 'original' && bgMaskBrush !== 'none');

  const cancelPatch = useCallback(() => setPatchSelection(null), []);
  const setPatchFlip = (update) =>
    setPatchSelection((p) => (p ? { ...p, flip: typeof update === 'function' ? update(p.flip) : update } : p));

  const handleApplyPatch = useCallback(() => {
    const workData = workDataRef.current;
    if (!workData || !patchRect || (patchOffset.dx === 0 && patchOffset.dy === 0)) return;
    cancelEraseJob();
    const changed = pastePatch(workData, patchRect, patchOffset.dx, patchOffset.dy, {
      feather: patchFeather,
      toneMatch: patchToneMatch,
      flip: patchFlip,
    });
    cancelPatch();
    if (!changed) return;
    imageJobs.invalidate();
    pushSnapshot(true);
    setRenderTick((t) => t + 1);
  }, [cancelEraseJob, cancelPatch, imageJobs, patchFeather, patchFlip, patchOffset, patchRect, patchToneMatch, pushSnapshot]);

  useEffect(() => {
    if (inspecting || !patchActive || !patchRect) return;
    const onKey = (e) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, dialog[open]')) return;
      if (e.key === 'Enter') {
        if (e.target instanceof Element && e.target.closest('button')) return;
        e.preventDefault();
        handleApplyPatch();
      } else if (e.key === 'Escape') {
        cancelPatch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelPatch, handleApplyPatch, inspecting, patchActive, patchRect]);

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
      const grow = Math.max(1, Math.round(Math.min(source.width, source.height) / 700));
      const pixels = await inpaintInWorker(source, dilateMask(mask, source.width, source.height, grow), job.controller.signal);
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
      let base = null;
      if (brushTool === 'smooth') {
        let session = smoothSessionRef.current;
        if (!session || session.work !== workData || session.version !== pixelEditVersionRef.current) {
          session = { work: workData, version: pixelEditVersionRef.current, base: cloneImageData(workData) };
          smoothSessionRef.current = session;
        }
        base = session.base;
      }
      applySkinBrushStroke(workData, origDataRef.current, x, y, brushSize, strength, brushTool, base);
    } else if (activeTab === 'liquify') {
      if (liquifyMode === 'push' && fromX === x && fromY === y) return false;
      const matte = cutoutAlphaRef.current;
      let session = liquifySessionRef.current;
      if (
        !session || session.work !== workData || session.matte !== matte ||
        session.version !== pixelEditVersionRef.current
      ) {
        session = {
          work: workData,
          matte,
          version: pixelEditVersionRef.current,
          field: createLiquifySession(workData, matte),
        };
        liquifySessionRef.current = session;
      }
      liquifyDab(session.field, workData, fromX, fromY, x, y, brushSize, strength, liquifyMode, matte);
    } else if (activeTab === 'erase' && eraseMode === 'clone' && cloneOffsetRef.current) {
      const { dx, dy } = cloneOffsetRef.current;
      applyCloneStampStroke(workData, x, y, dx, dy, brushSize, strength, cloneToneMatch);
    } else if (activeTab === 'background' && bgMaskBrush !== 'none' && cutoutAlphaRef.current) {
      const { width, height } = workData;
      applyAlphaMaskBrushStroke(cutoutAlphaRef.current, width, height, x, y, brushSize, strength, bgMaskBrush, workData);
      liquifySessionRef.current = null;
    } else {
      return false;
    }
    return true;
  }, [activeTab, bgMaskBrush, brushSize, brushStrength, brushTool, cloneToneMatch, eraseMode, liquifyMode]);

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
    if (brushEditedRef.current && workDataRef.current) {
      pushSnapshot(true);
      // The liquify session stays valid across its own strokes.
      if (liquifySessionRef.current && activeTab === 'liquify') liquifySessionRef.current.version = pixelEditVersionRef.current;
      if (smoothSessionRef.current && activeTab === 'portrait' && brushTool === 'smooth') {
        smoothSessionRef.current.version = pixelEditVersionRef.current;
      }
    }
    brushEditedRef.current = false;
  }, [activeTab, applyBrushDab, brushTool, liquifyMode, pushSnapshot, updateBrushPreview]);

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
      const maskData = rasterize(img, width, height).data.data;
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
      cutoutAlphaRef.current = transformAlphaMask(cutoutAlphaRef.current, oldW, oldH, operation);
    }

    resetEraseMask(nextWork.data.width, nextWork.data.height);
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
    setActivePreset(addPreset(name, adjustments).id);
  };

  const handleDeleteCustomPreset = (id) => {
    deletePreset(id);
    if (activePreset === id) setActivePreset('custom');
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
      const session = sessionsRef.current[img.id];
      if (session) {
        sessionsRef.current[img.id] = applyStyleToSession(session, style);
      } else {
        const pending = queuedStyles(pendingStyleByIdRef.current[img.id]);
        pendingStyleByIdRef.current[img.id] = [...pending, style].slice(1 - HISTORY_MAX_ENTRIES);
      }
    });
  };

  const activeItem = images.find((item) => item.id === activeImageId);
  const defaultFileName = activeItem ? activeItem.name.replace(/\.[^/.]+$/, '') + '-edited' : 'LKMagic-Export';
  const fullResolutionSize = getTransformedSize(sourceSize, geometry);

  async function activeExportCanvas(resolution, idSheetGrid) {
    if (!activeItem || loadedImageIdRef.current !== activeItem.id || !displayCanvas) {
      throw new Error('Hãy mở ảnh cần xuất trước.');
    }
    const source = resolution === 'original'
      ? await renderForExport(activeItem, captureCurrentSession(), resolution, null, workMaxDim)
      : displayCanvas;
    if (!idSheetGrid) return source;
    return generateIdSheet(source, idSheetGrid);
  }

  const handleExport = async ({ format, quality, scale, fileName, idSheetGrid, resolution }) => {
    const canvas = await activeExportCanvas(resolution, idSheetGrid);
    const encoded = await encodeCanvas(canvas, format, quality, idSheetGrid ? 1 : scale);
    // Print sheets carry 300 dpi so they print at their real size.
    const blob = idSheetGrid ? await withPrintDpi(encoded) : encoded;
    const suffix = idSheetGrid ? '-AnhThe-' + idSheetGrid + 'cm' : '';
    const name = fileName?.trim().replace(/\.(?:jpe?g|png|webp)$/i, '');
    downloadBlob(blob, sanitizeExportName(name, defaultFileName) + suffix + '.' + extensionForFormat(format));
  };

  const handleExportBatch = async ({ format, quality, scale, fileName, resolution, onProgress }) => {
    saveCurrentSession(activeImageId);
    const selected = images.map((item) => ({
      item,
      session: sessionsRef.current[item.id],
      style: queuedStyles(pendingStyleByIdRef.current[item.id]).at(-1),
    }));
    const entries = [];
    const failed = [];
    const usedNames = new Set();
    let firstError;
    for (const [index, { item, session, style }] of selected.entries()) {
      try {
        const canvas = await renderForExport(item, session, resolution, style, workMaxDim);
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
      .then((canvas) => encodeCanvas(canvas, 'image/png', 1, idSheetGrid ? 1 : scale))
      .then((blob) => idSheetGrid ? withPrintDpi(blob) : blob);
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

  const loadOverlayImage = async (pickedFile, kind) => {
    if (!pickedFile || !workDataRef.current) return;
    const job = imageJobs.start();
    let url;
    try {
      const file = await toEditableImageFile(pickedFile);
      url = URL.createObjectURL(file);
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
      if (url) URL.revokeObjectURL(url);
    }
  };

  const draftMessage = DRAFT_MESSAGES[draft.status];

  return (
    <div className="relative h-dvh w-full flex flex-col bg-[#0f1116] text-slate-100 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_FILE_ACCEPT}
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
        accept={IMAGE_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void loadOverlayImage(e.target.files?.[0], 'background');
          e.target.value = '';
        }}
      />
      <input
        ref={logoFileInputRef}
        type="file"
        accept={IMAGE_FILE_ACCEPT}
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
        canUndo={history.meta.canUndo}
        canRedo={history.meta.canRedo}
        splitView={splitView}
        onToggleSplit={() => setSplitView((v) => !v)}
        onCompareStart={() => setIsComparingOriginal(true)}
        onCompareEnd={() => setIsComparingOriginal(false)}
        inspecting={inspecting}
        onToggleInspection={() => setInspectionBackground((current) => current ? null : 'checkerboard')}
        zoom={zoom}
        onZoomIn={() => changeZoom((z) => Math.min(4, z * 1.25))}
        onZoomOut={() => changeZoom((z) => Math.max(Math.min(0.02, z), z / 1.25))}
        onZoomFit={handleZoomFit}
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
            setInspectionBackground(null);
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
            inspectionBackground={inspectionBackground}
            onInspectionBackground={setInspectionBackground}
            onInspectionZoom={handleInspectionZoom}
            onZoomFit={handleZoomFit}
            isBrushActive={!inspecting && isBrushActive}
            brushSize={brushSize}
            onStrokeStart={handleStrokeStart}
            onStrokeMove={handleStrokeMove}
            onStrokeEnd={handleStrokeEnd}
            eraseMaskCanvas={!inspecting && activeTab === 'erase' && eraseMode === 'magic' ? eraseMaskCanvasState : null}
            patchActive={!inspecting && patchActive}
            patchRect={inspecting ? null : patchRect}
            patchOffset={patchOffset}
            patchFlip={patchFlip}
            onPatchChange={(rect, offset) =>
              setPatchSelection(rect ? { key: patchKey, rect, offset, flip: livePatch?.flip ?? false } : null)
            }
            eraseMaskVersion={eraseMaskVersion}
            cloneSource={!inspecting && activeTab === 'erase' && eraseMode === 'clone' ? cloneSource : null}
            pickingCloneSource={!inspecting && activeTab === 'erase' && eraseMode === 'clone' && pickingCloneSource}
            onPickCloneSource={
              !inspecting && activeTab === 'erase' && eraseMode === 'clone'
                ? (x, y) => {
                    markDraftDirty();
                    setCloneSource({ x, y });
                    setPickingCloneSource(false);
                  }
                : null
            }
            cropActive={!inspecting && cropActive && activeTab === 'crop'}
            cropRect={cropRect}
            setCropRect={setCropRect}
            cropAspect={cropAspect}
            straightenAngle={!inspecting && activeTab === 'crop' ? straightenAngle : 0}
            canDragText={!inspecting && activeTab === 'text' && textConfig.enabled && !textConfig.repeatWatermark}
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
                role={imageLoadStatus.startsWith('Đang') ? 'status' : 'alert'}
                className="max-w-md rounded-lg border border-amber-400/40 bg-[#1d2029] px-3 py-2 text-center text-sm text-amber-100 shadow-lg"
              >
                {imageLoadStatus || editorNotice}
              </p>
            </div>
          )}

          {showFilmstrip && images.length > 0 && (
            <Filmstrip
              images={images}
              activeImageId={activeImageId}
              onSelect={handleSelectImage}
              onRemove={handleRemoveImage}
              onAdd={() => fileInputRef.current?.click()}
            />
          )}
          {draftMessage && (
            <p
              role="status"
              className={`shrink-0 border-t border-[#252a37] bg-[#13161e] px-3 py-1 text-[11px] ${DRAFT_WARNING_STATES.includes(draft.status) ? 'text-amber-200' : 'text-slate-400'}`}
            >
              {draftMessage}
            </p>
          )}
        </div>

        <RightPanel
          activeTab={activeTab}
          mobilePanelOpen={!inspecting && mobilePanelOpen}
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
            cutoutAlphaRef.current = null;
            liquifySessionRef.current = null;
            brushStrokeRef.current = null;
            brushEditedRef.current = false;
            setHasCutoutMask(false);
            setBgMaskBrush('none');
            setEditorNotice('');
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
          cloneToneMatch={cloneToneMatch}
          setCloneToneMatch={setCloneToneMatch}
          patchRect={patchRect}
          patchOffset={patchOffset}
          patchFeather={patchFeather}
          setPatchFeather={setPatchFeather}
          patchToneMatch={patchToneMatch}
          setPatchToneMatch={setPatchToneMatch}
          patchFlip={patchFlip}
          setPatchFlip={setPatchFlip}
          onApplyPatch={handleApplyPatch}
          onCancelPatch={cancelPatch}
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
      {draft.status === 'loading' && (
        <div role="status" className="absolute inset-0 z-50 grid place-items-center bg-[#0f1116] text-sm text-slate-200">
          Đang mở bản nháp…
        </div>
      )}
    </div>
  );
}
