export function applyMixins(derivedCtor: any, constructors: any[]) {
  constructors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name) || Object.create(null),
      );
    });
  });
}

export function slugFromUrl(url: string): string {
  return url.split("/").filter(Boolean).pop() ?? url;
}

export function cleanText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Reimplements the `beau()` function from rguard.min.js to deobfuscate image URLs.
 * See https://readcomiconline.li/Scripts/rguard.min.js?v=1.5.8
 *
 * The site serves image URLs as obfuscated strings with random anti-scraping padding
 * inserted at known positions. This function strips the padding, base64 decodes the
 * cleaned string to reveal the real blogspot CDN path (e.g. /pw/AP1GczMn4wam...),
 * then reconstructs the full URL with auth query params.
 *
 * Processing steps:
 *   1. Replace hardcoded obfuscation tokens: pw_.g28x -> 'b', d2pr.x_27 -> 'h'
 *   2. If the result already starts with "https", return as-is (already decoded)
 *   3. Separate query params (?rhlupa=<base64 IP+timestamp>&rnvuka=<base64 user-agent>)
 *   4. Strip the size suffix (=s0 or =s1600) before the query string
 *   5. step1(): Strip 15 padding chars from the start and 17 padding chars at position 33-49
 *   6. step2(): Strip 9 padding chars before the last 2 characters
 *   7. Base64 decode the cleaned string to get the real CDN path
 *   8. Strip 4 padding chars at position 13 in the decoded result
 *   9. Append the size suffix (=s0 or =s1600) replacing the last 2 decoded chars
 *  10. Reconstruct full URL: https://2.bp.blogspot.com/ + path + query params
 */
export function beauDecode(url: string): string | null {
  // rguard.min.js hardcoded replacements
  url = url.replace(/pw_.g28x/g, "b").replace(/d2pr.x_27/g, "h");

  // URL already fully formed after replacements — no further decoding needed
  if (url.indexOf("https") === 0) return url;

  // Separate auth query params (rhlupa = base64 IP+timestamp, rnvuka = base64 user-agent)
  const qIdx = url.indexOf("?");
  if (qIdx < 0) return null;
  const queryParams = url.substring(qIdx);

  // Determine image quality from size param and strip it
  // =s0 is default/thumbnail quality, =s1600 is high quality (1600px)
  const isS0 = url.indexOf("=s0?") > 0;
  let path: string;
  if (isS0) {
    path = url.substring(0, url.indexOf("=s0?"));
  } else {
    const idx = url.indexOf("=s1600?");
    if (idx < 0) return null;
    path = url.substring(0, idx);
  }

  // step1: strip 15 anti-scraping padding prefix and 17 padding chars at position 33-49
  path = path.substring(15, 33) + path.substring(50);

  // step2: strip 9 anti-scraping padding before the last 2 chars
  path = path.substring(0, path.length - 11) + path[path.length - 2] + path[path.length - 1];

  // Base64 decode to reveal the real CDN path (e.g. /pw/AP1GczMn4wam...)
  // Native atob() causes stack overflow in Paperback runtime,
  // Application.base64Decode() returns a polyfill ArrayBuffer incompatible with native calls
  const decoded = b64decode(path);

  // Strip 4 anti-scraping padding chars at position 13 in the decoded path
  let result = decoded.substring(0, 13) + decoded.substring(17);

  // Replace last 2 chars with the size suffix
  result = result.substring(0, result.length - 2) + (isS0 ? "=s0" : "=s1600");

  // Reconstruct the full blogspot CDN URL
  return "https://2.bp.blogspot.com/" + result + queryParams;
}

/**
 * Base64 decoder (drop-in atob replacement).
 * Needed because Paperback's native atob() causes a stack overflow
 * and Application.base64Decode() returns a polyfill ArrayBuffer
 * that lacks a native backing pointer for arrayBufferToUTF8String().
 */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function b64decode(input: string): string {
  let output = "";
  const str = input.replace(/=+$/, "");
  const remainder = str.length % 4;
  const fullLen = str.length - remainder;

  for (let i = 0; i < fullLen; i += 4) {
    const bits =
      (B64.indexOf(str[i]) << 18) |
      (B64.indexOf(str[i + 1]) << 12) |
      (B64.indexOf(str[i + 2]) << 6) |
      B64.indexOf(str[i + 3]);
    output += String.fromCharCode((bits >> 16) & 0xff, (bits >> 8) & 0xff, bits & 0xff);
  }

  if (remainder === 2) {
    const bits = (B64.indexOf(str[fullLen]) << 18) | (B64.indexOf(str[fullLen + 1]) << 12);
    output += String.fromCharCode((bits >> 16) & 0xff);
  } else if (remainder === 3) {
    const bits =
      (B64.indexOf(str[fullLen]) << 18) |
      (B64.indexOf(str[fullLen + 1]) << 12) |
      (B64.indexOf(str[fullLen + 2]) << 6);
    output += String.fromCharCode((bits >> 16) & 0xff, (bits >> 8) & 0xff);
  }

  return output;
}
