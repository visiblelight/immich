import type { MediaAttribution } from '@gallery/core';
import { imageContentType } from './image-metadata.server.ts';
const xml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
/** Input must already be stripped and validated. Only explicitly configured fields are written. */
export function addImageAttribution(
  clean: Buffer,
  config: MediaAttribution,
): Buffer {
  if (!config.enabled) return clean;
  const xmp = Buffer.from(
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/"><dc:creator><rdf:Seq><rdf:li>${xml(config.creator)}</rdf:li></rdf:Seq></dc:creator>${config.homepage ? `<Iptc4xmpCore:CreatorContactInfo rdf:parseType="Resource"><Iptc4xmpCore:CiUrlWork>${xml(config.homepage)}</Iptc4xmpCore:CiUrlWork></Iptc4xmpCore:CreatorContactInfo>` : ''}${config.copyright ? `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xml(config.copyright)}</rdf:li></rdf:Alt></dc:rights>` : ''}</rdf:Description></rdf:RDF></x:xmpmeta>`,
    'utf8',
  );
  // EXIF ASCII fields cannot faithfully represent Unicode. XMP always carries full text.
  const fields = [
    [0x013b, config.creator],
    [0x8298, config.copyright],
  ] as const;
  const ascii = fields.filter(([, v]) => v && /^[\x20-\x7e]+$/.test(v));
  const values = ascii.map(([, v]) => Buffer.from(v + '\0', 'ascii'));
  const base = 8 + 2 + 12 * ascii.length + 4;
  const exif = Buffer.alloc(
    base +
      values.reduce(
        (sum, v) => sum + (v.length > 4 ? v.length + (v.length % 2) : 0),
        0,
      ),
  );
  exif.write('II');
  exif.writeUInt16LE(42, 2);
  exif.writeUInt32LE(8, 4);
  exif.writeUInt16LE(ascii.length, 8);
  let tail = base;
  ascii.forEach(([tag], i) => {
    const offset = 10 + i * 12,
      data = values[i]!;
    exif.writeUInt16LE(tag, offset);
    exif.writeUInt16LE(2, offset + 2);
    exif.writeUInt32LE(data.length, offset + 4);
    if (data.length <= 4) data.copy(exif, offset + 8);
    else {
      exif.writeUInt32LE(tail, offset + 8);
      data.copy(exif, tail);
      tail += data.length + (data.length % 2);
    }
  });
  if (imageContentType(clean) === 'image/jpeg') {
    const segment = (data: Buffer) => {
      const h = Buffer.from([255, 225, 0, 0]);
      h.writeUInt16BE(data.length + 2, 2);
      return Buffer.concat([h, data]);
    };
    const at =
      clean[2] === 255 && clean[3] === 224 ? 4 + clean.readUInt16BE(4) : 2;
    return Buffer.concat([
      clean.subarray(0, at),
      segment(Buffer.concat([Buffer.from('Exif\0\0'), exif])),
      segment(
        Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0'), xmp]),
      ),
      clean.subarray(at),
    ]);
  }
  const chunks: Buffer[] = [];
  let extended: Buffer | undefined;
  for (let pos = 12; pos < clean.length;) {
    const size = clean.readUInt32LE(pos + 4),
      chunk = Buffer.from(clean.subarray(pos, pos + 8 + size + (size % 2)));
    if (chunk.toString('ascii', 0, 4) === 'VP8X') extended = chunk;
    else chunks.push(chunk);
    pos += chunk.length;
  }
  if (!extended) {
    extended = Buffer.alloc(18);
    extended.write('VP8X');
    extended.writeUInt32LE(10, 4);
    const vp8 = chunks.find((c) => c.toString('ascii', 0, 4) === 'VP8 ');
    const lossless = chunks.find((c) => c.toString('ascii', 0, 4) === 'VP8L');
    let width: number, height: number;
    if (vp8) {
      width = vp8.readUInt16LE(14) & 0x3fff;
      height = vp8.readUInt16LE(16) & 0x3fff;
    } else if (lossless) {
      const bits = lossless.readUInt32LE(9);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
      if (bits & 0x10000000) extended[8] = 0x10;
    } else throw new Error('Missing WebP image');
    if (chunks.some((c) => c.toString('ascii', 0, 4) === 'ALPH'))
      extended[8] = extended[8]! | 0x10;
    extended.writeUIntLE(width - 1, 12, 3);
    extended.writeUIntLE(height - 1, 15, 3);
  }
  extended[8] = extended[8]! | 0x0c;
  const chunk = (kind: string, data: Buffer) => {
    const b = Buffer.alloc(8 + data.length + (data.length % 2));
    b.write(kind);
    b.writeUInt32LE(data.length, 4);
    data.copy(b, 8);
    return b;
  };
  const body = Buffer.concat([
    extended,
    ...chunks,
    chunk('EXIF', exif),
    chunk('XMP ', xmp),
  ]);
  const header = Buffer.from('RIFF\0\0\0\0WEBP');
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}
