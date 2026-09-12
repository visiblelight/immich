/** Container-only metadata removal for Immich's still JPEG/WebP derivatives.
 * Compressed image data and ICC profiles are copied, never decoded/re-encoded here.
 * Unknown formats/structures fail closed; callers additionally validate decoding.
 */
export function imageContentType(bytes: Buffer): 'image/jpeg' | 'image/webp' {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  throw new Error('Unsupported derivative format');
}

export function stripImageMetadata(bytes: Buffer): Buffer {
  return imageContentType(bytes) === 'image/jpeg' ? stripJpeg(bytes) : stripWebp(bytes);
}

function stripJpeg(bytes: Buffer): Buffer {
  const parts: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2,
    scans = 0;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 && scans) {
      parts.push(Buffer.from([0xff, 0xd9]));
      return Buffer.concat(parts); // Discard any trailer after the image.
    }
    if (offset + 2 > bytes.length) throw new Error('Truncated JPEG');
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) throw new Error('Invalid JPEG segment');
    const payload = bytes.subarray(offset + 2, end);
    if (marker === 0xe0 && payload.length >= 14 && payload.toString('ascii', 0, 5) === 'JFIF\0') {
      // Retain display density, but remove the optional embedded thumbnail.
      const jfif = Buffer.from(payload.subarray(0, 14));
      jfif[12] = jfif[13] = 0;
      parts.push(Buffer.from([0xff, 0xe0, 0, 16]), jfif);
    } else if (
      marker === 0xe2 &&
      payload.length >= 14 &&
      payload.toString('ascii', 0, 12) === 'ICC_PROFILE\0'
    ) {
      parts.push(bytes.subarray(start, end));
    } else if (marker === 0xee && payload.length === 12 && payload.toString('ascii', 0, 5) === 'Adobe') {
      parts.push(bytes.subarray(start, end)); // Adobe colour transform.
    } else if ((marker! >= 0xe0 && marker! <= 0xef) || marker === 0xfe) {
      // Drop EXIF/XMP, IPTC/Photoshop, comments and other application metadata.
    } else if ([0xc0, 0xc1, 0xc2, 0xc4, 0xdb, 0xdd, 0xda].includes(marker!)) {
      parts.push(bytes.subarray(start, end));
    } else {
      throw new Error('Unsupported JPEG marker');
    }
    offset = end;
    if (marker === 0xda) {
      scans++;
      const scanStart = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const next = bytes[offset + 1];
        if (next === 0 || (next! >= 0xd0 && next! <= 0xd7)) {
          offset += 2;
          continue;
        }
        break;
      }
      parts.push(bytes.subarray(scanStart, offset));
      // Continue parsing markers: progressive JPEG may have metadata between scans.
    }
  }
  throw new Error('Missing JPEG end marker');
}

function stripWebp(bytes: Buffer): Buffer {
  const end = bytes.readUInt32LE(4) + 8;
  if (end < 12 || end > bytes.length || end % 2) throw new Error('Invalid WebP length');
  const parts: Buffer[] = [];
  const seen = new Set<string>();
  let offset = 12,
    images = 0;
  while (offset < end) {
    if (offset + 8 > end) throw new Error('Truncated WebP header');
    const kind = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const next = offset + 8 + size + (size % 2);
    if (next > end) throw new Error('Truncated WebP chunk');
    if (kind === 'ANIM' || kind === 'ANMF') throw new Error('Animated derivatives are unsupported');
    if (['VP8X', 'ICCP', 'ALPH', 'VP8 ', 'VP8L'].includes(kind)) {
      if (seen.has(kind)) throw new Error('Duplicate WebP chunk');
      seen.add(kind);
      const chunk = Buffer.from(bytes.subarray(offset, next));
      if (kind === 'VP8X') {
        if (size !== 10 || chunk[8]! & 0x02) throw new Error('Invalid still WebP header');
        chunk[8] = chunk[8]! & 0x30; // Keep ICC and alpha flags; remove EXIF/XMP flags.
      }
      if (kind === 'VP8 ' || kind === 'VP8L') images++;
      if (size % 2) chunk[chunk.length - 1] = 0;
      parts.push(chunk);
    }
    // Drop EXIF, XMP and unknown ancillary chunks, including those after image data.
    offset = next;
  }
  if (images !== 1) throw new Error('Invalid WebP image count');
  const header = Buffer.from(bytes.subarray(0, 12));
  header.writeUInt32LE(4 + parts.reduce((total, part) => total + part.length, 0), 4);
  return Buffer.concat([header, ...parts]);
}
