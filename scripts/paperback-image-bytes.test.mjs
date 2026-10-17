import assert from "node:assert/strict";
import test from "node:test";
import { verifyRasterImageBytes } from "../src/tests/image.ts";
// Generated 3x4 infrastructure codec samples, not provider/source fixtures.
const samples = {
  PNG: "iVBORw0KGgoAAAANSUhEUgAAAAMAAAAECAIAAADETxJQAAAAF0lEQVR4nGO0yWtiYGBgYGBgYoABbCwALQoBNAc+s50AAAAASUVORK5CYII=",
  JPEG: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDAooor0Dxz/9k=",
  WEBP: "UklGRjQAAABXRUJQVlA4ICgAAACwAQCdASoDAAQAAUAmJZACdLoABGaAAP7u09+LYpD0P/wG6+LZfAAA",
};
void test("complete raster container checks preserve real PNG/JPEG/WebP dimensions", () => {
  for (const [format, encoded] of Object.entries(samples)) {
    const bytes = Buffer.from(encoded, "base64");
    assert.deepEqual(verifyRasterImageBytes(bytes), {
      format: format === "WEBP" ? "WebP" : format,
      width: 3,
      height: 4,
    });
    for (const truncated of [bytes.subarray(0, 10), bytes.subarray(0, -2)])
      assert.throws(() => verifyRasterImageBytes(truncated));
  }
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from("<html>denied</html>"),
    Buffer.alloc(16 * 1024 * 1024 + 1),
  ]) {
    assert.throws(() => verifyRasterImageBytes(bytes));
  }
  const zero = Buffer.from(samples.PNG, "base64");
  zero.writeUInt32BE(0, 16);
  assert.throws(() => verifyRasterImageBytes(zero), /dimensions/);
});

void test("PNG and WebP cannot hide missing image data or malformed later chunks", () => {
  const png = Buffer.from(samples.PNG, "base64");
  const noData = Buffer.concat([png.subarray(0, 33), png.subarray(-12)]);
  assert.throws(() => verifyRasterImageBytes(noData), /image data/);
  const malformedPNG = Buffer.from(png);
  malformedPNG.writeUInt32BE(0xffffffff, 33);
  assert.throws(() => verifyRasterImageBytes(malformedPNG), /chunk/);
  const webp = Buffer.from(samples.WEBP, "base64");
  const late = Buffer.concat([webp, Buffer.from("JUNK"), Buffer.from([255, 255, 255, 127])]);
  late.writeUInt32LE(late.length - 8, 4);
  assert.throws(() => verifyRasterImageBytes(late), /chunk/);
  const headerOnly = Buffer.alloc(30);
  headerOnly.write("RIFF");
  headerOnly.writeUInt32LE(22, 4);
  headerOnly.write("WEBPVP8X", 8);
  headerOnly.writeUInt32LE(10, 16);
  assert.throws(() => verifyRasterImageBytes(headerOnly), /frame/);
});

void test("unsupported formats and JPEG with dimensions but no scan fail closed", () => {
  for (const bytes of [
    Buffer.from("GIF89a" + "0".repeat(100)),
    Buffer.from("\x00\x00\x00\x20ftypavif" + "0".repeat(100)),
    Buffer.from([0xff, 0x0a, ...Array(100).fill(0)]),
  ])
    assert.throws(() => verifyRasterImageBytes(bytes));
  const jpeg = Buffer.from(samples.JPEG, "base64");
  const scan = jpeg.indexOf(Buffer.from([0xff, 0xda]));
  assert(scan > 0);
  assert.throws(
    () =>
      verifyRasterImageBytes(Buffer.concat([jpeg.subarray(0, scan), Buffer.from([0xff, 0xd9])])),
    /scan/,
  );
});
