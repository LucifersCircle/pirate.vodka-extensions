import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

await test("FlareSolverr helper refuses CAPTCHA input and upstream drift offline", () => {
  const script = fileURLToPath(new URL("./flaresolverr/test_passive.py", import.meta.url));
  const result = spawnSync("python3", [script], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
