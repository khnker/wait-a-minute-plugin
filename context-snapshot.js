/**
 * Context Snapshot — continuation invalidation.
 * Detects when context has become stale and needs rebuild.
 *
 * States: VALID | STALE | INVALID
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SNAPSHOT_DIR = ".wam/snapshots";

/**
 * @typedef {Object} ContextSnapshot
 * @property {string} taskId
 * @property {string} gitRevision
 * @property {string} relevantFilesHash
 * @property {string} projectContextHash
 * @property {string} taskStateHash
 * @property {number} createdAt
 */

/**
 * @typedef {"VALID" | "STALE" | "INVALID"} SnapshotStatus
 */

/**
 * @typedef {Object} SnapshotCheck
 * @property {SnapshotStatus} status
 * @property {string} reason
 * @property {string[]} changedSignals
 */

function hashString(str = "") {
  return crypto.createHash("sha256").update(str || "").digest("hex").slice(0, 16);
}

function hashFiles(filePaths, root) {
  const parts = [];
  for (const fp of filePaths) {
    const full = path.join(root, fp);
    try {
      const content = fs.readFileSync(full, "utf-8");
      parts.push(`${fp}:${hashString(content)}`);
    } catch {
      parts.push(`${fp}:missing`);
    }
  }
  return hashString(parts.join("|"));
}

function getGitRevision(root) {
  try {
    const head = fs.readFileSync(path.join(root, ".git", "HEAD"), "utf-8").trim();
    const ref = head.replace(/^ref:\s*/, "");
    const refPath = path.join(root, ".git", ref);
    if (fs.existsSync(refPath)) {
      return fs.readFileSync(refPath, "utf-8").trim().slice(0, 12);
    }
    return head.slice(0, 12);
  } catch {
    return null;
  }
}

function getRelevantFiles(root) {
  const candidates = [
    "package.json",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "nest-cli.json",
    "angular.json",
    "AGENTS.md",
    ".opencode/opencode.jsonc",
  ];
  return candidates.filter((f) => fs.existsSync(path.join(root, f)));
}

function getProjectContextHash(root) {
  const relevant = getRelevantFiles(root);
  return hashFiles(relevant, root);
}

function getTaskStateHash(taskState) {
  const serialized = JSON.stringify({
    phase: taskState?.phase,
    contractStatus: taskState?.contract?.status,
    requirements: taskState?.requirements?.map((r) => ({
      id: r.id,
      status: r.status,
    })),
    approvedStrategy: taskState?.approvedStrategy,
  });
  return hashString(serialized);
}

function snapshotDir(root) {
  const dir = path.join(root || process.cwd(), SNAPSHOT_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function snapshotPath(taskId, root) {
  return path.join(snapshotDir(root), `${taskId}.json`);
}

/**
 * Create a context snapshot for a task.
 */
export function createSnapshot(taskId, taskState, root) {
  const snapshot = {
    taskId,
    gitRevision: getGitRevision(root),
    relevantFilesHash: getProjectContextHash(root),
    projectContextHash: hashString(getRelevantFiles(root).join(",")),
    taskStateHash: getTaskStateHash(taskState),
    createdAt: Date.now(),
  };
  fs.writeFileSync(snapshotPath(taskId, root), JSON.stringify(snapshot, null, 2));
  return snapshot;
}

/**
 * Load an existing snapshot for a task.
 */
export function loadSnapshot(taskId, root) {
  try {
    const raw = fs.readFileSync(snapshotPath(taskId, root), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Check if a continuation can use the fast-path.
 *
 * @param {string} taskId
 * @param {Object} currentTaskState
 * @param {string} root
 * @returns {SnapshotCheck}
 */
export function checkContinuation(taskId, currentTaskState, root) {
  const previous = loadSnapshot(taskId, root);
  if (!previous) {
    return { status: "STALE", reason: "no-previous-snapshot", changedSignals: ["no-snapshot"] };
  }

  const changed = [];

  // Check git revision
  const currentGit = getGitRevision(root);
  if (currentGit && previous.gitRevision && currentGit !== previous.gitRevision) {
    changed.push("git-revision");
  }

  // Check relevant files (package.json, config, etc.)
  const currentFilesHash = getProjectContextHash(root);
  if (currentFilesHash !== previous.relevantFilesHash) {
    changed.push("relevant-files");
  }

  // Check task state
  const currentStateHash = getTaskStateHash(currentTaskState);
  if (currentStateHash !== previous.taskStateHash) {
    changed.push("task-state");
  }

  if (changed.length === 0) {
    return { status: "VALID", reason: "no-changes", changedSignals: [] };
  }

  // Task state changes = INVALID (need full rebuild)
  if (changed.includes("task-state")) {
    return { status: "INVALID", reason: "task-state-changed", changedSignals: changed };
  }

  // Other changes = STALE (need partial rebuild)
  return { status: "STALE", reason: "context-changed", changedSignals: changed };
}

/**
 * Determine which context levels need rebuild based on changed signals.
 *
 * @param {string[]} changedSignals
 * @returns {{ rebuildN1: boolean, rebuildN2: boolean, rebuildN3: boolean }}
 */
export function rebuildScope(changedSignals) {
  const scope = { rebuildN1: false, rebuildN2: false, rebuildN3: false };

  for (const signal of changedSignals) {
    switch (signal) {
      case "relevant-files":
      case "git-revision":
        // Project-level changes → rebuild N1 (project context) and N3 (skills)
        scope.rebuildN1 = true;
        scope.rebuildN3 = true;
        break;
      case "task-state":
        // Task-level changes → rebuild everything
        scope.rebuildN1 = true;
        scope.rebuildN2 = true;
        scope.rebuildN3 = true;
        break;
      case "no-snapshot":
        // No previous snapshot → full rebuild
        scope.rebuildN1 = true;
        scope.rebuildN2 = true;
        scope.rebuildN3 = true;
        break;
    }
  }

  return scope;
}
