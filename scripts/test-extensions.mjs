import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !["Kagane", "VortexScans"].includes(args[0]))) {
  console.error("Usage: npm run test:extensions -- [Kagane|VortexScans]");
  process.exit(1);
}

const expectedSources = args.length ? args : ["Kagane", "VortexScans"];
const reportPath = fileURLToPath(new URL("../bundles/live-test-results.json", import.meta.url));
const cli = fileURLToPath(
  new URL("../node_modules/@paperback/toolchain/dist/cli.mjs", import.meta.url),
);
const bridge = fileURLToPath(new URL("./paperback-test-network.mjs", import.meta.url));

console.log(`FlareSolverr: ${process.env.FLARESOLVERR_URL ?? "http://127.0.0.1:8191"}`);

rmSync(reportPath, { force: true });
const result = spawnSync(
  process.execPath,
  [
    "--use-env-proxy",
    "--import",
    bridge,
    cli,
    "test",
    "--noGenerate",
    "--output",
    reportPath,
    ...args,
  ],
  { stdio: "inherit" },
);
if (result.error || result.status !== 0) {
  console.error(result.error ?? `Paperback CLI exited with ${result.status}`);
  process.exit(1);
}

// alpha.92 prints failures but exits zero. Missing suites must fail as well.
let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (error) {
  console.error("Paperback did not produce a valid test report:", String(error));
  process.exit(1);
}
const failed = expectedSources.filter((source) => {
  const data = report[source];
  return (
    !data ||
    data.error ||
    data.summary?.failed !== 0 ||
    !(data.summary?.total > 0) ||
    !Array.isArray(data.tests) ||
    data.tests.length !== data.summary.total ||
    data.tests.some((test) => test.status !== "pass")
  );
});
if (failed.length) {
  console.error(`Live tests failed: ${failed.join(", ")}. See bundles/live-test-results.json.`);
  process.exit(1);
}
