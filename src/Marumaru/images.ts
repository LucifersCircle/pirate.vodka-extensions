/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

// The site's advertised opaque cover filenames are complete still-image WebP,
// served as application/octet-stream. Do not treat arbitrary binary as an image.
export function binaryCoverWebP(data: ArrayBuffer): boolean {
  if (data.byteLength < 30 || data.byteLength > 16000000) return false;
  const b = new Uint8Array(data),
    v = new DataView(data);
  const tag = (start: number, value: string) =>
    value.split("").every((c, i) => b[start + i] === c.charCodeAt(0));
  if (
    !tag(0, "RIFF") ||
    !tag(8, "WEBP") ||
    !tag(12, "VP8 ") ||
    v.getUint32(4, true) + 8 !== b.length
  )
    return false;
  const size = v.getUint32(16, true),
    end = 20 + size;
  if (size <= 10 || end + (size % 2) !== b.length || (size % 2 && b[end] !== 0)) return false;
  const frame = b[20] + b[21] * 256 + b[22] * 65536;
  return (
    (frame & 1) === 0 &&
    ((frame >>> 1) & 7) <= 3 &&
    ((frame >>> 4) & 1) === 1 &&
    frame >>> 5 > 0 &&
    frame >>> 5 <= size - 10 &&
    b[23] === 0x9d &&
    b[24] === 0x01 &&
    b[25] === 0x2a &&
    (v.getUint16(26, true) & 0x3fff) > 0 &&
    (v.getUint16(28, true) & 0x3fff) > 0
  );
}

// Structural gate for complete, 8-bit Huffman-coded baseline/progressive JPEGs.
// This validates marker, table and scan framing; it is not a pixel/entropy decoder.
export function binaryCoverJPEG(data: ArrayBuffer): boolean {
  if (data.byteLength < 32 || data.byteLength > 16000000) return false;
  const b = new Uint8Array(data);
  const word = (p: number) => b[p] * 256 + b[p + 1];
  if (b[0] !== 0xff || b[1] !== 0xd8) return false;
  const quant = new Map<number, number>();
  const huffman = new Set<number>();
  const components = new Map<number, { quant: number; bits: number[] }>();
  let p = 2,
    frame = 0,
    scans = 0,
    restart = 0;
  while (p < b.length) {
    if (b[p++] !== 0xff) return false;
    while (p < b.length && b[p] === 0xff) p++;
    if (p >= b.length) return false;
    const marker = b[p++];
    if (marker === 0xd9)
      return (
        p === b.length &&
        scans > 0 &&
        [...components.values()].every((c) => c.bits.every((bit) => bit >= 0))
      );
    // All supported non-EOI markers have a bounded length-bearing segment.
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      p + 2 > b.length
    )
      return false;
    const length = word(p),
      end = p + length;
    if (length < 2 || end > b.length) return false;
    let q = p + 2;
    if (marker === 0xc0 || marker === 0xc2) {
      if (frame || length < 11 || b[q] !== 8 || !word(q + 1) || !word(q + 3)) return false;
      const count = b[q + 5];
      if ((count !== 1 && count !== 3) || length !== 8 + count * 3) return false;
      let blocks = 0,
        maxH = 0,
        maxV = 0;
      const sampling: [number, number][] = [];
      for (q += 6; q < end; q += 3) {
        const id = b[q],
          h = b[q + 1] >> 4,
          v = b[q + 1] & 15,
          table = b[q + 2];
        if (components.has(id) || h < 1 || h > 4 || v < 1 || v > 4 || table > 3) return false;
        blocks += h * v;
        maxH = Math.max(maxH, h);
        maxV = Math.max(maxV, v);
        sampling.push([h, v]);
        components.set(id, { quant: table, bits: Array.from({ length: 64 }, () => -1) });
      }
      if (blocks > 10 || sampling.some(([h, v]) => maxH % h !== 0 || maxV % v !== 0)) return false;
      frame = marker;
    } else if (marker === 0xdb) {
      if (q === end) return false;
      while (q < end) {
        const info = b[q++],
          precision = info >> 4,
          table = info & 15;
        if (precision > 1 || table > 3 || q + 64 * (precision + 1) > end) return false;
        for (let i = 0; i < 64; i++, q += precision + 1)
          if ((precision ? word(q) : b[q]) === 0) return false;
        quant.set(table, precision);
      }
    } else if (marker === 0xc4) {
      if (q === end) return false;
      while (q < end) {
        const info = b[q++],
          kind = info >> 4,
          table = info & 15;
        if (kind > 1 || table > 3 || q + 16 > end) return false;
        let total = 0,
          slots = 1;
        for (let i = 0; i < 16; i++) {
          const count = b[q++];
          total += count;
          slots = slots * 2 - count;
          // JPEG reserves the all-ones code, so a full/oversubscribed tree is invalid.
          if (slots <= 0) return false;
        }
        if (!total || total > 256 || q + total > end) return false;
        const symbols = new Set<number>();
        for (let i = 0; i < total; i++) {
          const symbol = b[q++];
          if (symbols.has(symbol) || (kind === 0 ? symbol > 11 : (symbol & 15) > 10)) return false;
          symbols.add(symbol);
        }
        huffman.add(info);
      }
    } else if (marker === 0xdd) {
      if (length !== 4) return false;
      restart = word(q);
    } else if (marker === 0xda) {
      if (!frame || length < 8) return false;
      const count = b[q++];
      if (!count || count > components.size || length !== 6 + count * 2) return false;
      const ss = b[end - 3],
        se = b[end - 2],
        ah = b[end - 1] >> 4,
        al = b[end - 1] & 15;
      if (
        frame === 0xc0
          ? ss !== 0 || se !== 63 || ah !== 0 || al !== 0
          : ss > se ||
            se > 63 ||
            (ss === 0 ? se !== 0 : count !== 1) ||
            ah > 13 ||
            al > 13 ||
            (ah !== 0 && al !== ah - 1)
      )
        return false;
      const selected = new Set<number>();
      for (let i = 0; i < count; i++, q += 2) {
        const id = b[q],
          dc = b[q + 1] >> 4,
          ac = b[q + 1] & 15,
          c = components.get(id);
        if (
          !c ||
          selected.has(id) ||
          dc > 3 ||
          ac > 3 ||
          !quant.has(c.quant) ||
          (frame === 0xc0 && quant.get(c.quant) !== 0)
        )
          return false;
        if (
          frame === 0xc0
            ? !huffman.has(dc) || !huffman.has(0x10 | ac)
            : ss === 0
              ? ac !== 0 || (ah === 0 && !huffman.has(dc))
              : dc !== 0 || !huffman.has(0x10 | ac) || c.bits[0] < 0
        )
          return false;
        for (let k = ss; k <= se; k++) {
          if (ah === 0 ? c.bits[k] !== -1 : c.bits[k] !== ah) return false;
          c.bits[k] = al;
        }
        selected.add(id);
      }
      scans++;
      p = end;
      let entropy = 0,
        expectedRestart = 0;
      while (p < b.length) {
        if (b[p] !== 0xff) {
          entropy++;
          p++;
          continue;
        }
        const start = p++;
        while (p < b.length && b[p] === 0xff) p++;
        if (p >= b.length) return false;
        const next = b[p];
        if (next === 0x00) {
          // A literal FF is exactly FF00, not an arbitrary run of fill bytes.
          if (p !== start + 1) return false;
          entropy++;
          p++;
          continue;
        }
        if (next >= 0xd0 && next <= 0xd7) {
          if (!restart || !entropy || next !== 0xd0 + expectedRestart) return false;
          expectedRestart = (expectedRestart + 1) & 7;
          entropy = 0;
          p++;
          continue;
        }
        if (!entropy) return false;
        p = start;
        break;
      }
      if (p >= b.length) return false;
      continue;
    } else if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) {
      return false;
    }
    p = end;
  }
  return false;
}
