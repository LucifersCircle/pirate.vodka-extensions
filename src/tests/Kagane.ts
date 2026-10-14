import { type TestLogger } from "@paperback/types";
import { TestSuite, registerDefaultTests } from "./suite.js";
import { Kagane, type KaganeImplementation } from "../Kagane/main.js";
import sourceInfo from "../Kagane/pbconfig.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Kagane tests", logger);
  registerDefaultTests(suite, Kagane as typeof Kagane & KaganeImplementation, sourceInfo);

  await suite.run();
}
