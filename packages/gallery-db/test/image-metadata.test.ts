import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { sanitizeImage, imageContentType } from '../src/media.server.ts';

const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><private>private-location</private></x:xmpmeta>';
function source(width: number, height: number, channels: 3 | 4 = 3) {
  return sharp({
    create: {
      width,
      height,
      channels,
      background: { r: 55, g: 113, b: 166, alpha: 0.5 },
    },
  })
    .withIccProfile('p3')
    .withExif({
      IFD0: { Artist: 'private-artist' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '41/1 0/1 0/1' },
    })
    .withXmp(xmp);
}
async function unchangedPixels(input: Buffer, output: Buffer) {
  const before = await sharp(input).raw().toBuffer();
  const after = await sharp(output).raw().toBuffer();
  assert.ok(before.equals(after), 'Decoded pixels must not change');
  const a = await sharp(input).metadata(),
    b = await sharp(output).metadata();
  assert.deepEqual([b.width, b.height, b.format], [a.width, a.height, a.format]);
  assert.ok(a.icc);
  assert.deepEqual(b.icc, a.icc);
  assert.equal(b.exif, undefined);
  assert.equal(b.xmp, undefined);
  assert.equal(b.iptc, undefined);
  assert.ok(!output.includes(Buffer.from('private-')));
}
function jpegSegment(marker: number, payload: string) {
  const data = Buffer.from(payload),
    header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([header, data]);
}
function webpChunk(kind: string, payload: string) {
  const data = Buffer.from(payload),
    chunk = Buffer.alloc(8 + data.length + (data.length % 2));
  chunk.write(kind, 0, 'ascii');
  chunk.writeUInt32LE(data.length, 4);
  data.copy(chunk, 8);
  return chunk;
}

for (const progressive of [false, true]) {
  test(`JPEG 4K preserves pixels and ICC, removes all metadata (${progressive ? 'progressive' : 'baseline'})`, async () => {
    const original = await source(3240, 2160).jpeg({ progressive, quality: 85 }).toBuffer();
    const input = Buffer.concat([
      original.subarray(0, 2),
      jpegSegment(0xed, 'private-photoshop-iptc'),
      original.subarray(2, -2),
      jpegSegment(0xfe, 'private-comment-after-scan'),
      original.subarray(-2),
      Buffer.from('private-trailer'),
    ]);
    const output = await sanitizeImage(input, 'preview');
    assert.equal(imageContentType(output), 'image/jpeg');
    await unchangedPixels(input, output);
    const sos = Buffer.from([0xff, 0xda]);
    assert.deepEqual(output.subarray(output.indexOf(sos)), original.subarray(original.indexOf(sos)));
    assert.ok(output.length <= original.length);
  });
}

for (const lossless of [false, true]) {
  test(`WebP 1080p preserves alpha, pixels and ICC (${lossless ? 'lossless' : 'lossy'})`, async () => {
    const original = await source(1620, 1080, 4).webp({ lossless, quality: 80 }).toBuffer();
    const input = Buffer.concat([original, webpChunk('PRIV', 'private-unknown-chunk')]);
    input.writeUInt32LE(input.length - 8, 4);
    const output = await sanitizeImage(input, 'thumbnail');
    assert.equal(imageContentType(output), 'image/webp');
    await unchangedPixels(input, output);
    assert.equal((await sharp(output).metadata()).hasAlpha, true);
    const kind = lossless ? 'VP8L' : 'VP8 ';
    const start = original.indexOf(kind), size = original.readUInt32LE(start + 4);
    const outputStart = output.indexOf(kind);
    assert.deepEqual(output.subarray(outputStart, outputStart + 8 + size), original.subarray(start, start + 8 + size));
  });
}

test('source replacement invalidates cached bytes; small derivatives are never enlarged', async () => {
  const first = await source(120, 80).jpeg().toBuffer();
  const second = await source(150, 100).jpeg().toBuffer();
  assert.equal((await sharp(await sanitizeImage(first, 'preview')).metadata()).width, 120);
  assert.equal((await sharp(await sanitizeImage(second, 'preview')).metadata()).width, 150);
});

test('malformed, unsupported and unnormalised sources fail closed', async () => {
  const jpeg = await source(120, 80).jpeg().toBuffer();
  const webp = await source(120, 80).webp().toBuffer();
  for (const data of [jpeg.subarray(0, -10), webp.subarray(0, -10), Buffer.from('<svg/>')]) {
    await assert.rejects(sanitizeImage(data, 'preview'));
  }
  const invalidLength = Buffer.from(webp);
  invalidLength.writeUInt32LE(0xffffffff, 16);
  await assert.rejects(sanitizeImage(invalidLength, 'preview'));
  const rotated = await sharp(jpeg).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  await assert.rejects(sanitizeImage(rotated, 'preview'));
  const png = await sharp(jpeg).png().toBuffer();
  await assert.rejects(sanitizeImage(png, 'preview'));
});
