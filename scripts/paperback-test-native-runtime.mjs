// alpha.92 injects the outer Promise into its VM, but async source methods return
// the VM's intrinsic Promise. SDK SearchFilterForm then mistakes a Promise for an
// array. Remove only that injected binding so the VM uses its own native Promise.
// No SDK method, form, transport, response, assertion or Promise implementation is replaced.
import vm from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
for (const name of ["@paperback/toolchain", "@paperback/types", "@paperback/runtime-polyfills"]) {
  if (
    JSON.parse(readFileSync(require.resolve(`${name}/package.json`), "utf8")).version !==
    "1.0.0-alpha.92"
  )
    throw new Error("Paperback native test runtime requires a reviewed alpha.92 SDK");
}
const base = import.meta.resolve("@paperback/toolchain/package.json");
const host = new URL("./dist/src/toolchain/test/test.mjs", base);
if (
  createHash("sha256").update(readFileSync(host)).digest("hex") !==
  "f1d0504212b5aa0cb5e214c810781c8223530fee7ce20a4962965140c0a92edf"
)
  throw new Error("Paperback CLI test host changed; review the native realm correction");
const { Logger } = await import(new URL("./dist/src/toolchain/test/logger.mjs", base));
const createContext = vm.createContext;
vm.createContext = function paperbackNativeTestContext(sandbox, ...options) {
  const logger = sandbox && Object.getOwnPropertyDescriptor(sandbox, "logger")?.value;
  if (!(logger instanceof Logger)) return Reflect.apply(createContext, this, [sandbox, ...options]);
  const application = Object.getOwnPropertyDescriptor(sandbox, "Application")?.value;
  const promise = Object.getOwnPropertyDescriptor(sandbox, "Promise");
  if (
    !application ||
    typeof application.scheduleRequest !== "function" ||
    typeof application.registerInterceptor !== "function" ||
    typeof application.SelectorRegistry?.selector !== "function" ||
    !promise ||
    promise.value !== Promise ||
    !promise.configurable ||
    !promise.writable
  )
    throw new Error("Unexpected Paperback CLI context; refusing native realm correction");
  delete sandbox.Promise;
  return Reflect.apply(createContext, this, [sandbox, ...options]);
};
