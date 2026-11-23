import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLiquifyStroke,
  applySkinBrushStroke,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_BEAUTY,
  DEFAULT_BG_STATE,
  PRESETS,
  processImagePipeline,
  straightenCanvas,
} from '../src/engine/imagePipeline.js';
import { renderCompositeCanvas } from '../src/engine/renderComposite.js';

globalThis.ImageData ??= class ImageData {
  constructor(data, width, height) {
    this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height;
  }
};

function makeImage(width, height, rgbaAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(rgbaAt(x, y), (y * width + x) * 4);
    }
  }
  return new ImageData(data, width, height);
}

function pixelAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(offset, offset + 4));
}

test('liquify keeps edge pixels when the source coordinate crosses the image boundary', () => {
  const image = makeImage(20, 20, (x) => [x === 0 ? 20 : 220, 80, 60, 255]);
  applyLiquifyStroke(image, null, 0, 8, 3, 8, 10, 0.6, 'push');
  assert.deepEqual(pixelAt(image, 0, 8), [20, 80, 60, 255]);
  assert.deepEqual(pixelAt(image, 19, 8), [220, 80, 60, 255]);
});

test('liquify moves alpha edges without mixing hidden RGB into visible pixels', () => {
  const image = makeImage(20, 20, (x) => x < 8 ? [210, 100, 40, 255] : [0, 240, 255, 0]);
  applyLiquifyStroke(image, null, 4, 8, 8, 8, 10, 0.3, 'push');
  assert.deepEqual(pixelAt(image, 8, 8), [210, 100, 40, 168]);
});

test('sharpen ignores hidden color and still enhances visible contrasts', () => {
  const image = makeImage(5, 5, (x, y) => {
    if (x === 2 && y === 2) return [120, 140, 160, 255];
    if (x === 3 && y === 2) return [100, 120, 140, 255];
    return [0, 230, 255, 0];
  });
  const result = processImagePipeline(image, { ...DEFAULT_ADJUSTMENTS, sharpen: 100 }, DEFAULT_BEAUTY);
  assert.deepEqual(pixelAt(result, 2, 2), [126, 146, 166, 255]);
  assert.deepEqual(pixelAt(result, 2, 1), [0, 230, 255, 0]);
});

test('clarity leaves constant-color pixels at transparent and translucent edges unchanged', () => {
  const image = makeImage(16, 8, (x) => {
    if (x >= 9) return [255, 0, 220, 0];
    return [106, 135, 165, x === 8 ? 128 : 255];
  });
  for (const clarity of [-100, 100]) {
    const result = processImagePipeline(image, { ...DEFAULT_ADJUSTMENTS, clarity }, DEFAULT_BEAUTY);
    assert.deepEqual(result.data, image.data);
  }
});

test('the black-and-white preset keeps bright saturated input neutral', () => {
  const image = makeImage(5, 5, (x) => x < 2 ? [255, 191, 117, 255] : [35, 90, 220, 128]);
  const preset = PRESETS.find((entry) => entry.id === 'artistic-bw');
  const result = processImagePipeline(image, preset.values, DEFAULT_BEAUTY);
  for (let i = 0; i < result.data.length; i += 4) {
    assert.equal(result.data[i], result.data[i + 1]);
    assert.equal(result.data[i], result.data[i + 2]);
    assert.equal(result.data[i + 3], image.data[i + 3]);
  }
  assert.notEqual(result.data[0], result.data[16], 'the preset still distinguishes bright and dark colors');
});

function installCanvasHarness(t) {
  const previous = globalThis.document;
  t.after(() => { globalThis.document = previous; });
  globalThis.document = {
    createElement() {
      const canvas = { width: 0, height: 0 };
      let pixels;
      const read = () => (pixels ??= new ImageData(canvas.width, canvas.height));
      const context = {
        putImageData(data) { pixels = new ImageData(data.data.slice(), data.width, data.height); },
        getImageData() { return read(); },
        drawImage(source) {
          const incoming = source.getContext('2d').getImageData().data;
          const current = read().data;
          for (let i = 0; i < current.length; i += 4) {
            const front = incoming[i + 3] / 255;
            const behind = current[i + 3] / 255 * (1 - front);
            const alpha = front + behind;
            if (!alpha) continue;
            for (let c = 0; c < 3; c++) current[i + c] = (incoming[i + c] * front + current[i + c] * behind) / alpha;
            current[i + 3] = alpha * 255;
          }
        },
      };
      canvas.getContext = (type) => type === '2d' ? context : null;
      return canvas;
    },
  };
}

function bokehPixels(workData, cutoutAlpha, adjustments) {
  return renderCompositeCanvas({
    workData,
    cutoutAlpha: Uint8ClampedArray.from(cutoutAlpha),
    adjustments,
    beauty: DEFAULT_BEAUTY,
    bgState: { ...DEFAULT_BG_STATE, mode: 'bokeh', feather: 0, decontaminate: false },
  }).getContext('2d').getImageData();
}

test('bokeh applies the global color adjustment to both subject and background', (t) => {
  installCanvasHarness(t);
  const image = makeImage(3, 1, (x) => x === 1 ? [25, 185, 42, 255] : [220, 30, 30, 255]);
  const result = bokehPixels(image, [0, 255, 0], { ...DEFAULT_ADJUSTMENTS, saturation: -100 });
  assert.deepEqual(pixelAt(result, 0, 0), [87, 87, 87, 255]);
  assert.deepEqual(pixelAt(result, 1, 0), [121, 121, 121, 255]);
});

test('bokeh preserves a translucent subject when no background sample is available', (t) => {
  installCanvasHarness(t);
  const image = makeImage(1, 1, () => [175, 120, 60, 128]);
  const result = bokehPixels(image, [255], DEFAULT_ADJUSTMENTS);
  assert.deepEqual(pixelAt(result, 0, 0), [175, 120, 60, 128]);
});

test('straightening a tiny image crops inward instead of adding a transparent border', (t) => {
  const canvas = { getContext: () => ({ translate() {}, rotate() {}, drawImage() {} }) };
  const previous = globalThis.document;
  globalThis.document = { createElement: () => canvas };
  t.after(() => { globalThis.document = previous; });
  const result = straightenCanvas({ width: 12, height: 12 }, 10);
  assert.deepEqual([result.width, result.height], [10, 10]);
});

test('healing still softens a dark blemish on a flat patch of skin', () => {
  const image = makeImage(40, 40, (x, y) => x === 20 && y === 20
    ? [98, 62, 48, 255]
    : [200, 144, 118, 255]);
  applySkinBrushStroke(image, null, 20, 20, 8, 1, 'heal');
  assert.deepEqual(pixelAt(image, 20, 20), [164, 115, 94, 255]);
  assert.deepEqual(pixelAt(image, 10, 20), [200, 144, 118, 255]);
});

test('healing protects the skin and hair colors on their respective sides of a sharp contour', () => {
  const image = makeImage(40, 40, (x) => x < 20 ? [25, 32, 39, 255] : [200, 144, 118, 255]);
  applySkinBrushStroke(image, null, 20, 20, 8, 1, 'heal');
  assert.deepEqual(pixelAt(image, 20, 20), [200, 144, 118, 255]);
  assert.deepEqual(pixelAt(image, 19, 20), [25, 32, 39, 255]);
});

test('healing a blemish near a transparent edge uses only the visible samples', () => {
  const image = makeImage(40, 40, (x, y) => {
    if (y < 20) return [20, 240, 255, 0];
    if (x === 20 && y === 20) return [98, 62, 48, 255];
    return [200, 144, 118, 255];
  });
  applySkinBrushStroke(image, null, 20, 20, 8, 1, 'heal');
  assert.deepEqual(pixelAt(image, 20, 20), [164, 115, 94, 255]);
  assert.deepEqual(pixelAt(image, 20, 19), [20, 240, 255, 0]);
});
