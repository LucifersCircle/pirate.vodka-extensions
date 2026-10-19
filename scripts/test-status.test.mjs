import assert from "node:assert/strict";
import test from "node:test";
import {
  createSnapshot,
  END,
  renderStatus,
  replaceStatus,
  START,
  updateHistory,
} from "./test-status.mjs";

import { discoverSources, reportIssues, failedSources } from "./test-sources.mjs";

const checkedAt = "2026-10-14T12:17:04.000Z";
const runUrl = "https://github.com/owner/repo/actions/runs/123";
function suite(statuses = ["pass", "pass"]) {
  return {
    summary: {
      passed: statuses.filter((status) => status === "pass").length,
      failed: statuses.filter((status) => status === "fail").length,
      total: statuses.length,
      duration: 1250,
    },
    tests: statuses.map((status, index) => ({ name: `test ${index}`, status, duration: 625 })),
  };
}

void test("publishes passing counts, UTC timestamps, per-test output, and the run link", () => {
  const snapshot = createSnapshot(
    { Hijala: suite(), Kagane: suite(), VortexScans: suite() },
    { checkedAt, runUrl, outcome: "success" },
  );
  const text = renderStatus(snapshot, updateHistory([], snapshot));
  assert.match(text, /2026-10-14 12:17:04 UTC/);
  assert.ok(text.includes(`| Kagane | ✅ Pass | 2/2 | 0 | 0 | 0 | 1.25s |`));
  assert.ok(text.includes(`| VortexScans | test 1 | ✅ Pass | 0.63s | — |`));
  assert.ok(text.includes(`[Run](${runUrl})`));
});

void test("preserves a healthy source when the other fails and keeps table rows together", () => {
  const report = { Kagane: suite(["pass", "fail"]), VortexScans: suite() };
  report.Kagane.tests[1].error = "HTTP 503 | <script>\nretry `later`";
  const snapshot = createSnapshot(report, { checkedAt, outcome: "failure" });
  assert.equal(snapshot.sources.Kagane.status, "fail");
  assert.equal(snapshot.sources.VortexScans.status, "pass");
  const text = renderStatus(snapshot, updateHistory([], snapshot));
  assert.match(text, /\| Kagane \| ❌ Fail /);
  assert.match(text, /\| VortexScans \| ✅ Pass /);
  assert.ok(text.includes("HTTP 503 \\| &lt;script&gt; retry &#96;later&#96;"));
});

void test("missing, empty, inconsistent, or crashed suites are errors rather than success", () => {
  for (const data of [
    undefined,
    suite([]),
    { ...suite(), summary: { total: 10, passed: 10, failed: 0 } },
    { tests: [null] },
    { error: "VM crashed", ...suite() },
  ]) {
    const snapshot = createSnapshot({ Kagane: data, VortexScans: suite() }, { checkedAt });
    assert.equal(snapshot.sources.Kagane.status, "error");
    assert.equal(snapshot.sources.VortexScans.status, "pass");
  }
  const snapshot = createSnapshot(undefined, { checkedAt, outcome: "skipped" });
  assert.equal(snapshot.sources.Kagane.status, "error");
  assert.equal(snapshot.sources.VortexScans.status, "error");
});

void test("updates only the marked README section and rejects missing or duplicate markers", () => {
  const readme = `Introduction\n\n${START}\nold\n${END}\n\nInstallation\n`;
  assert.equal(
    replaceStatus(readme, "new"),
    `Introduction\n\n${START}\n\nnew\n\n${END}\n\nInstallation\n`,
  );
  assert.throws(() => replaceStatus("unmarked README", "new"));
  assert.throws(() => replaceStatus(`${readme}${START}`, "new"));
});

void test("keeps the newest 24 checks and deduplicates a retried publication", () => {
  let history = [];
  for (let hour = 0; hour < 30; hour++) {
    const snapshot = createSnapshot(undefined, {
      checkedAt: new Date(Date.parse(checkedAt) + hour * 3600000).toISOString(),
    });
    history = updateHistory(history, snapshot);
  }
  assert.equal(history.length, 24);
  assert.ok(history[0].checkedAt > history[23].checkedAt);
  const repeated = { ...createSnapshot(undefined), ...history[0] };
  assert.deepEqual(updateHistory(history, repeated), history);
});

void test("includes Hijala in summary, output, and history without rewriting old runs", () => {
  const snapshot = createSnapshot(
    { Hijala: suite(), Kagane: suite(), VortexScans: suite() },
    { checkedAt, outcome: "success" },
  );
  const old = {
    checkedAt: "2026-10-14T11:17:04.000Z",
    sources: { Kagane: { status: "pass" }, VortexScans: { status: "pass" } },
  };
  const history = updateHistory([old], snapshot);
  assert.equal(history[0].sources.Hijala.status, "pass");
  assert.equal(history[1].sources.Hijala, undefined);
  const text = renderStatus(snapshot, history);
  assert.ok(text.includes("| Hijala | ✅ Pass | 2/2 | 0 | 0 | 0 | 1.25s |"));
  assert.ok(text.includes("| Hijala | test 1 | ✅ Pass | 0.63s | — |"));
  const names = Object.keys(snapshot.sources);
  assert.ok(text.includes(`| Checked (UTC) | ${names.join(" | ")} | Run |`));
  const oldResults = names.map((name) => (old.sources[name] ? "✅ Pass" : "— Not tested"));
  assert.ok(text.includes(`| 2026-10-14 11:17:04 UTC | ${oldResults.join(" | ")} |`));
});

void test("a missing or failed Hijala suite cannot be hidden by healthy older sources", () => {
  for (const Hijala of [undefined, suite(["pass", "fail"])]) {
    const snapshot = createSnapshot(
      { Hijala, Kagane: suite(), VortexScans: suite() },
      { checkedAt, outcome: "failure" },
    );
    assert.equal(snapshot.sources.Hijala.status, Hijala ? "fail" : "error");
    assert.equal(snapshot.sources.Kagane.status, "pass");
    assert.equal(snapshot.sources.VortexScans.status, "pass");
    assert.ok(renderStatus(snapshot, updateHistory([], snapshot)).includes("| Hijala |"));
  }
});

void test("renders the captured source set even after an extension is removed", () => {
  const snapshot = createSnapshot(undefined, { checkedAt });
  snapshot.sources.Retired = { ...snapshot.sources.Hijala };
  const text = renderStatus(snapshot, [snapshot]);
  assert.ok(text.includes("| Retired | ⚠️ Error"));
  assert.ok(text.includes(`| ${Object.keys(snapshot.sources).join(" | ")} | Run |`));
});

const challengeEvidence = {
  kind: "cloudflare-challenge",
  header: "cf-mitigated",
  value: "challenge",
};
function obstructedSuite() {
  return {
    summary: { total: 3, passed: 1, failed: 0, cloudflared: 1, blocked: 1 },
    tests: [
      { name: "build", status: "pass" },
      {
        name: "inventory",
        status: "cloudflared",
        evidence: challengeEvidence,
        error: "Challenge stopped request",
      },
      { name: "reader", status: "blocked", blockedBy: "inventory" },
    ],
  };
}

void test("challenge and dependent blockage remain separate non-pass results with honest counts and history", () => {
  const report = Object.fromEntries(discoverSources().map((name) => [name, suite()]));
  report.Kagane = obstructedSuite();
  const snapshot = createSnapshot(report, { checkedAt, outcome: "failure", sha: "a".repeat(40) });
  assert.deepEqual(reportIssues(report, discoverSources()), {});
  assert.deepEqual(failedSources(report, discoverSources()), ["Kagane"]);
  assert.equal(snapshot.sources.Kagane.status, "cloudflared");
  assert.equal(snapshot.sources.VortexScans.status, "pass");
  assert.equal(snapshot.sources.Kagane.passed, 1);
  assert.equal(snapshot.sources.Kagane.failed, 0);
  assert.equal(snapshot.sourceCounts.cloudflared, 1);
  assert.equal(snapshot.sourceCounts.blocked, 1);
  assert.equal(snapshot.sourceCounts.total, discoverSources().length * 2 + 1);
  assert.deepEqual(snapshot.sources.Kagane.tests[1].evidence, challengeEvidence);
  assert.equal(snapshot.sources.Kagane.tests[2].blockedBy, "inventory");
  const history = updateHistory([], snapshot);
  assert.equal(history[0].sources.Kagane.status, "cloudflared");
  assert.equal(history[0].sha, "a".repeat(40));
  const text = renderStatus(snapshot, history);
  assert.match(text, /Cloudflared and blocked tests are not verified passes/);
  assert.match(text, /inventory \| ☁️ Cloudflared/);
  assert.match(text, /reader \| ⏸️ Blocked/);
  assert.match(text, /Blocked by: inventory/);
});

void test("true failures and setup errors outrank challenge classification", () => {
  const data = obstructedSuite();
  data.tests[0].status = "fail";
  data.summary.passed = 0;
  data.summary.failed = 1;
  assert.equal(createSnapshot({ Kagane: data }).sources.Kagane.status, "fail");
  data.error = "runtime crashed";
  assert.equal(createSnapshot({ Kagane: data }).sources.Kagane.status, "error");
});

void test("only exact sanitized challenge evidence and consistent counters are accepted", () => {
  for (const edit of [
    (data) => {
      delete data.tests[1].evidence;
    },
    (data) => {
      data.tests[1].evidence.header = "cf-ray";
    },
    (data) => {
      data.tests[1].evidence.value = "managed";
    },
    (data) => {
      data.tests[1].evidence.cookie = "must not be copied";
    },
    (data) => {
      delete data.summary.cloudflared;
    },
    (data) => {
      data.summary.blocked = null;
    },
    (data) => {
      data.summary.cloudflared = "1";
    },
    (data) => {
      data.summary.blocked = -1;
    },
    (data) => {
      data.tests[2].blockedBy = "unknown";
    },
    (data) => {
      data.tests[2].blockedBy = "reader";
    },
    (data) => {
      data.tests[2].blockedBy = "build";
    },
    (data) => {
      data.tests[2].evidence = challengeEvidence;
    },
    (data) => {
      data.tests[1].status = "skipped";
    },
  ]) {
    const data = structuredClone(obstructedSuite());
    edit(data);
    assert.ok(reportIssues({ Kagane: data }, ["Kagane"]).Kagane);
    assert.deepEqual(failedSources({ Kagane: data }, ["Kagane"]), ["Kagane"]);
    const snapshot = createSnapshot({ Kagane: data });
    assert.equal(snapshot.sources.Kagane.status, "error");
    assert.ok(!JSON.stringify(snapshot).includes("must not be copied"));
  }
});

void test("legacy reports and benign Cloudflare response errors are never inferred as challenges", () => {
  for (const error of [
    "HTTP403",
    "cf-ray: 123",
    "server: cloudflare",
    "ETIMEDOUT",
    "cf-mitigated: challenge",
  ]) {
    const data = suite(["fail"]);
    data.tests[0].error = error;
    assert.deepEqual(reportIssues({ Kagane: data }, ["Kagane"]), {});
    const snapshot = createSnapshot({ Kagane: data });
    assert.equal(snapshot.sources.Kagane.status, "fail");
    assert.equal(snapshot.sources.Kagane.cloudflared, 0);
  }
  const data = suite();
  data.summary.cloudflared = 0;
  data.summary.blocked = 0;
  assert.deepEqual(reportIssues({ Kagane: data }, ["Kagane"]), {});
  data.summary.cloudflared = null;
  assert.ok(reportIssues({ Kagane: data }, ["Kagane"]).Kagane);
});
