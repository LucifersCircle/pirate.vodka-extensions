import CryptoJS from "crypto-js";

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

export function extractNumericId(html: string): string | undefined {
  return html.match(/data-manga-id="(\d+)"/)?.[1];
}

export function generateToken(): { token: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const hour = new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "");
  const secret = "mng_ch_" + hour;
  const hash = CryptoJS.MD5(timestamp.toString() + secret)
    .toString()
    .substring(0, 16);
  return { token: hash, timestamp };
}

export function parseRelativeDate(str: string): Date {
  const now = new Date();
  const s = str.trim().toLowerCase();

  if (/^(just now|a moment ago|moments? ago)$/.test(s)) return now;

  const match = s.match(/^(?:(\d+)|an?)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
  if (!match) return now;

  const amount = match[1] !== undefined ? parseInt(match[1], 10) : 1;
  const unit = match[2];
  const ms = now.getTime();

  switch (unit) {
    case "second":
      return new Date(ms - amount * 1_000);
    case "minute":
      return new Date(ms - amount * 60_000);
    case "hour":
      return new Date(ms - amount * 3_600_000);
    case "day":
      return new Date(ms - amount * 86_400_000);
    case "week":
      return new Date(ms - amount * 7 * 86_400_000);
    case "month":
      return new Date(ms - amount * 30 * 86_400_000);
    case "year":
      return new Date(ms - amount * 365 * 86_400_000);
    default:
      return now;
  }
}
