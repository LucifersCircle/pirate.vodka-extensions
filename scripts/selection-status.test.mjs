import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { allSelection } from "./changed-sources.mjs";
import { discoverSources, SOURCE_ROOT, SOURCE_MARKER } from "./test-sources.mjs";
import {
  assertPublishableSnapshot,
  createSnapshot,
  renderStatus,
  updateHistory,
} from "./test-status.mjs";

const sha = "a".repeat(40),
  names = discoverSources(),
  selected = names.slice(0, 1);
const suite = () => ({
  tests: [{ name: "live contract", status: "pass" }],
  summary: { total: 1, passed: 1, failed: 0 },
});
function partial() {
  return {
    ...allSelection(),
    mode: "changed",
    eventName: "pull_request",
    baseSha: "b".repeat(40),
    headSha: "c".repeat(40),
    mergeBase: "d".repeat(40),
    testedSha: sha,
    selectedSources: selected,
    selectedCount: selected.length,
    decisions: [
      {
        status: "M",
        path: `${SOURCE_ROOT}/${selected[0]}/main.ts`,
        scope: "source",
        source: selected[0],
      },
    ],
  };
}
const fullReport = () => Object.fromEntries(names.map((name) => [name, suite()]));

void test("direct full snapshot callers retain sha metadata without providing a selection manifest", () => {
  const snapshot = createSnapshot(fullReport(), { sha, outcome: "success" });
  assert.equal(snapshot.sha, sha);
  assert.equal(snapshot.selection.testedSha, sha);
  assert.doesNotThrow(() => assertPublishableSnapshot(snapshot));
  assert.equal(snapshot.sourceCounts.selected, names.length);
});

void test("partial snapshots count only expected suites and explicitly label omitted sources", () => {
  const snapshot = createSnapshot(
    { [selected[0]]: suite() },
    { selection: partial(), sha, outcome: "success" },
  );
  assert.deepEqual(Object.keys(snapshot.sources), selected);
  assert.deepEqual(snapshot.sourceCounts, {
    available: names.length,
    selected: 1,
    completed: 1,
    passed: 1,
    failed: 0,
    total: 1,
  });
  assert.equal(snapshot.sources[selected[0]].status, "pass");
  assert.deepEqual(snapshot.notSelectedSources, names.slice(1));
  const text = renderStatus(snapshot, [snapshot]);
  assert.match(text, /Not selected/);
  assert.match(text, /1 complete reports/);
  assert.throws(() => assertPublishableSnapshot(snapshot), /cannot be published/);
  assert.throws(() => updateHistory([], snapshot), /cannot be published/);
});

void test("forged self-consistent full subsets cannot publish against the actual source inventory", () => {
  const snapshot = createSnapshot(fullReport(), { sha, outcome: "success" });
  snapshot.selection.discoveredSources = selected;
  snapshot.selection.selectedSources = selected;
  snapshot.selection.selectedCount = 1;
  snapshot.sources = { [selected[0]]: snapshot.sources[selected[0]] };
  assert.throws(() => assertPublishableSnapshot(snapshot), /inventory differs/);
});

void test("unexpected, incomplete and unsuccessful outputs cannot turn a partial snapshot green", () => {
  for (const [report, outcome] of [
    [{}, "success"],
    [{ [selected[0]]: suite(), Unexpected: suite() }, "success"],
    [{ [selected[0]]: suite() }, "skipped"],
    [{ [selected[0]]: suite() }, "failure"],
  ]) {
    const snapshot = createSnapshot(report, { selection: partial(), sha, outcome });
    assert.equal(snapshot.sources[selected[0]].status, "error");
  }
});

void test("capture and publication enforce partial scope, manifest freshness and explicit errors end to end", () => {
  const dir = mkdtempSync(join(tmpdir(), "selection-status-"));
  const script = fileURLToPath(new URL("./test-status.mjs", import.meta.url));
  const path = join(dir, "bundles/live-status/selection.json");
  const put = (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  const env = {
    ...process.env,
    LIVE_TEST_SELECTION: path,
    GITHUB_SHA: sha,
    TESTED_SHA: sha,
    TEST_OUTCOME: "success",
    GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
  };
  const invoke = (command) =>
    spawnSync(process.execPath, [script, command], { cwd: dir, env, encoding: "utf8" });
  try {
    for (const name of names) put(join(dir, SOURCE_ROOT, name, SOURCE_MARKER), "");
    put(path, JSON.stringify(partial()));
    put(join(dir, "bundles/live-test-results.json"), JSON.stringify({ [selected[0]]: suite() }));
    const capture = invoke("capture");
    assert.equal(capture.status, 0, capture.stderr);
    const snapshot = JSON.parse(
      readFileSync(join(dir, "bundles/live-status/snapshot.json"), "utf8"),
    );
    assert.equal(snapshot.selection.mode, "changed");
    assert.deepEqual(Object.keys(snapshot.sources), selected);
    assert.notEqual(invoke("publish").status, 0);
    put(join(dir, "bundles/live-test-results.json"), JSON.stringify(fullReport()));
    for (const invalid of [
      "{broken",
      JSON.stringify({ ...partial(), testedSha: "0".repeat(40) }),
      undefined,
    ]) {
      if (invalid === undefined) rmSync(path);
      else put(path, invalid);
      const result = invoke("capture");
      assert.notEqual(result.status, 0, "invalid manifest must fail capture");
      const failed = JSON.parse(
        readFileSync(join(dir, "bundles/live-status/snapshot.json"), "utf8"),
      );
      assert.equal(Object.keys(failed.sources).length, names.length);
      assert.ok(Object.values(failed.sources).every((source) => source.status === "error"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test("full capture and README/history publication work without installed dependencies", () => {
  const dir = mkdtempSync(join(tmpdir(), "full-status-no-dependencies-"));
  const put = (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  try {
    mkdirSync(join(dir, "scripts"));
    for (const name of [
      "test-status.mjs",
      "test-sources.mjs",
      "changed-sources.mjs",
      "source-dependencies.mjs",
    ])
      copyFileSync(new URL(`./${name}`, import.meta.url), join(dir, "scripts", name));
    for (const name of names) put(join(dir, SOURCE_ROOT, name, SOURCE_MARKER), "");
    const path = join(dir, "bundles/live-status/selection.json");
    put(path, JSON.stringify(allSelection(names, "Full fixture run", { testedSha: sha })));
    put(join(dir, "bundles/live-test-results.json"), JSON.stringify(fullReport()));
    put(
      join(dir, "README.md"),
      "Before\n<!-- LIVE_TEST_STATUS:START -->\nold\n<!-- LIVE_TEST_STATUS:END -->\nAfter\n",
    );
    const env = {
      ...process.env,
      LIVE_TEST_SELECTION: path,
      GITHUB_SHA: sha,
      TESTED_SHA: sha,
      TEST_OUTCOME: "success",
      GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
    };
    const invoke = (command) =>
      spawnSync(process.execPath, [join(dir, "scripts/test-status.mjs"), command], {
        cwd: dir,
        env,
        encoding: "utf8",
      });
    const capture = invoke("capture");
    assert.equal(capture.status, 0, capture.stderr);
    const publish = invoke("publish");
    assert.equal(publish.status, 0, publish.stderr);
    assert.match(readFileSync(join(dir, "README.md"), "utf8"), /Live scope: all/);
    const history = JSON.parse(readFileSync(join(dir, "reports/live-tests-history.json"), "utf8"));
    assert.deepEqual(Object.keys(history[0].sources), names);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
