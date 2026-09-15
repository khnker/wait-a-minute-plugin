/**
 * Verification Persistence + Stale Evidence Tests
 *
 * Cambios cubiertos:
 *   Change 16 — session-persistence: persistVerificationState, loadVerificationState, createVerificationSnapshot
 *   Change 17 — stale-evidence: EVIDENCE_TTL, getEvidenceTTL, isEvidenceStale
 *
 * Ejecutar: node --test verification-persistence.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EVIDENCE_TTL,
  getEvidenceTTL,
  isEvidenceStale,
  persistVerificationState,
  loadVerificationState,
  createVerificationSnapshot,
} from "./verification-persistence.js";

const CWD = process.cwd();
const WAM_DIR = path.join(CWD, ".wam", "verifications");

// ── Helpers ─────────────────────────────────────────────────────────

function setup() {
  // Limpiar directorio de test antes de cada prueba
  if (fs.existsSync(WAM_DIR)) {
    fs.rmSync(WAM_DIR, { recursive: true, force: true });
  }
}

// ── Change 17: Stale Evidence — Constants ──────────────────────────

test("EVIDENCE_TTL — default value is 24h (86400000ms)", () => {
  assert.equal(EVIDENCE_TTL, 86_400_000);
});

test("getEvidenceTTL — returns EVIDENCE_TTL by default", () => {
  const ttl = getEvidenceTTL();
  assert.equal(ttl, EVIDENCE_TTL);
});

test("getEvidenceTTL — respects WAM_EVIDENCE_TTL env var", () => {
  const original = process.env.WAM_EVIDENCE_TTL;
  process.env.WAM_EVIDENCE_TTL = "5000";
  try {
    assert.equal(getEvidenceTTL(), 5000);
  } finally {
    if (original === undefined) delete process.env.WAM_EVIDENCE_TTL;
    else process.env.WAM_EVIDENCE_TTL = original;
  }
});

test("getEvidenceTTL — ignores invalid env var values", () => {
  const original = process.env.WAM_EVIDENCE_TTL;
  process.env.WAM_EVIDENCE_TTL = "abc";
  try {
    assert.equal(getEvidenceTTL(), EVIDENCE_TTL);
  } finally {
    if (original === undefined) delete process.env.WAM_EVIDENCE_TTL;
    else process.env.WAM_EVIDENCE_TTL = original;
  }
});

test("getEvidenceTTL — ignores zero and negative env values", () => {
  const original = process.env.WAM_EVIDENCE_TTL;
  process.env.WAM_EVIDENCE_TTL = "0";
  try {
    assert.equal(getEvidenceTTL(), EVIDENCE_TTL);
  } finally {
    if (original === undefined) delete process.env.WAM_EVIDENCE_TTL;
    else process.env.WAM_EVIDENCE_TTL = original;
  }
});

// ── Change 17: Stale Evidence — isEvidenceStale ────────────────────

test("isEvidenceStale — fresh evidence (timestamp within TTL)", () => {
  const evidence = { timestamp: Date.now() };
  assert.equal(isEvidenceStale(evidence), false);
});

test("isEvidenceStale — stale evidence (timestamp beyond TTL)", () => {
  const staleTime = Date.now() - EVIDENCE_TTL - 1000; // 1ms past TTL
  const evidence = { timestamp: staleTime };
  assert.equal(isEvidenceStale(evidence), true);
});

test("isEvidenceStale — exactly at TTL boundary is NOT stale", () => {
  const evidence = { timestamp: Date.now() - EVIDENCE_TTL };
  assert.equal(isEvidenceStale(evidence), false);
});

test("isEvidenceStale — evidence with `at` ISO string field", () => {
  const fresh = { at: new Date().toISOString() };
  assert.equal(isEvidenceStale(fresh), false);
});

test("isEvidenceStale — evidence with `at` ISO string past TTL", () => {
  const stale = { at: new Date(Date.now() - EVIDENCE_TTL * 2).toISOString() };
  assert.equal(isEvidenceStale(stale), true);
});

test("isEvidenceStale — null evidence is stale", () => {
  assert.equal(isEvidenceStale(null), true);
});

test("isEvidenceStale — undefined evidence is stale", () => {
  assert.equal(isEvidenceStale(undefined), true);
});

test("isEvidenceStale — evidence without timestamp is stale", () => {
  assert.equal(isEvidenceStale({ observation: "no timestamp" }), true);
});

test("isEvidenceStale — evidence with NaN timestamp is stale", () => {
  assert.equal(isEvidenceStale({ timestamp: NaN }), true);
});

// ── Change 16: persistVerificationState ────────────────────────────

test("persistVerificationState — writes state to disk", () => {
  setup();
  const taskId = "test-task-1";
  const state = { status: "VERIFIED", requirements: [] };
  const result = persistVerificationState(taskId, state);

  assert.equal(result.taskId, taskId);
  assert.ok(result.persistedAt);
  assert.ok(result.path.endsWith(`${taskId}.json`));
  assert.ok(fs.existsSync(result.path), "file was written");

  const raw = JSON.parse(fs.readFileSync(result.path, "utf-8"));
  assert.equal(raw.taskId, taskId);
  assert.deepEqual(raw.state, state);
  assert.ok(raw.persistedAt);
});

test("persistVerificationState — throws on missing taskId", () => {
  assert.throws(() => persistVerificationState(null, {}), /taskId is required/);
  assert.throws(() => persistVerificationState(undefined, {}), /taskId is required/);
});

test("persistVerificationState — overwrites existing file", () => {
  setup();
  const taskId = "test-task-overwrite";
  persistVerificationState(taskId, { status: "VERIFIED" });
  persistVerificationState(taskId, { status: "FAILED" });

  const raw = JSON.parse(fs.readFileSync(path.join(WAM_DIR, `${taskId}.json`), "utf-8"));
  assert.equal(raw.state.status, "FAILED");
});

test("persistVerificationState — creates .wam/verifications/ directory", () => {
  setup();
  // Ensure dir doesn't exist
  if (fs.existsSync(WAM_DIR)) fs.rmSync(WAM_DIR, { recursive: true });

  persistVerificationState("dir-test", { status: "VERIFIED" });
  assert.ok(fs.existsSync(WAM_DIR), "directory created");
});

test("persistVerificationState — handles complex state objects", () => {
  setup();
  const taskId = "complex-state";
  const state = {
    status: "VERIFYING",
    requirements: [
      { id: "R1", verificationStatus: "VERIFIED", evidence: [{ method: "test", result: "pass" }] },
      { id: "R2", verificationStatus: "UNVERIFIED" },
    ],
    snapshotAt: new Date().toISOString(),
  };
  const result = persistVerificationState(taskId, state);
  assert.ok(fs.existsSync(result.path));
  const raw = JSON.parse(fs.readFileSync(result.path, "utf-8"));
  assert.deepEqual(raw.state, state);
});

// ── Change 16: loadVerificationState ───────────────────────────────

test("loadVerificationState — loads existing state", () => {
  setup();
  const taskId = "test-load";
  const state = { status: "VERIFIED" };
  persistVerificationState(taskId, state);

  const loaded = loadVerificationState(taskId);
  assert.ok(loaded !== null);
  assert.equal(loaded.taskId, taskId);
  assert.deepEqual(loaded.state, state);
  assert.ok(loaded.persistedAt);
});

test("loadVerificationState — returns null when file missing", () => {
  setup();
  const loaded = loadVerificationState("nonexistent-task");
  assert.equal(loaded, null);
});

test("loadVerificationState — throws on missing taskId", () => {
  assert.throws(() => loadVerificationState(null), /taskId is required/);
  assert.throws(() => loadVerificationState(undefined), /taskId is required/);
});

test("loadVerificationState — after persist round-trip", () => {
  setup();
  const taskId = "round-trip";
  const originalState = { status: "FAILED", error: "timeout" };
  persistVerificationState(taskId, originalState);
  const loaded = loadVerificationState(taskId);
  assert.deepEqual(loaded.state, originalState);
});

// ── Change 16: createVerificationSnapshot ──────────────────────────

test("createVerificationSnapshot — creates snapshot file", () => {
  setup();
  const taskId = "snapshot-task";
  const state = { status: "VERIFIED" };
  const result = createVerificationSnapshot(taskId, state);

  assert.equal(result.taskId, taskId);
  assert.ok(result.snapshotId);
  assert.ok(result.snapshotAt);
  assert.ok(result.path.endsWith(".json"));
  assert.ok(fs.existsSync(result.path), "snapshot file written");

  const raw = JSON.parse(fs.readFileSync(result.path, "utf-8"));
  assert.equal(raw.taskId, taskId);
  assert.equal(raw.snapshotId, result.snapshotId);
  assert.deepEqual(raw.state, state);
  assert.ok(raw.snapshotAt);
});

test("createVerificationSnapshot — multiple snapshots accumulate", () => {
  setup();
  const taskId = "multi-snapshot";
  createVerificationSnapshot(taskId, { status: "VERIFYING" });
  const snap2 = createVerificationSnapshot(taskId, { status: "VERIFIED" });

  const snapshotsDir = path.join(WAM_DIR, taskId, "snapshots");
  const files = fs.readdirSync(snapshotsDir);
  assert.equal(files.length, 2);
  assert.ok(files.includes(`${snap2.snapshotId}.json`));
});

test("createVerificationSnapshot — snapshotId is unique per call", () => {
  setup();
  const taskId = "unique-ids";
  const s1 = createVerificationSnapshot(taskId, { status: "A" });
  const s2 = createVerificationSnapshot(taskId, { status: "B" });
  assert.notEqual(s1.snapshotId, s2.snapshotId);
  assert.notEqual(s1.path, s2.path);
  assert.ok(fs.existsSync(s1.path));
  assert.ok(fs.existsSync(s2.path));
});

test("createVerificationSnapshot — creates task directory structure", () => {
  setup();
  createVerificationSnapshot("dir-struct", { status: "UNVERIFIED" });
  const snapshotsDir = path.join(WAM_DIR, "dir-struct", "snapshots");
  assert.ok(fs.existsSync(snapshotsDir), "snapshots dir created");
});

test("createVerificationSnapshot — throws on missing taskId", () => {
  assert.throws(() => createVerificationSnapshot(null, {}), /taskId is required/);
  assert.throws(() => createVerificationSnapshot(undefined, {}), /taskId is required/);
});

test("createVerificationSnapshot — snapshots are independent records", () => {
  setup();
  const taskId = "independent";
  createVerificationSnapshot(taskId, { status: "A" });
  const snap2 = createVerificationSnapshot(taskId, { status: "B" });

  const raw = JSON.parse(fs.readFileSync(snap2.path, "utf-8"));
  assert.equal(raw.state.status, "B");

  // First snapshot should still have A
  const dir = path.join(WAM_DIR, taskId, "snapshots");
  const files = fs.readdirSync(dir).sort();
  const first = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf-8"));
  assert.equal(first.state.status, "A");
});

// ── Cross-cutting: integration — persistence + staleness ───────────

test("integration — loaded snapshot is fresh, old one is stale", () => {
  setup();
  const taskId = "integration-test";

  // Persist with a fresh timestamp
  const state = { timestamp: Date.now(), status: "VERIFIED" };
  persistVerificationState(taskId, state);

  const loaded = loadVerificationState(taskId);
  assert.ok(loaded !== null);
  assert.equal(isEvidenceStale(loaded.state), false, "fresh evidence should not be stale");
});

test("integration — very old persisted evidence is stale", () => {
  setup();
  const taskId = "stale-integration";
  const state = { timestamp: Date.now() - EVIDENCE_TTL * 2, status: "VERIFIED" };
  persistVerificationState(taskId, state);

  const loaded = loadVerificationState(taskId);
  assert.ok(loaded !== null);
  assert.equal(isEvidenceStale(loaded.state), true, "old evidence should be stale");
});
