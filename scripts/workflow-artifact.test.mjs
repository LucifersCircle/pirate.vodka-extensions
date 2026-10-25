import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

void test("report download uses the producing job's immutable artifact ID across reruns", () => {
  const workflow = readFileSync(".github/workflows/live-tests.yaml", "utf8");
  const [producer, publisher] = workflow.split("  publish-status:");
  assert.ok(producer.includes("results-artifact-id: ${{ steps.results.outputs.artifact-id }}"));
  assert.match(producer, /name: Upload results and logs\n\s+id: results/);
  assert.ok(producer.includes("name: live-test-results-${{ github.run_attempt }}"));
  const output = "${{ needs.live-tests.outputs.results-artifact-id }}";
  assert.ok(publisher.includes(`RESULTS_ARTIFACT_ID: ${output}`));
  assert.ok(publisher.includes(`artifact-ids: ${output}`));
  assert.ok(publisher.includes("merge-multiple: true"));
  assert.ok(
    publisher.indexOf("Require this test job artifact") < publisher.indexOf("Download results"),
  );
  assert.ok(!publisher.includes("github.run_attempt"));
  assert.ok(!publisher.includes("name: live-test-results"));
  const guard = publisher.match(/run: \|\n([\s\S]*?)\n      - name: Download results/)[1];
  for (const id of ["", "0", "1259,1260", "latest", "12595204972"]) {
    const result = spawnSync("bash", ["-c", guard], {
      env: { ...process.env, RESULTS_ARTIFACT_ID: id },
    });
    assert.equal(result.status === 0, id === "12595204972");
  }
});
