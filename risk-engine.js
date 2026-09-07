/**
 * Action Risk Envelope — Runtime risk classification for agent actions.
 *
 * Implementa spec: action-risk-envelope.
 *
 * Categorías:
 * - SAFE: Read-only o efectos reversibles mínimos. Autónoma.
 * - GUARDED: Mutaciones bounded y reversibles. Autónoma si está dentro del scope.
 * - BLOCKED: Destructivo, irreversible, o sensible. Requiere autorización explícita.
 */

import nodePath from "node:path";// `task` is NOT inherently SAFE — delegation may cause mutations.
// It MUST be GUARDED and evaluated per-call.
const SAFE_TOOLS = new Set([
  "read", "glob", "grep", "ls",
  "tool_search", "webfetch", "fetch",
]);

const GUARDED_TOOLS = new Set([
  "write", "edit", "apply_patch", "patch",
  "todo_write", "todowrite",
  "bash", "sh", "pty_spawn", "pty_write",
  "task", // delegation: GUARDED, not SAFE
]);

const BLOCKED_TOOLS = new Set([
  "rm", "rmdir", "mv", "sudo", "chmod", "chown",
  "docker", "ssh", "scp", "rsync",
  "push", "force_push",
]);

const PROTECTED_PATHS = [
  "/etc/", "/root/", "/boot/", "/sys/", "/proc/",
  "/var/lib/", "/usr/bin/", "/usr/sbin/",
  "C:\\Windows", "C:\\System32",
];

function isProtectedPath(path) {
  if (!path || typeof path !== "string") return false;
  return PROTECTED_PATHS.some((p) => path.startsWith(p) || path.includes(p));
}

/**
 * Canonicalize and resolve a path against the task root.
 * Returns the absolute canonical path, or null if unsafe (path traversal).
 */
/**
 * Canonicalize and resolve a path against the task root.
 * Returns the absolute canonical path, or null if unsafe (path traversal).
 */
function canonicalPath(p, taskRoot) {
  if (!p || typeof p !== "string") return null;
  try {
    let resolved;
    if (nodePath.isAbsolute(p)) {
      resolved = nodePath.resolve(p);
    } else if (taskRoot) {
      resolved = nodePath.resolve(taskRoot, p);
    } else {
      return null;
    }
    return resolved;
  } catch {
    return null;
  }
}

function isWithinScope(absPath, taskRoot) {
  if (!taskRoot) return true; // No scope constraint
  try {
    const resolvedRoot = nodePath.resolve(taskRoot);
    const rel = nodePath.relative(resolvedRoot, absPath);
    return !rel.startsWith("..") && !nodePath.isAbsolute(rel);
  } catch {
    return false;
  }
}

/**
 * Structured error for policy blocks. MUST NOT be swallowed by catch.
 */
export class WamPolicyBlock extends Error {
  constructor(message, policy = {}) {
    super(message);
    this.name = "WamPolicyBlock";
    this.wamPolicyBlock = true;
    this.policy = policy;
  }
}

function evaluateBashCommand(cmd) {
  if (!cmd || typeof cmd !== "string") return { safe: true };

  const destructive = /\b(rm\s+-rf|rm\s+-fr|dd\s+if=|mkfs|format|:()\s*\{|\bdrop\s+database|\bdrop\s+table|truncate\s+table|delete\s+from.*where|pkill\s+.*|killall\s+.*)\b/i;
  const privileged = /\b(sudo|chmod\s+777|chown\s+root|iptables|ufw\s+disable)\b/i;
  const network = /\b(curl.*\|.*sh|wget.*\|.*sh|nc\s+-|netcat)\b/i;
  const gitDestructive = /\bgit\s+push\s+(-f|--force)|git\s+reset\s+--hard|git\s+clean\s+-fd|git\s+filter-branch/i;

  if (destructive.test(cmd)) return { safe: false, reason: `Comando destructivo detectado: ${cmd.slice(0, 80)}` };
  if (privileged.test(cmd)) return { safe: false, reason: `Comando privilegiado detectado: ${cmd.slice(0, 80)}` };
  if (gitDestructive.test(cmd)) return { safe: false, reason: `Operación git destructiva: ${cmd.slice(0, 80)}` };
  if (network.test(cmd)) return { safe: false, reason: `Pipe a shell desde red: ${cmd.slice(0, 80)}` };

  return { safe: true };
}

/**
 * Evalúa una acción propuesta por el agente y retorna su clasificación de riesgo.
 *
 * @param {string} tool — Nombre de la herramienta invocada.
 * @param {object} args — Argumentos de la invocación.
 * @param {string} taskRoot — Root de la tarea activa (para validación de scope).
 * @returns {{level: string, reason?: string, requiresUser: boolean}}
 */
export function evaluateAction(tool, args = {}, taskRoot = "") {
  const lowerTool = (tool || "").toLowerCase();

  // 1. Evaluación por tipo de herramienta
  if (SAFE_TOOLS.has(lowerTool)) {
    return { level: "SAFE", requiresUser: false };
  }

  if (BLOCKED_TOOLS.has(lowerTool)) {
    return {
      level: "BLOCKED",
      reason: `Herramienta peligrosa por defecto: ${tool}`,
      requiresUser: true,
    };
  }

  if (GUARDED_TOOLS.has(lowerTool)) {
    const rawPath = args?.path || args?.file || args?.file_path || args?.target || "";
    if (isProtectedPath(rawPath)) {
      return {
        level: "BLOCKED",
        reason: `Ruta protegida: ${rawPath}`,
        requiresUser: true,
      };
    }

    if (lowerTool === "bash" || lowerTool === "sh" || lowerTool === "pty_spawn") {
      const cmd = args?.command || args?.cmd || args?.script || "";
      const bashEval = evaluateBashCommand(cmd);
      if (!bashEval.safe) {
        return {
          level: "BLOCKED",
          reason: bashEval.reason,
          requiresUser: true,
        };
      }
    }

    // Path canonicalization (prevents /repo/project-evil/ bypass)
    if (taskRoot && rawPath) {
      const canonical = canonicalPath(rawPath, taskRoot);
      if (canonical && !isWithinScope(canonical, taskRoot)) {
        return {
          level: "BLOCKED",
          reason: `Acción fuera del scope de tarea (path traversal): ${rawPath} → ${canonical} (root: ${taskRoot})`,
          requiresUser: true,
        };
      }
    }

    return { level: "GUARDED", requiresUser: false };
  }

  // Default: tratar como GUARDED para fallar de forma conservadora
  return { level: "GUARDED", reason: `Herramienta desconocida: ${tool}`, requiresUser: false };
}

export const RISK_LEVELS = { SAFE: "SAFE", GUARDED: "GUARDED", BLOCKED: "BLOCKED" };
