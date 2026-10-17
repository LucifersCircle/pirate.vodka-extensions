/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
// Native-VM-safe container/dimension checks. This is not a pixel decoder.
// Unsupported formats fail rather than pass on Content-Length or magic bytes alone.
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function verifyRasterImageBytes(bytes: Uint8Array) {
  check(bytes.length > 0 && bytes.length <= 16 * 1024 * 1024, "Invalid image body size");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const result = (width: number, height: number, format: string) => {
    check(
      [width, height].every((value) => Number.isSafeInteger(value) && value > 0),
      "Invalid image dimensions",
    );
    return { width, height, format };
  };
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") {
    check(bytes.length >= 45, "Truncated PNG");
    check(view.getUint32(8) === 13 && ascii(12, 16) === "IHDR", "PNG has no valid initial IHDR");
    const width = view.getUint32(16),
      height = view.getUint32(20);
    let imageData = false;
    for (let offset = 8; offset < bytes.length; ) {
      check(offset + 12 <= bytes.length, "Truncated PNG chunk");
      const size = view.getUint32(offset),
        kind = ascii(offset + 4, offset + 8);
      check(size <= bytes.length - offset - 12, "Truncated PNG chunk data");
      check(offset === 8 || kind !== "IHDR", "Duplicate PNG IHDR");
      if (kind === "IDAT" && size > 0) imageData = true;
      offset += size + 12;
      if (kind === "IEND") {
        check(
          size === 0 && imageData && offset === bytes.length,
          "PNG has no image data or is incomplete",
        );
        return result(width, height, "PNG");
      }
    }
    throw new Error("PNG has no IEND");
  }
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    check(view.getUint32(4, true) + 8 === bytes.length, "WebP is incomplete");
    let dimensions: [number, number] | undefined,
      hasFrame = false;
    const uint24 = (offset: number) =>
      bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    for (let offset = 12; offset < bytes.length; ) {
      check(offset + 8 <= bytes.length, "Truncated WebP chunk");
      const kind = ascii(offset, offset + 4),
        size = view.getUint32(offset + 4, true),
        start = offset + 8;
      check(size + (size % 2) <= bytes.length - start, "Malformed WebP chunk length");
      if (kind === "VP8X") {
        check(size === 10 && !dimensions, "Invalid WebP extended dimensions");
        dimensions = [uint24(start + 4) + 1, uint24(start + 7) + 1];
      } else if (kind === "VP8 ") {
        check(size > 10 && ascii(start + 3, start + 6) === "\x9d\x01\x2a", "Invalid WebP frame");
        dimensions ??= [
          view.getUint16(start + 6, true) & 0x3fff,
          view.getUint16(start + 8, true) & 0x3fff,
        ];
        hasFrame = true;
      } else if (kind === "VP8L") {
        check(size > 5 && bytes[start] === 0x2f, "Invalid lossless WebP frame");
        const packed = view.getUint32(start + 1, true);
        dimensions ??= [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
        hasFrame = true;
      }
      offset = start + size + (size % 2);
    }
    check(hasFrame && dimensions, "WebP has no supported image frame");
    return result(...dimensions, "WebP");
  }
  check(
    bytes.length >= 4 &&
      view.getUint16(0) === 0xffd8 &&
      view.getUint16(bytes.length - 2) === 0xffd9,
    "Unsupported format or incomplete JPEG bytes",
  );
  let offset = 2,
    inScan = false,
    scans = 0,
    entropyBytes = 0;
  let dimensions: [number, number] | undefined,
    components = 0;
  for (let count = 0; count < 65536 && offset < bytes.length; count += 1) {
    if (inScan) {
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          entropyBytes++;
          offset++;
          continue;
        }
        const next = bytes[offset + 1];
        if (next === 0x00) {
          entropyBytes++;
          offset += 2;
          continue;
        }
        if (next >= 0xd0 && next <= 0xd7) {
          offset += 2;
          continue;
        }
        break;
      }
      inScan = false;
    }
    check(offset + 1 < bytes.length, "Truncated JPEG scan");
    check(bytes[offset++] === 0xff, "Malformed JPEG marker");
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    check(offset < bytes.length, "Truncated JPEG marker");
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      check(
        offset === bytes.length && dimensions && scans > 0 && entropyBytes > 0,
        "JPEG has no complete image scan",
      );
      return result(...dimensions, "JPEG");
    }
    check(
      marker !== 0x00 && marker !== 0xd8 && !(marker >= 0xd0 && marker <= 0xd7),
      "Invalid JPEG marker outside scan",
    );
    if (marker === 0x01) continue;
    check(offset + 2 <= bytes.length, "Truncated JPEG segment");
    const size = view.getUint16(offset);
    check(size >= 2 && offset + size <= bytes.length, "Malformed JPEG segment length");
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      check(size >= 8 && !dimensions, "Truncated or repeated JPEG SOF");
      components = bytes[offset + 7];
      check(
        components > 0 && components <= 4 && size === 8 + 3 * components,
        "Invalid JPEG SOF component table",
      );
      dimensions = [view.getUint16(offset + 5), view.getUint16(offset + 3)];
      result(...dimensions, "JPEG");
    } else if (marker === 0xda) {
      check(dimensions && size >= 6, "JPEG scan has no frame");
      const selected = bytes[offset + 2];
      check(
        selected > 0 && selected <= components && size === 6 + 2 * selected,
        "Invalid JPEG scan component table",
      );
      scans++;
      inScan = true;
    }
    offset += size;
  }
  throw new Error("JPEG image scan missing or beyond the bounded segment limit");
}
