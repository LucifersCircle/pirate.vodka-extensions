import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "rolldown";
import { Worker } from "node:worker_threads";

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
  const server = new Worker(
    `
    const { parentPort } = require('node:worker_threads');
    const http = require('node:http');
    http.createServer((req, res) => {
      if (req.url === '/challenge') res.setHeader('CF-Mitigated', 'challenge');
      if (req.url === '/benign') res.setHeader('cf-ray', 'test-ray');
      if (req.url === '/wrong-value') res.setHeader('cf-mitigated', 'none');
      if (req.url === '/plain403') res.statusCode = 403;
      res.end('native harness response');
    }).listen(0, '127.0.0.1', function() { parentPort.postMessage(this.address().port); });
  `,
    { eval: true },
  );
  const port = await new Promise((resolve, reject) => {
    server.once("message", resolve);
    server.once("error", reject);
  });
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
          import { NativeProbe, TestSuite } from ${JSON.stringify(new URL("../src/tests/suite.ts", import.meta.url).pathname)};
          import { PaperbackInterceptor, CloudflareError } from '@paperback/types';
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
            // Local HTTP fixtures exercise the real SDK bridge with actual headers.
            const challengeProbe = new NativeProbe('challenge-observer'); challengeProbe.registerInterceptor();
            const classified = new TestSuite('classification', logger.scope('classification'));
            classified.test('benign Cloudflare headers', async () => {
              challengeProbe.beginTest('benign Cloudflare headers');
              await Application.scheduleRequest({url:'http://127.0.0.1:${String(port)}/benign',method:'GET'});
              await Application.scheduleRequest({url:'http://127.0.0.1:${String(port)}/wrong-value',method:'GET'});
            });
            classified.test('challenge origin', async () => {
              challengeProbe.beginTest('challenge origin');
              try {
                await Application.scheduleRequest({url:'http://127.0.0.1:${String(port)}/challenge',method:'GET'});
              } catch (error) {
                // Same discrimination as Kagane: SDK challenges must survive.
                if (error instanceof CloudflareError) throw error;
                throw new Error('source swallowed non-SDK transport error');
              }
            });
            classified.test('dependent access', async () => { challengeProbe.requireAccess(); });
            classified.test('dependent guard', async () => { challengeProbe.requireGuardAccess(false); });
            classified.test('guard with existing prerequisites', async () => { challengeProbe.requireGuardAccess(true); });
            classified.test('independent assertion', async () => { throw new Error('genuine guard defect'); });
            await classified.run();
            challengeProbe.unregisterInterceptor();
            const plainProbe = new NativeProbe('plain-observer'); plainProbe.registerInterceptor();
            const plain = new TestSuite('plain403', logger.scope('plain403'));
            plain.test('plain denial', async () => {
              plainProbe.beginTest('plain denial');
              await Application.scheduleRequest({url:'http://127.0.0.1:${String(port)}/plain403',method:'GET'});
              plainProbe.requireAccess();
            });
            await plain.run();
            plainProbe.unregisterInterceptor();
            const swallowedProbe = new NativeProbe('swallowed-observer'); swallowedProbe.registerInterceptor();
            const swallowed = new TestSuite('swallowed', logger.scope('swallowed'));
            swallowed.test('swallowed challenge', async () => {
              swallowedProbe.beginTest('swallowed challenge');
              try { await Application.scheduleRequest({url:'http://127.0.0.1:${String(port)}/challenge',method:'GET'}); }
              catch { /* Simulate a source returning cached data after a transport denial. */ }
              swallowedProbe.requireCompletedAccess();
            });
            await swallowed.run();
            swallowedProbe.unregisterInterceptor();
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
    assert.deepEqual(
      (({ duration: _duration, ...counts }) => counts)(result.classification.summary),
      { passed: 2, failed: 1, cloudflared: 1, blocked: 2, total: 6 },
    );
    const classified = result.classification.tests;
    assert.equal(classified[0].status, "pass");
    assert.equal(classified[1].status, "cloudflared");
    assert.deepEqual(classified[1].evidence, {
      kind: "cloudflare-challenge",
      header: "cf-mitigated",
      value: "challenge",
    });
    assert.equal(classified[2].status, "blocked");
    assert.equal(classified[2].blockedBy, "challenge origin");
    assert.equal(classified[3].status, "blocked");
    assert.equal(classified[3].blockedBy, "challenge origin");
    assert.equal(classified[4].status, "pass");
    assert.equal(classified[5].status, "fail");
    assert.match(classified[5].error, /genuine guard defect/);
    assert.equal(result.plain403.tests[0].status, "fail");
    assert.equal(result.plain403.summary.cloudflared, 0);
    assert.equal(result.swallowed.tests[0].status, "cloudflared");
    assert.equal(result.swallowed.summary.passed, 0);
  } finally {
    await server.terminate();
    rmSync(temp, { recursive: true, force: true });
  }
});
