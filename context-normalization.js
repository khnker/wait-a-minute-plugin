/**
 * Context Normalization — unify all captured context into ContextItem.
 *
 * Every raw capture record (tool_call, agent_message, file_modification,
 * git_change, requirement_change, verification_result) is normalized
 * into a canonical ContextItem:
 *   { id, content, source, type, timestamp, scope, relatedRequirements[], metadata }
 */

/**
 * @typedef {Object} ContextItem
 * @property {string} id - Unique identifier
 * @property {string} content - Human-readable content / summary
 * @property {string} source - Where the context originated
 * @property {string} type - Category (tool_call, agent_message, etc.)
 * @property {number} timestamp - Unix ms
 * @property {string} scope - Scope boundary (session, requirement, task, project)
 * @property {string[]} relatedRequirements - Related requirement IDs
 * @property {Object} metadata - Extra metadata
 */

/**
 * Normalize a single raw capture record into a ContextItem.
 * @param {Object} record - Raw capture record
 * @returns {ContextItem}
 */
export function normalizeContextItem(record) {
  if (!record || typeof record !== "object") {
    throw new TypeError("Record must be a non-null object");
  }
  if (!record.id || !record.type) {
    throw new TypeError("Record must have id and type");
  }

  const content = extractContent(record);
  const relatedRequirements = extractRelatedRequirements(record);

  return {
    id: record.id,
    content,
    source: record.source || "unknown",
    type: record.type,
    timestamp: record.timestamp || Date.now(),
    scope: record.scope || "session",
    relatedRequirements,
    metadata: record.metadata || {},
  };
}

/**
 * Normalize an array of raw records into ContextItems.
 * @param {Object[]} records
 * @returns {ContextItem[]}
 */
export function normalizeContextItems(records) {
  if (!Array.isArray(records)) {
    throw new TypeError("Records must be an array");
  }
  return records.map(normalizeContextItem);
}

function extractContent(record) {
  const { type, content } = record;

  // Agent messages: content is { role, content }
  if (type === "agent_message" && content && typeof content === "object") {
    return `[${content.role}] ${content.content || ""}`;
  }

  // Tool calls / results: content is { toolName, params } or { toolName, result }
  if ((type === "tool_call" || type === "tool_result") && content && typeof content === "object") {
    const name = content.toolName || "unknown";
    if (type === "tool_call") {
      const paramsStr = content.params ? JSON.stringify(content.params).slice(0, 200) : "";
      return `Tool call: ${name}(${paramsStr})`;
    }
    const resultStr = typeof content.result === "string" ? content.result.slice(0, 200) : "[non-string result]";
    return `Tool result: ${name} → ${resultStr}`;
  }

  // File modifications: { filePath, action, details }
  if (type === "file_modification" && content && typeof content === "object") {
    return `File ${content.action}: ${content.filePath}${content.details ? ` — ${JSON.stringify(content.details).slice(0, 150)}` : ""}`;
  }

  // Git changes: { action, details }
  if (type === "git_change" && content && typeof content === "object") {
    const hash = content.details?.hash ? ` (${content.details.hash.slice(0, 8)})` : "";
    const msg = content.details?.message || "";
    return `Git ${content.action}${hash}: ${msg}`;
  }

  // Requirement changes: { action, requirement }
  if (type === "requirement_change" && content && typeof content === "object") {
    const req = content.requirement || {};
    return `Requirement ${content.action}: ${req.id || "?"} — ${req.title || req.description || ""}`;
  }

  // Verification results: { status, details }
  if (type === "verification_result" && content && typeof content === "object") {
    const test = content.details?.testName || content.details?.assertion || "";
    return `Verification ${content.status}: ${test}`;
  }

  // Fallback
  if (typeof content === "string") return content;
  if (content && typeof content === "object") return JSON.stringify(content).slice(0, 500);
  return String(record.content ?? "");
}

function extractRelatedRequirements(record) {
  const reqs = [];

  // Check metadata
  if (record.metadata?.requirementId) {
    reqs.push(record.metadata.requirementId);
  }
  if (record.metadata?.requirementIds) {
    reqs.push(...record.metadata.requirementIds);
  }

  // Check content fields
  if (record.content && typeof record.content === "object") {
    const req = record.content.requirement;
    if (req?.id) reqs.push(req.id);
    if (record.content.requirementId) reqs.push(record.content.requirementId);
  }

  return [...new Set(reqs)];
}
