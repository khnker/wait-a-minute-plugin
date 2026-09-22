/**
 * Action Risk Envelope — Runtime risk classification for agent actions.
 *
 * Implementa spec: action-risk-envelope.
 *
 * Categorías:
 * - SAFE: Read-only o efectos reversibles mínimos. Autónoma.
 * - GUARDED: Mutaciones bounded y reversibles. Autónoma si está dentro del scope.
 * - BLOCKED: Destructivo, irreversible, o sensible. Requiere autorización explícita.
 * - UNKNOWN: herramienta no catalogada. Se trata como BLOCKED (fail-closed).
 *
 * Las capabilities explícitas viven en `policy/action-capabilities.js`.
 * Aquí solo se aplica la evaluación contextual (path, scope, contenido del comando).
 */

import nodePath from "node:path";
import nodeFs from "node:fs";
import {
  CAPABILITY_LEVELS,
  getEffectiveCapability,
  isMutatingCapability,
} from "./policy/action-capabilities.js";

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
 *
 * Estrategia:
 * 1. Si la ruta es absoluta, se resuelve contra el cwd.
 * 2. Si es relativa y hay taskRoot, se resuelve contra taskRoot.
 * 3. Si el path resuelto existe en disco → se usa `fs.realpathSync` para
 *    resolver symlinks (un symlink que apunta fuera del scope se bloquea).
 * 4. Si el path NO existe todavía (caso típico: write de archivo nuevo) →
 *    se usa el realpath del directorio padre. Esto evita que un symlink en
 *    un directorio padre redirija el archivo fuera del scope.
 * 5. Si el padre tampoco existe → se devuelve la ruta absoluta resuelta
 *    (resolución lexical), suficiente para validar prefijo.
 *
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

    // Resolver symlinks usando realpath. Rama depende de si el path existe.
    if (nodeFs.existsSync(resolved)) {
      try {
        return nodeFs.realpathSync(resolved);
      } catch {
        return resolved;
      }
    }

    // El path no existe: usamos realpath del padre (cuando el padre existe)
    // para que un symlink en el directorio padre no redirija fuera del scope.
    const parent = nodePath.dirname(resolved);
    if (nodeFs.existsSync(parent)) {
      try {
        const realParent = nodeFs.realpathSync(parent);
        return nodePath.join(realParent, nodePath.basename(resolved));
      } catch {
        return resolved;
      }
    }

    // Padre tampoco existe: devolvemos la ruta absoluta resuelta (lexical).
    return resolved;
  } catch {
    return null;
  }
}

function isWithinScope(absPath, taskRoot) {
  if (!taskRoot) return true; // No scope constraint
  try {
    const resolvedRoot = nodePath.resolve(taskRoot);
    // Si el root tiene symlinks, también los resolvemos para la comparación.
    let canonicalRoot;
    try {
      canonicalRoot = nodeFs.realpathSync(resolvedRoot);
    } catch {
      canonicalRoot = resolvedRoot;
    }
    const rel = nodePath.relative(canonicalRoot, absPath);
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

  // NOTE: en este regex NO se usa `\b` al final del grupo porque alternativas
  // como `dd if=` terminan en `=` (no-word), por lo que `\b` no aplica.
  // Tampoco se envuelve todo el grupo en `\b...\b` por la misma razón.
  const destructive = /(rm\s+-rf|rm\s+-fr|dd\s+if=|mkfs|format|:()\s*\{|\bdrop\s+database\b|\bdrop\s+table\b|\btruncate\s+table\b|delete\s+from\s+\S+\s+where|pkill\b|killall\b)/i;
  const privileged = /\b(sudo|chmod\s+777|chown\s+root|iptables|ufw\s+disable)\b/i;
  const network = /\b(curl[^|]*\|\s*sh|wget[^|]*\|\s*sh|nc\s+-|netcat)\b/i;
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
 * Política fail-closed (C01):
 * - Herramientas catalogadas como SAFE/GUARDED/BLOCKED se evalúan normalmente.
 * - Herramientas NO catalogadas → se clasifican como UNKNOWN y se tratan como
 *   BLOCKED con reason "fail-closed: herramienta no catalogada".
 *
 * El match contra el catálogo es EXACTO (no sub-string), para evitar colisiones
 * como "bash-safe" resolviendo a "bash".
 *
 * Las validaciones de scope y rutas protegidas aplican a TODAS las
 * herramientas (incluso SAFE): un `read` de `/etc/passwd` o de un symlink
 * fuera del root sigue siendo un escape de scope.
 *
 * @param {string} tool — Nombre de la herramienta invocada.
 * @param {object} args — Argumentos de la invocación.
 * @param {string} taskRoot — Root de la tarea activa (para validación de scope).
 * @returns {{level: string, reason?: string, requiresUser: boolean}}
 */
export function evaluateAction(tool, args = {}, taskRoot = "") {
  const lowerTool = (tool || "").toLowerCase();

  // 0. Resolución de capability explícita (fail-closed para UNKNOWN).
  const capability = getEffectiveCapability(lowerTool);

  // Fail-closed: herramientas no catalogadas → BLOCKED inmediato.
  if (capability === CAPABILITY_LEVELS.BLOCKED) {
    // Si la herramienta tampoco está en el catálogo (UNKNOWN → BLOCKED),
    // el reason debe indicar fail-closed para que el guard lo registre.
    const knownBlocked = new Set([
      "rm", "rmdir", "mv", "sudo", "chmod", "chown",
      "docker", "ssh", "scp", "rsync",
      "push", "force_push",
    ]);
    if (!knownBlocked.has(lowerTool)) {
      return {
        level: "BLOCKED",
        reason: `fail-closed: herramienta no catalogada (${tool})`,
        requiresUser: true,
      };
    }
    return {
      level: "BLOCKED",
      reason: `Herramienta peligrosa por defecto: ${tool}`,
      requiresUser: true,
    };
  }

  // 1. Extracción de path crudo y validaciones universales (aplican a
  //    SAFE y GUARDED). Las rutas protegidas o fuera del scope elevan
  //    la acción a BLOCKED independientemente del capability original.
  const rawPath = args?.path || args?.file || args?.file_path || args?.target || "";
  if (isProtectedPath(rawPath)) {
    return {
      level: "BLOCKED",
      reason: `Ruta protegida: ${rawPath}`,
      requiresUser: true,
    };
  }

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

  // 2. SAFE: autónoma (post validación de scope).
  if (capability === CAPABILITY_LEVELS.SAFE) {
    return { level: "SAFE", requiresUser: false };
  }

  // 3. GUARDED: requiere validación contextual adicional (bash commands).
  if (capability === CAPABILITY_LEVELS.GUARDED) {
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

    return { level: "GUARDED", requiresUser: false };
  }

  // Cualquier otro nivel no debería ocurrir (SAFE/GUARDED/BLOCKED cubren todo
  // gracias a fail-closed), pero por seguridad devolvemos BLOCKED.
  return {
    level: "BLOCKED",
    reason: `fail-closed: capacidad no resuelta (${tool})`,
    requiresUser: true,
  };
}

export const RISK_LEVELS = { SAFE: "SAFE", GUARDED: "GUARDED", BLOCKED: "BLOCKED" };

/**
 * Conjunto de herramientas mutantes (GUARDED + BLOCKED explícitos).
 * NOTA: las herramientas UNKNOWN NO aparecen aquí — la verificación
 * de mutación se hace preferentemente con `isMutatingTool`, que aplica
 * fail-closed para UNKNOWN. Este Set se conserva por compatibilidad.
 */
export const MUTATING_TOOLS = new Set([
  // GUARDED
  "write", "edit", "apply_patch", "patch",
  "todo_write", "todowrite",
  "bash", "sh", "pty_spawn", "pty_write",
  "task",
  // BLOCKED
  "rm", "rmdir", "mv", "sudo", "chmod", "chown",
  "docker", "ssh", "scp", "rsync",
  "push", "force_push",
]);

export function isMutatingTool(tool) {
  // Fail-closed: una herramienta desconocida también se considera mutante.
  return isMutatingCapability(tool);
}
