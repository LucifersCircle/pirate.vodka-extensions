import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "rolldown";

const toolchain = new URL(
  "../node_modules/@paperback/toolchain/dist/src/toolchain/test/",
  import.meta.url,
);
const preload = new URL("./paperback-test-native-runtime.mjs", import.meta.url);

void test("official SDK async form reproduces the alpha.92 realm bug and works with only its native realm restored", async () => {
  const temp = mkdtempSync(join(tmpdir(), "paperback-native-realm-"));
  try {
    const file = join(temp, "source.js");
    // This is the actual SDK class and native async execution, not a replacement form.
    await build({
      input: "native-realm-entry",
      plugins: [
        {
          name: "inline-sdk-contract",
          resolveId(id) {
            if (id === "native-realm-entry") return id;
          },
          load(id) {
            if (id === "native-realm-entry")
              return `
          import { SearchFilterForm } from ${JSON.stringify(new URL("../node_modules/@paperback/types/lib/compat/0.8/searchFilters.js", import.meta.url).pathname)};
          export async function runTests(logger) {
            const pending = (async () => [])();
            logger.log('nativePromise', pending instanceof Promise);
            const form = new SearchFilterForm(undefined, pending);
            await pending; await Promise.resolve();
            try { await form.formDidSubmit(); logger.log('sections', form.getSections()); logger.log('metadata', form.getSearchQueryMetadata()); }
            catch(error) { logger.log('error', String(error)); }
          }`;
          },
        },
      ],
      output: { file, format: "iife", name: "source" },
    });
    const run = (patched) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            ...(patched ? ["--import", preload.pathname] : []),
            "--input-type=module",
            "--eval",
            `
        import {runSourceTests} from ${JSON.stringify(new URL("test.mjs", toolchain).href)};
        import {Logger} from ${JSON.stringify(new URL("logger.mjs", toolchain).href)};
        const logger = new Logger(); await runSourceTests(logger, ${JSON.stringify(file)});
        console.log(JSON.stringify(logger.raw()));
      `,
          ],
          { encoding: "utf8" },
        ),
      );
    const before = run(false),
      after = run(true);
    assert.equal(before.nativePromise, false);
    assert.match(before.error, /this.filters.map is not a function/);
    assert.equal(after.nativePromise, true);
    assert.equal(after.error, undefined);
    assert.deepEqual(after.sections, []);
    assert.deepEqual(after.metadata, []);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

void test("native realm correction leaves unrelated contexts, Application methods and transport untouched; malformed SDK context fails closed", () => {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
    import vm from 'node:vm';
    import {ApplicationPolyfill} from ${JSON.stringify(new URL("../node_modules/@paperback/runtime-polyfills/lib/index.js", import.meta.url).href)};
    import {Logger} from ${JSON.stringify(new URL("logger.mjs", toolchain).href)};
    const fetchBefore=globalThis.fetch, outerPromise=globalThis.Promise;
    await import(${JSON.stringify(preload.href)});
    const unrelated={Promise};vm.createContext(unrelated);
    const application=ApplicationPolyfill(), snapshot=Object.getOwnPropertyDescriptors(application);
    const sandbox={Application:application,logger:new Logger(),Promise};const context=vm.createContext(sandbox);
    const sameMethods=Reflect.ownKeys(snapshot).every(key=>Object.getOwnPropertyDescriptor(application,key)?.value===snapshot[key].value);
    let rejected=false;try{vm.createContext({Application:application,logger:new Logger(),Promise:class Other{}})}catch{rejected=true}
    console.log(JSON.stringify({unrelated:unrelated.Promise===outerPromise,sameMethods,fetch:globalThis.fetch===fetchBefore,outer:globalThis.Promise===outerPromise,native:vm.runInContext('(async()=>{})() instanceof Promise',context),rejected}));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
  assert.deepEqual(result, {
    unrelated: true,
    sameMethods: true,
    fetch: true,
    outer: true,
    native: true,
    rejected: true,
  });
  const code = readFileSync(preload, "utf8");
  assert.match(code, /1\.0\.0-alpha\.92/);
  assert.match(code, /createHash\("sha256"\)/);
  assert.doesNotMatch(code, /scheduleRequest\s*=|fetch\s*=|form\.filters\s*=/);
});

void test("unreviewed SDK version or altered official test host refuses preload installation", () => {
  const temp = mkdtempSync(join(tmpdir(), "paperback-native-version-"));
  try {
    const script = join(temp, "preload.mjs");
    writeFileSync(script, readFileSync(preload));
    for (const name of ["toolchain", "types", "runtime-polyfills"]) {
      const directory = join(temp, "node_modules", "@paperback", name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, "package.json"),
        JSON.stringify({ name: `@paperback/${name}`, version: "1.0.0-alpha.92", type: "module" }),
      );
    }
    const typesPackage = join(temp, "node_modules", "@paperback", "types", "package.json");
    writeFileSync(
      typesPackage,
      JSON.stringify({ name: "@paperback/types", version: "1.0.0-alpha.93" }),
    );
    const invoke = () =>
      spawnSync(
        process.execPath,
        ["--import", script, "--eval", "throw Error('must not execute')"],
        { encoding: "utf8" },
      );
    const version = invoke();
    assert.equal(version.status, 1);
    assert.match(version.stderr, /requires a reviewed alpha.92 SDK/);
    writeFileSync(
      typesPackage,
      JSON.stringify({ name: "@paperback/types", version: "1.0.0-alpha.92" }),
    );
    const directory = join(
      temp,
      "node_modules",
      "@paperback",
      "toolchain",
      "dist",
      "src",
      "toolchain",
      "test",
    );
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "test.mjs"),
      readFileSync(new URL("test.mjs", toolchain), "utf8") + "\n// modified host\n",
    );
    const host = invoke();
    assert.equal(host.status, 1);
    assert.match(host.stderr, /test host changed; review/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
