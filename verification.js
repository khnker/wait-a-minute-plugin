/**
 * Verification Engine — WAM 1.1 (openspec/changes/add-verifiable-task-completion).
 *
 * Ejecuta checks de verificación definidos en el Completion Contract aprobado
 * y genera evidencia machine-verifiable. Aislado del adapter OpenCode
 * (index.js) y del razonamiento (engine.js): solo ejecuta, observa y registra.
 *
 * Reglas:
 * - Solo ejecuta comandos del contract aprobado (el engine NUNCA ejecuta
 *   texto libre proveniente del campo `evidence` del agente).
 * - Ejecución acotada: timeout + límite de stdout/stderr.
 * - La evidencia persistente usa output_hash, no logs completos.
 */

import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_TIMEOUT_MS = 30000;
export const MAX_OUTPUT_BYTES = 64 * 1024;
const GIT_TIMEOUT_MS = 5000;

function nowIso() {
  return new Date().toISOString();
}

function truncate(buf) {
  if (buf.length <= MAX_OUTPUT_BYTES) return { text: buf.toString("utf-8"), truncated: false };
  return { text: buf.subarray(0, MAX_OUTPUT_BYTES).toString("utf-8"), truncated: true };
}

function sha256(text) {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

/**
 * Captura el estado del repositorio en `cwd`. Fail-safe: si no es un repo
 * git o git no está disponible, devuelve head/dirty en null.
 *
 * Cache: 5s TTL por directorio para evitar llamadas git redundantes
 * durante verificaciones con múltiples checks.
 */
const REPO_STATE_CACHE_TTL_MS = 5000;
const _repoStateCache = new Map();

export function captureRepositoryState(cwd) {
  const root = cwd || process.cwd();
  const cached = _repoStateCache.get(root);
  if (cached && (Date.now() - cached.ts) < REPO_STATE_CACHE_TTL_MS) {
    return cached.state;
  }
  let state;
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, timeout: GIT_TIMEOUT_MS, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    let dirty = null;
    try {
      const porcelain = execFileSync("git", ["status", "--porcelain"], { cwd: root, timeout: GIT_TIMEOUT_MS, stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
      dirty = porcelain.length > 0;
    } catch {}
    state = { root, head: head || null, working_tree_dirty: dirty };
  } catch {
    state = { root, head: null, working_tree_dirty: null };
  }
  _repoStateCache.set(root, { state, ts: Date.now() });
  if (_repoStateCache.size > 50) {
    const oldest = _repoStateCache.keys().next().value;
    _repoStateCache.delete(oldest);
  }
  return state;
}

function validateCheck(check) {
  if (!check || typeof check !== "object") return "check inválido";
  if (check.type !== "command") return `tipo no soportado: ${check.type}`;
  if (!check.command || typeof check.command !== "string" || !check.command.trim()) {
    return "command vacío";
  }
  const cwd = check.cwd || process.cwd();
  try {
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) return `cwd inexistente: ${cwd}`;
  } catch {
    return `cwd ilegible: ${cwd}`;
  }
  return null;
}

/**
 * Ejecuta un VerificationCheck y devuelve un VerificationResult normalizado:
 * { check_id, requirement_id, status: PASS|FAIL|TIMEOUT|ERROR, exit_code,
 *   started_at, completed_at, duration_ms, output_hash, output_truncated,
 *   diagnostic, repository_state }.
 */
export function executeCheck(check, { timeout_ms = DEFAULT_TIMEOUT_MS } = {}) {
  const started_at = nowIso();
  const startedHr = Date.now();
  const invalid = validateCheck(check);
  const repository_state = captureRepositoryState(check?.cwd);
  if (invalid) {
    return {
      check_id: check?.id || null,
      requirement_id: check?.requirement_id || null,
      status: "ERROR",
      exit_code: null,
      started_at,
      completed_at: nowIso(),
      duration_ms: Date.now() - startedHr,
      output_hash: sha256(""),
      output_truncated: false,
      diagnostic: invalid.slice(0, 500),
      repository_state,
    };
  }
  const timeout = Number(check.timeout_ms ?? timeout_ms);
  return new Promise((resolve) => {
    execFile(
      "sh",
      ["-c", check.command],
      { cwd: check.cwd || process.cwd(), timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES * 4 },
      (error, stdout, stderr) => {
        const completed_at = nowIso();
        const out = truncate(Buffer.concat([Buffer.from(stdout || ""), Buffer.from(stderr || "")]));
        const base = {
          check_id: check.id || null,
          requirement_id: check.requirement_id || null,
          started_at,
          completed_at,
          duration_ms: Date.now() - startedHr,
          output_hash: sha256(out.text),
          output_truncated: out.truncated,
          repository_state,
        };
        if (error && (error.killed || error.code === "ETIMEDOUT" || /timed out/i.test(error.message || ""))) {
          return resolve({ ...base, status: "TIMEOUT", exit_code: null, diagnostic: `timeout tras ${timeout}ms`.slice(0, 500) });
        }
        if (error && error.code === "ENOENT") {
          return resolve({ ...base, status: "ERROR", exit_code: null, diagnostic: String(error.message || error).slice(0, 500) });
        }
        const exit_code = typeof error?.code === "number" ? error.code : 0;
        if (exit_code === 0) {
          return resolve({ ...base, status: "PASS", exit_code, diagnostic: out.text.slice(-500) });
        }
        return resolve({ ...base, status: "FAIL", exit_code, diagnostic: out.text.slice(-500) });
      }
    );
  });
}

/**
 * Genera la Evidence machine-verifiable de un check ejecutado.
 */
export function createEvidence(check, result) {
  return {
    id: `ev-${result.check_id || "unknown"}-${Date.now().toString(36)}`,
    requirement_id: result.requirement_id || check?.requirement_id || null,
    check_id: result.check_id,
    type: "command",
    command: check?.command || null,
    cwd: check?.cwd || process.cwd(),
    exit_code: result.exit_code,
    started_at: result.started_at,
    completed_at: result.completed_at,
    output_hash: result.output_hash,
    output_truncated: result.output_truncated,
    repository_state: result.repository_state,
  };
}

/**
 * Evalúa un requirement a partir de sus checks (todos obligatorios):
 * VERIFIED solo si todos los resultados son PASS. Sin verificación parcial.
 */
export function evaluateRequirement(checks, results) {
  const list = Array.isArray(checks) ? checks : [];
  const res = Array.isArray(results) ? results : [];
  if (!list.length) return { status: "VERIFYING", reason: "sin checks definidos" };
  if (res.length !== list.length) return { status: "VERIFYING", reason: "checks pendientes de ejecutar" };
  const failed = res.find((r) => r.status !== "PASS");
  if (failed) return { status: "VERIFYING", reason: `${failed.check_id || "?"}: ${failed.status}` };
  return { status: "VERIFIED", reason: "todos los checks pasaron" };
}

/**
 * Verifica un requirement completo: ejecuta sus checks en orden,
 * genera evidencia por cada uno y devuelve el estado agregado.
 */
export async function verifyRequirement(checks, opts = {}) {
  const list = Array.isArray(checks) ? checks : [];
  const results = [];
  const evidence = [];
  for (const check of list) {
    const result = await executeCheck(check, opts);
    results.push(result);
    evidence.push(createEvidence(check, result));
    if (result.status !== "PASS") break;
  }
  return { ...evaluateRequirement(list, results), results, evidence };
}
