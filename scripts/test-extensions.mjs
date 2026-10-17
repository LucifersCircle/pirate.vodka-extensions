import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readSelection } from "./changed-sources.mjs";
import { collectSelectedReports, failedSources, selectSources } from "./test-sources.mjs";

const reportPath = fileURLToPath(new URL("../bundles/live-test-results.json", import.meta.url));
rmSync(reportPath, { force: true });
const args = process.argv.slice(2);
let expectedSources, selection;
try {
  if (process.env.LIVE_TEST_SELECTION && args.length)
    throw new Error("Cannot override the live selection manifest with CLI arguments");
  selection = readSelection();
  expectedSources = args.length ? selectSources(args) : selection.selectedSources;
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const cli = fileURLToPath(
  new URL("../node_modules/@paperback/toolchain/dist/cli.mjs", import.meta.url),
);
const bridge = fileURLToPath(new URL("./paperback-test-network.mjs", import.meta.url));
const webView = fileURLToPath(new URL("./paperback-test-webview-preload.mjs", import.meta.url));
console.log(`FlareSolverr: ${process.env.FLARESOLVERR_URL ?? "http://127.0.0.1:8191"}`);
mkdirSync(fileURLToPath(new URL("../bundles/live-status", import.meta.url)), { recursive: true });
function runCLI(sources, output) {
  rmSync(output, { force: true });
  const result = spawnSync(
    process.execPath,
    [
      "--use-env-proxy",
      "--import",
      bridge,
      "--import",
      webView,
      cli,
      "test",
      "--noGenerate",
      "--output",
      output,
      ...sources,
    ],
    { stdio: "inherit" },
  );
  let report;
  try {
    report = JSON.parse(readFileSync(output, "utf8"));
  } catch {
    /* Missing or malformed output is validated below. */
  }
  return {
    report,
    error:
      result.error ??
      (result.status !== 0 ? `Paperback CLI exited with ${result.status}` : undefined),
  };
}
let report;
if (!args.length && selection.mode === "all") {
  const result = runCLI([], reportPath);
  report = result.report;
  if (result.error)
    report = Object.fromEntries(
      expectedSources.map((source) => [
        source,
        { ...report?.[source], error: String(result.error) },
      ]),
    );
} else {
  report = collectSelectedReports(expectedSources, (source) =>
    runCLI(
      [source],
      fileURLToPath(new URL(`../bundles/live-status/${source}.json`, import.meta.url)),
    ),
  );
}
writeFileSync(reportPath, `${JSON.stringify(report ?? {}, null, 2)}\n`);
// alpha.92 prints failures but exits zero. Missing suites must fail as well.
const failed = failedSources(report, expectedSources);
if (failed.length) {
  console.error(`Live tests failed: ${failed.join(", ")}. See bundles/live-test-results.json.`);
  process.exitCode = 1;
}
