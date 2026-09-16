/**
 * Formatting — funciones puras de formateo y presentación.
 *
 * Contiene:
 *   - truncate: utilidad de truncamiento de texto (compartida)
 *   - delegationLines: formatea lines de delegación para el inyector
 *   - getStatusReport: formatea reporte de estado (re-exportado)
 *
 * Todas son PURAS: toman datos como entrada, retornan strings/arrays.
 * Sin side effects (no persisten, no leen, no escriben).
 */

import { getStatusReport } from "./execution-state.js";

export { getStatusReport } from "./execution-state.js";

// -- Shared utility --------------------------------------------------------

/**
 * Trunca texto a máximo `max` caracteres con "..." al final.
 */
export function truncate(text, max = 80) {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max - 3) + "...";
}

// -- Delegation lines -------------------------------------------------------

const MAX_VISIBLE_REQS = 8;

/**
 * Formatea las líneas de delegación visible para el inyector de sistema.
 * Solo se muestra when contract está APPROVED con requisitos pendientes.
 *
 * @param {Object} state - Estado de la tarea
 * @param {Function} [domainHintFn] - Función opcional para clasificar dominio (ej: domainHint de index.js)
 * @returns {string[]} Líneas de delegación
 */
export function delegationLines(state, domainHintFn = null) {
  const reqs = state?.contract?.requirements || [];
  if (!reqs.length) return [];
  if (state?.contract?.status !== "APPROVED") return [];

  const pending = reqs.filter((r) => r.status !== "done" && r.status !== "verified");
  if (!pending.length) return [];

  const lines = [
    "⏳ Delegación: estos requerimientos están aprobados para ejecución paralela:",
  ];
  const visible = pending.slice(0, MAX_VISIBLE_REQS);
  const overflow = pending.length - MAX_VISIBLE_REQS;
  for (const r of visible) {
    const hint = domainHintFn ? domainHintFn(r.title) : "";
    lines.push(`  ${r.id} → Task(parallel) "${truncate(r.title, 120)}"${hint ? ` [contexto: ${hint}]` : ""}`);
  }
  if (overflow > 0) {
    lines.push(`  ...(+${overflow} requerimientos adicionales consolidados)`);
  }
  return lines;
}
