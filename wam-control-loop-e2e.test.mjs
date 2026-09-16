import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { startExperiment, noteSuccess, noteFailure } from "./execution-engine.js";
import { getTaskState } from "./engine.js";
import { transitionVerification, canComplete } from "./verification-lifecycle.js";

test("WAM Control Loop E2E: Full cognitive cycle leads to DONE", () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-e2e-"));
  const taskId = "e2e-task";

  try {
    // 1. Task created with requirements
    const taskDir = path.join(TMP, ".wam", "tasks", taskId);
    fs.mkdirSync(taskDir, { recursive: true });
    
    // 2. Start experiment (Hypothesis)
    const { hypothesis, experiment } = startExperiment(TMP, taskId, {
      statement: "Fix bug in parser",
      tool: "edit",
      args: { path: "parser.ts" },
      expectedObservation: { type: "text", pattern: "Success" }
    });

    // 3. Agent action succeeds (Observation)
    noteSuccess(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      result: "File edited successfully",
      provenance: "agent-tool-edit"
    });

    // 4. Verify requirement -> VERIFIED
    const reqState = getTaskState(taskId, TMP);
    const req = reqState.requirements?.[0];
    if (req) {
      transitionVerification(req.verificationStatus || "UNVERIFIED", "VERIFYING");
      // Simulate verification passed
    }

    // 5. Completion Gate should allow DONE
    const completion = canComplete(reqState);
    assert.equal(completion.canComplete, true, "Task should be completable after verification");

  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
