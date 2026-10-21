import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { sanitizeImage } from '../src/media.server.ts';
import { stripImageMetadata } from '../src/image-metadata.server.ts';
import { cdnObjectKey } from '../src/cdn.server.ts';
import { validateMediaAttribution } from '@gallery/core';
const policy = {
  enabled: true,
  creator: 'https://vision.ke',
  homepage: 'https://vision.ke',
  copyright: '',
};
function artist(exif: Buffer) {
  // Independent TIFF read of the EXIF buffer returned by libvips.
  const t =
    exif.toString('ascii', 0, 6) === 'Exif\0\0' ? exif.subarray(6) : exif;
  assert.equal(t.toString('ascii', 0, 2), 'II');
  const ifd = t.readUInt32LE(4),
    n = t.readUInt16LE(ifd);
  assert.equal(
    n,
    1,
    'Only allowlisted Artist is present; no GPS/camera/date IFDs',
  );
  const p = ifd + 2;
  assert.equal(t.readUInt16LE(p), 0x013b);
  assert.equal(t.readUInt16LE(p + 2), 2);
  const size = t.readUInt32LE(p + 4),
    at = size <= 4 ? p + 8 : t.readUInt32LE(p + 8);
  return t.toString('ascii', at, at + size - 1);
}
for (const format of [
  'jpeg',
  'webp',
  'lossless-webp',
  'simple-webp',
  'simple-lossless-webp',
] as const) {
  test(`${format}: attribution preserves source bytes, pixels, ICC and compressed image payload`, async () => {
    let source = sharp({
      create: {
        width: 41,
        height: 23,
        channels: format === 'simple-webp' ? 3 : 4,
        background: { r: 83, g: 140, b: 205, alpha: 0.5 },
      },
    });
    if (!format.startsWith('simple'))
      source = source
        .withIccProfile('p3')
        .withExif({
          IFD0: { Artist: 'private-source', Model: 'private-camera' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '20/1 30/1 0/1' },
        })
        .withXmp('<private>private-location</private>');
    const input = await (
      format === 'jpeg'
        ? source.jpeg({ progressive: true })
        : source.webp({ lossless: format.includes('lossless') })
    ).toBuffer();
    const original = Buffer.from(input);
    const clean = await sanitizeImage(input, 'preview');
    const output = await sanitizeImage(input, 'preview', policy);
    assert.deepEqual(input, original, 'Never mutate source buffer');
    assert.deepEqual(
      await sharp(output).raw().toBuffer(),
      await sharp(input).raw().toBuffer(),
    );
    const before = await sharp(input).metadata(),
      after = await sharp(output).metadata();
    assert.deepEqual(
      [after.width, after.height, after.icc, after.hasAlpha],
      [before.width, before.height, before.icc, before.hasAlpha],
    );
    assert.equal(artist(after.exif!), policy.creator);
    assert.match(after.xmp!.toString(), /<dc:creator>/);
    assert.match(
      after.xmp!.toString(),
      /<Iptc4xmpCore:CiUrlWork>https:\/\/vision.ke<\/Iptc4xmpCore:CiUrlWork>/,
    );
    assert.ok(!output.includes(Buffer.from('private-')));
    // A simple WebP gains a VP8X wrapper; compare compressed chunks separately.
    const a = stripImageMetadata(output),
      b = stripImageMetadata(clean);
    if (b.toString('ascii', 12, 16) !== 'VP8X' && format !== 'jpeg')
      assert.deepEqual(a.subarray(30), b.subarray(12));
    else assert.deepEqual(a, b);
    assert.deepEqual(
      await sanitizeImage(output, 'preview', policy),
      output,
      'No duplicate attribution on repeated handling',
    );
    assert.deepEqual(
      await sanitizeImage(input, 'preview', { ...policy, enabled: false }),
      clean,
      'Turning off restores unsigned output',
    );
    assert.notEqual(cdnObjectKey(output), cdnObjectKey(clean));
    assert.equal(
      cdnObjectKey(await sanitizeImage(input, 'preview', { ...policy })),
      cdnObjectKey(output),
    );
    const changed = await sanitizeImage(input, 'preview', {
      ...policy,
      creator: 'https://example.com',
    });
    assert.notEqual(
      cdnObjectKey(changed),
      cdnObjectKey(output),
      'Config changes cannot reuse stale cache',
    );
    assert.equal(
      artist((await sharp(changed).metadata()).exif!),
      'https://example.com',
    );
  });
}
test('short EXIF value, XML escaping, Unicode and validation', async () => {
  const input = await sharp({
    create: { width: 8, height: 8, channels: 3, background: 'red' },
  })
    .jpeg()
    .toBuffer();
  assert.equal(
    artist(
      (
        await sharp(
          await sanitizeImage(input, 'preview', { ...policy, creator: 'A' }),
        ).metadata()
      ).exif!,
    ),
    'A',
  );
  const text = await sharp(
    await sanitizeImage(input, 'preview', {
      ...policy,
      creator: '光与远方 & <Vision>',
      copyright: '版权所有',
    }),
  ).metadata();
  assert.match(text.xmp!.toString(), /光与远方 &amp; &lt;Vision&gt;/);
  assert.match(text.xmp!.toString(), /版权所有/);
  for (const value of [
    { ...policy, creator: '' },
    { ...policy, creator: 'bad\u0000' },
    { ...policy, homepage: 'javascript:alert(1)' },
    { ...policy, homepage: 'https://user:password@example.com' },
    { ...policy, homepage: 'invalid' },
  ])
    assert.throws(() => validateMediaAttribution(value));
  assert.deepEqual(validateMediaAttribution(policy), policy);
});
