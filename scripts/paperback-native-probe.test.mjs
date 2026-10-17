import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "rolldown";

void test("native observer preserves SDK request headers and fences budgets before actual data transport", async () => {
  const suiteCode = readFileSync(new URL("../src/tests/suite.ts", import.meta.url), "utf8");
  assert.equal(
    suiteCode.match(/probe\.registerInterceptor\(\)/g)?.length,
    1,
    "observer stays before initialize, never re-registered last",
  );
  assert(
    suiteCode.indexOf("probe.registerInterceptor()") <
      suiteCode.indexOf("await extension.initialise()"),
  );
  const temp = mkdtempSync(join(tmpdir(), "paperback-native-probe-"));
  try {
    const file = join(temp, "probe.mjs");
    await build({
      input: "probe-entry",
      plugins: [
        {
          name: "probe-entry",
          resolveId(id) {
            if (id === "probe-entry") return id;
          },
          load(id) {
            if (id === "probe-entry")
              return `
          import { NativeProbe } from ${JSON.stringify(new URL("../src/tests/suite.ts", import.meta.url).pathname)};
          import { PaperbackInterceptor } from '@paperback/types';
          export async function runTests(logger) {
            let delivered = 0;
            class HeaderCopy extends PaperbackInterceptor {
              async interceptRequest(request) { return { ...request, headers: { ...request.headers, referer: 'https://source.example/' } }; }
              async interceptResponse(request, response, data) { delivered++; logger.log('finalHeaders', request.headers); return data; }
            }
            const probe = new NativeProbe('observer', 1), headers = new HeaderCopy('production-header-contract');
            // Same registration order as the compact suite and native initialise.
            probe.registerInterceptor(); headers.registerInterceptor();
            await Application.scheduleRequest({url:'data:text/plain,document',method:'GET'});
            try { await Application.scheduleRequest({url:'data:text/plain,blocked-document',method:'GET'}); }
            catch(error) { logger.log('documentLimit', String(error)); }
            logger.log('attempts',probe.requests.length); logger.log('dispatched',delivered);
            probe.unregisterInterceptor();
            const imageProbe = new NativeProbe('images', 1); imageProbe.registerInterceptor();
            // Keep observer first, exactly as the source suite does.
            headers.unregisterInterceptor(); headers.registerInterceptor();
            for (let i=0;i<4;i++) { const url='data:text/plain,image'+i; imageProbe.imageURLs.add(url);
              try { await Application.scheduleRequest({url,method:'GET'}); } catch(error) { logger.log('imageLimit',String(error)); }
            }
            logger.log('imageAttempts',imageProbe.counts()); logger.log('finalDispatched',delivered);
            imageProbe.unregisterInterceptor();headers.unregisterInterceptor();
          }`;
          },
        },
      ],
      output: { file, format: "iife", name: "source" },
    });
    const toolchain = new URL(
      "../node_modules/@paperback/toolchain/dist/src/toolchain/test/",
      import.meta.url,
    );
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `
      import {runSourceTests} from ${JSON.stringify(new URL("test.mjs", toolchain).href)};
      import {Logger} from ${JSON.stringify(new URL("logger.mjs", toolchain).href)};
      const logger=new Logger();await runSourceTests(logger,${JSON.stringify(file)});console.log(JSON.stringify(logger.raw()));
    `,
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(result.finalHeaders.referer, "https://source.example/");
    assert.match(result.documentLimit, /budget exceeded before dispatch/);
    assert.equal(result.attempts, 2);
    assert.equal(result.dispatched, 1);
    assert.match(result.imageLimit, /budget exceeded before dispatch/);
    assert.deepEqual(result.imageAttempts, {
      documentAttempts: 0,
      imageAttempts: 4,
      totalAttempts: 4,
      blockedAttempts: 1,
    });
    assert.equal(result.finalDispatched, 4);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
