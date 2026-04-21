import {
  DEFAULT_DISCOVER_SECTION_IDS,
  DISCOVER_SECTIONS,
  DOMAIN_IMAGE,
  DOMAIN_IMAGE_PROXY,
  type DiscoverSectionDefinition,
} from "./models";

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

export function getDiscoverSectionDefinition(
  sectionId: string,
): DiscoverSectionDefinition | undefined {
  return DISCOVER_SECTIONS.find((section) => section.id === sectionId);
}

export function normalizeDiscoverSectionIds(value: unknown, includeMissing: boolean): string[] {
  const knownSectionIds = new Set(DEFAULT_DISCOVER_SECTION_IDS);
  const normalizedSectionIds: string[] = [];

  if (Array.isArray(value)) {
    for (const sectionId of value) {
      if (
        typeof sectionId === "string" &&
        knownSectionIds.has(sectionId) &&
        !normalizedSectionIds.includes(sectionId)
      ) {
        normalizedSectionIds.push(sectionId);
      }
    }
  }

  if (includeMissing) {
    for (const sectionId of DEFAULT_DISCOVER_SECTION_IDS) {
      if (!normalizedSectionIds.includes(sectionId)) {
        normalizedSectionIds.push(sectionId);
      }
    }
  }

  return normalizedSectionIds;
}

// reimplements rguard beau() image URL decoding
// source: https://readcomiconline.li/Scripts/rguard.min.js?v=1.5.8
// strips anti-scraping padding, decodes the cdn path, then restores auth params
export function beauDecode(url: string): string | null {
  // rguard hardcoded replacements
  url = url.replace(/pw_.g28x/g, "b").replace(/d2pr.x_27/g, "h");

  // already decoded after replacements
  if (url.indexOf("https") === 0) return url;

  // split auth query params before path cleanup
  const qIdx = url.indexOf("?");
  if (qIdx < 0) return null;
  const queryParams = url.substring(qIdx);

  // detect image quality suffix before path cleanup
  const isS0 = url.indexOf("=s0?") > 0;
  let path: string;
  if (isS0) {
    path = url.substring(0, url.indexOf("=s0?"));
  } else {
    const idx = url.indexOf("=s1600?");
    if (idx < 0) return null;
    path = url.substring(0, idx);
  }

  // strip 15-byte prefix and 17-byte middle padding
  path = path.substring(15, 33) + path.substring(50);

  // strip 9-byte padding before the final 2 chars
  path = path.substring(0, path.length - 11) + path[path.length - 2] + path[path.length - 1];

  // decode real cdn path without native atob
  const decoded = b64decode(path);

  // strip 4-byte decoded path padding at position 13
  let result = decoded.substring(0, 13) + decoded.substring(17);

  // restore size suffix
  result = result.substring(0, result.length - 2) + (isS0 ? "=s0" : "=s1600");

  // rguard proxies ip= image urls through ano1 before assigning img src
  const host = queryParams.includes("ip=") ? DOMAIN_IMAGE_PROXY : DOMAIN_IMAGE;
  const imagePath = result.startsWith("/") ? result : `/${result}`;

  return host + imagePath + queryParams;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// atob/Application.base64Decode are unsafe in Paperback here
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
