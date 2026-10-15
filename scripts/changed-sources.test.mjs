import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  allSelection,
  classifyChanges,
  createSelection,
  inventoryFromPaths,
  parseDiff,
  readSelection,
  validateSelection,
} from "./changed-sources.mjs";
import { isolatedSourceLayout } from "./source-dependencies.mjs";
import {
  SOURCE_ROOT,
  SOURCE_MARKER,
  collectSelectedReports,
  failedSources,
  reportIssues,
} from "./test-sources.mjs";

const sources = ["Alpha", "FutureSource", "Zebra"],
  sha = "a".repeat(40);
const context = {
  eventName: "pull_request",
  baseSha: "b".repeat(40),
  headSha: "c".repeat(40),
  mergeBase: "d".repeat(40),
  testedSha: sha,
};
const changed = (selected = ["Alpha"]) => ({
  ...allSelection(sources),
  ...context,
  mode: "changed",
  selectedSources: selected,
  selectedCount: selected.length,
  decisions: selected.map((source) => ({
    status: "M",
    path: `${SOURCE_ROOT}/${source}/main.ts`,
    scope: "source",
    source,
  })),
});
const suite = (status = "pass") => ({
  tests: [{ name: "contract", status }],
  summary: { total: 1, passed: Number(status === "pass"), failed: Number(status === "fail") },
});
const classify = (paths, before = sources, after = sources, current = sources) =>
  classifyChanges(parseDiff(paths), current, before, after);

void test("discovers arbitrary future source IDs from source markers, not suites", () => {
  assert.deepEqual(
    inventoryFromPaths(
      sources
        .map((source) => `${SOURCE_ROOT}/${source}/${SOURCE_MARKER}`)
        .concat(`${SOURCE_ROOT}/helpers/util.ts`),
    ),
    sources,
  );
  assert.throws(() => inventoryFromPaths([`${SOURCE_ROOT}/helpers/util.ts`]));
});

void test("maps own source files, version/config/icons and exclusive tests dynamically", () => {
  for (const path of [
    `${SOURCE_ROOT}/FutureSource/main.ts`,
    `${SOURCE_ROOT}/FutureSource/${SOURCE_MARKER}`,
    `${SOURCE_ROOT}/FutureSource/static/icon.png`,
    `${SOURCE_ROOT}/FutureSource/version.json`,
    `${SOURCE_ROOT}/FutureSource/source.test.ts`,
  ]) {
    assert.deepEqual(classify(`M\0${path}\0`).selectedSources, ["FutureSource"]);
  }
  const ownTest =
    SOURCE_ROOT === "src" ? "src/tests/FutureSource.ts" : "scripts/futuresource-live-tests.mjs";
  assert.deepEqual(classify(`A\0${ownTest}\0`).selectedSources, ["FutureSource"]);
  if (SOURCE_ROOT === "src/sources")
    assert.deepEqual(classify("M\0assets/FutureSource.png\0").selectedSources, ["FutureSource"]);
  const newsources = [...sources, "NewExtension"].sort();
  assert.deepEqual(
    classify(`A\0${SOURCE_ROOT}/NewExtension/${SOURCE_MARKER}\0`, sources, newsources, newsources)
      .selectedSources,
    ["NewExtension"],
  );
});

void test("shared, unknown, tooling, transport and docs-only paths conservatively select all", () => {
  for (const path of [
    "scripts/live-tests.mjs",
    "scripts/test-sources.mjs",
    "scripts/test-status.mjs",
    "scripts/mana-runtime.mjs",
    "scripts/paperback-test-network.mjs",
    "scripts/mangasushi-live-tests.mjs",
    "src/tests/suite.ts",
    "src/shared/util.ts",
    "src/ContentRatingPolicy.ts",
    "scripts/unknown-live-tests.mjs",
    "assets/Unknown.png",
    "compose.yaml",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    ".oxlintrc.json",
    ".eslintrc.js",
    ".github/workflows/future.yml",
    "README.md",
    `${SOURCE_ROOT}/Unregistered/main.ts`,
  ])
    assert.equal(classify(`M\0${path}\0`).mode, "all", path);
  assert.equal(classify("").mode, "all");
});

void test("NUL diffs preserve both rename/copy paths and whitespace without shell parsing", () => {
  assert.deepEqual(parseDiff("R100\0old name\0new\nname\0"), [
    { status: "R100", paths: ["old name", "new\nname"] },
  ]);
  for (const status of ["R100", "C75"])
    assert.deepEqual(
      classify(`${status}\0${SOURCE_ROOT}/Alpha/old.ts\0${SOURCE_ROOT}/Zebra/new.ts\0`)
        .selectedSources,
      ["Alpha", "Zebra"],
    );
  assert.deepEqual(classify(`D\0${SOURCE_ROOT}/Alpha/deleted.ts\0`).selectedSources, ["Alpha"]);
  assert.deepEqual(
    classify(
      `D\0${SOURCE_ROOT === "src" ? "src/tests/Alpha.ts" : "scripts/alpha-live-tests.mjs"}\0`,
    ).selectedSources,
    ["Alpha"],
  );
  for (const output of [
    "M\0unfinished",
    "M\0",
    "R100\0one\0",
    "R101\0a\0b\0",
    "U\0a\0",
    "M\0../escape\0",
    "M\0/absolute\0",
    "bad\0a\0",
    "\0",
  ])
    assert.throws(() => parseDiff(output), output);
});

void test("complete removal/root rename and inventory uncertainty run all surviving sources", () => {
  const remaining = sources.filter((name) => name !== "Alpha");
  const removed = classify(
    `D\0${SOURCE_ROOT}/Alpha/${SOURCE_MARKER}\0`,
    sources,
    remaining,
    remaining,
  );
  assert.equal(removed.mode, "all");
  assert.deepEqual(removed.removedSources, ["Alpha"]);
  const renamed = [...remaining, "NewAlpha"].sort();
  assert.equal(
    classify(
      `R100\0${SOURCE_ROOT}/Alpha/${SOURCE_MARKER}\0${SOURCE_ROOT}/NewAlpha/${SOURCE_MARKER}\0`,
      sources,
      renamed,
      renamed,
    ).mode,
    "all",
  );
  assert.equal(
    classify(`M\0${SOURCE_ROOT}/Alpha/main.ts\0`, sources, sources, [...sources, "Another"].sort())
      .mode,
    "all",
  );
  {
    const collision = ["Alpha", "ALPHA"].sort();
    assert.equal(
      classifyChanges(
        parseDiff(`M\0${SOURCE_ROOT}/Alpha/main.ts\0`),
        collision,
        collision,
        collision,
      ).mode,
      "all",
    );
    assert.equal(
      classifyChanges(
        parseDiff("M\0scripts/alpha-live-tests.mjs\0"),
        collision,
        collision,
        collision,
      ).mode,
      "all",
    );
  }
});

void test("selection manifest fails closed on missing, malicious, duplicate, empty and stale selections", () => {
  assert.equal(validateSelection(changed(), sources, sha).selectedCount, 1);
  const cases = [
    null,
    {},
    { ...changed(), schemaVersion: 2 },
    { ...changed(), mode: "skip" },
    { ...changed(), reason: "" },
    { ...changed(), selectedSources: [] },
    { ...changed(), selectedSources: ["Unknown"] },
    { ...changed(), selectedSources: ["Alpha", "Alpha"], selectedCount: 2 },
    { ...changed(), selectedSources: ["Alpha; touch /tmp/oops"] },
    { ...changed(), discoveredSources: sources.slice(1) },
    { ...changed(), selectedCount: 99 },
    { ...changed(), mode: "all" },
    { ...changed(), eventName: "push" },
    { ...changed(), baseSha: "--help" },
    { ...changed(), testedSha: "0".repeat(40) },
    { ...changed(), removedSources: ["Alpha"] },
    { ...changed(), decisions: [] },
    {
      ...changed(),
      decisions: [{ status: "M", path: "package.json", scope: "source", source: "Alpha" }],
    },
    {
      ...changed(),
      decisions: [
        { status: "M", path: `${SOURCE_ROOT}/Zebra/main.ts`, scope: "source", source: "Alpha" },
      ],
    },
  ];
  for (const selection of cases) assert.throws(() => validateSelection(selection, sources, sha));
  const dir = mkdtempSync(join(tmpdir(), "selection-manifest-"));
  try {
    const path = join(dir, "selection.json"),
      env = { LIVE_TEST_SELECTION: path, GITHUB_SHA: sha };
    assert.throws(() => readSelection(sources, env));
    writeFileSync(path, "{broken");
    assert.throws(() => readSelection(sources, env));
    writeFileSync(path, JSON.stringify(changed()));
    assert.equal(readSelection(sources, env).selectedCount, 1);
    assert.equal(readSelection(sources, {}).mode, "all");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test("non-PR events and unavailable/unsafe PR metadata never select an empty suite", () => {
  for (const eventName of [
    "push",
    "schedule",
    "workflow_dispatch",
    "pull_request_target",
    undefined,
  ])
    assert.equal(
      createSelection({
        eventName,
        sources,
        git: () => {
          throw new Error("must not run");
        },
      }).mode,
      "all",
    );
  for (const baseSha of [undefined, "--malicious", "0".repeat(40)])
    assert.equal(
      createSelection({
        ...context,
        baseSha,
        sources,
        git: () => {
          throw new Error("missing commit");
        },
      }).mode,
      "all",
    );
});

void test("immutable merge-base/head diff works with a fork-shaped branch and a separate merge checkout", () => {
  const dir = mkdtempSync(join(tmpdir(), "source-diff-git-"));
  const git = (args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (path, content) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  try {
    git(["init", "-q"]);
    git(["config", "user.email", "ci@example.invalid"]);
    git(["config", "user.name", "CI fixture"]);
    for (const name of sources) put(`${SOURCE_ROOT}/${name}/${SOURCE_MARKER}`, name);
    git(["add", "."]);
    git(["commit", "-qm", "base"]);
    const baseSha = git(["rev-parse", "HEAD"]).trim();
    git(["checkout", "-qb", "foreign-pr-head"]);
    put(`${SOURCE_ROOT}/Alpha/main.ts`, "export const changed = true;");
    git(["add", "."]);
    git(["commit", "-qm", "head"]);
    const headSha = git(["rev-parse", "HEAD"]).trim();
    git(["checkout", "-qb", "base-advanced", baseSha]);
    put("README.md", "base-only documentation");
    git(["add", "."]);
    git(["commit", "-qm", "base advanced"]);
    const advancedBase = git(["rev-parse", "HEAD"]).trim();
    git(["merge", "--no-ff", "-qm", "PR merge", headSha]);
    const testedSha = git(["rev-parse", "HEAD"]).trim();
    const options = {
      eventName: "pull_request",
      baseSha: advancedBase,
      headSha,
      testedSha,
      sources,
      git,
      independent: () => isolatedSourceLayout(sources, dir),
    };
    put("tsconfig.json", "{}");
    const selection = createSelection(options);
    assert.equal(selection.mode, "changed");
    assert.deepEqual(selection.selectedSources, ["Alpha"]);
    assert.equal(selection.mergeBase, baseSha);
    assert.equal(selection.testedSha, testedSha);
    assert.equal(createSelection({ ...options, headSha: "0".repeat(40) }).mode, "all");
    assert.equal(
      createSelection({
        ...options,
        git: (args) => (args[0] === "diff" ? "M\0truncated" : git(args)),
      }).mode,
      "all",
    );
    assert.equal(
      createSelection({ ...options, git: (args) => (args[0] === "merge-base" ? "" : git(args)) })
        .mode,
      "all",
    );
    assert.equal(createSelection({ ...options, testedSha: headSha }).mode, "all");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test("only complete expected-source reports pass, including CLI exit-zero failure cases", () => {
  assert.deepEqual(failedSources({ Alpha: suite() }, ["Alpha"]), []);
  for (const report of [
    undefined,
    {},
    { Alpha: suite("fail") },
    { Alpha: { tests: [], summary: { total: 0, passed: 0, failed: 0 } } },
    { Alpha: { ...suite(), error: "runtime crashed" } },
    { Alpha: { ...suite(), summary: { total: 100, passed: 100, failed: 0 } } },
    { Alpha: { tests: [null] } },
    { Alpha: suite(), Stale: suite() },
    { Alpha: { ...suite(), tests: [{ name: "contract", status: "skip" }] } },
  ])
    assert.deepEqual(failedSources(report, ["Alpha"]), ["Alpha"]);
  assert.ok(reportIssues({ Alpha: suite(), Stale: suite() }, ["Alpha"]).Alpha);
});

void test("partial CLI aggregation retains every result and continues after crashes or failed suites", () => {
  const called = [];
  const report = collectSelectedReports(sources, (source) => {
    called.push(source);
    if (source === "Alpha") throw new Error("CLI crashed");
    if (source === "FutureSource") return { report: { [source]: suite("fail") } };
    return { report: { [source]: suite() } };
  });
  assert.deepEqual(called, sources);
  assert.deepEqual(Object.keys(report), sources);
  assert.deepEqual(failedSources(report, sources), ["Alpha", "FutureSource"]);
  const wrong = collectSelectedReports(["Alpha"], () => ({ report: { Zebra: suite() } }));
  assert.deepEqual(failedSources(wrong, ["Alpha"]), ["Alpha"]);
});

void test("workflow preserves full static gates, non-PR publication and credential restrictions", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/live-tests.yaml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /  pull_request:\s*\npermissions:/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /github.event_name != 'pull_request'/);
  assert.match(workflow, /run: node scripts\/changed-sources.mjs/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /rm -f bundles\/live-test-results.json/);
  assert.ok(!workflow.includes("pull_request_target"));
});

void test("live sweeps use schedule/manual and PR events while pushes retain static checks", () => {
  const readWorkflow = (name) =>
    readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
  const events = (workflow) =>
    [...workflow.match(/^on:\s*\n([\s\S]*?)(?=^\S)/m)[1].matchAll(/^ {2}([a-z_]+):/gm)]
      .map((match) => match[1])
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const live = readWorkflow("live-tests.yaml");
  assert.deepEqual(events(live), ["pull_request", "schedule", "workflow_dispatch"]);
  assert.match(live, /cron: "17,47 \* \* \* \*"/);
  const checks = readWorkflow("test.yaml");
  assert.deepEqual(events(checks), ["pull_request", "push", "workflow_dispatch"]);
  assert.match(checks, /  push:\n    branches:\n      - "0\.9\/stable"/);
  assert.match(checks, /    paths-ignore:\n      - "README\.md"\n      - "reports\/\*\*"/);
  assert.match(checks, /run: npm test/);
  const deploy = readWorkflow("bundle-deploy.yaml");
  assert.deepEqual(events(deploy), ["push", "workflow_dispatch"]);
  assert.match(deploy, /run: npm run bundle/);
  assert.doesNotMatch(deploy, /test:extensions/);
});

void test("cross-source, path-alias and dynamic dependencies invalidate source-only selection", () => {
  const dir = mkdtempSync(join(tmpdir(), "source-dependencies-"));
  const put = (path, content) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  try {
    put("tsconfig.json", "{}");
    for (const name of sources)
      put(`${SOURCE_ROOT}/${name}/${SOURCE_MARKER}`, "export const value = 1;");
    assert.equal(isolatedSourceLayout(sources, dir), true);
    put(`${SOURCE_ROOT}/Zebra/helper.ts`, "export const helper = 1;");
    put(`${SOURCE_ROOT}/Alpha/consumer.ts`, 'import { helper } from "../Zebra/helper";');
    assert.equal(isolatedSourceLayout(sources, dir), false);
    put(
      `${SOURCE_ROOT}/Alpha/consumer.ts`,
      'import Peer = require("../Zebra/helper"); export const value = Peer.helper;',
    );
    assert.equal(
      isolatedSourceLayout(sources, dir),
      false,
      "TypeScript import-equals must retain cross-source dependencies",
    );
    put(`${SOURCE_ROOT}/shared.ts`, 'export { helper } from "./Zebra/helper";');
    put(`${SOURCE_ROOT}/Alpha/consumer.ts`, 'import { helper } from "../shared";');
    assert.equal(
      isolatedSourceLayout(sources, dir),
      false,
      "A local shared-module bridge must not hide cross-source dependencies",
    );
    put(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@peer/*": [`${SOURCE_ROOT}/Zebra/*`] } },
      }),
    );
    put(`${SOURCE_ROOT}/Alpha/consumer.ts`, 'import { helper } from "@peer/helper";');
    assert.equal(isolatedSourceLayout(sources, dir), false);
    put(`${SOURCE_ROOT}/Alpha/consumer.ts`, 'const moduleName = "anything"; import(moduleName);');
    assert.equal(isolatedSourceLayout(sources, dir), false);
    put(`${SOURCE_ROOT}/Alpha/consumer.ts`, 'import "./missing";');
    assert.equal(isolatedSourceLayout(sources, dir), false);
    assert.equal(
      createSelection({
        ...context,
        sources,
        independent: () => false,
        git: (args) =>
          args[0] === "rev-parse" ? sha : args[0] === "merge-base" ? "d".repeat(40) : "",
      }).mode,
      "all",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test("shared production modules are owner-safe only through fully inspectable local dependencies", () => {
  const dir = mkdtempSync(join(tmpdir(), "shared-source-dependencies-"));
  const put = (path, content) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  const shared = `${SOURCE_ROOT}/shared`,
    consumer = `${SOURCE_ROOT}/Alpha/consumer.ts`;
  try {
    put("tsconfig.json", "{}");
    for (const name of sources)
      put(`${SOURCE_ROOT}/${name}/${SOURCE_MARKER}`, "export const value = 1;");
    put(`${shared}/policy.ts`, "export const policy = 1;");
    put(`${shared}/bridge.ts`, 'export { policy } from "./policy";');
    put(consumer, 'import { policy } from "../shared/bridge";');
    put(`${SOURCE_ROOT}/Zebra/consumer.ts`, 'import { policy } from "../shared/bridge";');
    assert.equal(
      isolatedSourceLayout(sources, dir),
      true,
      "multiple sources may reach the same pure policy without depending on one another",
    );
    assert.deepEqual(classify(`M\0${consumer}\0`).selectedSources, ["Alpha"]);
    assert.equal(classify(`M\0${shared}/policy.ts\0`).mode, "all");
    for (const dependency of [
      'import Policy = require("../shared/bridge"); export const value = Policy.policy;',
      'export const value = require("../shared/bridge").policy;',
      'export type Policy = typeof import("../shared/bridge");',
    ]) {
      put(consumer, dependency);
      assert.equal(isolatedSourceLayout(sources, dir), true, dependency);
    }
    put(consumer, 'import { policy } from "../shared/bridge";');
    put(`${SOURCE_ROOT}/Zebra/helper.ts`, "export const policy = 1;");
    for (const dependency of [
      'export { policy } from "../Zebra/helper";',
      'import Peer = require("../Zebra/helper"); export const policy = Peer.policy;',
      'export type Policy = typeof import("../Zebra/helper");',
      'const target = "./missing"; import(target);',
      'const target = "./missing"; require(target);',
      'export { policy } from "./missing";',
      "export const policy = ;",
    ]) {
      put(`${shared}/policy.ts`, dependency);
      assert.equal(
        isolatedSourceLayout(sources, dir),
        false,
        `a transitive shared dependency cannot conceal unsafe ownership: ${dependency}`,
      );
    }
    put(`${shared}/policy.js`, 'export { policy } from "../Zebra/helper";');
    put(`${shared}/policy.d.ts`, "export declare const policy: number;");
    rmSync(join(dir, shared, "policy.ts"));
    assert.equal(
      isolatedSourceLayout(sources, dir),
      false,
      "a declaration file cannot hide a separate runtime dependency graph",
    );
    rmSync(join(dir, shared, "policy.js"));
    rmSync(join(dir, shared, "policy.d.ts"));
    put(`${shared}/policy.ts`, "export const policy = 1;");
    put(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@policy": [`${shared}/bridge`] } },
      }),
    );
    put(consumer, 'import { policy } from "@policy";');
    assert.equal(
      isolatedSourceLayout(sources, dir),
      true,
      "resolved shared aliases stay inspectable",
    );
    put(`${shared}/policy.ts`, 'export { policy } from "../Zebra/helper";');
    assert.equal(isolatedSourceLayout(sources, dir), false, "aliases retain transitive peer edges");
    put(`${shared}/policy.ts`, "export const policy = 1;");
    symlinkSync(join(dir, shared), join(dir, SOURCE_ROOT, "shared-alias"), "dir");
    put(`${shared}/bridge.ts`, 'export { policy } from "../shared-alias/policy";');
    assert.equal(
      isolatedSourceLayout(sources, dir),
      false,
      "even an ownerless directory symlink leaves shared resolution uncertain",
    );
    put(`${shared}/bridge.ts`, 'export { policy } from "./policy";');
    const outside = `${dir}-outside.ts`;
    try {
      writeFileSync(outside, "export const policy = 1;");
      put(`${shared}/policy.ts`, `export { policy } from ${JSON.stringify(outside)};`);
      assert.equal(
        isolatedSourceLayout(sources, dir),
        false,
        "shared traversal stays inside the repo",
      );
    } finally {
      rmSync(outside, { force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test("unreadable, malformed or null PR event files deliberately fall back to all sources", () => {
  const dir = mkdtempSync(join(tmpdir(), "selection-event-"));
  try {
    const script = fileURLToPath(new URL("./changed-sources.mjs", import.meta.url));
    const output = join(dir, "selection.json"),
      event = join(dir, "event.json");
    for (const source of sources) {
      const marker = join(dir, SOURCE_ROOT, source, SOURCE_MARKER);
      mkdirSync(dirname(marker), { recursive: true });
      writeFileSync(marker, "");
    }
    for (const data of [undefined, "{broken", "null", "[]", "{}"]) {
      if (data === undefined) rmSync(event, { force: true });
      else writeFileSync(event, data);
      const result = spawnSync(process.execPath, [script], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_EVENT_PATH: event,
          GITHUB_SHA: sha,
          LIVE_TEST_SELECTION: output,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      const selection = JSON.parse(readFileSync(output, "utf8"));
      assert.equal(selection.mode, "all");
      assert.ok(selection.selectedCount > 0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test("only exact root README changes are neutral beside verified nonempty source ownership", () => {
  const mixed = classify(`M\0README.md\0M\0${SOURCE_ROOT}/Alpha/main.ts\0`);
  assert.equal(mixed.mode, "changed");
  assert.deepEqual(mixed.selectedSources, ["Alpha"]);
  assert.deepEqual(mixed.decisions[0], { status: "M", path: "README.md", scope: "neutral" });
  assert.doesNotThrow(() => validateSelection({ ...mixed, ...context }, sources, sha));
  assert.equal(classify("M\0README.md\0").mode, "all");
  for (const path of ["docs/README.md", "readme.md", "LICENSE", "reports/live-tests-history.json"])
    assert.equal(classify(`M\0${path}\0M\0${SOURCE_ROOT}/Alpha/main.ts\0`).mode, "all");
  const neutral = { status: "M", path: "README.md", scope: "neutral" };
  for (const decisions of [
    [neutral],
    [{ ...neutral, path: "package.json" }, ...changed().decisions],
    [{ ...neutral, source: "Alpha" }, ...changed().decisions],
    [{ ...neutral, path: `${SOURCE_ROOT}/Alpha/main.ts` }],
    [{ ...neutral, status: "bad" }, ...changed().decisions],
    [
      {
        status: "M",
        path: `${SOURCE_ROOT}/Alpha/../Zebra/main.ts`,
        scope: "source",
        source: "Alpha",
      },
    ],
  ])
    assert.throws(() => validateSelection({ ...changed(), decisions }, sources, sha));
});

void test("logical suites reject peer-suite/source dependencies and shared bridges, not central discovery", () => {
  const dir = mkdtempSync(join(tmpdir(), "suite-dependencies-"));
  const put = (path, content) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  const ownSuite = (source) =>
    SOURCE_ROOT === "src"
      ? `src/tests/${source}.ts`
      : `scripts/${source.toLowerCase()}-live-tests.mjs`;
  const peerSpecifier = SOURCE_ROOT === "src" ? "./Zebra.js" : "./zebra-live-tests.mjs";
  const harness = SOURCE_ROOT === "src" ? "src/tests/harness.ts" : "scripts/harness.mjs";
  try {
    put("tsconfig.json", "{}");
    for (const name of sources)
      put(`${SOURCE_ROOT}/${name}/${SOURCE_MARKER}`, "export const value = 1;");
    put(ownSuite("Zebra"), "export const sharedHelper = 1;");
    put(harness, "export const harness = 1;");
    put(
      ownSuite("Alpha"),
      `import { harness } from "./harness${SOURCE_ROOT === "src" ? ".js" : ".mjs"}";`,
    );
    put(
      "scripts/live-tests.mjs",
      `import "./alpha-live-tests.mjs"; import "./zebra-live-tests.mjs";`,
    );
    assert.equal(
      isolatedSourceLayout(sources, dir),
      true,
      "independent suites may use a neutral shared harness; central imports do not imply sharing",
    );
    put(ownSuite("Alpha"), `import { sharedHelper } from "${peerSpecifier}";`);
    assert.equal(
      isolatedSourceLayout(sources, dir),
      false,
      "peer suite helpers invalidate exclusive ownership",
    );
    put(harness, `export { sharedHelper } from "${peerSpecifier}";`);
    put(
      ownSuite("Alpha"),
      `import { sharedHelper } from "./harness${SOURCE_ROOT === "src" ? ".js" : ".mjs"}";`,
    );
    assert.equal(
      isolatedSourceLayout(sources, dir),
      false,
      "a shared harness cannot hide a peer-suite bridge",
    );
    put(
      ownSuite("Alpha"),
      `import "${SOURCE_ROOT === "src" ? "../Zebra/pbconfig.js" : "../src/sources/Zebra/index.js"}";`,
    );
    assert.equal(
      isolatedSourceLayout(sources, dir),
      false,
      "logical suites cannot silently depend on peer implementations",
    );
    put(ownSuite("Alpha"), 'const target = "./anywhere"; import(target);');
    assert.equal(isolatedSourceLayout(sources, dir), false);
    put(`${SOURCE_ROOT}/Zebra/helper.ts`, "export const sharedHelper = 1;");
    symlinkSync(
      join(dir, SOURCE_ROOT, "Zebra"),
      join(dir, dirname(ownSuite("Alpha")), "peer-alias"),
      "dir",
    );
    put(ownSuite("Alpha"), 'import { sharedHelper } from "./peer-alias/helper.js";');
    assert.equal(
      isolatedSourceLayout(sources, dir),
      false,
      "directory symlinks cannot hide a peer-source dependency",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
