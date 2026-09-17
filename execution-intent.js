export const EXECUTION_INTENT = Object.freeze({
  DIRECT_REQUIREMENT_ACTION: "DIRECT_REQUIREMENT_ACTION",
  SUPPORTING_ACTION: "SUPPORTING_ACTION",
  INVESTIGATION: "INVESTIGATION",
  VALIDATION: "VALIDATION",
  RECOVERY: "RECOVERY",
  UNKNOWN: "UNKNOWN",
});

const INVESTIGATION_TOOLS = new Set(["read", "read_file", "list_directory", "list_files", "get_file", "glob", "grep", "search", "webfetch", "fetch", "task_search", "tool_search"]);
const RECOVERY_TOOLS = new Set(["revert", "rollback", "restore"]);
const VALIDATION_TOOLS = new Set(["test", "spec", "vitest", "jest", "pytest", "mocha"]);
const MODIFICATION_TOOLS = new Set(["write", "edit", "apply_patch", "patch", "todo_write", "todowrite"]);

export function classifyExecutionIntent(tool, args = {}, statement = "") {
  const operation = String(tool || "").toLowerCase();
  const stmt = String(statement || "").toLowerCase();
  const cmd = String(args?.command || "").toLowerCase();
  const first = (cmd.split(/\s+/)[0] || "");

  if (RECOVERY_TOOLS.has(operation)) return EXECUTION_INTENT.RECOVERY;

  if (VALIDATION_TOOLS.has(operation) || /\b(test|spec|verify|check|assert)\b/.test(operation) || /\btest\b/.test(cmd)) {
    return EXECUTION_INTENT.VALIDATION;
  }

  if (INVESTIGATION_TOOLS.has(operation)) return EXECUTION_INTENT.INVESTIGATION;
  if (/^(ls|find|cat|grep|search|inspect|inspect_file|view|show)/.test(cmd.split(/\s+/)[0] || "")) return EXECUTION_INTENT.INVESTIGATION;

  if (MODIFICATION_TOOLS.has(operation)) {
    return EXECUTION_INTENT.SUPPORTING_ACTION;
  }

  if (/^(npm|pnpm|yarn|brew|apt|pip)\s+(install|add|setup|i)\b/.test(cmd) || /^(install|setup|setup_)/.test(cmd.split(/\s+/)[0] || "")) {
    return EXECUTION_INTENT.SUPPORTING_ACTION;
  }

  if (/^(npm|pnpm|yarn|node|deno|ruby|python|bash|sh|make|cargo|go|docker|kubectl|npx)/.test(first)) {
    if (/^npx\s+/.test(cmd) || /\binstall\b/.test(cmd) || /\bsetup\b/.test(cmd)) {
      return EXECUTION_INTENT.SUPPORTING_ACTION;
    }
    if (/\btest\b/.test(cmd)) {
      return EXECUTION_INTENT.VALIDATION;
    }
    if (/\b(run|exec|start|build)\b/.test(cmd)) {
      return EXECUTION_INTENT.DIRECT_REQUIREMENT_ACTION;
    }
    return EXECUTION_INTENT.SUPPORTING_ACTION;
  }

  if (stmt && /\brequirement\b/.test(stmt) && !/(install|setup|test|spec)/.test(cmd)) {
    if (operation && MODIFICATION_TOOLS.has(operation)) {
      return EXECUTION_INTENT.DIRECT_REQUIREMENT_ACTION;
    }
  }

  return EXECUTION_INTENT.UNKNOWN;
}

export function isDirectRequirementAction(intent) {
  return intent === EXECUTION_INTENT.DIRECT_REQUIREMENT_ACTION;
}

export function isSupportingAction(intent) {
  return intent === EXECUTION_INTENT.SUPPORTING_ACTION ||
    intent === EXECUTION_INTENT.INVESTIGATION ||
    intent === EXECUTION_INTENT.VALIDATION ||
    intent === EXECUTION_INTENT.RECOVERY;
}
