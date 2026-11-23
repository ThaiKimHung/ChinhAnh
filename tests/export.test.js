import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOriginalSource,
  createZip,
  encodeCanvas,
  getTransformedSize,
  sanitizeExportName,
  transformImageCanvas,
  uniqueExportName,
} from '../src/engine/exportImage.js';

test('original dimensions apply the same edit geometry at source size', () => {
  const operations = [
    { type: 'rotate', degrees: 90 },
    { type: 'flip', direction: 'h' },
    { type: 'crop', rect: { x: 10, y: 10, w: 50, h: 75 } },
    { type: 'straighten', angle: 30 },
  ];
  assert.deepEqual(getTransformedSize({ width: 4000, height: 3000 }, operations), {
    width: 804,
    height: 1608,
  });
  assert.deepEqual(getTransformedSize({ width: 1600, height: 1200 }, operations), {
    width: 322,
    height: 643,
  });
});

test('a crop ending at the right and bottom edges stays inside a small source', (t) => {
  const source = { width: 20, height: 20 };
  const crop = { type: 'crop', rect: { x: 85, y: 85, w: 15, h: 15 } };
  const previousDocument = globalThis.document;
  let drawArgs;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ drawImage: (...args) => { drawArgs = args; } }),
    }),
  };
  t.after(() => { globalThis.document = previousDocument; });

  assert.deepEqual(getTransformedSize(source, [crop]), { width: 3, height: 3 });
  const result = transformImageCanvas(source, crop);
  assert.equal(result.width, 3);
  assert.equal(result.height, 3);
  assert.deepEqual(drawArgs, [source, 17, 17, 3, 3, 0, 0, 3, 3]);
});

test('original rendering preserves fine detail while resampling brush changes and the cutout mask', (t) => {
  const imageData = (reds, alpha = 255) => ({
    width: reds.length,
    height: 1,
    data: new Uint8ClampedArray(reds.flatMap((red) => [red, 0, 0, alpha])),
  });
  const source = imageData([25, 75, 20, 80]);
  const makeCanvas = () => ({
    getContext: () => ({
      drawImage() {},
      getImageData: () => imageData([25, 75, 20, 80]),
    }),
  });
  const formerDocument = globalThis.document;
  globalThis.document = { createElement: makeCanvas };
  t.after(() => { globalThis.document = formerDocument; });

  const result = buildOriginalSource(source, {
    geometry: [],
    origData: imageData([50, 50]),
    workData: imageData([50, 54]),
    cutoutAlpha: new Uint8ClampedArray([0, 255]),
  });

  // Small retouching changes are added on top of the full-resolution pixels.
  assert.deepEqual(Array.from(result.workData.data).filter((_, i) => i % 4 === 0), [25, 76, 23, 84]);
  assert.deepEqual(Array.from(result.cutoutAlpha), [0, 64, 191, 255]);
  assert.equal(result.origCanvas.width, 4);
  assert.equal(result.origCanvas.height, 1);
});

test('original rendering does not bring back sharp detail of an object removed in the edit', (t) => {
  const W = 16;
  const row = Array.from({ length: W }, (_, x) => (x === 8 ? 30 : 150));
  const source = { width: W, height: 1, data: new Uint8ClampedArray(row.flatMap((v) => [v, v, v, 255])) };
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => source }) }),
  };
  t.after(() => { globalThis.document = previousDocument; });
  const small = (values) => ({ width: values.length, height: 1, data: new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255])) });

  const { workData } = buildOriginalSource(source, {
    origData: small([150, 150, 120, 150]), // the wire averaged into one working pixel
    workData: small([150, 150, 150, 150]), // removed in the edit
  });

  const reds = Array.from(workData.data).filter((_, i) => i % 4 === 0);
  assert.ok(Math.abs(reds[8] - 150) <= 6, `wire pixel came back as ${reds[8]}`);
  assert.ok(reds.every((v) => v >= 140), `ghost halo ${reds}`);
  assert.equal(reds[0], 150, 'untouched pixels keep their full-resolution value');
});

test('original rendering resamples alpha corrections without reviving hidden colors', (t) => {
  const imageData = (pixels) => ({ width: pixels.length / 4, height: 1, data: new Uint8ClampedArray(pixels) });
  const source = imageData([255, 0, 0, 0, 240, 0, 0, 255]);
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ drawImage() {}, getImageData: () => source }),
    }),
  };
  t.after(() => { globalThis.document = previousDocument; });

  const { workData } = buildOriginalSource(source, {
    origData: imageData([240, 0, 0, 128]),
    workData: imageData([240, 0, 0, 64]),
  });

  assert.deepEqual(Array.from(workData.data), [0, 0, 0, 0, 240, 0, 0, 191]);
});

test('export names normalize Vietnamese text, avoid paths and deduplicate case-insensitively', () => {
  const used = new Set();
  assert.equal(sanitizeExportName('  Ảnh/gốc:1?  '), 'Ảnh-gốc-1-');
  assert.equal(sanitizeExportName('...'), 'LKMagic-Export');
  assert.equal(sanitizeExportName('NUL'), 'NUL-');
  assert.equal(uniqueExportName('Chân dung', 'image/jpeg', used), 'Chân dung.jpg');
  assert.equal(uniqueExportName('chân dung', 'image/jpeg', used), 'chân dung-2.jpg');
});

test('ZIP records Vietnamese filenames, UTF-8 flags, file bytes and valid offsets', async () => {
  const zip = await createZip([
    { name: 'Ảnh thử.txt', blob: new Blob(['123456789']) },
    { name: 'Ảnh 2.txt', blob: new Blob(['abc']) },
  ]);
  const buf = await zip.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const decoder = new TextDecoder();
  const end = bytes.length - 22;
  const central = view.getUint32(end + 16, true);
  const nameLength = view.getUint16(26, true);

  assert.equal(zip.type, 'application/zip');
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true), 0x0800);
  assert.equal(view.getUint32(14, true), 0xcbf43926);
  assert.equal(view.getUint32(18, true), 9);
  assert.equal(decoder.decode(bytes.slice(30, 30 + nameLength)), 'Ảnh thử.txt');
  assert.equal(decoder.decode(bytes.slice(30 + nameLength, 39 + nameLength)), '123456789');
  assert.equal(view.getUint32(39 + nameLength, true), 0x04034b50);
  assert.equal(view.getUint32(central, true), 0x02014b50);
  assert.equal(view.getUint32(central + 46 + nameLength + 42, true), 39 + nameLength);
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
});

test('ZIP accepts only leaf filenames', async () => {
  await assert.rejects(createZip([{ name: '../Ảnh.png', blob: new Blob(['abc']) }]), /tên tệp không hợp lệ/);
});

test('invalid or unsupported canvas encodes report a failure', async () => {
  const canvas = { width: 80, height: 40, toBlob: (cb) => cb(new Blob([], { type: 'image/png' })) };
  await assert.rejects(encodeCanvas(canvas, 'image/webp', 0.9), /định dạng/);
  await assert.rejects(encodeCanvas(canvas, 'image/png', 0.9, 2000), /quá lớn/);
});
