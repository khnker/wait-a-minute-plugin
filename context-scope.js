/**
 * Context Scope — define and assign scope boundaries to context items.
 *
 * Scopes: GLOBAL, PROJECT, TASK, REQUIREMENT, ACTION, SESSION, TURN.
 *
 * Scope determines the visibility and lifetime of a context item.
 * A context item's scope is assigned by analyzing the item's metadata,
 * type, and associated identifiers.
 */

/** @typedef {"GLOBAL"|"PROJECT"|"TASK"|"REQUIREMENT"|"ACTION"|"SESSION"|"TURN"} ContextScope */

/**
 * @typedef {Object} ScopeResult
 * @property {ContextScope} scope
 * @property {number} confidence 0-1
 * @property {string} reason
 */

// Scope hierarchy (smaller = more specific)
const SCOPE_LEVELS = ["GLOBAL", "PROJECT", "TASK", "REQUIREMENT", "ACTION", "SESSION", "TURN"];

// Type-to-scope hints
const TYPE_SCOPE_HINTS = {
  tool_call: "ACTION",
  tool_result: "ACTION",
  agent_message: "SESSION",
  system_message: "GLOBAL",
  file_modification: "ACTION",
  git_change: "PROJECT",
  requirement_change: "REQUIREMENT",
  verification_result: "ACTION",
  clarification_request: "SESSION",
  plan: "TASK",
  rationale: "SESSION",
  assumption: "SESSION",
};

/**
 * Infer scope from metadata fields.
 * @param {Object} metadata
 * @returns {ContextScope|null}
 */
function inferFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;

  // Explicit scope in metadata (uppercase normalized)
  if (metadata.scope) {
    const raw = String(metadata.scope).toUpperCase();
    if (SCOPE_LEVELS.includes(raw)) {
      return raw;
    }
  }

  // Task ID implies TASK scope (or more specific if requirementId present)
  if (metadata.taskId || metadata.task_id) {
    if (metadata.requirementId || metadata.requirement_id) {
      return "REQUIREMENT";
    }
    if (metadata.actionId || metadata.action_id) {
      return "ACTION";
    }
    return "TASK";
  }

  // Requirement ID implies REQUIREMENT scope
  if (metadata.requirementId || metadata.requirement_id) {
    return "REQUIREMENT";
  }

  // Session ID implies SESSION scope
  if (metadata.sessionId || metadata.session_id || metadata.session) {
    return "SESSION";
  }

  // Turn number implies TURN scope
  if (metadata.turn !== undefined || metadata.turnNumber !== undefined) {
    return "TURN";
  }

  // Project name/id implies PROJECT scope
  if (metadata.projectId || metadata.project_id || metadata.project) {
    return "PROJECT";
  }

  return null;
}

/**
 * Infer scope from item type and content.
 * @param {Object} item
 * @returns {ContextScope|null}
 */
function inferFromType(item) {
  const type = (item.type || "").toLowerCase();
  return TYPE_SCOPE_HINTS[type] || null;
}

/**
 * Assign scope to a context item.
 * @param {Object} item - Context item with type, metadata, content
 * @param {Object} [metadata] - Additional context for scoping decisions
 * @returns {ScopeResult}
 */
export function scopeContextItem(item, metadata = {}) {
  if (!item || typeof item !== "object") {
    return { scope: "SESSION", confidence: 0.3, reason: "default_fallback" };
  }

  const combinedMetadata = { ...item.metadata, ...metadata };

  // 1. Explicit scope in metadata (highest priority)
  const explicit = inferFromMetadata(combinedMetadata);
  if (explicit) {
    return { scope: explicit, confidence: 0.95, reason: "explicit_metadata" };
  }

  // 2. Type-based inference
  const typeScope = inferFromType(item);
  if (typeScope) {
    return { scope: typeScope, confidence: 0.8, reason: `type:${item.type}` };
  }

  // 3. Content-based keywords
  const text = typeof item.content === "string"
    ? item.content
    : typeof item.summary === "string"
      ? item.summary
      : JSON.stringify(item.content || "");

  const lower = text.toLowerCase();

  if (metadata.globalScope || combinedMetadata.globalScope || lower.includes("global")) {
    return { scope: "GLOBAL", confidence: 0.7, reason: "global_signal" };
  }
  if (lower.includes("project") || combinedMetadata.project) {
    return { scope: "PROJECT", confidence: 0.7, reason: "project_signal" };
  }
  if (lower.includes("requirement") || combinedMetadata.requirement) {
    return { scope: "REQUIREMENT", confidence: 0.7, reason: "requirement_signal" };
  }

  // 4. Default: SESSION scope
  return { scope: "SESSION", confidence: 0.6, reason: "default_session" };
}

/**
 * Normalize a scope string to a valid ContextScope.
 * @param {string} scope
 * @returns {ContextScope}
 */
export function normalizeScope(scope) {
  if (!scope) return "SESSION";
  const upper = String(scope).toUpperCase();
  if (SCOPE_LEVELS.includes(upper)) return upper;
  return "SESSION";
}

/**
 * Get parent scope (one level up in hierarchy).
 * @param {ContextScope} scope
 * @returns {ContextScope}
 */
export function parentScope(scope) {
  const idx = SCOPE_LEVELS.indexOf(scope);
  if (idx <= 0) return scope; // GLOBAL has no parent
  return SCOPE_LEVELS[idx - 1];
}

/**
 * Check if a scope covers another (is at least as broad).
 * @param {ContextScope} container
 * @param {ContextScope} contained
 * @returns {boolean}
 */
export function scopeCovers(container, contained) {
  const cIdx = SCOPE_LEVELS.indexOf(container);
  const sIdx = SCOPE_LEVELS.indexOf(contained);
  if (cIdx < 0 || sIdx < 0) return false;
  return cIdx <= sIdx;
}
