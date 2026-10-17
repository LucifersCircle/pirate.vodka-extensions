/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

import * as cheerio from "cheerio";
import { validateDocumentURL } from "./MarumaruURLs";
import { fetchDocument } from "./network";

type Snapshot = { ok: boolean; code?: string; url: string; baseURI: string; html?: string };
const RESULT_KEY = "__paperbackMarumaruDOMResult__";

// Independent DOM-only implementation. This is not a token/network hook.
// All source scripts remain in their original order and run in the ordinary WebView.
export function collectDOM(expected: string, key: string): void {
  const target = window as unknown as Record<string, unknown>;
  target[key] = new Promise<Snapshot>((resolve) => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let observer: MutationObserver | undefined;
    let done = false;
    let previous = "";
    let stableAt = 0;
    const chapterRows: string[] = [],
      chapterIDs = new Set<string>();
    let detailIdentity: string | undefined,
      detailHero = "",
      detailCount = "";
    let chapterLength = 0;
    let expectedPage = 1,
      previousRows = "",
      completeDetail: string | undefined;
    const finish = (code: string | undefined, html?: string) => {
      if (done) return;
      done = true;
      if (interval !== undefined) clearInterval(interval);
      if (deadline !== undefined) clearTimeout(deadline);
      observer?.disconnect();
      resolve({
        ok: code === undefined,
        code,
        url: location.href,
        baseURI: document.baseURI,
        html,
      });
    };
    const serialize = (elements: Element[]) =>
      elements.map((element) => element.outerHTML).join("");
    const read = (): string | undefined => {
      if (
        location.href !== expected ||
        document.URL !== expected ||
        document.baseURI !== expected
      ) {
        finish("document-identity");
        return;
      }
      const path = location.pathname;
      const pager = () => serialize([...document.querySelectorAll("a.pager-btn")]);
      if (/^\/manhwa\/[1-9]\d*\/[1-9]\d*$/.test(path)) {
        const cuts = [...document.querySelectorAll(".vw-cut.theme-viewer-image")];
        if (!cuts.length) return;
        if (cuts.length > 1000) {
          finish("reader-limit");
          return;
        }
        const pending = cuts.find((cut) => {
          const images = cut.querySelectorAll("img");
          const image = images[0];
          return (
            images.length !== 1 ||
            !image?.complete ||
            image.naturalWidth <= 0 ||
            image.naturalHeight <= 0
          );
        });
        if (pending) {
          pending.scrollIntoView({ block: "center" });
          return;
        }
        return serialize(cuts);
      }
      if (/^\/manhwa\/[1-9]\d*$/.test(path)) {
        const heroes = document.querySelectorAll(".hero-v2"),
          sections = document.querySelectorAll(".ep-section");
        const hero = heroes[0],
          section = sections[0];
        if (!hero?.querySelector(".hero-v2-title") || !section) return undefined;
        if (heroes.length !== 1 || sections.length !== 1)
          throw new Error("Marumaru detail identity is ambiguous");
        const counts = section.querySelectorAll(".ep-section-count"),
          count = counts[0];
        const rows = [...section.querySelectorAll("a.ep-row-v2-link")];
        if (!count || !rows.length || section.querySelector(".ep-notice-body")) return undefined;
        const rawCount = count.textContent?.trim() ?? "",
          total = Number(rawCount);
        if (
          counts.length !== 1 ||
          !/^[1-9]\d*$/.test(rawCount) ||
          !Number.isSafeInteger(total) ||
          total > 10000
        )
          throw new Error("Marumaru chapter count is invalid or exceeds its limit");
        const key = (href: string | null): string => {
          const path = href?.startsWith(expected + "/") ? href.slice(location.origin.length) : href;
          const prefix = location.pathname + "/";
          if (!path?.startsWith(prefix) || !/^[1-9]\d*$/.test(path.slice(prefix.length)))
            throw new Error("Marumaru chapter link escaped title identity");
          return path.slice(prefix.length);
        };
        const first = hero.querySelectorAll(".hero-v2-actions-bottom a.cta-ghost"),
          latest = hero.querySelectorAll(".hero-v2-actions-bottom a.cta-primary");
        const firstLink = first[0],
          latestLink = latest[0];
        if (first.length !== 1 || latest.length !== 1 || !firstLink || !latestLink)
          throw new Error("Marumaru chapter endpoints unavailable");
        const firstID = key(firstLink.getAttribute("href")),
          latestID = key(latestLink.getAttribute("href"));
        const identity = JSON.stringify([
          total,
          firstID,
          latestID,
          hero.querySelector(".hero-v2-title")?.textContent,
          hero.querySelector(".hero-v2-thumb img")?.getAttribute("src"),
          hero.querySelector(".hero-v2-adult")?.textContent ?? "",
        ]);
        if (detailIdentity !== undefined && detailIdentity !== identity)
          throw new Error("Marumaru detail changed during chapter pagination");
        if (detailIdentity === undefined) {
          detailIdentity = identity;
          detailHero = hero.outerHTML;
          detailCount = count.outerHTML;
        }
        if (completeDetail !== undefined) return completeDetail;
        const pagers = section.querySelectorAll(".pager"),
          pager = pagers[0],
          active = pager?.querySelectorAll("a.pager-num.is-active");
        if (pagers.length > 1 || (pager && active?.length !== 1))
          throw new Error("Marumaru chapter pagination is ambiguous");
        const pageNumber = pager ? Number(active?.[0]?.textContent?.trim()) : 1;
        if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 1000)
          throw new Error("Marumaru chapter page is invalid");
        if (pageNumber !== expectedPage) {
          if (previousRows && pageNumber === expectedPage - 1) return undefined;
          throw new Error("Marumaru chapter page changed unexpectedly");
        }
        const ids = rows.map((row) => key(row.getAttribute("href"))),
          signature = ids.join(",");
        // The page badge updates before the asynchronous row replacement.
        if (previousRows && signature === previousRows) return undefined;
        if (new Set(ids).size !== ids.length || ids.some((value) => chapterIDs.has(value)))
          throw new Error("Marumaru chapter pagination repeats an identity");
        if (!chapterRows.length && ids[0] !== latestID)
          throw new Error("Marumaru chapter list does not begin at the latest episode");
        rows.forEach((row) => {
          chapterIDs.add(key(row.getAttribute("href")));
          const html = row.outerHTML;
          chapterLength += html.length;
          if (chapterLength > 4000000)
            throw new Error("Marumaru chapter snapshot exceeds its limit");
          chapterRows.push(html);
        });
        if (chapterRows.length > total)
          throw new Error("Marumaru chapter inventory exceeds its advertised count");
        const next = pager
          ? [...pager.querySelectorAll<HTMLAnchorElement>("a.pager-btn")].filter(
              (link) => link.textContent?.trim() === "›",
            )
          : [];
        if (next.length > 1) throw new Error("Marumaru chapter continuation is ambiguous");
        const nextLink = next[0],
          enabled = !!nextLink && nextLink.getAttribute("aria-disabled") !== "true";
        if (chapterRows.length === total) {
          if (
            enabled ||
            (pager && (!nextLink || nextLink.getAttribute("aria-disabled") !== "true")) ||
            ids[ids.length - 1] !== firstID
          )
            throw new Error("Marumaru chapter inventory lacks a confirmed ending");
          completeDetail =
            detailHero +
            detailCount +
            chapterRows.join("") +
            (document.querySelector(".cs-rating-card")?.outerHTML ?? "");
          return completeDetail;
        }
        if (
          !enabled ||
          !nextLink ||
          nextLink.getAttribute("href") !== `#page-${expectedPage + 1}` ||
          expectedPage >= 1000
        )
          throw new Error("Marumaru complete chapter continuation unavailable");
        previousRows = signature;
        expectedPage++;
        nextLink.click();
        return undefined;
      }
      if (path === "/search") {
        const forms = document.querySelectorAll("form.search-page-form");
        const grid = document.querySelector(".search-results-grid");
        const count = document.querySelector(".count");
        if (forms.length !== 1 || !count || !grid?.querySelector("a.card")) return;
        // Serialize the source's actual search form, not the unrelated global header input.
        return forms[0]!.outerHTML + grid.outerHTML + count.outerHTML + pager();
      }
      const cards = [...document.querySelectorAll("a[data-work-card]")];
      return cards.length ? serialize(cards) + pager() : undefined;
    };
    const inspect = () => {
      if (done) return;
      try {
        const html = read();
        if (done) return;
        if (html === undefined) {
          previous = "";
          stableAt = 0;
          return;
        }
        if (html.length > 4000000) {
          finish("snapshot-limit");
          return;
        }
        if (html !== previous) {
          previous = html;
          stableAt = Date.now();
          return;
        }
        if (Date.now() - stableAt >= 450) finish(undefined, html);
      } catch {
        finish("dom-read-failed");
      }
    };
    observer = new MutationObserver(inspect);
    observer.observe(document, { childList: true, subtree: true, attributes: true });
    interval = setInterval(inspect, 150);
    deadline = setTimeout(() => finish("render-timeout"), 18000);
    inspect();
  });
}

export function prepareHTML(html: string, url: string): string {
  validateDocumentURL(url);
  if (html.length > 4000000) throw new Error("Marumaru document exceeds its size limit.");
  const $ = cheerio.load(html);
  const modules = $('script[type="module"][src]')
    .toArray()
    .filter((element) => {
      const src = $(element).attr("src") ?? "";
      return /^(?:https:\/\/marumaru105\.com)?\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(src);
    });
  if (
    $("#root").length !== 1 ||
    modules.length !== 1 ||
    $("base").length ||
    !/<head(?:\s[^>]*)?>/i.test(html)
  )
    throw new Error(
      "Marumaru returned a non-application document (no usable app root/module). The native document request is not ready for DOM rendering.",
    );
  const bootstrap = `(${collectDOM.toString()})(${JSON.stringify(url)},${JSON.stringify(RESULT_KEY)});`;
  // Preserve original markup/scripts. Do not synthesize an app shell from another browser.
  return html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}<script>${bootstrap}</script>`);
}

let queue: Promise<unknown> = Promise.resolve();
export function renderedHTML(url: string): Promise<string> {
  const result = queue.then(async () => {
    validateDocumentURL(url);
    const html = prepareHTML(await fetchDocument(url), url);
    const executed = await Application.executeInWebView({
      source: { html, baseUrl: url, loadCSS: true, loadImages: true },
      inject: `return window[${JSON.stringify(RESULT_KEY)}];`,
      storage: { cookies: [] },
    });
    // Deliberately ignore returned cookies. They are not copied into another transport.
    const result = executed.result as Snapshot | undefined;
    if (
      !result ||
      result.ok !== true ||
      result.url !== url ||
      result.baseURI !== url ||
      typeof result.html !== "string"
    ) {
      const code = result?.code;
      const safe = [
        "document-identity",
        "reader-limit",
        "chapter-limit",
        "snapshot-limit",
        "dom-read-failed",
        "render-timeout",
      ].includes(code ?? "")
        ? code
        : "invalid-result";
      throw new Error(`Marumaru native DOM rendering failed (${safe}).`);
    }
    if (!result.html || result.html.length > 4000000)
      throw new Error("Marumaru returned an invalid DOM snapshot.");
    return result.html;
  });
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
