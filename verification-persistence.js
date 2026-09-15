/**
 * Verification Persistence + Stale Evidence — WAM 1.1
 *
 * Change 16 — session-persistence:
 *   persistVerificationState, loadVerificationState, createVerificationSnapshot
 *
 * Change 17 — stale-evidence:
 *   EVIDENCE_TTL, getEvidenceTTL, isEvidenceStale
 *
 * Persistence root: .wam/verifications/ (mirrors PersistenceManager convention).
 */

import fs from "node:fs";
import path from "node:path";

let snapshotCounter = 0;

// ── Stale Evidence Constants ────────────────────────────────────────────────

/** Default TTL for evidence freshness: 24 hours in milliseconds. */
export const EVIDENCE_TTL = 24 * 60 * 60 * 1000; // 86_400_000 ms

/**
 * Returns the configured TTL for evidence staleness checks (ms).
 * Override via WAM_EVIDENCE_TTL env var for testing flexibility.
 */
export function getEvidenceTTL() {
  const env = process.env.WAM_EVIDENCE_TTL;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return EVIDENCE_TTL;
}

/**
 * Determines whether evidence is stale relative to the configured TTL.
 * Evidence is stale when (now - evidence.timestamp) > getEvidenceTTL().
 * Accepts evidence objects with a `timestamp` (number, ms) or `at` (ISO string) field.
 */
export function isEvidenceStale(evidence) {
  if (!evidence) return true;
  const ttl = getEvidenceTTL();
  const now = Date.now();

  let evidenceTime;
  if (typeof evidence.timestamp === "number") {
    evidenceTime = evidence.timestamp;
  } else if (typeof evidence.at === "string") {
    evidenceTime = new Date(evidence.at).getTime();
  } else {
    return true; // no recognizable timestamp → stale
  }

  if (isNaN(evidenceTime)) return true;
  return now - evidenceTime > ttl;
}

// ── Session Persistence ───────────────────────────────────────────────────────

const VERIFICATIONS_DIR = path.join(process.cwd(), ".wam", "verifications");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getPath(taskId) {
  return path.join(VERIFICATIONS_DIR, `${taskId}.json`);
}

/**
 * Persists the verification state for a task to disk as JSON.
 * @param {string} taskId
 * @param {object} state — verification state object to serialize
 * @returns {{ taskId, persistedAt, path }}
 */
export function persistVerificationState(taskId, state) {
  if (!taskId) throw new Error("taskId is required");
  ensureDir(VERIFICATIONS_DIR);
  const filePath = getPath(taskId);
  const record = {
    taskId,
    state,
    persistedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
  return { taskId, persistedAt: record.persistedAt, path: filePath };
}

/**
 * Loads the verification state for a task from disk.
 * Returns null if no file exists for the task.
 * @param {string} taskId
 * @returns {object|null} — { taskId, state, persistedAt } or null
 */
export function loadVerificationState(taskId) {
  if (!taskId) throw new Error("taskId is required");
  const filePath = getPath(taskId);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Creates a timestamped snapshot of the current verification state.
 * Appends a snapshot entry to the task's existing record (or creates a new one).
 * Snapshots are stored in `.wam/verifications/{taskId}.snapshots/` as individual files.
 * @param {string} taskId
 * @param {object} state — current verification state to snapshot
 * @returns {{ taskId, snapshotId, snapshotAt, path }}
 */
export function createVerificationSnapshot(taskId, state) {
  if (!taskId) throw new Error("taskId is required");
  const snapshotsDir = path.join(VERIFICATIONS_DIR, taskId, "snapshots");
  ensureDir(snapshotsDir);

  const snapshotId = Date.now().toString(36) + "-" + (snapshotCounter++);
  const snapshotAt = new Date().toISOString();
  const snapshot = {
    snapshotId,
    taskId,
    state,
    snapshotAt,
  };
  const filePath = path.join(snapshotsDir, `${snapshotId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");

  return { taskId, snapshotId, snapshotAt, path: filePath };
}
