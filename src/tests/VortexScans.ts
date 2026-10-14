import { type TestLogger } from "@paperback/types";
import { TestSuite, registerDefaultTests } from "./suite.js";
import { VortexScans, type VortexScansImplementation } from "../VortexScans/main.js";
import sourceInfo from "../VortexScans/pbconfig.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("VortexScans tests", logger);
  registerDefaultTests(
    suite,
    VortexScans as typeof VortexScans & VortexScansImplementation,
    sourceInfo,
  );

  await suite.run();
}
