import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

// Exercise extension code directly in Node without changing the production bundle.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    if (specifier === "@paperback/types/lib/compat/0.8") {
      return nextResolve("@paperback/types/lib/compat/0.8/index.js", context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".ts")) {
      const { outputText } = transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
        fileName: url,
      });
      return { format: "module", source: outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
