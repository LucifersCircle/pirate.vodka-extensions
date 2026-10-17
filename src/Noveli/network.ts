/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import {
  CloudflareError,
  PaperbackInterceptor,
  type Request,
  type Response,
} from "@paperback/types";
import { BASE_URL } from "./models";
import { isMetadataURL } from "./urls";
import { nativePolicy, type ContentPolicy } from "./policy";
const responseType = (response: Response): string =>
  Object.entries(response.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] ??
  response.mimeType ??
  "";
const checkResponse = (request: Request, response: Response): void => {
  if (response.url !== request.url)
    throw new Error(`Noveli request failed or redirected (${response.status}).`);
  if (
    response.status === 403 &&
    /^https:\/\/noveli\.to\/api\/novels\/[1-9]\d*\/chapters\/[1-9]\d*$/.test(request.url)
  )
    throw new Error("Noveli refused access to this chapter (403). Please read it on the website.");
  if (response.status !== 200)
    throw new Error(`Noveli request failed or redirected (${response.status}).`);
};
export class NoveliInterceptor extends PaperbackInterceptor {
  constructor(
    id: string,
    private policy: ContentPolicy,
  ) {
    super(id);
  }
  async handleRedirect(_request: Request, _response: Response): Promise<Request | undefined> {
    return undefined;
  }
  override async interceptRequest(request: Request): Promise<Request> {
    nativePolicy();
    if (request.method !== "GET" || request.body !== undefined || request.cookies !== undefined)
      throw new Error("Unsupported Noveli request.");
    if (!isMetadataURL(request.url)) this.policy.authorize(request.url);
    request.headers = request.headers ?? {};
    request.headers.referer = `${BASE_URL}/`;
    return request;
  }
  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    nativePolicy();
    const cfMitigated = response.headers?.["cf-mitigated"];
    if (cfMitigated === "challenge") {
      throw new CloudflareError({
        url: request.url,
        method: request.method ?? "GET",
      });
    }
    checkResponse(request, response);
    if (!isMetadataURL(request.url)) {
      this.policy.authorize(request.url);
      const bytes = new Uint8Array(data);
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
      const webp =
        bytes[0] === 82 &&
        bytes[1] === 73 &&
        bytes[2] === 70 &&
        bytes[3] === 70 &&
        bytes[8] === 87 &&
        bytes[9] === 69 &&
        bytes[10] === 66 &&
        bytes[11] === 80;
      const avif =
        bytes[4] === 102 &&
        bytes[5] === 116 &&
        bytes[6] === 121 &&
        bytes[7] === 112 &&
        bytes[8] === 97 &&
        bytes[9] === 118 &&
        bytes[10] === 105 &&
        bytes[11] === 102;
      const mime = responseType(response).split(";")[0].trim().toLowerCase();
      if (
        !(
          (mime === "image/jpeg" && jpeg) ||
          (mime === "image/png" && png) ||
          (mime === "image/webp" && webp) ||
          (mime === "image/avif" && avif)
        )
      )
        throw new Error("Noveli returned an invalid cover image.");
    }
    return data;
  }
}
export const fetchJSON = async (url: string): Promise<unknown> => {
  if (!isMetadataURL(url)) throw new Error("Unsupported Noveli metadata route.");
  const request: Request = { url, method: "GET" };
  const [response, data] = await Application.scheduleRequest(request);
  checkResponse(request, response);
  if (!/^application\/json(?:;|$)/i.test(responseType(response)))
    throw new Error("Noveli did not return JSON content.");
  try {
    return JSON.parse(Application.arrayBufferToUTF8String(data)) as unknown;
  } catch {
    throw new Error("Noveli returned malformed JSON.");
  }
};
