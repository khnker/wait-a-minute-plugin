import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { transitionVerification } from "./verification-lifecycle.js";
import { createEvidence, invalidateDependentEvidence } from "./evidence-lineage.js";

test("Integration: VERIFIED → INVALIDATED → RE-VERIFYING", () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-inval-"));
  const taskId = "test-inval-task";
  
  // 1. Setup Evidence and verify
  const ev = createEvidence(taskId, { requirementId: "req-1", content: "Valid" }, TMP);
  // Simulación de estado VERIFIED (asumimos lógica de engine ya lo puso así)
  
  // 2. Contradiction observed
  const invalidated = transitionVerification("VERIFIED", "INVALIDATED");
  assert.equal(invalidated, "INVALIDATED");

  // 3. Invalidate evidence
  const staleEvidence = invalidateDependentEvidence(taskId, "req-1", "Contradiction found", TMP);
  assert.equal(staleEvidence.length, 1);
  assert.equal(staleEvidence[0].status, "stale");

  // 4. Back to RE-VERIFYING
  const reVerifying = transitionVerification("INVALIDATED", "VERIFYING");
  assert.equal(reVerifying, "VERIFYING");

  fs.rmSync(TMP, { recursive: true, force: true });
});
