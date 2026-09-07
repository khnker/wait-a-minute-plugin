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

const SAFE_TOOLS = new Set([
  "read", "glob", "grep", "ls",
  "tool_search", "task", "webfetch", "fetch",
]);

const GUARDED_TOOLS = new Set([
  "write", "edit", "apply_patch", "patch",
  "todo_write", "todowrite",
  "bash", "sh", "pty_spawn", "pty_write",
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

function evaluateBashCommand(cmd) {
  if (!cmd || typeof cmd !== "string") return { safe: true };

  const destructive = /\b(rm\s+-rf|rm\s+-fr|dd\s+if=|mkfs|format|:()\s*\{|\bdrop\s+database|\bdrop\s+table|truncate\s+table|delete\s+from.*where)\b/i;
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
    const path = args?.path || args?.file || args?.file_path || args?.target || "";
    if (isProtectedPath(path)) {
      return {
        level: "BLOCKED",
        reason: `Ruta protegida: ${path}`,
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

    if (taskRoot && path) {
      const absolutePath = path.startsWith("/") || /^[A-Z]:\\/.test(path);
      if (absolutePath && !path.startsWith(taskRoot)) {
        return {
          level: "BLOCKED",
          reason: `Acción fuera del scope de tarea: ${path} (root: ${taskRoot})`,
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
