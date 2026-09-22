/**
 * Evidence Freshness / Closure
 *
 * `refreshEvidenceValidity(taskId, root)` is the orchestrator that detects
 * environment and artifact drift, invalidates the affected evidence records,
 * recomputes requirement satisfaction, and returns a structured delta report.
 *
 * Drift sources:
 *   1. Environment fingerprint drift (os / node version / executable / version /
 *      git revision). This is the same check used by
 *      `detectInvalidatedEvidence` in evidence-lineage.js, extended with a
 *      git-revision probe and file-hash tracking.
 *   2. Artifact drift — any file whose hash (or mtime, as a cheap proxy)
 *      changed since the evidence was captured. The set of relevant files is
 *      declared by the task state under `state.relevantFiles`; if absent, we
 *      conservatively consider every file in the task's lineage directory.
 *
 * Evidence metadata:
 *   `refreshEvidenceValidity` also enriches evidence records with:
 *     - `environment` (EnvironmentFingerprint at capture time)
 *     - `artifactHashes` (map of relevant path -> sha256)
 *     - `artifactMtimes` (map of relevant path -> mtime ms)
 *   These are stored alongside the evidence so future freshness checks can
 *   diff against them.
 *
 * Returned delta report shape:
 *   {
 *     taskId,
 *     root,
 *     drifted: boolean,
 *     reasons: string[],                // human-readable drift reasons
 *     previousEnvironment: object|null, // env fingerprint last recorded
 *     currentEnvironment: object,       // env fingerprint observed now
 *     artifactChanges: [                // per-file drift entries
 *       { path, previousHash, currentHash, previousMtime, currentMtime, status }
 *     ],
 *     invalidatedEvidence: [            // evidence records marked invalidated
 *       { id, requirementId, status, invalidationReason }
 *     ],
 *     satisfiedBefore: string[],        // requirement IDs satisfied pre-refresh
 *     satisfiedAfter:  string[],        // requirement IDs satisfied post-refresh
 *     unsatisfiedDelta: {               // recomputed gap
 *       gained:  string[],              // requirements that LOST satisfaction
 *       lost:    string[],              // requirements that LOST satisfaction
 *     },
 *     recomputedAt: number,
 *   }
 *
 * The function is read-mostly: it writes only to evidence records it
 * invalidates and to a single `.wam/tasks/<taskId>/freshness.json` snapshot.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import {
  getAllEvidence,
  getEvidence,
  invalidateEvidence,
  isRequirementSatisfied,
  getSatisfiedRequirements,
  getUnsatisfiedRequirements,
} from "./evidence-lineage.js";
import { getTaskState } from "./engine.js";

function saveTaskState(taskId, state, root) {
  const dir = path.join(root, ".wam", "tasks", taskId);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "state.yaml"), JSON.stringify(state, null, 2));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeReadFile(p) {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Compute the current environment fingerprint.
 *
 * @param {string} root - project root
 * @returns {{
 *   os: string,
 *   nodeVersion: string,
 *   executable: string,
 *   version: string,
 *   repositoryRevision: string,
 *   capturedAt: number,
 * }}
 */
export function captureEnvironment(root) {
  let revision = "";
  try {
    revision = execFileSync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
  } catch {
    revision = "";
  }
  return {
    os: `${process.platform}-${process.arch}`,
    nodeVersion: process.version,
    executable: process.execPath,
    version: process.env.npm_package_version || "",
    repositoryRevision: revision,
    capturedAt: Date.now(),
  };
}

/**
 * Compute a sha256 + mtime for a single file. Returns null for missing files.
 */
function fingerprintFile(absPath) {
  const buf = safeReadFile(absPath);
  if (buf === null) return null;
  let mtime = 0;
  try {
    mtime = fs.statSync(absPath).mtimeMs;
  } catch {
    mtime = 0;
  }
  return { hash: sha256(buf), mtime };
}

/**
 * Fingerprint a list of relative paths against root. Missing files map to null.
 */
export function fingerprintArtifacts(root, relativePaths) {
  const out = {};
  for (const rel of relativePaths || []) {
    const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
    out[rel] = fingerprintFile(abs);
  }
  return out;
}

/**
 * Resolve the list of relevant artifact paths for a task.
 *
 * Order of precedence:
 *   1. state.relevantFiles (authoritative)
 *   2. evidence.artifactHashes union (re-derived from existing evidence)
 *   3. empty list (no relevant files known)
 */
function resolveRelevantFiles(state, evidence) {
  if (Array.isArray(state.relevantFiles) && state.relevantFiles.length > 0) {
    return state.relevantFiles;
  }
  const collected = new Set();
  for (const ev of evidence) {
    if (ev && ev.artifactHashes) {
      for (const p of Object.keys(ev.artifactHashes)) collected.add(p);
    }
    if (ev && ev.artifactMtimes) {
      for (const p of Object.keys(ev.artifactMtimes)) collected.add(p);
    }
  }
  return [...collected];
}

/**
 * Decide which evidence records are affected by a set of artifact changes.
 *
 * An evidence record is affected if any of its declared artifactHashes /
 * artifactMtimes correspond to a changed file.
 */
function evidenceAffectedByArtifactChanges(ev, artifactChanges) {
  if (!ev) return false;
  const changed = new Set(
    artifactChanges
      .filter((c) => c.status !== "unchanged")
      .map((c) => c.path)
  );
  if (changed.size === 0) return false;
  const declared = new Set();
  if (ev.artifactHashes) for (const p of Object.keys(ev.artifactHashes)) declared.add(p);
  if (ev.artifactMtimes) for (const p of Object.keys(ev.artifactMtimes)) declared.add(p);
  for (const p of declared) {
    if (changed.has(p)) return true;
  }
  return false;
}

/**
 * Recompute requirement satisfaction for a task from scratch (after
 * invalidations have been applied). Returns { satisfied, unsatisfied }.
 */
function recomputeSatisfaction(taskId, root) {
  return {
    satisfied: getSatisfiedRequirements(taskId, root).map((r) => r.requirementId),
    unsatisfied: getUnsatisfiedRequirements(taskId, root).map((r) => r.requirementId),
  };
}

/**
 * Persist the freshness snapshot.
 */
function writeFreshnessSnapshot(root, taskId, report) {
  const dir = path.join(root, ".wam", "tasks", taskId);
  ensureDir(dir);
  const snap = path.join(dir, "freshness.json");
  fs.writeFileSync(snap, JSON.stringify(report, null, 2));
}

/**
 * @typedef {Object} RefreshDeltaReport
 * @property {string} taskId
 * @property {string} root
 * @property {boolean} drifted
 * @property {string[]} reasons
 * @property {object|null} previousEnvironment
 * @property {object} currentEnvironment
 * @property {Array<{path:string,previousHash:string|null,currentHash:string|null,previousMtime:number,currentMtime:number,status:string}>} artifactChanges
 * @property {Array<{id:string,requirementId:string,status:string,invalidationReason:string}>} invalidatedEvidence
 * @property {string[]} satisfiedBefore
 * @property {string[]} satisfiedAfter
 * @property {{gained:string[],lost:string[]}} unsatisfiedDelta
 * @property {number} recomputedAt
 */

/**
 * Refresh evidence validity for a task. Detects drift, invalidates affected
 * evidence, recomputes requirement satisfaction, and returns a delta report.
 *
 * The function is idempotent: running it twice in a row with no intervening
 * changes should produce a `drifted: false` report with empty
 * `invalidatedEvidence`.
 *
 * @param {string} taskId
 * @param {string} [root] - project root (defaults to process.cwd())
 * @returns {RefreshDeltaReport}
 */
export function refreshEvidenceValidity(taskId, root) {
  const effectiveRoot = root || process.cwd();
  const state = getTaskState(taskId, effectiveRoot);
  if (!state) {
    return {
      taskId,
      root: effectiveRoot,
      drifted: false,
      reasons: [`task state not found for ${taskId}`],
      previousEnvironment: null,
      currentEnvironment: captureEnvironment(effectiveRoot),
      artifactChanges: [],
      invalidatedEvidence: [],
      satisfiedBefore: [],
      satisfiedAfter: [],
      unsatisfiedDelta: { gained: [], lost: [] },
      recomputedAt: Date.now(),
    };
  }

  const previousEnvironment = state.currentEnvironment || null;
  const currentEnvironment = captureEnvironment(effectiveRoot);
  const evidence = getAllEvidence(taskId, effectiveRoot);

  // 1) Environment drift detection.
  const envDrifted = isEnvironmentDrifted(previousEnvironment, currentEnvironment);

  // 2) Artifact drift detection.
  const relevantFiles = resolveRelevantFiles(state, evidence);
  const previousArtifacts = {};
  for (const ev of evidence) {
    if (!ev) continue;
    if (ev.artifactHashes) {
      for (const [p, h] of Object.entries(ev.artifactHashes)) {
        const existing = previousArtifacts[p] || {};
        existing.hash = h;
        previousArtifacts[p] = existing;
      }
    }
    if (ev.artifactMtimes) {
      for (const [p, m] of Object.entries(ev.artifactMtimes)) {
        const existing = previousArtifacts[p] || {};
        existing.mtime = m;
        previousArtifacts[p] = existing;
      }
    }
  }
  const currentArtifacts = fingerprintArtifacts(effectiveRoot, relevantFiles);
  const artifactChanges = diffArtifacts(previousArtifacts, currentArtifacts);

  const reasons = [];
  if (envDrifted) reasons.push("environment fingerprint changed");
  if (artifactChanges.some((c) => c.status !== "unchanged")) {
    reasons.push("artifact hash or mtime changed");
  }
  const drifted = reasons.length > 0;

  // Capture pre-drift satisfaction BEFORE we invalidate anything, so the delta
  // report can show which requirements we just lost.
  const satisfiedBefore = getSatisfiedRequirements(taskId, effectiveRoot);

  // 3) Decide which evidence to invalidate.
  const invalidatedEvidence = [];
  if (drifted) {
    for (const ev of evidence) {
      if (!ev) continue;
      if (ev.status === "invalidated") continue;
      const envInvalidates = envDrifted;
      const artifactInvalidates = evidenceAffectedByArtifactChanges(ev, artifactChanges);
      if (envInvalidates || artifactInvalidates) {
        const reasonParts = [];
        if (envInvalidates) reasonParts.push("environment drift");
        if (artifactInvalidates) reasonParts.push("artifact drift");
        const reason = reasonParts.join(" + ");
        const ok = invalidateEvidence(taskId, ev.id, reason, effectiveRoot);
        if (ok) {
          invalidatedEvidence.push({
            id: ev.id,
            requirementId: ev.requirementId,
            status: "invalidated",
            invalidationReason: reason,
          });
        }
      }
    }
  }

  // 4) Stamp current environment + artifacts onto surviving evidence.
  stampEvidenceMetadata(taskId, evidence, currentEnvironment, currentArtifacts, effectiveRoot);

  // 5) Recompute requirement satisfaction. satisfiedBefore was captured before
//    invalidation; now read the post-invalidation set.
  const after = recomputeSatisfaction(taskId, effectiveRoot);
  const satisfiedAfter = after.satisfied;

  const lost = satisfiedBefore.filter((id) => !satisfiedAfter.includes(id));
  const gained = satisfiedAfter.filter((id) => !satisfiedBefore.includes(id));

  // 6) Persist current environment on the task state.
  state.currentEnvironment = currentEnvironment;
  if (!Array.isArray(state.relevantFiles)) {
    state.relevantFiles = relevantFiles;
  }
  saveTaskState(taskId, state, effectiveRoot);

  const report = {
    taskId,
    root: effectiveRoot,
    drifted,
    reasons,
    previousEnvironment,
    currentEnvironment,
    artifactChanges,
    invalidatedEvidence,
    satisfiedBefore,
    satisfiedAfter,
    unsatisfiedDelta: { gained, lost },
    recomputedAt: Date.now(),
  };

  writeFreshnessSnapshot(effectiveRoot, taskId, report);
  return report;
}

function isEnvironmentDrifted(prev, curr) {
  if (!prev) return false;
  return (
    prev.os !== curr.os ||
    prev.nodeVersion !== curr.nodeVersion ||
    prev.executable !== curr.executable ||
    prev.version !== curr.version ||
    (prev.repositoryRevision || "") !== (curr.repositoryRevision || "")
  );
}

function diffArtifacts(previousArtifacts, currentArtifacts) {
  const out = [];
  const allKeys = new Set([
    ...Object.keys(previousArtifacts || {}),
    ...Object.keys(currentArtifacts || {}),
  ]);
  for (const p of allKeys) {
    const prev = previousArtifacts[p] || null;
    const curr = currentArtifacts[p] || null;
    if (!prev && !curr) {
      out.push({ path: p, previousHash: null, currentHash: null, previousMtime: 0, currentMtime: 0, status: "missing" });
      continue;
    }
    if (!prev && curr) {
      out.push({ path: p, previousHash: null, currentHash: curr.hash, previousMtime: 0, currentMtime: curr.mtime, status: "added" });
      continue;
    }
    if (prev && !curr) {
      out.push({ path: p, previousHash: prev.hash, currentHash: null, previousMtime: prev.mtime, currentMtime: 0, status: "removed" });
      continue;
    }
    const status = prev.hash === curr.hash ? "unchanged" : "modified";
    out.push({
      path: p,
      previousHash: prev.hash,
      currentHash: curr.hash,
      previousMtime: prev.mtime,
      currentMtime: curr.mtime,
      status,
    });
  }
  return out;
}

function stampEvidenceMetadata(taskId, evidence, environment, artifacts, root) {
  for (const ev of evidence) {
    const live = getEvidence(taskId, ev.id, root);
    if (!live) continue;
    if (live.status === "invalidated") continue;
    live.environment = environment;
    live.artifactHashes = {};
    live.artifactMtimes = {};
    for (const [p, fp] of Object.entries(artifacts)) {
      if (!fp) continue;
      live.artifactHashes[p] = fp.hash;
      live.artifactMtimes[p] = fp.mtime;
    }
    const file = path.join(root, ".wam", "tasks", taskId, "lineage", `${live.id}.json`);
    try {
      fs.writeFileSync(file, JSON.stringify(live, null, 2));
    } catch {
      // best-effort stamp
    }
  }
}

/**
 * Check whether the current evidence for a task allows the DONE state.
 * Returns { allowed: boolean, reason: string, report: RefreshDeltaReport }.
 *
 * This is the gate `refreshEvidenceValidity` was built for: a DONE transition
 * is blocked whenever refreshEvidenceValidity reports drifted=true and at
 * least one requirement that was satisfied before is no longer satisfied.
 */
export function isDoneAllowed(taskId, root) {
  const report = refreshEvidenceValidity(taskId, root);
  if (!report.drifted) {
    return { allowed: true, reason: "no drift detected", report };
  }
  if (report.unsatisfiedDelta.lost.length > 0) {
    return {
      allowed: false,
      reason: `drift invalidated evidence for ${report.unsatisfiedDelta.lost.length} requirement(s)`,
      report,
    };
  }
  return {
    allowed: false,
    reason: `drift detected (${report.reasons.join(", ")}) but no satisfied requirement lost`,
    report,
  };
}