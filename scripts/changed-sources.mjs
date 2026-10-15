import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { discoverSources, SOURCE_ROOT, SOURCE_MARKER } from "./test-sources.mjs";
import { isolatedSourceLayout } from "./source-dependencies.mjs";

const ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const STATUS = /^(?:[AMD]|[RC](?:100|[1-9]?\d))$/;
const validPath = (path) =>
  typeof path === "string" &&
  path.length > 0 &&
  !path.includes("\0") &&
  !path.startsWith("/") &&
  !path.split("/").some((part) => !part || part === "." || part === "..");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function names(values) {
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.some((name) => typeof name !== "string" || !ID.test(name)) ||
    new Set(values).size !== values.length
  )
    throw new Error("Invalid or empty source inventory");
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function allSelection(
  sources = discoverSources(),
  reason = "Full live suite",
  context = {},
) {
  const discoveredSources = names(sources);
  return {
    schemaVersion: 1,
    mode: "all",
    reason,
    ...context,
    discoveredSources,
    selectedSources: [...discoveredSources],
    selectedCount: discoveredSources.length,
    removedSources: [],
    decisions: [],
  };
}

export function validateSelection(selection, sources = discoverSources(), testedSha) {
  const current = names(sources);
  if (
    !selection ||
    selection.schemaVersion !== 1 ||
    !["all", "changed"].includes(selection.mode) ||
    typeof selection.reason !== "string" ||
    !selection.reason.trim()
  )
    throw new Error("Invalid selection manifest header");
  if (
    !same(names(selection.discoveredSources), current) ||
    !same(selection.discoveredSources, current)
  )
    throw new Error("Selection inventory differs from the tested checkout");
  for (const field of ["baseSources", "headSources", "ancestorSources"])
    if (selection[field] !== undefined && !same(names(selection[field]), selection[field]))
      throw new Error(`Invalid ${field}`);
  const selected = names(selection.selectedSources);
  if (
    !same(selected, selection.selectedSources) ||
    selected.some((name) => !current.includes(name)) ||
    selection.selectedCount !== selected.length
  )
    throw new Error("Invalid selected sources or count");
  if (selection.mode === "all" && !same(selected, current))
    throw new Error("Full selection omitted a source");
  if (
    !Array.isArray(selection.removedSources) ||
    selection.removedSources.some(
      (name) => typeof name !== "string" || !ID.test(name) || current.includes(name),
    ) ||
    new Set(selection.removedSources).size !== selection.removedSources.length
  )
    throw new Error("Invalid removed sources");
  for (const field of ["baseSha", "headSha", "mergeBase", "testedSha"])
    if (selection[field] !== undefined && !SHA.test(selection[field]))
      throw new Error(`Invalid ${field}`);
  if (testedSha && selection.testedSha !== testedSha)
    throw new Error("Selection belongs to another tested commit");
  if (
    selection.mode === "changed" &&
    (selection.eventName !== "pull_request" ||
      !selection.baseSha ||
      !selection.headSha ||
      !selection.mergeBase ||
      !selection.testedSha ||
      selection.removedSources.length)
  )
    throw new Error("Changed selection lacks immutable PR context");
  if (
    !Array.isArray(selection.decisions) ||
    selection.decisions.some(
      (decision) =>
        !decision ||
        !validPath(decision.path) ||
        typeof decision.status !== "string" ||
        !STATUS.test(decision.status) ||
        !["source", "all", "neutral"].includes(decision.scope) ||
        (decision.scope === "source" && !current.includes(decision.source)) ||
        (decision.scope === "neutral" &&
          (selection.mode !== "changed" ||
            decision.path !== "README.md" ||
            decision.source !== undefined)),
    )
  )
    throw new Error("Invalid per-path ownership decisions");
  if (selection.mode === "changed") {
    const ownership = classifyChanges(
      selection.decisions.map((decision) => ({ status: decision.status, paths: [decision.path] })),
      current,
      current,
      current,
    );
    if (
      ownership.mode !== "changed" ||
      !same(ownership.selectedSources, selected) ||
      selection.decisions.some(
        (decision, index) =>
          decision.scope !== ownership.decisions[index]?.scope ||
          decision.source !== ownership.decisions[index]?.source,
      )
    )
      throw new Error("Changed selection does not match its path ownership decisions");
  }
  return selection;
}

export function readSelection(sources = discoverSources(), env = process.env) {
  if (!env.LIVE_TEST_SELECTION) return allSelection(sources);
  return validateSelection(
    JSON.parse(readFileSync(env.LIVE_TEST_SELECTION, "utf8")),
    sources,
    env.GITHUB_SHA,
  );
}

export function parseDiff(output) {
  if (typeof output !== "string" || (output && !output.endsWith("\0")))
    throw new Error("Malformed NUL-delimited diff");
  if (!output) return [];
  const fields = output.slice(0, -1).split("\0"),
    changes = [];
  while (fields.length) {
    const status = fields.shift();
    if (!STATUS.test(status)) throw new Error("Unrecognized diff status");
    const paths = fields.splice(0, /^[RC]/.test(status) ? 2 : 1);
    if (paths.length !== (/^[RC]/.test(status) ? 2 : 1) || paths.some((path) => !validPath(path)))
      throw new Error("Malformed diff path");
    changes.push({ status, paths });
  }
  return changes;
}

export function inventoryFromPaths(paths, sourceRoot = SOURCE_ROOT, marker = SOURCE_MARKER) {
  const prefix = `${sourceRoot}/`,
    sources = [];
  for (const path of paths) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length).split("/");
    if (rest.length === 2 && rest[1] === marker) sources.push(rest[0]);
  }
  return names(sources);
}

export function classifyChanges(changes, sources, before, after, sourceRoot = SOURCE_ROOT) {
  const current = names(sources),
    old = names(before),
    head = names(after);
  const decisions = [];
  const all = (reason, removedSources = []) => ({
    ...allSelection(current, reason),
    removedSources,
    decisions: changes.flatMap((change) =>
      change.paths.map((path) => ({ status: change.status, path, scope: "all" })),
    ),
  });
  if (new Set(current.map((name) => name.toLowerCase())).size !== current.length)
    return all("Case-normalized source ownership is ambiguous");
  const removed = old.filter((name) => !head.includes(name));
  if (removed.length)
    return all(
      "Source removal or root rename requires the full live suite",
      removed.filter((name) => !current.includes(name)),
    );
  if (!same(head, current)) return all("PR head and tested checkout inventories differ");
  if (!changes.length) return all("No changed source was established");
  const known = [...new Set([...old, ...head, ...current])],
    selected = new Set();
  const suiteOwners = new Map();
  for (const source of known) {
    const path = `scripts/${source.toLowerCase()}-live-tests.mjs`;
    suiteOwners.set(path, suiteOwners.has(path) ? null : source);
  }
  for (const change of changes)
    for (const path of change.paths) {
      // Audit established only the root README as independent of source/live/build logic.
      // It is neutral beside verified source changes, but README-only still falls back to all.
      if (path === "README.md") {
        decisions.push({ status: change.status, path, scope: "neutral" });
        continue;
      }
      // This suite exports image utilities used by other source contracts too.
      if (path === "scripts/mangasushi-live-tests.mjs")
        return all("Shared live-test image helpers changed");
      let owner;
      const prefix = `${sourceRoot}/`;
      if (path.startsWith(prefix)) {
        const candidate = path.slice(prefix.length).split("/")[0];
        if (known.includes(candidate)) owner = candidate;
      }
      if (sourceRoot === "src" && path.startsWith("src/tests/"))
        owner = known.find((source) => path === `src/tests/${source}.ts`);
      if (sourceRoot === "src/sources" && path.startsWith("assets/"))
        owner = known.find((source) => new RegExp(`^assets/${source}\\.[A-Za-z0-9]+$`).test(path));
      if (sourceRoot === "src/sources" && suiteOwners.has(path)) owner = suiteOwners.get(path);
      if (!owner || !current.includes(owner))
        return all("Shared, unknown, or uncertain changed path requires the full live suite");
      decisions.push({ status: change.status, path, scope: "source", source: owner });
      selected.add(owner);
    }
  if (!selected.size) return all("No runnable changed source was established");
  return {
    ...allSelection(current, "Changed source ownership established"),
    mode: "changed",
    selectedSources: [...selected].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    selectedCount: selected.size,
    decisions,
  };
}

export function createSelection({
  eventName,
  baseSha,
  headSha,
  testedSha,
  git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }),
  sources = discoverSources(),
  independent = () => isolatedSourceLayout(sources),
}) {
  const context = { eventName, ...(testedSha && SHA.test(testedSha) ? { testedSha } : {}) };
  if (eventName !== "pull_request")
    return allSelection(sources, "Non-PR events run the full live suite", context);
  try {
    if (![baseSha, headSha, testedSha].every((sha) => typeof sha === "string" && SHA.test(sha)))
      throw new Error("Immutable PR commits are unavailable");
    if (git(["rev-parse", "HEAD"]).trim() !== testedSha)
      throw new Error("Tested checkout does not match the event commit");
    for (const sha of [baseSha, headSha]) git(["cat-file", "-e", `${sha}^{commit}`]);
    const mergeBase = git(["merge-base", baseSha, headSha]).trim();
    if (!SHA.test(mergeBase)) throw new Error("Invalid merge base");
    const tree = (sha) =>
      inventoryFromPaths(
        git(["ls-tree", "-r", "--name-only", "-z", sha, "--", SOURCE_ROOT])
          .split("\0")
          .filter(Boolean),
      );
    const baseSources = tree(baseSha),
      headSources = tree(headSha),
      ancestorSources = tree(mergeBase);
    if (!independent())
      throw new Error("Cross-source or uncertain source dependencies require the full suite");
    const changes = parseDiff(
      git([
        "diff",
        "--no-ext-diff",
        "--name-status",
        "-z",
        "--find-renames",
        mergeBase,
        headSha,
        "--",
      ]),
    );
    return validateSelection(
      {
        ...classifyChanges(
          changes,
          sources,
          [...new Set([...baseSources, ...ancestorSources])],
          headSources,
        ),
        baseSources,
        headSources,
        ancestorSources,
        ...context,
        baseSha,
        headSha,
        mergeBase,
      },
      sources,
      testedSha,
    );
  } catch {
    return allSelection(
      sources,
      "PR diff or source ownership could not be verified; running all sources",
      context,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let event = {};
  try {
    if (process.env.GITHUB_EVENT_PATH)
      event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  } catch {
    /* Unverifiable event metadata deliberately falls back to the full suite. */
  }
  const selection = createSelection({
    eventName: process.env.GITHUB_EVENT_NAME,
    baseSha: event?.pull_request?.base?.sha,
    headSha: event?.pull_request?.head?.sha,
    testedSha: process.env.GITHUB_SHA,
  });
  const output = process.env.LIVE_TEST_SELECTION;
  if (!output) throw new Error("LIVE_TEST_SELECTION must name the output manifest");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(selection, null, 2)}\n`);
  console.log(
    `Live selection: ${selection.mode}; ${selection.selectedCount}/${selection.discoveredSources.length} sources. ${selection.reason}`,
  );
}
