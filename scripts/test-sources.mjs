import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_ROOT = "src";
export const SOURCE_MARKER = "pbconfig.ts";

// Match extension directories rather than test files, so a missing suite fails closed.
export function discoverSources(root = fileURLToPath(new URL("../src", import.meta.url))) {
  const sources = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "pbconfig.ts")))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (!sources.length) throw new Error("No extension sources found");
  return sources;
}

export function selectSources(args, sources = discoverSources()) {
  if (new Set(args).size !== args.length || args.some((name) => !sources.includes(name))) {
    throw new Error(`Usage: npm run test:extensions -- [${sources.join("|")}]`);
  }
  return args.length ? [...args].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) : sources;
}

// Only the explicit response challenge marker is evidence, never edge headers or status codes.
export function validChallengeEvidence(evidence) {
  return (
    evidence &&
    typeof evidence === "object" &&
    !Array.isArray(evidence) &&
    Object.keys(evidence).sort().join(",") === "header,kind,value" &&
    evidence.kind === "cloudflare-challenge" &&
    evidence.header === "cf-mitigated" &&
    evidence.value === "challenge"
  );
}

export function testCounts(tests) {
  return Object.fromEntries(
    ["pass", "fail", "cloudflared", "blocked"].map((status) => [
      status,
      Array.isArray(tests) ? tests.filter((test) => test?.status === status).length : 0,
    ]),
  );
}

// Validate the expected set, not whichever suites happened to emit output.
export function reportIssues(report, sources) {
  const issues = {};
  const validReport = report && typeof report === "object" && !Array.isArray(report);
  const unexpected = validReport
    ? Object.keys(report).filter((name) => !sources.includes(name))
    : [];
  for (const source of sources) {
    const data = validReport && Object.hasOwn(report, source) ? report[source] : undefined;
    const tests = data?.tests;
    const counts = testCounts(tests);
    const validTests =
      Array.isArray(tests) &&
      tests.length > 0 &&
      new Set(tests.map((test) => test?.name)).size === tests.length &&
      tests.every((test, index) => {
        if (
          !test ||
          typeof test.name !== "string" ||
          !test.name.trim() ||
          !Object.hasOwn(counts, test.status)
        )
          return false;
        if (test.status === "cloudflared")
          return validChallengeEvidence(test.evidence) && test.blockedBy === undefined;
        if (test.status === "blocked")
          return (
            typeof test.blockedBy === "string" &&
            test.blockedBy.trim() &&
            test.blockedBy !== test.name &&
            tests
              .slice(0, index)
              .some(
                (dependency) =>
                  dependency?.name === test.blockedBy &&
                  ["fail", "cloudflared", "blocked"].includes(dependency.status),
              ) &&
            test.evidence === undefined
          );
        return test.evidence === undefined && test.blockedBy === undefined;
      });
    if (unexpected.length) issues[source] = "Report contains unexpected sources";
    else if (data?.error) issues[source] = String(data.error);
    else if (
      !validTests ||
      data.summary?.total !== tests.length ||
      data.summary.passed !== counts.pass ||
      data.summary.failed !== counts.fail ||
      (data.summary.cloudflared ?? 0) !== counts.cloudflared ||
      (data.summary.blocked ?? 0) !== counts.blocked ||
      (Object.hasOwn(data.summary, "cloudflared") && !Number.isInteger(data.summary.cloudflared)) ||
      (Object.hasOwn(data.summary, "blocked") && !Number.isInteger(data.summary.blocked))
    )
      issues[source] = "Missing, empty, malformed, or inconsistent test report";
  }
  return issues;
}

export function failedSources(report, sources) {
  const issues = reportIssues(report, sources);
  return sources.filter(
    (source) => issues[source] || report[source].tests.some((test) => test.status !== "pass"),
  );
}

// Each invocation has its own output file. Continue after failures to retain every selected result.
export function collectSelectedReports(sources, runSource) {
  const report = {};
  for (const source of sources) {
    try {
      const result = runSource(source);
      const issue = reportIssues(result.report, [source])[source];
      report[source] = {
        ...result.report?.[source],
        ...(result.error || issue ? { error: String(result.error || issue) } : {}),
      };
    } catch (error) {
      report[source] = { error: String(error.message ?? error) };
    }
  }
  return report;
}
