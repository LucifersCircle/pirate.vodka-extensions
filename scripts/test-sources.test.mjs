import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverSources, failedSources, selectSources } from "./test-sources.mjs";

function suite() {
  return {
    summary: { passed: 1, failed: 0, total: 1 },
    tests: [{ name: "initialisation", status: "pass" }],
  };
}

void test("discovers extension configs, not helpers or existing test files", () => {
  const root = mkdtempSync(join(tmpdir(), "extension-sources-"));
  try {
    for (const name of ["Zebra", "NewAddon", "tests", "helpers"]) mkdirSync(join(root, name));
    for (const name of ["Zebra", "NewAddon"]) writeFileSync(join(root, name, "pbconfig.ts"), "");
    assert.deepEqual(discoverSources(root), ["NewAddon", "Zebra"]);
    assert.deepEqual(failedSources({ Zebra: suite() }, discoverSources(root)), ["NewAddon"]);
    rmSync(join(root, "NewAddon"), { recursive: true });
    rmSync(join(root, "Zebra"), { recursive: true });
    assert.throws(() => discoverSources(root), /No extension sources/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test("requires every shipped extension and accepts Hijala individually", () => {
  const sources = discoverSources();
  assert.ok(sources.includes("Hijala"));
  assert.ok(!sources.includes("HijalaTest"));
  assert.deepEqual(selectSources([]), sources);
  assert.deepEqual(selectSources(["Hijala"]), ["Hijala"]);
  assert.throws(() => selectSources(["HijalaTest"]), /Usage:/);
  assert.throws(() => selectSources(["Unknown"]), /Usage:/);
  assert.throws(() => selectSources(["Hijala", "Kagane"]), /Usage:/);
  const report = Object.fromEntries(sources.map((name) => [name, suite()]));
  assert.deepEqual(failedSources(report, sources), []);
  delete report.Hijala;
  assert.deepEqual(failedSources(report, sources), ["Hijala"]);
});

void test("missing, failing, empty, malformed, and inconsistent Hijala reports fail closed", () => {
  for (const data of [
    undefined,
    { error: "crashed", ...suite() },
    { summary: { passed: 0, failed: 0, total: 0 }, tests: [] },
    { ...suite(), summary: { passed: 2, failed: 0, total: 1 } },
    { ...suite(), tests: [null] },
    { ...suite(), tests: [{ name: "initialisation", status: "fail" }] },
    { ...suite(), summary: { passed: 0, failed: 1, total: 1 } },
  ]) {
    assert.deepEqual(failedSources({ Hijala: data }, ["Hijala"]), ["Hijala"]);
  }
  assert.deepEqual(failedSources(null, ["Hijala"]), ["Hijala"]);
});
