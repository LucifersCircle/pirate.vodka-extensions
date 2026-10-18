import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAssistanceReport } from "./cloudflare-assistance-report.mjs";

void test("missing or malformed helper accounting is an explicit error without erasing native failures", () => {
  const folder = mkdtempSync(join(tmpdir(), "assistance-report-")),
    path = join(folder, "stats.json");
  const report = { Marumaru: { tests: [{ status: "fail", error: "original native challenge" }] } };
  const before = structuredClone(report);
  try {
    assert.throws(() => readAssistanceReport(path, report), /metrics are unavailable or invalid/);
    for (const value of [
      "not-json",
      "null",
      "[]",
      '{"Marumaru":{}}',
      '{"unexpected":{"secret":"not logged"}}',
    ]) {
      writeFileSync(path, value);
      assert.throws(() => readAssistanceReport(path, report), /metrics are unavailable or invalid/);
      assert.deepEqual(report, before);
    }
    writeFileSync(path, "{}");
    readAssistanceReport(path, report);
    assert.deepEqual(report, before);
    const stats = {
      positiveChallenges: 1,
      assistanceAttempts: 1,
      helperCalls: 3,
      sessionLifecycleCalls: 2,
      navigationAttempts: 1,
      replayAttempts: 1,
      unknownHelperOutcomes: 0,
      refusedAttempts: 0,
      successfulReplays: 0,
      stopReason: "operation",
      stopDetail: "browser-command-failed",
      assistanceLimit: 3,
      browserSubresourcesCounted: false,
    };
    writeFileSync(path, JSON.stringify({ Marumaru: stats }));
    readAssistanceReport(path, report);
    assert.deepEqual(report.Marumaru.cloudflareAssistance, stats);
    assert.deepEqual(report.Marumaru.tests, before.Marumaru.tests);
    for (const changes of [
      { stopDetail: "secret-not-for-logs" },
      { stopReason: undefined },
      { assistanceAttempts: 4 },
      { navigationAttempts: 4 },
      { replayAttempts: 2 },
      { unknownHelperOutcomes: -1 },
      { browserSubresourcesCounted: true },
    ]) {
      writeFileSync(path, JSON.stringify({ Marumaru: { ...stats, ...changes } }));
      assert.throws(() => readAssistanceReport(path, report), /metrics are unavailable or invalid/);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
