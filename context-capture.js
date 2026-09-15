/**
 * Context Capture — mechanisms for capturing context from diverse sources.
 *
 * Captures: tool calls, agent messages, file modifications, git changes,
 * requirement changes, and verification results.
 *
 * Each capture produces a raw record with: id, type, content, source,
 * timestamp, scope, metadata.
 */

import crypto from "node:crypto";
import { classifyContextItem } from "./context-classification.js";
import { scopeContextItem } from "./context-scope.js";

let _idCounter = 0;

function genId(prefix) {
  _idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${_idCounter.toString(36).padStart(4, "0")}`;
}

function now() {
  return Date.now();
}

/**
 * Attach classification and scope metadata to a capture record.
 * @param {Object} record
 */
function attachContextMeta(record) {
  if (!record) return;
  record.classification = classifyContextItem(record);
  record.scopeAssignment = scopeContextItem(record);
}

function buildRecord(type, content, source, scope, metadata = {}) {
  return {
    id: genId(`${type}_ctx`),
    type,
    content,
    source,
    timestamp: now(),
    scope: scope || "session",
    metadata,
  };
}

// -- 1. Tool calls ---------------------------------------------------------

/**
 * Capture a tool call invocation.
 * @param {string} toolName - Name of the tool called
 * @param {Object} params - Arguments passed to the tool
 * @param {Object} [opts] - Optional scope/metadata
 * @returns {Object} Capture record
 */
export function captureToolCall(toolName, params, opts = {}) {
  const record = buildRecord(
    "tool_call",
    { toolName, params },
    "tool",
    opts.scope || "session",
    { toolName, paramsSummary: JSON.stringify(params).slice(0, 500), ...opts.metadata },
  );
  attachContextMeta(record);
  return record;
}

/**
 * Capture a tool call result.
 * @param {string} toolName
 * @param {*} result - The result returned
 * @param {Object} [opts]
 * @returns {Object} Capture record
 */
export function captureToolResult(toolName, result, opts = {}) {
  const record = buildRecord(
    "tool_result",
    { toolName, result },
    "tool",
    opts.scope || "session",
    { toolName, resultSize: typeof result === "string" ? result.length : 0, ...opts.metadata },
  );
  attachContextMeta(record);
  return record;
}

// -- 2. Agent messages -----------------------------------------------------

/**
 * Capture an agent message (user or assistant).
 * @param {"user"|"assistant"} role
 * @param {string} content - Message text
 * @param {Object} [opts]
 * @returns {Object} Capture record
 */
export function captureAgentMessage(role, content, opts = {}) {
  if (!["user", "assistant"].includes(role)) {
    throw new TypeError(`Invalid role: ${role}. Must be "user" or "assistant"`);
  }
  const record = buildRecord(
    "agent_message",
    { role, content },
    "agent",
    opts.scope || "session",
    { role, contentLength: content.length, ...opts.metadata },
  );
  attachContextMeta(record);
  return record;
}

/**
 * Capture a system prompt fragment.
 * @param {string} content
 * @param {Object} [opts]
 * @returns {Object} Capture record
 */
export function captureSystemMessage(content, opts = {}) {
  const record = buildRecord(
    "agent_message",
    { role: "system", content },
    "agent",
    opts.scope || "session",
    { role: "system", contentLength: content.length, ...opts.metadata },
  );
  attachContextMeta(record);
  return record;
}

// -- 3. File modifications -------------------------------------------------

/**
 * Capture a file modification event.
 * @param {string} filePath - Path to the file
 * @param {"create"|"modify"|"delete"} action
 * @param {Object} [details] - Optional diff/summary
 * @param {Object} [opts]
 * @returns {Object} Capture record
 */
export function captureFileModification(filePath, action, details = {}, opts = {}) {
  if (!["create", "modify", "delete"].includes(action)) {
    throw new TypeError(`Invalid action: ${action}. Must be create/modify/delete`);
  }
  const record = buildRecord(
    "file_modification",
    { filePath, action, details },
    "filesystem",
    opts.scope || "session",
    { filePath, action, ...opts.metadata },
  );
  attachContextMeta(record);
  return record;
}

// -- 4. Git changes --------------------------------------------------------

/**
 * Capture a git change (commit, branch, merge, etc.).
 * @param {"commit"|"branch"|"merge"|"rebase"|"reset"} action
 * @param {Object} details - { hash, message, branch, filesChanged, ... }
 * @param {Object} [opts]
 * @returns {Object} Capture record
 */
export function captureGitChange(action, details, opts = {}) {
  if (!["commit", "branch", "merge", "rebase", "reset"].includes(action)) {
    throw new TypeError(`Invalid git action: ${action}`);
  }
  return buildRecord(
    "git_change",
    { action, details },
    "git",
    opts.scope || "session",
    { action, commitHash: details.hash || null, ...opts.metadata },
  );
}

// -- 5. Requirement changes ------------------------------------------------

/**
 * Capture a requirement change (created, updated, closed).
 * @param {"created"|"updated"|"closed"|"reopened"} action
 * @param {Object} requirement - { id, title, description, ... }
 * @param {Object} [opts]
 * @returns {Object} Capture record
 */
export function captureRequirementChange(action, requirement, opts = {}) {
  if (!["created", "updated", "closed", "reopened"].includes(action)) {
    throw new TypeError(`Invalid requirement action: ${action}`);
  }
  const record = buildRecord(
    "requirement_change",
    { action, requirement },
    "requirement",
    opts.scope || "session",
    {
      action,
      requirementId: requirement.id || null,
      requirementTitle: requirement.title || null,
      ...opts.metadata,
    },
  );
  attachContextMeta(record);
  return record;
}

// -- 6. Verification results -----------------------------------------------

/**
 * Capture a verification result.
 * @param {"passed"|"failed"|"skipped"|"blocked"} status
 * @param {Object} details - { testName, assertion, output, ... }
 * @param {Object} [opts]
 * @returns {Object} Capture record
 */
export function captureVerificationResult(status, details, opts = {}) {
  if (!["passed", "failed", "skipped", "blocked"].includes(status)) {
    throw new TypeError(`Invalid verification status: ${status}`);
  }
  const record = buildRecord(
    "verification_result",
    { status, details },
    "verification",
    opts.scope || "session",
    { status, testName: details.testName || null, ...opts.metadata },
  );
  attachContextMeta(record);
  return record;
}

// -- Batch -----------------------------------------------------------------

/**
 * Capture multiple records at once.
 * @param {Object[]} records - Array of partial records to capture
 * @returns {Object[]}
 */
export function captureBatch(records) {
  return records.map((r) => {
    const record = buildRecord(r.type, r.content, r.source, r.scope, r.metadata || {});
    attachContextMeta(record);
    return record;
  });
}
