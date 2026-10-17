/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
import {
  BasicRateLimiter,
  CloudflareError,
  PaperbackInterceptor,
  type Request,
  type Response,
} from "@paperback/types";
import { authorizeImage } from "./policy";
import { binaryCoverWebP, binaryCoverJPEG } from "./images";
const metadata = new Map<string, number>();
const mime = (response: Response) =>
  Object.entries(response.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] ??
  response.mimeType ??
  "";
function apiURL(url: string): void {
  if (
    !/^https:\/\/marumaru105\.com\/api\/works\/[1-9]\d*$/.test(url) &&
    !/^https:\/\/marumaru105\.com\/api\/works\?mediaType=MANHWA&page=(?:0|[1-9]\d*)&size=49$/.test(
      url,
    ) &&
    !/^https:\/\/marumaru105\.com\/api\/search\?q=(?:[A-Za-z0-9_.!~*'()-]|%[0-9A-F]{2})+&page=(?:0|[1-9]\d*)&media=MANHWA&sort=LATEST$/.test(
      url,
    ) &&
    !/^https:\/\/api\.storagewebtoon\.store\/api\/v1\/reader\/A2\/(?:works|episodes)\/[1-9]\d*$/.test(
      url,
    )
  )
    throw new Error("Unsupported Marumaru API request.");
}
export class MarumaruInterceptor extends PaperbackInterceptor {
  async handleRedirect(_request: Request, _response: Response): Promise<Request | undefined> {
    return undefined;
  }
  override async interceptRequest(request: Request): Promise<Request> {
    const cookies = request.cookies;
    if (
      request.method !== "GET" ||
      request.body !== undefined ||
      (cookies !== undefined &&
        (!cookies ||
          typeof cookies !== "object" ||
          Array.isArray(cookies) ||
          Reflect.ownKeys(cookies).length))
    )
      throw new Error("Unsupported Marumaru request.");
    if (metadata.has(request.url)) apiURL(request.url);
    else authorizeImage(request.url);
    if (!Object.keys(request.headers ?? {}).some((key) => key.toLowerCase() === "user-agent")) {
      const userAgent = await Application.getDefaultUserAgent();
      if (typeof userAgent !== "string" || !userAgent.trim() || /[\r\n]/.test(userAgent))
        throw new Error("Paperback did not provide a valid default User-Agent.");
      request.headers = { ...request.headers, "user-agent": userAgent };
    }
    return request;
  }
  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (response.url !== request.url) throw new Error("Marumaru response redirected.");
    if (metadata.has(request.url)) apiURL(request.url);
    else authorizeImage(request.url);
    if (
      Object.entries(response.headers).some(
        ([key, value]) =>
          key.toLowerCase() === "cf-mitigated" && value.toLowerCase() === "challenge",
      )
    )
      throw new CloudflareError({
        url: request.url,
        method: "GET",
        headers: { "user-agent": await Application.getDefaultUserAgent() },
      });
    if (response.status !== 200) throw new Error(`Marumaru request failed (${response.status}).`);
    if (!metadata.has(request.url)) {
      const b = new Uint8Array(data);
      const valid =
        (b[0] === 255 && b[1] === 216 && b[2] === 255) ||
        (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) ||
        (b[0] === 82 &&
          b[1] === 73 &&
          b[2] === 70 &&
          b[3] === 70 &&
          b[8] === 87 &&
          b[9] === 69 &&
          b[10] === 66 &&
          b[11] === 80);
      const binaryCover =
        /^https:\/\/peer\.storagewebtoon\.store\/(?:manhwa|webtoon)\/[1-9]\d*\/[A-Za-z0-9._-]+$/.test(
          request.url,
        ) &&
        /^application\/octet-stream(?:;|$)/i.test(mime(response)) &&
        (binaryCoverWebP(data) || binaryCoverJPEG(data));
      if (!binaryCover && (!/^image\/(jpeg|png|webp)(?:;|$)/i.test(mime(response)) || !valid))
        throw new Error("Marumaru returned non-image content.");
    }
    return data;
  }
}
export async function fetchJSON(url: string): Promise<unknown> {
  apiURL(url);
  metadata.set(url, (metadata.get(url) ?? 0) + 1);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (url.startsWith("https://marumaru105.com/")) headers["X-Site"] = "marumaru";
    const [response, data] = await Application.scheduleRequest({ url, method: "GET", headers });
    if (
      response.status !== 200 ||
      response.url !== url ||
      data.byteLength > 4000000 ||
      !/^application\/json(?:;|$)/i.test(mime(response))
    )
      throw new Error("Marumaru returned an invalid API response.");
    return JSON.parse(Application.arrayBufferToUTF8String(data)) as unknown;
  } finally {
    const count = (metadata.get(url) ?? 1) - 1;
    if (count) metadata.set(url, count);
    else metadata.delete(url);
  }
}

// The CDN uses opaque cover filenames. Classify by exact issued provenance,
// not a filename extension, so thumbnails never occupy the metadata queue.
export class MarumaruRateLimiter extends BasicRateLimiter {
  override async interceptRequest(request: Request): Promise<Request> {
    if (!metadata.has(request.url)) {
      authorizeImage(request.url);
      return request;
    }
    return super.interceptRequest(request);
  }
}
