
import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

/**
 * ContextDecisionTracer
 *
 * Handles audit logging for context decision processes.
 * Ensures persistence to .wam/traces/<trace_id>.json with fail-safe behavior.
 */
export class ContextDecisionTracer {
  constructor(traceId, projectRoot, mode = "standard") {
    this.traceId = traceId;
    this.projectRoot = projectRoot || process.cwd();
    this.mode = mode; // minimal, standard, debug
    this.ledger = {
      traceId,
      timestamp: new Date().toISOString(),
      entries: [],
    };
  }

  _getTraceFile() {
    let current = this.projectRoot;
    
    while (current !== path.parse(current).root) {
      if (fs.existsSync(path.join(current, ".wam"))) {
        // Verify this is a project root to avoid accidental jumps
        const isProjectRoot = fs.existsSync(path.join(current, "package.json")) || 
                             fs.existsSync(path.join(current, ".opencode.jsonc"));
        
        if (isProjectRoot) {
          const traceDir = path.join(current, ".wam", "traces");
          if (!fs.existsSync(traceDir)) {
            fs.mkdirSync(traceDir, { recursive: true });
          }
          return path.join(traceDir, `${this.traceId}.json`);
        }
      }
      current = path.dirname(current);
    }

    // Fallback to original behavior if no qualified root found
    const traceDir = path.join(this.projectRoot, ".wam", "traces");
    if (!fs.existsSync(traceDir)) {
      fs.mkdirSync(traceDir, { recursive: true });
    }
    return path.join(traceDir, `${this.traceId}.json`);
  }

  _persist() {
    try {
      const p = this._getTraceFile();
      logger.info("AuditPersist", `traceId: ${this.traceId}, entries: ${this.ledger.entries.length}, path: ${p}`);
      if (this.ledger.entries.length === 0) {
        logger.warn("AuditEmpty", `Attempting to persist empty ledger for trace ${this.traceId}`);
      }
      fs.writeFileSync(p, JSON.stringify(this.ledger, null, 2));
      logger.info("AuditSuccess", `Persisted trace to: ${p}`);
    } catch (err) {
      logger.error("AuditFail", `Path: ${this._getTraceFile()} | Error: ${err?.message ?? err}`);
    }
  }

  _addEntry(type, data) {
    try {
      this.ledger.entries.push({
        type,
        timestamp: new Date().toISOString(),
        ...data,
      });
      this._persist();
    } catch (err) {
      console.error(`[AuditFail] Failed to record entry ${type}:`, err);
    }
  }

  logConceptExtraction(concept, metadata = {}) {
    this._addEntry("CONCEPT_EXTRACTION", { concept, metadata });
  }

  logDictionaryResolution(term, resolution, metadata = {}) {
    this._addEntry("DICTIONARY_RESOLUTION", { term, resolution, metadata });
  }

  logCandidateRetrieval(query, candidatesCount, metadata = {}) {
    this._addEntry("CANDIDATE_RETRIEVAL", { query, candidatesCount, metadata });
  }

  logSelectionDecision(candidateId, evidenceClassification, reason, metadata = {}) {
    this._addEntry("SELECTION_DECISION", {
      candidateId,
      evidenceClassification, // e.g., 'direct', 'inferred', 'probabilistic'
      reason,
      metadata,
    });
  }

  /**
   * Registra una decisión técnica con punto de bifurcación, racional, alternativas
   * evaluadas, evidencia y métricas técnicas opcionales. Usado por el Decision Gate
   * para forzar documentación de elecciones arquitectónicas o de modelo de datos.
   *
   * @param {string} decisionPoint  - Qué se decidió (ej: "nuevo servicio X", "cambio de schema Y").
   * @param {string} rationale      - Por qué se eligió esta ruta.
   * @param {Array}  alternatives   - Alternativas descartadas [{name, pros, cons, whyRejected}].
   * @param {Array}  evidence       - Evidencia técnica (benchmarks, docs, RFCs, links, file:line).
   * @param {Object} [technicalMetrics] - Métricas técnicas (latencia, costo, complejidad, etc.).
   */
  logTechnicalDecision(decisionPoint, rationale, alternatives, evidence, technicalMetrics = {}) {
    this._addEntry("TECHNICAL_DECISION", {
      decisionPoint,
      rationale,
      alternatives: Array.isArray(alternatives) ? alternatives : [],
      evidence: Array.isArray(evidence) ? evidence : [],
      technicalMetrics: technicalMetrics || {},
    });
  }
}
