/**
 * Clasifica la incertidumbre de una tarea.
 * Rule-based, determinista (sin LLM). Prioridad de seguridad: critical > resolvable > non-blocking.
 */
export function classifyUncertainty(item = "") {
  const text = String(item);
  const CRITICAL = [
    /migra|migrate|migraci[oó]n|refresh.?token|rotar|dele|destructiv|borr|elim|data loss|p[ée]rdida de datos/i,
    /seguridad|security|auth|oauth|token|api.?key|secret|password/i,
    /schema|esquema|api contract|formato de respuesta|response shape|compatibil/i,
    /arquitectura|architecture|scope|alcance|comportamiento|behavior|user.?visible|aceptaci[oó]n/i,
  ];
  const RESOLVABLE = [
    /c[oó]mo se maneja|c[oó]mo funciona|c[oó]mo est[áa]|existe|hay |d[oó]nde est|qu[ée] herramienta|formato de|qu[ée] framework|qu[ée] versi[oó]n|config|tests?|documentaci[oó]n|endpoint existente|api existente/i,
  ];
  if (CRITICAL.some((p) => p.test(text))) return "DECISION_CRITICAL";
  if (RESOLVABLE.some((p) => p.test(text))) return "RESOLVABLE";
  return "NON_BLOCKING";
}

/** Convierte assumed/unknown del pre-flight en uncertainties clasificadas. */
export function buildUncertainties(assumed = [], unknown = []) {
  const seen = new Set();
  const uncertainties = [];
  const entries = [
    ...(assumed || []).map((a) => ({ kind: "ASSUMED", text: String(a) })),
    ...(unknown || []).map((u) => ({ kind: "UNKNOWN", text: String(u) })),
  ];
  for (const { kind, text } of entries) {
    if (!text || seen.has(text)) continue;
    seen.add(text);
    uncertainties.push({
      id: `U${uncertainties.length + 1}`,
      question: text,
      kind,
      classification: classifyUncertainty(text),
      status: "active",
    });
  }
  return uncertainties;
}

const ASSUMPTION_IMPACT =
  /elim|delet|borr|actualiz|update|schema|esquema|migraci|endpoint|api|arquitectur|estructura|m[oó]dulo|seguridad|auth|token|compatib|breaking|alcance|scope|destructiv|data.?loss|aceptaci[oó]n|criterios/i;

/** Clasifica una asunción: DECISION_CRITICAL si toca impacto material. */
export function classifyAssumption(statement = "") {
  return ASSUMPTION_IMPACT.test(statement) ? "DECISION_CRITICAL" : "NON_BLOCKING";
}

/**
 * Convierte asunciones textuales del análisis en objetos de estado.
 */
export function buildAssumptions(assumed = []) {
  const seen = new Set();
  const out = [];
  for (const s of assumed || []) {
    if (!s || typeof s !== "string") continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push({
      id: `A${out.length + 1}`,
      statement: s,
      classification: classifyAssumption(s),
      status: "active",
    });
  }
  return out;
}

export function escalateAssumptions(state, taskText = "") {
  const contract = state?.contract || {};
  const escalated = [];
  const assumptions = contract.assumptions || [];
  let unknowns = contract.unknowns || [];
  let changed = false;

  for (const a of assumptions) {
    if (a.status === "active" && a.classification === "NON_BLOCKING") {
      const taskImpact = !!taskText && ASSUMPTION_IMPACT.test(taskText);
      const genericAssumption = /funcionalidad|agregar nueva|nueva funcionalidad|add support|add.*support/i.test(a.statement);
      const cls =
        classifyAssumption(a.statement) === "DECISION_CRITICAL" ||
        (taskImpact && genericAssumption)
          ? "DECISION_CRITICAL"
          : "NON_BLOCKING";
      if (cls === "DECISION_CRITICAL") {
        a.classification = cls;
        a.status = "blocking";
        const existing = unknowns.find((u) => u.status === "blocking" && !u.assumptionId);
        if (existing) {
          existing.assumptionId = a.id;
        } else if (!unknowns.some((u) => u.assumptionId === a.id)) {
          unknowns = [
            ...unknowns,
            {
              id: `U${unknowns.length + 1}`,
              kind: "ASSUMED",
              question: `¿${a.statement}?`,
              status: "blocking",
              assumptionId: a.id,
            },
          ];
        }
        escalated.push(a);
        changed = true;
      }
    }
  }

  if (changed) {
    contract.assumptions = assumptions;
    contract.unknowns = unknowns;
    state.contract = contract;
  }
  return { escalated, changed };
}
