import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { discoverSources, SOURCE_ROOT } from "./test-sources.mjs";
const require = createRequire(import.meta.url);

// Source implementations must remain inside their ownership roots. Logical suites may
// use shared harness modules, but their reachable local dependencies must stay owner-safe.
// Start from suites, never the central Mana runner that intentionally imports every suite.
export function isolatedSourceLayout(
  sources = discoverSources(),
  root = process.cwd(),
  sourceRoot = SOURCE_ROOT,
) {
  try {
    // Reporting/publishing remains built-in-only when dependency installation failed.
    const ts = require("typescript");
    root = realpathSync(root);
    const config = ts.readConfigFile(join(root, "tsconfig.json"), (path) => ts.sys.readFile(path));
    if (config.error) return false;
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    if (parsed.errors.some((error) => error.code !== 18003)) return false;
    const localPath = (path) => relative(root, path).split("\\").join("/");
    const suitePath = (source) =>
      sourceRoot === "src"
        ? `src/tests/${source}.ts`
        : `scripts/${source.toLowerCase()}-live-tests.mjs`;
    // Its image helper is intentionally shared by Hijala and VortexScans too.
    const sharedSuite = "scripts/mangasushi-live-tests.mjs";
    const ownerOf = (path) => {
      const local = localPath(path);
      return sources.find(
        (source) =>
          local.startsWith(`${sourceRoot}/${source}/`) ||
          (local !== sharedSuite && local === suitePath(source)),
      );
    };
    const inspectFile = (file, source, suiteMode, visited) => {
      if (realpathSync(file) !== resolve(file)) return false;
      if (visited.has(file)) return true;
      visited.add(file);
      if (lstatSync(file).isSymbolicLink()) return false;
      const tree = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      if (tree.parseDiagnostics.length) return false;
      let safe = true;
      const inspect = (node) => {
        let specifier;
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
          specifier = node.moduleSpecifier;
        else if (ts.isImportEqualsDeclaration(node)) {
          if (ts.isExternalModuleReference(node.moduleReference))
            specifier = node.moduleReference.expression;
          else safe = false;
        } else if (ts.isImportTypeNode(node)) specifier = node.argument?.literal;
        else if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === "require"))
        ) {
          specifier = node.arguments[0];
          if (node.arguments.length !== 1) safe = false;
        }
        if (specifier) {
          if (!ts.isStringLiteralLike(specifier)) safe = false;
          else {
            const target = ts.resolveModuleName(
              specifier.text,
              file,
              parsed.options,
              ts.sys,
            ).resolvedModule;
            if (target) {
              const resolved = realpathSync(target.resolvedFileName),
                owner = ownerOf(resolved);
              const external =
                target.isExternalLibraryImport ||
                resolved.split("\\").join("/").includes("/node_modules/");
              if (owner && owner !== source) safe = false;
              else if (!external) {
                const local = localPath(resolved);
                if (!suiteMode && !local.startsWith(`${sourceRoot}/${source}/`)) safe = false;
                else if (
                  local.startsWith("../") ||
                  local === ".." ||
                  !inspectFile(resolved, source, suiteMode, visited)
                )
                  safe = false;
              }
            } else if (!specifier.text.startsWith("node:")) safe = false;
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(tree);
      return safe;
    };
    for (const source of sources) {
      const files = [];
      const walk = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isSymbolicLink()) throw new Error("Uncertain source symlink ownership");
          if (entry.isDirectory()) walk(path);
          else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
        }
      };
      walk(join(root, sourceRoot, source));
      const implementationFiles = new Set();
      for (const file of files)
        if (!inspectFile(file, source, false, implementationFiles)) return false;
      const suite = join(root, suitePath(source));
      // A missing contract must still be selected and fail in the live runner, not disappear.
      if (existsSync(suite) && !inspectFile(suite, source, true, new Set())) return false;
    }
    return true;
  } catch {
    return false;
  }
}
