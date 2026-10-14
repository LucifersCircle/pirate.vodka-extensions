import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Match extension directories rather than test files, so a missing suite fails closed.
export function discoverSources(root = fileURLToPath(new URL("../src", import.meta.url))) {
  const sources = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "pbconfig.ts")))
    .map((entry) => entry.name)
    .sort();
  if (!sources.length) throw new Error("No extension sources found");
  return sources;
}

export function selectSources(args, sources = discoverSources()) {
  if (args.length > 1 || (args.length === 1 && !sources.includes(args[0]))) {
    throw new Error(`Usage: npm run test:extensions -- [${sources.join("|")}]`);
  }
  return args.length ? args : sources;
}

export function failedSources(report, sources) {
  return sources.filter((source) => {
    const data = report?.[source];
    return (
      !data ||
      data.error ||
      data.summary?.failed !== 0 ||
      !(data.summary?.total > 0) ||
      !Array.isArray(data.tests) ||
      data.tests.length !== data.summary.total ||
      data.summary.passed !== data.tests.length ||
      data.tests.some((test) => test?.status !== "pass")
    );
  });
}
