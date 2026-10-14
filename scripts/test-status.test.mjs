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
  assert.ok(text.includes(`| Kagane | ✅ Pass | 2/2 | 0 | 1.25s |`));
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
  assert.match(text, /\| Kagane \| ❌ Fail .*\n\| VortexScans \| ✅ Pass/);
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
  assert.ok(text.includes("| Hijala | ✅ Pass | 2/2 | 0 | 1.25s |"));
  assert.ok(text.includes("| Hijala | test 1 | ✅ Pass | 0.63s | — |"));
  assert.ok(text.includes("| Checked (UTC) | Hijala | Kagane | VortexScans | Run |"));
  assert.ok(text.includes("| 2026-10-14 11:17:04 UTC | — Not tested | ✅ Pass | ✅ Pass |"));
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
  const text = renderStatus(snapshot, updateHistory([], snapshot));
  assert.ok(text.includes("| Retired | ⚠️ Error"));
  assert.ok(text.includes("| Hijala | Kagane | VortexScans | Retired | Run |"));
});
