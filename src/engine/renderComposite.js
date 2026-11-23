import { applyCutoutMatte } from './cutout';
import { buildOriginalSource, getTransformedSize } from './exportImage';
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_BEAUTY,
  DEFAULT_BG_STATE,
  DEFAULT_FRAME,
  DEFAULT_LOGO,
  DEFAULT_TEXT,
  bokehBackdrop,
  compositeWithBackground,
  renderTextAndFrame,
} from './imagePipeline';
import { processImage } from './gpuPipeline';
import { imageSizeOf, rasterize, readImage, workingSizeOf } from './canvasUtils';

/** Runs color/beauty processing, cutout matte, background compositing and text/frame overlay. */
export function renderCompositeCanvas({
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
  const processed = processImage(workData, adjustments, beauty);
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
    const backdropSrc = bgState.mode === 'bokeh'
      ? bokehBackdrop(workData, cutoutAlpha, (bgState.blurAmount || 12) * resolutionScale)
      : origCanvas;
    finalCanvas = compositeWithBackground(fgCanvas, backdropSrc, bgState, resolutionScale);
  }

  const outCtx = finalCanvas.getContext('2d');
  renderTextAndFrame(outCtx, finalCanvas.width, finalCanvas.height, textConfig, frameConfig, logoConfig);
  return finalCanvas;
}

/**
 * Renders one filmstrip item for export.
 * `resolution` is 'working' (edit size), 'original' (full source size) or anything else
 * (re-decoded at `workMaxDim`). Items never opened use `style` (a pending “apply to all”) or defaults.
 */
export async function renderForExport(item, session, resolution, style, workMaxDim) {
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
  const { canvas, data } = rasterize(image, width, height);
  return renderCompositeCanvas({ ...settings, workData: data, origCanvas: canvas });
}
