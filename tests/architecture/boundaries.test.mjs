import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Define boundary rules: Layer -> Forbidden imports
const BOUNDARIES = {
  "domain": ["index.js", "engine.js"], // Domain shouldn't import entry points
  "verification": ["index.js", "engine.js"],
  "cognition": ["index.js", "engine.js", "verification/"],
};

test("Architecture Boundary: Domain should not import Runtime", () => {
  const root = process.cwd();
  const domainFiles = ["evidence/evidence.js", "verification/verification.js", "cognition-store.js"];
  
  for (const file of domainFiles) {
    const content = fs.readFileSync(path.join(root, file), "utf-8");
    for (const forbidden of BOUNDARIES["domain"]) {
      assert.ok(!content.includes(forbidden), `File ${file} should not import ${forbidden}`);
    }
  }
});
