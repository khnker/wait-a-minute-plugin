import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  refreshEvidenceValidity,
  isDoneAllowed,
  captureEnvironment,
  fingerprintArtifacts,
} from "./evidence-freshness.js";
import {
  createEvidence,
  linkEvidenceToRequirement,
  verifyEvidence,
  getEvidence,
  invalidateEvidence as invalidateEvidenceFn,
} from "./evidence-lineage.js";
import { getTaskState } from "./engine.js";

/**
 * Build a minimal task layout under a temporary root, seed requirements,
 * attach valid evidence to one of them, and return the root + cleanup.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.relevantFiles]
 * @param {Array<{id:string,description?:string,status?:string}>} [opts.requirements]
 */
function makeTask(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-evidence-fresh-"));
  const taskId = "task-fresh";
  const taskDir = path.join(root, ".wam", "tasks", taskId);
  fs.mkdirSync(taskDir, { recursive: true });

  const requirements = opts.requirements || [
    { id: "R1", description: "feature works", status: "pending" },
    { id: "R2", description: "tests pass", status: "pending" },
  ];

  const state = {
    id: taskId,
    requirements,
    relevantFiles: opts.relevantFiles || [],
    currentEnvironment: captureEnvironment(root),
    artifacts: {},
  };

  fs.writeFileSync(path.join(taskDir, "state.yaml"), JSON.stringify(state, null, 2));

  // Seed source files that we'll mutate to simulate drift.
  for (const rel of opts.relevantFiles || []) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `initial content for ${rel}\n`);
  }

  const cleanup = () => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  return { root, taskId, state, cleanup };
}

function seedEvidence(taskId, root, requirementId, artifactHashes) {
  const ev = createEvidence(
    taskId,
    {
      requirementId,
      hypothesisId: "H1",
      experimentId: "E1",
      observationId: "O1",
      content: "tests pass",
      type: "test",
      source: "tool",
    },
    root
  );
  linkEvidenceToRequirement(
    ev.id,
    requirementId,
    "H1",
    "E1",
    "O1",
    taskId,
    root
  );
  // Mark the evidence as PASS first so it actually satisfies its requirement.
  verifyEvidence(taskId, ev.id, "smoke", "PASS", root);
  // Then stamp artifact metadata so refreshEvidenceValidity can diff.
  const live = getEvidence(taskId, ev.id, root);
  live.artifactHashes = { ...(artifactHashes || {}) };
  live.artifactMtimes = {};
  for (const [p, hash] of Object.entries(artifactHashes || {})) {
    const abs = path.isAbsolute(p) ? p : path.join(root, p);
    try {
      live.artifactMtimes[p] = fs.statSync(abs).mtimeMs;
    } catch {
      live.artifactMtimes[p] = 0;
    }
  }
  fs.writeFileSync(
    path.join(root, ".wam", "tasks", taskId, "lineage", `${live.id}.json`),
    JSON.stringify(live, null, 2)
  );
  return ev.id;
}

test("captureEnvironment returns a non-empty fingerprint", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-env-"));
  try {
    const env = captureEnvironment(root);
    assert.equal(typeof env.os, "string");
    assert.ok(env.os.length > 0);
    assert.equal(typeof env.nodeVersion, "string");
    assert.ok(env.nodeVersion.startsWith("v"));
    assert.equal(typeof env.executable, "string");
    assert.equal(typeof env.repositoryRevision, "string");
    assert.equal(typeof env.capturedAt, "number");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fingerprintArtifacts hashes and timestamps existing files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-fp-"));
  try {
    const f = path.join(root, "a.js");
    fs.writeFileSync(f, "abc");
    const fp = fingerprintArtifacts(root, ["a.js"]);
    assert.ok(fp["a.js"]);
    assert.equal(fp["a.js"].hash.length, 64);
    assert.ok(fp["a.js"].mtime > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("refreshEvidenceValidity: no drift when nothing changed", () => {
  const { root, taskId, cleanup } = makeTask({ relevantFiles: ["src/foo.js"] });
  try {
    const fp = fingerprintArtifacts(root, ["src/foo.js"]);
    seedEvidence(taskId, root, "R1", { "src/foo.js": fp["src/foo.js"].hash });
    // First refresh records the new fingerprints (and the prior hashes match the current ones).
    const first = refreshEvidenceValidity(taskId, root);
    assert.equal(first.drifted, false);
    assert.equal(first.invalidatedEvidence.length, 0);
    // Second refresh, still no drift.
    const second = refreshEvidenceValidity(taskId, root);
    assert.equal(second.drifted, false);
    assert.equal(second.invalidatedEvidence.length, 0);
  } finally {
    cleanup();
  }
});

test("refreshEvidenceValidity: modifying relevant source invalidates evidence and blocks DONE", () => {
  const { root, taskId, cleanup } = makeTask({
    relevantFiles: ["src/foo.js", "README.md"],
    requirements: [
      { id: "R1", description: "core works", status: "pending" },
      { id: "R2", description: "docs ok", status: "pending" },
    ],
  });
  try {
    // Compute initial fingerprints and seed evidence tied to those hashes.
    const initialFps = fingerprintArtifacts(root, ["src/foo.js", "README.md"]);
    seedEvidence(taskId, root, "R1", {
      "src/foo.js": initialFps["src/foo.js"].hash,
      "README.md": initialFps["README.md"].hash,
    });
    seedEvidence(taskId, root, "R2", {
      "src/foo.js": initialFps["src/foo.js"].hash,
      "README.md": initialFps["README.md"].hash,
    });

    // Mutate ONLY src/foo.js (the relevant source). Leave README.md untouched.
    fs.writeFileSync(path.join(root, "src/foo.js"), "changed\n");

    const gate = isDoneAllowed(taskId, root);
    assert.equal(gate.allowed, false, "DONE must be blocked after relevant drift");
    assert.ok(
      gate.reason.includes("drift"),
      `reason should mention drift, got: ${gate.reason}`
    );
    assert.ok(gate.report.invalidatedEvidence.length >= 1);
    // Both seeded evidence entries referenced src/foo.js so both are affected.
    assert.equal(gate.report.unsatisfiedDelta.lost.length, 2);
  } finally {
    cleanup();
  }
});

test("refreshEvidenceValidity: modifying irrelevant file (README) preserves evidence", () => {
  const { root, taskId, cleanup } = makeTask({
    relevantFiles: ["src/foo.js", "README.md"],
  });
  try {
    const initialFps = fingerprintArtifacts(root, ["src/foo.js", "README.md"]);
    seedEvidence(taskId, root, "R1", {
      "src/foo.js": initialFps["src/foo.js"].hash,
    });

    // Mutate ONLY README.md — an irrelevant file.
    fs.writeFileSync(path.join(root, "README.md"), "new docs\n");

    // After refresh, evidence linked only to src/foo.js should remain valid.
    const report = refreshEvidenceValidity(taskId, root);
    assert.equal(report.invalidatedEvidence.length, 0);
    assert.ok(
      report.artifactChanges.some(
        (c) => c.path === "README.md" && (c.status === "modified" || c.status === "added")
      ),
      "README change should appear in artifactChanges"
    );
    // After re-stamp, future refresh should be clean.
    const report2 = refreshEvidenceValidity(taskId, root);
    assert.equal(report2.invalidatedEvidence.length, 0);
  } finally {
    cleanup();
  }
});

test("refreshEvidenceValidity: delta report carries environment, reasons, and recomputed satisfaction", () => {
  const { root, taskId, cleanup } = makeTask({
    relevantFiles: ["src/x.js"],
    requirements: [
      { id: "R1", description: "works", status: "pending" },
    ],
  });
  try {
    const fp = fingerprintArtifacts(root, ["src/x.js"]);
    seedEvidence(taskId, root, "R1", { "src/x.js": fp["src/x.js"].hash });
    fs.writeFileSync(path.join(root, "src/x.js"), "changed\n");

    const report = refreshEvidenceValidity(taskId, root);
    assert.equal(report.taskId, taskId);
    assert.equal(report.root, root);
    assert.equal(typeof report.recomputedAt, "number");
    assert.ok(Array.isArray(report.reasons));
    assert.ok(Array.isArray(report.artifactChanges));
    assert.ok(report.previousEnvironment);
    assert.ok(report.currentEnvironment);
    assert.equal(typeof report.satisfiedBefore, "object");
    assert.equal(typeof report.satisfiedAfter, "object");
    // R1 must have moved from satisfied to unsatisfied.
    assert.ok(report.satisfiedBefore.includes("R1"));
    assert.ok(!report.satisfiedAfter.includes("R1"));
    assert.ok(report.unsatisfiedDelta.lost.includes("R1"));
    // Freshness snapshot persisted to disk.
    const snap = path.join(root, ".wam", "tasks", taskId, "freshness.json");
    assert.ok(fs.existsSync(snap), "freshness.json snapshot must be written");
    const parsed = JSON.parse(fs.readFileSync(snap, "utf-8"));
    assert.equal(parsed.taskId, taskId);
  } finally {
    cleanup();
  }
});

test("refreshEvidenceValidity: idempotent — running twice with no changes produces no drift", () => {
  const { root, taskId, cleanup } = makeTask({ relevantFiles: ["src/y.js"] });
  try {
    const fp = fingerprintArtifacts(root, ["src/y.js"]);
    seedEvidence(taskId, root, "R1", { "src/y.js": fp["src/y.js"].hash });

    // First refresh records the new fingerprints.
    const first = refreshEvidenceValidity(taskId, root);
    // Second refresh should not detect drift.
    const second = refreshEvidenceValidity(taskId, root);
    assert.equal(second.drifted, false);
    assert.equal(second.invalidatedEvidence.length, 0);
  } finally {
    cleanup();
  }
});

test("refreshEvidenceValidity: env fingerprint is persisted on task state", () => {
  const { root, taskId, cleanup } = makeTask({ relevantFiles: [] });
  try {
    const report = refreshEvidenceValidity(taskId, root);
    const state = getTaskState(taskId, root);
    assert.ok(state.currentEnvironment);
    assert.equal(state.currentEnvironment.os, report.currentEnvironment.os);
    assert.equal(state.currentEnvironment.nodeVersion, report.currentEnvironment.nodeVersion);
  } finally {
    cleanup();
  }
});

test("refreshEvidenceValidity: missing task state produces a non-throwing report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-empty-"));
  try {
    const report = refreshEvidenceValidity("does-not-exist", root);
    assert.equal(report.drifted, false);
    assert.ok(report.reasons[0].includes("not found"));
    assert.ok(report.currentEnvironment);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});