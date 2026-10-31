// Keep helper accounting independent of native source pass/fail results.
import { readFileSync } from "node:fs";
import { isHelperFailureReason } from "./cloudflare-assistance.mjs";
const counters = [
  "positiveChallenges",
  "assistanceAttempts",
  "helperCalls",
  "sessionLifecycleCalls",
  "navigationAttempts",
  "replayAttempts",
  "unknownHelperOutcomes",
  "refusedAttempts",
  "successfulReplays",
];
const sources = new Set([
  "Marumaru",
  "Hijala",
  "MangaSushi",
  "ManhwaNex",
  "MangaStash",
  "VortexScans",
]);
const record = (value) => value && typeof value === "object" && !Array.isArray(value);
export function readAssistanceReport(path, report) {
  try {
    const values = JSON.parse(readFileSync(path, "utf8"));
    if (!record(values)) throw new Error();
    for (const [source, stats] of Object.entries(values)) {
      if (
        !sources.has(source) ||
        !record(stats) ||
        !record(report?.[source]) ||
        !counters.every((key) => Number.isSafeInteger(stats[key]) && stats[key] >= 0) ||
        stats.assistanceLimit !== 3 ||
        stats.browserSubresourcesCounted !== false ||
        Object.keys(stats).some(
          (key) =>
            ![
              ...counters,
              "assistanceLimit",
              "browserSubresourcesCounted",
              "stopReason",
              "stopDetail",
            ].includes(key),
        ) ||
        (stats.stopReason !== undefined &&
          (typeof stats.stopReason !== "string" || !/^[a-z-]{1,40}$/.test(stats.stopReason))) ||
        (stats.stopDetail !== undefined &&
          (stats.stopReason === undefined || !isHelperFailureReason(stats.stopDetail))) ||
        stats.assistanceAttempts > 3 ||
        stats.replayAttempts > stats.assistanceAttempts ||
        stats.navigationAttempts > 3 * stats.assistanceAttempts ||
        stats.successfulReplays > stats.replayAttempts ||
        stats.sessionLifecycleCalls > stats.helperCalls
      )
        throw new Error();
    }
    // Validate the whole sidecar before attaching any accounting to the report.
    for (const [source, stats] of Object.entries(values))
      report[source].cloudflareAssistance = stats;
  } catch {
    throw new Error("Cloudflare assistance metrics are unavailable or invalid");
  }
}
