/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Cloudflare lifecycle adapted from Kagane, Copyright © 2026 Inkdex. */
import { CloudflareError, PaperbackInterceptor, URL } from "@paperback/types";
import type { Request, Response } from "@paperback/types";
import { BASE_URL } from "./models";

export function isSiteURL(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return (
    host === "en-hijala.com" || host === "api.en-hijala.com" || host === "storage.en-hijala.com"
  );
}

export class HijalaInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    if (!isSiteURL(request.url)) return request;
    return {
      ...request,
      headers: {
        ...request.headers,
        referer: `${BASE_URL}/`,
        "user-agent": await Application.getDefaultUserAgent(),
      },
    };
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    const challenge = Object.entries(response.headers ?? {}).some(
      ([key, value]) => key.toLowerCase() === "cf-mitigated" && value.toLowerCase() === "challenge",
    );
    if (isSiteURL(request.url) && challenge) {
      throw new CloudflareError({
        url: `${BASE_URL}/`,
        method: "GET",
        headers: { "user-agent": await Application.getDefaultUserAgent() },
      });
    }
    return data;
  }
}

export async function fetchText(url: string): Promise<string> {
  const [response, data] = await Application.scheduleRequest({ url, method: "GET" });
  if (response.status !== 200) throw new Error(`Hijala returned HTTP ${response.status}: ${url}`);
  return Application.arrayBufferToUTF8String(data);
}

export async function fetchJSON(url: string): Promise<unknown> {
  return JSON.parse(await fetchText(url));
}
