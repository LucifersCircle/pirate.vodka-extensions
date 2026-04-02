import type { CookieStorageInterceptor, Request, Response } from "@paperback/types";
import { CloudflareError, PaperbackInterceptor } from "@paperback/types";
import { DOMAIN, DOMAIN_API } from "../implementations/shared/models";

// non-standard constructor and handleRedirect are required for vShield PoW challenge handling
export class VortexScansInterceptor extends PaperbackInterceptor {
  private cookieStorage: CookieStorageInterceptor;

  constructor(id: string, cookieStorage: CookieStorageInterceptor) {
    super(id);
    this.cookieStorage = cookieStorage;
  }

  async interceptRequest(request: Request): Promise<Request> {
    return {
      ...request,
      headers: {
        ...request.headers,
        referer: `${DOMAIN}/`,
        "user-agent": await Application.getDefaultUserAgent(),
      },
    };
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    if (response.headers?.["cf-mitigated"] === "challenge") {
      throw new CloudflareError({
        url: request.url,
        method: request.method ?? "GET",
        headers: {
          "user-agent": await Application.getDefaultUserAgent(),
        },
      });
    }

    // vshield PoW challenge returns 200 with challenge HTML instead of real content
    if (request.url.startsWith(DOMAIN) || request.url.startsWith(DOMAIN_API)) {
      const body = Application.arrayBufferToUTF8String(data);
      if (typeof body === "string" && body.includes("vShield")) {
        throw new CloudflareError({
          url: request.url,
          method: request.method ?? "GET",
          headers: {
            "user-agent": await Application.getDefaultUserAgent(),
          },
        });
      }
    }

    return data;
  }

  // vshield redirect handler — extracts Set-Cookie from 302 and attaches to redirect
  async handleRedirect(
    proposedRequest: Request,
    redirectedResponse: Response,
  ): Promise<Request | undefined> {
    const respHeaders = redirectedResponse.headers ?? {};
    const setCookieKey = Object.keys(respHeaders).find((k) => k.toLowerCase() === "set-cookie");
    const setCookie = setCookieKey ? respHeaders[setCookieKey] : undefined;
    if (!setCookie) return proposedRequest;

    const [nameValue] = setCookie.split(";");
    if (!nameValue) return proposedRequest;

    const [name, ...rest] = nameValue.split("=");
    if (!name || rest.length === 0) return proposedRequest;

    const value = rest.join("=");

    this.cookieStorage.setCookie({
      name,
      value,
      domain: new globalThis.URL(DOMAIN).hostname,
      path: "/",
    });

    const existing = proposedRequest.headers?.["cookie"] ?? "";
    const cookieHeader = existing ? `${existing}; ${name}=${value}` : `${name}=${value}`;

    return {
      ...proposedRequest,
      headers: {
        ...proposedRequest.headers,
        cookie: cookieHeader,
      },
    };
  }
}

export async function fetchJSON<T>(request: Request): Promise<T> {
  const [response, buffer] = await Application.scheduleRequest(request);

  if (response.status !== 200) {
    throw new Error(`Request failed with status ${response.status}: ${request.url}`);
  }

  const data = Application.arrayBufferToUTF8String(buffer);

  try {
    return typeof data === "string" ? (JSON.parse(data) as T) : (data as T);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${request.url}: ${reason}`);
  }
}

export async function fetchText(request: Request): Promise<string> {
  const [response, buffer] = await Application.scheduleRequest(request);

  if (response.status !== 200) {
    throw new Error(`Request failed with status ${response.status}: ${request.url}`);
  }

  const data = Application.arrayBufferToUTF8String(buffer);
  return typeof data === "string" ? data : String(data);
}
