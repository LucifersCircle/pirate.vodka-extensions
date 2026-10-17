/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import { PaperbackInterceptor, type Request, type Response } from "@paperback/types";
import { validateDocumentURL } from "./MarumaruURLs";
import { authorizeImage } from "./policy";
const documents = new Map<string, number>();
const mime = (response: Response) =>
  Object.entries(response.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] ??
  response.mimeType ??
  "";
export class MarumaruInterceptor extends PaperbackInterceptor {
  async handleRedirect(_request: Request, _response: Response): Promise<Request | undefined> {
    return undefined;
  }
  override async interceptRequest(request: Request): Promise<Request> {
    if (request.method !== "GET" || request.body !== undefined || request.cookies !== undefined)
      throw new Error("Unsupported Marumaru request.");
    if (!documents.has(request.url)) authorizeImage(request.url);
    // Retain Paperback's ordinary defaults. No identity, Origin, Referer or cookie override.
    return request;
  }
  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (response.status !== 200 || response.url !== request.url)
      throw new Error(`Marumaru request failed or redirected (${response.status}).`);
    if (!documents.has(request.url)) {
      authorizeImage(request.url);
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
      if (!/^image\/(jpeg|png|webp)(?:;|$)/i.test(mime(response)) || !valid)
        throw new Error("Marumaru returned non-image content.");
    }
    return data;
  }
}
export async function fetchDocument(url: string): Promise<string> {
  validateDocumentURL(url);
  documents.set(url, (documents.get(url) ?? 0) + 1);
  try {
    const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
    if (response.status !== 200 || response.url !== url)
      throw new Error(`Marumaru document request failed or redirected (${response.status}).`);
    if (data.byteLength > 4000000 || !/^text\/html(?:;|$)/i.test(mime(response)))
      throw new Error("Marumaru returned an invalid HTML document.");
    return Application.arrayBufferToUTF8String(data);
  } finally {
    const count = (documents.get(url) ?? 1) - 1;
    if (count) documents.set(url, count);
    else documents.delete(url);
  }
}
