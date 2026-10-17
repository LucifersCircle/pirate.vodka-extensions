/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { PaperbackInterceptor, type Request, type Response } from "@paperback/types";
import { BASE_URL } from "./models";
import { authorizeImage } from "./images";
import { sourceURL } from "./urls";
const metadataRequests = new Map<string, number>();
export class MangaStashInterceptor extends PaperbackInterceptor {
  // Public source URLs are exact identities, not permission to follow a new destination.
  async handleRedirect(_proposed: Request, _response: Response): Promise<Request | undefined> {
    return undefined;
  }
  override async interceptRequest(request: Request): Promise<Request> {
    const userAgent = await Application.getDefaultUserAgent();
    const url = sourceURL(request.url);
    if (request.method !== "GET" || request.body !== undefined || request.cookies !== undefined)
      throw new Error("Unsupported MangaStash request.");
    if (!metadataRequests.has(url.href)) authorizeImage(url.href);
    request.headers = {
      ...request.headers,
      referer: BASE_URL + "/",
      origin: BASE_URL,
      "user-agent": userAgent,
    };
    return request;
  }
  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (response.status !== 200 || response.url !== request.url)
      throw new Error("MangaStash request failed or redirected (" + response.status + ").");
    if (sourceURL(request.url).pathname.startsWith("/content/")) {
      authorizeImage(request.url);
      const type =
        Object.entries(response.headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ??
        response.mimeType ??
        "";
      const b = new Uint8Array(data),
        valid =
          (b[0] === 255 && b[1] === 216 && b[2] === 255) ||
          (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) ||
          (b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70) ||
          (b[4] === 102 && b[5] === 116 && b[6] === 121 && b[7] === 112);
      if (!/^image\/(jpeg|png|webp|avif)(?:;|$)/i.test(type) || !valid)
        throw new Error("MangaStash returned non-image reader content.");
    }
    return data;
  }
}
export const fetchText = async (url: string): Promise<string> => {
  sourceURL(url);
  metadataRequests.set(url, (metadataRequests.get(url) ?? 0) + 1);
  let response: Response, data: ArrayBuffer;
  try {
    [response, data] = await Application.scheduleRequest({ url, method: "GET" });
  } finally {
    const count = (metadataRequests.get(url) ?? 1) - 1;
    if (count) metadataRequests.set(url, count);
    else metadataRequests.delete(url);
  }
  if (response.status !== 200 || response.url !== url)
    throw new Error("MangaStash request failed or redirected (" + response.status + ").");
  const type =
    Object.entries(response.headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ??
    response.mimeType ??
    "";
  if (!/^text\/html(?:;|$)/i.test(type))
    throw new Error("MangaStash returned a non-HTML response.");
  const text = Application.arrayBufferToUTF8String(data);
  if (/cf-chl-|<title>Just a moment|<title>Access denied/i.test(text))
    throw new Error("MangaStash requires website verification. Open the source website.");
  return text;
};
