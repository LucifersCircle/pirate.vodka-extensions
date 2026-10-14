import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const START = "<!-- LIVE_TEST_STATUS:START -->";
export const END = "<!-- LIVE_TEST_STATUS:END -->";
const SOURCES = ["Kagane", "VortexScans"];
const LABELS = { pass: "✅ Pass", fail: "❌ Fail", error: "⚠️ Error" };

function cell(value) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replaceAll("`", "&#96;")
    .slice(0, 400);
}

function duration(milliseconds) {
  return Number.isFinite(milliseconds) ? `${(milliseconds / 1000).toFixed(2)}s` : "—";
}

function timestamp(value) {
  return new Date(value)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}

function runLink(snapshot) {
  return snapshot.runUrl ? `[Run](${snapshot.runUrl})` : "Local verification";
}

export function createSnapshot(report, options = {}) {
  const sources = {};
  const reportedFailure = SOURCES.some((name) => {
    const data = report?.[name];
    return data?.error || data?.summary?.failed > 0 || !data?.tests?.length;
  });
  for (const name of SOURCES) {
    const data = report?.[name];
    const tests = Array.isArray(data?.tests) ? data.tests : [];
    const passed = tests.filter((test) => test?.status === "pass").length;
    const failed = tests.filter((test) => test?.status === "fail").length;
    const valid =
      tests.length > 0 &&
      tests.every((test) => test && typeof test.name === "string") &&
      passed + failed === tests.length &&
      data?.summary?.total === tests.length &&
      data.summary.passed === passed &&
      data.summary.failed === failed;
    const error =
      data?.error ||
      (!valid
        ? "No complete test report. Check the workflow logs for setup or runtime errors."
        : "");
    let status = error ? "error" : failed ? "fail" : "pass";
    if (
      status === "pass" &&
      options.outcome &&
      options.outcome !== "success" &&
      !(options.outcome === "failure" && reportedFailure)
    )
      status = "error";
    sources[name] = {
      status,
      passed,
      failed,
      total: tests.length,
      duration: data?.summary?.duration,
      error: error || (status === "error" ? `Test step outcome: ${options.outcome}` : ""),
      tests: tests.map((test) => ({
        name: test?.name ?? "Unknown test",
        status: test?.status === "pass" ? "pass" : "fail",
        duration: test?.duration,
        error: test?.error,
      })),
    };
  }
  return {
    checkedAt: options.checkedAt ?? new Date().toISOString(),
    startedAt: options.startedAt || undefined,
    runUrl: options.runUrl || undefined,
    sha: options.sha || undefined,
    sources,
  };
}

export function updateHistory(history, snapshot) {
  const entry = {
    checkedAt: snapshot.checkedAt,
    runUrl: snapshot.runUrl,
    sha: snapshot.sha,
    sources: Object.fromEntries(
      SOURCES.map((name) => [name, { status: snapshot.sources[name].status }]),
    ),
  };
  return [entry, ...history.filter((old) => old.checkedAt !== entry.checkedAt)].slice(0, 24);
}

export function renderStatus(snapshot, history) {
  const lines = [`Last checked: **${timestamp(snapshot.checkedAt)}** · ${runLink(snapshot)}`];
  if (snapshot.startedAt) lines.push(`Started: ${timestamp(snapshot.startedAt)}`);
  if (snapshot.sha) lines.push(`Tested commit: \`${snapshot.sha.slice(0, 7)}\``);
  lines.push(
    "",
    "| Extension | Result | Passed | Failed | Duration |",
    "| --- | --- | ---: | ---: | ---: |",
  );
  const diagnostics = [];
  for (const name of SOURCES) {
    const result = snapshot.sources[name];
    lines.push(
      `| ${name} | ${LABELS[result.status]} | ${result.passed}/${result.total} | ${result.failed} | ${duration(result.duration)} |`,
    );
    if (result.error) diagnostics.push(`${name}: ${cell(result.error)}`);
  }
  lines.push(
    "",
    ...diagnostics.flatMap((message) => [message, ""]),
    "<details>",
    "<summary>Test output</summary>",
    "",
    "| Extension | Test | Result | Duration | Failure |",
    "| --- | --- | --- | ---: | --- |",
  );
  for (const name of SOURCES) {
    if (!snapshot.sources[name].tests.length) {
      lines.push(`| ${name} | — | ⚠️ Error | — | ${cell(snapshot.sources[name].error)} |`);
    }
    for (const test of snapshot.sources[name].tests) {
      lines.push(
        `| ${name} | ${cell(test.name)} | ${LABELS[test.status]} | ${duration(test.duration)} | ${cell(test.error) || "—"} |`,
      );
    }
  }
  lines.push(
    "",
    "</details>",
    "",
    "<details>",
    "<summary>Recent checks (last 24 runs)</summary>",
    "",
    "| Checked (UTC) | Kagane | VortexScans | Run |",
    "| --- | --- | --- | --- |",
  );
  for (const entry of history) {
    lines.push(
      `| ${timestamp(entry.checkedAt)} | ${LABELS[entry.sources.Kagane.status]} | ${LABELS[entry.sources.VortexScans.status]} | ${runLink(entry)} |`,
    );
  }
  lines.push("", "</details>");
  return lines.join("\n");
}

export function replaceStatus(readme, status) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start < 0 || end < start || readme.indexOf(START, start + START.length) !== -1) {
    throw new Error("README must contain exactly one valid live-test status block");
  }
  return `${readme.slice(0, start + START.length)}\n\n${status}\n\n${readme.slice(end)}`;
}

function readJSON(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function writeJSON(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function capture() {
  let report;
  try {
    report = readJSON("bundles/live-test-results.json", undefined);
  } catch {
    // Malformed CLI output must be published as an error rather than stale success.
  }
  const snapshot = createSnapshot(report, {
    outcome: process.env.TEST_OUTCOME,
    startedAt: process.env.TEST_STARTED_AT,
    sha: process.env.TESTED_SHA,
    runUrl: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : undefined,
  });
  writeJSON("bundles/live-status/snapshot.json", snapshot);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${renderStatus(snapshot, [snapshot])}\n`);
  }
}

function publish() {
  const snapshot = readJSON("bundles/live-status/snapshot.json", undefined);
  if (!snapshot) throw new Error("Missing run snapshot; refusing to publish a stale status");
  const history = updateHistory(readJSON("reports/live-tests-history.json", []), snapshot);
  writeFileSync(
    "README.md",
    replaceStatus(readFileSync("README.md", "utf8"), renderStatus(snapshot, history)),
  );
  writeJSON("reports/live-tests-history.json", history);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "capture") capture();
  else if (process.argv[2] === "publish") publish();
  else throw new Error("Usage: node scripts/test-status.mjs capture|publish");
}
