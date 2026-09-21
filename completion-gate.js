/**
 * Completion Gate
 *
 * Decides whether a task can be marked complete based on:
 *  - every requirement being VERIFIED (via requirement-state)
 *  - existence of at least one piece of verified evidence per requirement
 *  - absence of contradicting evidence that would invalidate completion
 *  - absence of inconclusive evidence that leaves the requirement unresolved
 *
 * API:
 *   canComplete(taskRoot, taskId) -> {
 *     allowed: boolean,
 *     reason: string,
 *     blockers: Array<{ requirementId, reason }>,
 *     summary: { total, complete, incomplete, blocked },
 *   }
 *
 * The function is read-only; it does not mutate task state. Callers may use
 * the result to either allow completion, emit a structured failure, or block
 * a "done" claim emitted by an agent.
 */

import fs from "node:fs";
import path from "node:path";
import { getTaskState } from "./engine.js";
import {
  isRequirementComplete,
  summarizeRequirements,
  REQUIREMENT_STATES,
} from "./requirement-state.js";
import {
  getAllEvidence,
  getEvidenceForRequirement,
} from "./evidence-lineage.js";

/**
 * Read all evidence for a task (regardless of status). Tolerates errors.
 */
function readAllEvidence(taskRoot, taskId) {
  try {
    const ev = getAllEvidence(taskId, taskRoot);
    return Array.isArray(ev) ? ev : [];
  } catch {
    return [];
  }
}

/**
 * Inspect a single requirement and classify why it would block completion.
 * Returns null if the requirement does NOT block.
 */
function findBlocker(requirement, allEvidence) {
  const id = requirement.id;
  const evidenceForReq = allEvidence.filter((e) => e && e.requirementId === id);

  // 1. No evidence at all -> blocked (regardless of status).
  if (evidenceForReq.length === 0) {
    return {
      requirementId: id,
      reason: `no evidence linked (status=${requirement.status || REQUIREMENT_STATES.PENDING})`,
    };
  }

  // 2. Evidence exists but is contradictory or invalidated -> blocked.
  const statuses = evidenceForReq.map((e) => e.status || e.verdict);
  if (statuses.some((s) => s === "contradictory" || s === "CONTRADICTORY" || s === "INVALIDATED" || s === "invalidated")) {
    return {
      requirementId: id,
      reason: `contradictory or invalidated evidence present`,
    };
  }

  // 3. All evidence is inconclusive -> blocked.
  if (statuses.every((s) => s === "inconclusive" || s === "INCONCLUSIVE")) {
    return {
      requirementId: id,
      reason: `only inconclusive evidence; requirement unresolved`,
    };
  }

  // 4. Requirement is not VERIFIED but has evidence.
  if (!isRequirementComplete(requirement)) {
    // Has evidence but no valid piece yet -> blocked.
    if (!statuses.some((s) => s === "valid" || s === "VERIFIED")) {
      return {
        requirementId: id,
        reason: `no valid evidence for requirement`,
      };
    }
    return {
      requirementId: id,
      reason: `requirement status is ${requirement.status || REQUIREMENT_STATES.PENDING} (not VERIFIED)`,
    };
  }

  return null;
}

/**
 * Decide if a task can complete.
 *
 * @param {string} taskRoot  absolute path to the project root (where .wam/ lives)
 * @param {string} taskId    task identifier
 * @returns {{allowed: boolean, reason: string, blockers: Array, summary: object}}
 */
export function canComplete(taskRoot, taskId) {
  if (!taskRoot || !taskId) {
    return {
      allowed: false,
      reason: "taskRoot and taskId are required",
      blockers: [],
      summary: { total: 0, complete: 0, incomplete: 0, blocked: 0 },
    };
  }

  const root = path.resolve(taskRoot);
  if (!fs.existsSync(root)) {
    return {
      allowed: false,
      reason: `task root does not exist: ${root}`,
      blockers: [],
      summary: { total: 0, complete: 0, incomplete: 0, blocked: 0 },
    };
  }

  let taskState;
  try {
    taskState = getTaskState(taskId, root);
  } catch (err) {
    return {
      allowed: false,
      reason: `failed to load task state: ${err.message}`,
      blockers: [],
      summary: { total: 0, complete: 0, incomplete: 0, blocked: 0 },
    };
  }

  const requirements = Array.isArray(taskState.requirements)
    ? taskState.requirements
    : [];

  if (requirements.length === 0) {
    return {
      allowed: false,
      reason: "task has no requirements",
      blockers: [],
      summary: { total: 0, complete: 0, incomplete: 0, blocked: 0 },
    };
  }

  const allEvidence = readAllEvidence(root, taskId);

  const blockers = [];
  for (const req of requirements) {
    const blocker = findBlocker(req, allEvidence);
    if (blocker) blockers.push(blocker);
  }

  const summary = summarizeRequirements(requirements);

  if (blockers.length === 0) {
    return {
      allowed: true,
      reason: "all requirements verified",
      blockers: [],
      summary: summary.summary,
    };
  }

  return {
    allowed: false,
    reason: `${blockers.length} requirement(s) blocking completion`,
    blockers,
    summary: summary.summary,
  };
}

/**
 * Convenience helper: returns true iff canComplete(...).allowed
 */
export function isCompletionAllowed(taskRoot, taskId) {
  return canComplete(taskRoot, taskId).allowed;
}
