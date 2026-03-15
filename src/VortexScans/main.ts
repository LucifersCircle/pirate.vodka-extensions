import type { Cookie, Extension, MangaProviding, Request } from "@paperback/types";
import { BasicRateLimiter, CookieStorageInterceptor } from "@paperback/types";
import { ChapterProvider } from "./implementations/chapter-providing/main";
import { DiscoverProvider } from "./implementations/discover-section/main";
import { MangaProvider } from "./implementations/manga/main";
import { SearchProvider } from "./implementations/search-results/main";
import { applyMixins } from "./implementations/shared/utils";
import { VortexScansInterceptor } from "./services/network";

export const VORTEX_DOMAIN = "https://vortexscans.org";
export const VORTEX_API_BASE = "https://api.vortexscans.org/api";

export interface VortexScansImplementation
  extends SearchProvider, MangaProvider, ChapterProvider, DiscoverProvider {}

export class VortexScansExtension implements Omit<Extension, keyof MangaProviding> {
  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });
  globalRateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 4,
    bufferInterval: 1,
    ignoreImages: true,
  });
  vortexInterceptor = new VortexScansInterceptor(
    "vortex-interceptor",
    this.cookieStorageInterceptor,
  );

  async initialise(): Promise<void> {
    this.globalRateLimiter.registerInterceptor();
    this.cookieStorageInterceptor.registerInterceptor();
    this.vortexInterceptor.registerInterceptor();

    Application.setRedirectHandler(Application.Selector(this.vortexInterceptor, "handleRedirect"));
  }

  async saveCloudflareBypassCookies(cookies: Cookie[]): Promise<void> {
    for (const cookie of cookies) {
      if (
        cookie.name.startsWith("cf") ||
        cookie.name.startsWith("_cf") ||
        cookie.name.startsWith("__cf") ||
        cookie.name.includes("vShield")
      ) {
        this.cookieStorageInterceptor.setCookie(cookie);
      }
    }
  }

  async bypassCloudflareRequest(request: Request): Promise<Request> {
    return request;
  }
}

applyMixins(VortexScansExtension, [
  SearchProvider,
  MangaProvider,
  ChapterProvider,
  DiscoverProvider,
]);

export const VortexScans = new VortexScansExtension();
