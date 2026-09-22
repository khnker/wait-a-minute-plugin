/**
 * Action Capabilities — Structured classification of agent tool capabilities.
 *
 * Define cuatro niveles de capacidad, cada uno con un significado explícito
 * respecto a mutación, autorización y fail-mode:
 *
 *   - SAFE     : read-only / efectos reversibles mínimos. Autónoma.
 *   - GUARDED  : mutaciones bounded y reversibles. Autónoma si está dentro del scope.
 *   - BLOCKED  : destructivo, irreversible o sensible. Requiere autorización explícita.
 *   - UNKNOWN  : la herramienta no aparece en el catálogo. Fail-closed (treated as BLOCKED).
 *
 * Implementa: action-risk-envelope / C01 fail-closed.
 *
 * El uso de UNKNOWN permite que el evaluador aplique una política fail-closed
 * ante herramientas no registradas: cualquier herramienta que no aparezca
 * explícitamente en SAFE/GUARDED/BLOCKED se clasifica como UNKNOWN y, por
 * política, se trata como BLOCKED para evitar que una herramienta nueva o
 * mal nombrada ejecute mutaciones sin control.
 */

export const CAPABILITY_LEVELS = Object.freeze({
  SAFE: "SAFE",
  GUARDED: "GUARDED",
  BLOCKED: "BLOCKED",
  UNKNOWN: "UNKNOWN",
});

/**
 * Mapa explícito de capacidades por nombre de herramienta.
 * Cualquier herramienta que NO esté aquí se clasifica como UNKNOWN.
 */
export const ACTION_CAPABILITIES = Object.freeze({
  // --- SAFE: read-only / sin efectos ---
  read:        CAPABILITY_LEVELS.SAFE,
  glob:        CAPABILITY_LEVELS.SAFE,
  grep:        CAPABILITY_LEVELS.SAFE,
  ls:          CAPABILITY_LEVELS.SAFE,
  tool_search: CAPABILITY_LEVELS.SAFE,
  webfetch:    CAPABILITY_LEVELS.SAFE,
  fetch:       CAPABILITY_LEVELS.SAFE,

  // --- GUARDED: mutaciones bounded ---
  write:       CAPABILITY_LEVELS.GUARDED,
  edit:        CAPABILITY_LEVELS.GUARDED,
  apply_patch: CAPABILITY_LEVELS.GUARDED,
  patch:       CAPABILITY_LEVELS.GUARDED,
  todo_write:  CAPABILITY_LEVELS.GUARDED,
  todowrite:   CAPABILITY_LEVELS.GUARDED,
  bash:        CAPABILITY_LEVELS.GUARDED,
  sh:          CAPABILITY_LEVELS.GUARDED,
  pty_spawn:   CAPABILITY_LEVELS.GUARDED,
  pty_write:   CAPABILITY_LEVELS.GUARDED,
  task:        CAPABILITY_LEVELS.GUARDED, // delegation: GUARDED, not SAFE

  // --- BLOCKED: destructivo / sensible ---
  rm:          CAPABILITY_LEVELS.BLOCKED,
  rmdir:       CAPABILITY_LEVELS.BLOCKED,
  mv:          CAPABILITY_LEVELS.BLOCKED,
  sudo:        CAPABILITY_LEVELS.BLOCKED,
  chmod:       CAPABILITY_LEVELS.BLOCKED,
  chown:       CAPABILITY_LEVELS.BLOCKED,
  docker:      CAPABILITY_LEVELS.BLOCKED,
  ssh:         CAPABILITY_LEVELS.BLOCKED,
  scp:         CAPABILITY_LEVELS.BLOCKED,
  rsync:       CAPABILITY_LEVELS.BLOCKED,
  push:        CAPABILITY_LEVELS.BLOCKED,
  force_push:  CAPABILITY_LEVELS.BLOCKED,
});

/**
 * Resuelve la capacidad explícita de una herramienta por nombre exacto.
 * No hace coincidencia por sub-string ni por prefijo — debe ser match exacto.
 *
 * Esto evita la colisión por sub-string: "bash-safe" no debe resolverse a "bash".
 *
 * @param {string} tool — nombre de la herramienta (case-insensitive).
 * @returns {"SAFE"|"GUARDED"|"BLOCKED"|"UNKNOWN"}
 */
export function getCapability(tool) {
  if (typeof tool !== "string" || tool.length === 0) {
    return CAPABILITY_LEVELS.UNKNOWN;
  }
  const normalized = tool.toLowerCase();
  const cap = ACTION_CAPABILITIES[normalized];
  return cap || CAPABILITY_LEVELS.UNKNOWN;
}

/**
 * Resuelve la capacidad effective aplicando fail-closed:
 * UNKNOWN → BLOCKED.
 *
 * Esta es la función que el risk-engine debe usar cuando evalúa una acción.
 * Si la herramienta no está en el catálogo, la acción queda BLOCKED.
 *
 * @param {string} tool
 * @returns {"SAFE"|"GUARDED"|"BLOCKED"}
 */
export function getEffectiveCapability(tool) {
  const cap = getCapability(tool);
  if (cap === CAPABILITY_LEVELS.UNKNOWN) {
    return CAPABILITY_LEVELS.BLOCKED;
  }
  return cap;
}

/**
 * ¿Es una herramienta mutante? (GUARDED o BLOCKED).
 * Incluye UNKNOWN como BLOCKED (fail-closed).
 *
 * @param {string} tool
 * @returns {boolean}
 */
export function isMutatingCapability(tool) {
  const eff = getEffectiveCapability(tool);
  return eff === CAPABILITY_LEVELS.GUARDED || eff === CAPABILITY_LEVELS.BLOCKED;
}
