import assert from 'node:assert/strict';
import test from 'node:test';
import { heicOutputName, isHeicFile, isImageFile, toEditableImageFile } from '../src/engine/imageFiles.js';

const file = (name, type) => new File([new Uint8Array([1, 2, 3])], name, { type });

test('HEIC is recognised by MIME type or by extension when the OS reports none', () => {
  assert.equal(isHeicFile(file('IMG_0001.HEIC', '')), true);
  assert.equal(isHeicFile(file('photo.heif', '')), true);
  assert.equal(isHeicFile(file('photo', 'image/heic')), true);
  assert.equal(isHeicFile(file('photo.jpg', 'image/jpeg')), false);
});

test('only images and HEIC files are accepted', () => {
  assert.equal(isImageFile(file('a.png', 'image/png')), true);
  assert.equal(isImageFile(file('IMG_0001.HEIC', '')), true);
  assert.equal(isImageFile(file('notes.txt', 'text/plain')), false);
});

test('converted files keep their name with a .jpg extension', () => {
  assert.equal(heicOutputName('IMG_0001.HEIC'), 'IMG_0001.jpg');
  assert.equal(heicOutputName('scan'), 'scan.jpg');
});

test('non-HEIC files and HEIC the browser can decode are passed through', async () => {
  const jpg = file('a.jpg', 'image/jpeg');
  assert.equal(await toEditableImageFile(jpg), jpg);
  const heic = file('a.heic', 'image/heic');
  const convert = () => assert.fail('should not convert');
  assert.equal(await toEditableImageFile(heic, { decodeCheck: async () => true, convert }), heic);
});

test('HEIC the browser cannot decode becomes a JPEG file', async () => {
  const heic = file('IMG_0002.HEIC', '');
  let received;
  const out = await toEditableImageFile(heic, {
    decodeCheck: async () => false,
    convert: async (args) => {
      received = args;
      return new Blob([new Uint8Array([9])], { type: 'image/jpeg' });
    },
  });
  assert.equal(received.blob, heic);
  assert.equal(received.type, 'image/jpeg');
  assert.equal(out.name, 'IMG_0002.jpg');
  assert.equal(out.type, 'image/jpeg');
});
