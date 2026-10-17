// Alpha.92's official CLI constructs its own VM Application with no injection
// hook. Decorate only that namespace's unimplemented WebView member; preserve
// runSourceTests, assertions, Logger and the CLI's native result reporting.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ApplicationPolyfill } from "@paperback/runtime-polyfills";
import { createPaperbackTestWebView } from "./paperback-test-webview.mjs";

const require = createRequire(import.meta.url);
const { Logger } = await import(
  new URL(
    "./dist/src/toolchain/test/logger.mjs",
    import.meta.resolve("@paperback/toolchain/package.json"),
  )
);
for (const name of ["@paperback/toolchain", "@paperback/runtime-polyfills"]) {
  if (
    JSON.parse(readFileSync(require.resolve(`${name}/package.json`), "utf8")).version !==
    "1.0.0-alpha.92"
  )
    throw new Error("Paperback test WebView preload requires a reviewed SDK version");
}
const stub = Function.prototype.toString.call(ApplicationPolyfill().executeInWebView);
if (!stub.includes("throw new Error('Not Implemented')"))
  throw new Error("Paperback SDK WebView implementation changed; review the test host");

const host = createPaperbackTestWebView();
const createContext = vm.createContext;
vm.createContext = function paperbackTestContext(sandbox, ...options) {
  const application = sandbox && Object.getOwnPropertyDescriptor(sandbox, "Application")?.value;
  const logger = sandbox && Object.getOwnPropertyDescriptor(sandbox, "logger")?.value;
  if (application && logger instanceof Logger) {
    const descriptor = Object.getOwnPropertyDescriptor(application, "executeInWebView");
    if (
      !descriptor ||
      typeof descriptor.value !== "function" ||
      !descriptor.writable ||
      Function.prototype.toString.call(descriptor.value) !== stub ||
      typeof application.scheduleRequest !== "function" ||
      typeof application.registerInterceptor !== "function"
    )
      throw new Error("Unexpected Paperback CLI Application namespace; refusing WebView override");
    application.executeInWebView = (context) => host.executeInWebView(context);
  }
  return Reflect.apply(createContext, this, [sandbox, ...options]);
};
process.once("beforeExit", () => host.close());
