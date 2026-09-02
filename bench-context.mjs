/**
 * Benchmark de contexto real — mide:
 *  1. Reducción de contexto (tokens del paquete vs total disponible vs transcript)
 *  2. Guardado correcto de información (estructura/metadata por capa)
 *  3. Comportamiento de las 4 capas (L1 base / L2 utility / L3 sesión / L4 nunca)
 *  4. Cross-session retrieval (sesión B recupera solo lo relevante de A)
 *
 * Caso: plataforma e-commerce — auth (JWT rotation), pagos (webhooks),
 * cache (redis), deploy (docker).
 * Ejecutar: node bench-context.mjs
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  resetSessionCache,
  getSessionId,
  createCapsule,
  listCapsules,
  getCapsule,
  selectContext,
  estimateCapsuleTokens,
  closeSession,
} from "./context.js";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "wam-bench-"));

// -- Setup: proyecto real con conocimiento en las 4 capas --------------------
console.log("════════ SETUP — conocimiento del proyecto (12 capsules, 4 capas) ════════\n");

const project = [
  // L1 Foundation — decisiones estables y fundamentales
  { level: "L1", purpose: "Arquitectura del proyecto", scope: "global", content: "Monorepo Node/TypeScript. API NestJS + FE Angular. Postgres como DB principal.", provenance: "user_decided", importance: 10, confidence: 0.95, retrieval_hints: ["arquitectura", "stack", "nest", "angular", "monorepo"], mutation_rate: "low", reuse_probability: "high" },
  { level: "L1", purpose: "Convención de secretos", scope: "global", content: "Secretos vía env vars, nunca en repo. Rotación de credenciales cada 90 días.", provenance: "user_decided", importance: 9, confidence: 0.9, retrieval_hints: ["secreto", "secret", "env", "credencial"], mutation_rate: "low", reuse_probability: "high" },
  // L2 Working — decisiones de módulo, mutan más
  { level: "L2", purpose: "Auth: refresh-token rotation", scope: "auth", content: "JWT rotativo: refresh de un solo uso, blacklist de rotados, tests obligatorios.", provenance: "user_decided", importance: 8, confidence: 0.85, retrieval_hints: ["auth", "refresh", "token", "jwt", "rotation"], dependencies: [] },
  { level: "L2", purpose: "Pagos: webhooks idempotentes", scope: "pagos", content: "Webhooks de pago con idempotency-key, verificación de firma, reintentos exponenciales.", provenance: "user_decided", importance: 8, confidence: 0.8, retrieval_hints: ["pagos", "webhook", "idempotencia", "payment"], dependencies: [] },
  { level: "L2", purpose: "Cache: redis invalidation", scope: "cache", content: "Redis con invalidación por patrón de keys, TTL 5min, cache-aside.", provenance: "observed", importance: 6, confidence: 0.7, retrieval_hints: ["cache", "redis", "ttl"], dependencies: [] },
  { level: "L2", purpose: "Deploy: docker compose", scope: "ops", content: "Compose con 3 servicios: api, db, redis. Healthchecks habilitados.", provenance: "observed", importance: 5, confidence: 0.75, retrieval_hints: ["deploy", "docker", "compose", "ops"], dependencies: [] },
  // L3 Session — hallazgos de la sesión anterior
  { level: "L3", purpose: "Hallazgo: rate-limit en login", scope: "auth", content: "Login vulnerable a brute-force: falta rate-limit por IP. Pendiente de implementar.", provenance: "observed", importance: 7, confidence: 0.6, retrieval_hints: ["auth", "login", "rate", "limit", "brute"], session_tag: "sesión 1" },
  { level: "L3", purpose: "Hallazgo: webhook duplicado", scope: "pagos", content: "Webhook de stripe duplicado en staging, revisar configuración.", provenance: "inferred", importance: 4, confidence: 0.4, retrieval_hints: ["pagos", "stripe", "webhook"], session_tag: "sesión 2" },
  { level: "L3", purpose: "Nota: timeout redis en dev", scope: "cache", content: "En dev el redis timeout es 100ms — bajo para tests locales.", provenance: "observed", importance: 3, confidence: 0.5, retrieval_hints: ["cache", "redis", "timeout"], session_tag: "sesión 2" },
  // L4 Ephemeral — temporal, no durable
  { level: "L4", purpose: "Borrador: renombrar tabla users", scope: "auth", content: "Idea exploratoria, no decidido.", provenance: "inferred", importance: 2, confidence: 0.3, retrieval_hints: ["users", "rename"], session_tag: "sesión 1" },
  { level: "L4", purpose: "Nota rápida: costo infra", scope: "ops", content: "A revisar factura de GCP, sin conclusiones.", provenance: "inferred", importance: 1, confidence: 0.2, retrieval_hints: ["costo", "infra"], session_tag: "sesión 1" },
  { level: "L4", purpose: "Tuit interesante sobre JWT", scope: "auth", content: "Artículo de seguridad JWT, solo referencia.", provenance: "inferred", importance: 1, confidence: 0.2, retrieval_hints: ["jwt"], session_tag: "sesión 1" },
];

const created = project.map((p) => createCapsule({ ...p, session_id: p.session_tag ? getSessionId(ROOT) : getSessionId(ROOT) }, ROOT));
const byPurpose = Object.fromEntries(created.map((c) => [c.purpose.split(":")[0].trim(), c]));

const totalTokens = created.reduce((acc, c) => acc + estimateCapsuleTokens(c), 0);
const byLevel = Object.fromEntries(["L1", "L2", "L3", "L4"].map((l) => [l, created.filter((c) => c.level === l)]));
console.log("capsules por capa:", Object.entries(byLevel).map(([l, cs]) => `${l}=${cs.length}`).join(" | "));
console.log(`tokens totales disponibles: ${totalTokens}\n`);

let passed = 0;
let failed = 0;
const ok = (cond, label) => { if (cond) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`); } };

// -- Medición 1: sesión AUTH (sesión 2, cross-session) ------------------------
console.log("════════ SESIÓN AUTH — paquete de contexto para 'agregar rate-limit al login' ════════");
resetSessionCache();
const sidA = getSessionId(ROOT);
const taskAuth = "agregar rate-limit al login del módulo auth para evitar brute-force";
const pkgAuth = selectContext(taskAuth, { budget: 2000, root: ROOT });

console.log(`paquete (${pkgAuth.budget_used}/${pkgAuth.budget} tok, ${pkgAuth.selected_ids.length} capsules):`);
for (const c of pkgAuth.capsules) {
  console.log(`  [${c.level}] ${c.context_id} — ${(c.purpose || "").slice(0, 55)}`);
}
const pkgAuthTokens = pkgAuth.budget_used;
console.log(`\nreducción vs total disponible: ${((1 - pkgAuthTokens / totalTokens) * 100).toFixed(1)}% (${pkgAuthTokens}/${totalTokens} tok)`);
const transcriptTokens = 20 * 100; // sesión simulada: 20 mensajes × ~100 tok
console.log(`vs transcript simulado (20 msg): ${((1 - pkgAuthTokens / transcriptTokens) * 100).toFixed(1)}% menos (${pkgAuthTokens}/${transcriptTokens})`);

ok(pkgAuth.capsules.some((c) => c.level === "L1"), "L1 base siempre incluida");
ok(pkgAuth.capsules.some((c) => /refresh-token/i.test(c.purpose)), "L2 auth rotation incluida (mismo módulo, conocimiento distinto)");
ok(pkgAuth.capsules.some((c) => /rate-limit/i.test(c.purpose)), "L3 hallazgo de rate-limit incluido (relevante)");
ok(!pkgAuth.capsules.some((c) => /pagos/i.test(c.purpose) || /webhook/i.test(c.purpose)), "L2/L3 de pagos excluidas (irrelevantes)");
ok(!pkgAuth.capsules.some((c) => c.level === "L4"), "L4 ephemeral NUNCA entra al paquete");
ok(pkgAuth.budget_used <= 2000, "presupuesto respetado");

// -- Medición 2: sesión PAGOS (contexto opuesto) ------------------------------
console.log("\n════════ SESIÓN PAGOS — paquete para 'verificar webhooks de stripe con idempotencia' ════════");
const pkgPay = selectContext("verificar webhooks de stripe con idempotencia en pagos", { budget: 2000, root: ROOT });
console.log(`paquete (${pkgPay.budget_used}/${pkgPay.budget} tok):`);
for (const c of pkgPay.capsules) console.log(`  [${c.level}] ${c.context_id} — ${(c.purpose || "").slice(0, 55)}`);

ok(pkgPay.capsules.some((c) => /pagos|webhook/i.test(c.purpose + c.scope)), "L2 pagos relevante incluida");
ok(!pkgPay.capsules.some((c) => /auth/i.test(c.purpose + c.scope)), "auth excluida en tarea de pagos (relevancia > proximidad)");
ok(!pkgPay.capsules.some((c) => c.level === "L4"), "L4 nunca entra");

// -- Medición 3: guardado correcto por capa ------------------------------------
console.log("\n════════ VALIDACIÓN DE GUARDADO (metadata por capa) ════════");
for (const [lvl, caps] of Object.entries(byLevel)) {
  const bad = caps.filter((c) => {
    const metaOk = c.context_id && c.purpose && c.scope && c.importance && c.confidence && c.provenance && c.created_at && c.updated_at && c.session_id;
    return !metaOk;
  });
  ok(bad.length === 0, `${lvl}: ${caps.length} capsules con metadata completa (id/purpose/scope/importance/confidence/provenance/timestamps/session)`);
}
// Supersession real: la decisión de cache se reemplaza
console.log("\n  supersession real: cache redis → cache redisson");
const newCache = createCapsule({
  level: "L2", purpose: "Cache: redisson invalidation", scope: "cache",
  content: "Migrado a redisson con pub/sub invalidation.",
  provenance: "user_decided", importance: 7, confidence: 0.85,
  retrieval_hints: ["cache", "redisson"], supersedes: byPurpose["Cache"].context_id,
}, ROOT);
const oldCache = getCapsule(byPurpose["Cache"].context_id, ROOT);
ok(oldCache.lifecycle === "superseded" && oldCache.superseded_by === newCache.context_id, "capsula antigua preservada (superseded, no current)");
ok(getCapsule(oldCache.context_id, ROOT) !== null, "sigue addressable");

// -- Medición 4: close session + candidatos ------------------------------------
console.log("\n════════ CIERRE DE SESIÓN ════════");
const entry = closeSession({ sessionId: sidA, taskId: taskAuth, summary: "rate-limit implementado", candidates: [{ id: "req-1", title: "rate-limit login" }] }, ROOT);
ok(entry.session_id === sidA && entry.candidates.length === 1, "sesión cerrada con progreso + candidatos");
ok(entry.auto_promoted.length === 0, "sin auto-promoción (conservador)");

// -- Reporte final ---------------------------------------------------------------
console.log(`\n════════ REPORTE ════════`);
console.log(`reducción de contexto (tarea auth):   ${((1 - pkgAuthTokens / totalTokens) * 100).toFixed(1)}% vs total de capsules`);
console.log(`reducción vs transcript simulado:     ${((1 - pkgAuthTokens / transcriptTokens) * 100).toFixed(1)}% (${pkgAuthTokens} tok vs ~${transcriptTokens})`);
console.log(`precisión del paquete (auth):         ${pkgAuth.selected_ids.length} capsules, ${pkgAuth.budget_used} tok`);
console.log(`relevancia cruzada:                   auth excluida en tarea de pagos: ${!pkgPay.capsules.some((c) => /auth/i.test(c.purpose))}`);
console.log(`\nRESULTADO: ${passed} ok / ${failed} fail`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(failed ? 1 : 0);