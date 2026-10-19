import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { discoverSources, reportIssues, testCounts } from "./test-sources.mjs";
import { allSelection, readSelection, validateSelection } from "./changed-sources.mjs";

export const START = "<!-- LIVE_TEST_STATUS:START -->";
export const END = "<!-- LIVE_TEST_STATUS:END -->";

const LABELS = {
  pass: "✅ Pass",
  fail: "❌ Fail",
  error: "⚠️ Error",
  cloudflared: "☁️ Cloudflared",
  blocked: "⏸️ Blocked",
};

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
  const selection = validateSelection(
    options.selection ??
      allSelection(undefined, "Full live suite", options.sha ? { testedSha: options.sha } : {}),
    discoverSources(),
    options.sha,
  );
  const names = selection.selectedSources;
  const issues = reportIssues(report, names);
  const sources = {};
  const reportedFailure = names.some((name) => {
    const data = report?.[name];
    return (
      issues[name] || data?.tests?.some((test) => test?.status !== "pass") || !data?.tests?.length
    );
  });
  for (const name of names) {
    const data = report?.[name];
    const tests = Array.isArray(data?.tests) ? data.tests : [];
    const counts = testCounts(tests);
    const { pass: passed, fail: failed, cloudflared, blocked } = counts;
    const valid = !issues[name];
    const error =
      options.selectionError ||
      issues[name] ||
      data?.error ||
      (!valid
        ? "No complete test report. Check the workflow logs for setup or runtime errors."
        : "");
    let status = error
      ? "error"
      : failed
        ? "fail"
        : cloudflared
          ? "cloudflared"
          : blocked
            ? "blocked"
            : "pass";
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
      cloudflared,
      blocked,
      total: tests.length,
      duration: data?.summary?.duration,
      error: error || (status === "error" ? `Test step outcome: ${options.outcome}` : ""),
      tests: tests.map((test) => ({
        name: test?.name ?? "Unknown test",
        status: Object.hasOwn(LABELS, test?.status) ? test.status : "error",
        ...(test?.status === "cloudflared" && !issues[name] ? { evidence: test.evidence } : {}),
        ...(test?.status === "blocked" && !issues[name] ? { blockedBy: test.blockedBy } : {}),
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
    selection,
    sourceCounts: {
      available: selection.discoveredSources.length,
      selected: names.length,
      completed: names.filter((name) => sources[name].status !== "error").length,
      passed: Object.values(sources).reduce((sum, source) => sum + source.passed, 0),
      failed: Object.values(sources).reduce((sum, source) => sum + source.failed, 0),
      cloudflared: Object.values(sources).reduce((sum, source) => sum + source.cloudflared, 0),
      blocked: Object.values(sources).reduce((sum, source) => sum + source.blocked, 0),
      total: Object.values(sources).reduce((sum, source) => sum + source.total, 0),
    },
    notSelectedSources: selection.discoveredSources.filter((name) => !names.includes(name)),
    sources,
  };
}

export function assertPublishableSnapshot(snapshot) {
  if (!snapshot?.selection || snapshot.selection.mode !== "all")
    throw new Error("Partial or unverified live results cannot be published");
  validateSelection(snapshot.selection, discoverSources(), snapshot.sha);
  if (
    JSON.stringify(
      Object.keys(snapshot.sources ?? {}).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    ) !== JSON.stringify(snapshot.selection.selectedSources)
  )
    throw new Error("Snapshot source set differs from its full selection");
}

export function updateHistory(history, snapshot) {
  assertPublishableSnapshot(snapshot);
  const entry = {
    checkedAt: snapshot.checkedAt,
    runUrl: snapshot.runUrl,
    sha: snapshot.sha,
    sources: Object.fromEntries(
      Object.keys(snapshot.sources).map((name) => [
        name,
        { status: snapshot.sources[name].status },
      ]),
    ),
  };
  return [entry, ...history.filter((old) => old.checkedAt !== entry.checkedAt)].slice(0, 24);
}

export function renderStatus(snapshot, history) {
  const names = Object.keys(snapshot.sources);
  const lines = [`Last checked: **${timestamp(snapshot.checkedAt)}** · ${runLink(snapshot)}`];
  if (snapshot.selection)
    lines.push(
      `Live scope: ${snapshot.selection.mode}; ${snapshot.sourceCounts.selected}/${snapshot.sourceCounts.available} sources selected; ${snapshot.sourceCounts.completed} complete reports. ${snapshot.selection.reason}`,
    );
  if (snapshot.notSelectedSources?.length)
    lines.push(
      `Not selected (${snapshot.notSelectedSources.length}): ${snapshot.notSelectedSources.join(", ")}`,
    );
  if (snapshot.sourceCounts)
    lines.push(
      `Selected tests: ${snapshot.sourceCounts.passed}/${snapshot.sourceCounts.total} passed; ${snapshot.sourceCounts.failed} failed; ${snapshot.sourceCounts.cloudflared ?? 0} Cloudflared; ${snapshot.sourceCounts.blocked ?? 0} blocked. Cloudflared and blocked tests are not verified passes.`,
    );
  if (snapshot.startedAt) lines.push(`Started: ${timestamp(snapshot.startedAt)}`);
  if (snapshot.sha) lines.push(`Tested commit: \`${snapshot.sha.slice(0, 7)}\``);
  lines.push(
    "",
    "| Extension | Result | Passed | Failed | Cloudflared | Blocked | Duration |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  );
  const diagnostics = [];
  for (const name of names) {
    const result = snapshot.sources[name];
    lines.push(
      `| ${name} | ${LABELS[result.status]} | ${result.passed}/${result.total} | ${result.failed} | ${result.cloudflared ?? 0} | ${result.blocked ?? 0} | ${duration(result.duration)} |`,
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
  for (const name of names) {
    if (!snapshot.sources[name].tests.length) {
      lines.push(`| ${name} | — | ⚠️ Error | — | ${cell(snapshot.sources[name].error)} |`);
    }
    for (const test of snapshot.sources[name].tests) {
      lines.push(
        `| ${name} | ${cell(test.name)} | ${LABELS[test.status]} | ${duration(test.duration)} | ${cell(test.error) || (test.blockedBy ? `Blocked by: ${cell(test.blockedBy)}` : "—")} |`,
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
    `| Checked (UTC) | ${names.join(" | ")} | Run |`,
    `| --- | ${names.map(() => "---").join(" | ")} | --- |`,
  );
  for (const entry of history) {
    lines.push(
      `| ${timestamp(entry.checkedAt)} | ${names.map((name) => LABELS[entry.sources?.[name]?.status] ?? "— Not tested").join(" | ")} | ${runLink(entry)} |`,
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
  let selection, selectionError;
  try {
    selection = readSelection();
  } catch {
    selection = allSelection(
      undefined,
      "Selection manifest verification failed",
      process.env.GITHUB_SHA ? { testedSha: process.env.GITHUB_SHA } : {},
    );
    selectionError = "Missing or invalid selection manifest; results are not verified";
  }
  const snapshot = createSnapshot(report, {
    selection,
    selectionError,
    outcome: process.env.TEST_OUTCOME,
    startedAt: process.env.TEST_STARTED_AT,
    sha: process.env.TESTED_SHA,
    runUrl: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : undefined,
  });
  writeJSON("bundles/live-status/snapshot.json", snapshot);
  if (Object.values(snapshot.sources).some((source) => source.status !== "pass"))
    process.exitCode = 1;
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
