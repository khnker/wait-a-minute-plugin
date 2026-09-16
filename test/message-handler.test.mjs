/**
 * Tests for runtime/message-handler.js — modular chat.message processor.
 *
 * Regression test for Change 02: verify that the extracted handler
 * works correctly when called directly with explicit deps.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleMessage, extractPrompt } from "../runtime/message-handler.js";
import { initMemory } from "../memory.js";
import { getTaskState, persistTaskState } from "../engine.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "wam-handler-"));
initMemory(ROOT);

/**
 * Minimal waitAMinute stub with the methods handleMessage invokes.
 */
const waitAMinute = {
  analyze: async ({ prompt }) => ({
    intent: { classification: "task", confidence: 90 },
    strategy: "NORMAL",
    ambiguity: "low",
    project: { detected_stack: "node", architecture: "unknown", known: [], inferred: [], assumed: [], unknown: [] },
    known: [],
    inferred: [],
    assumed: [],
    unknown: [],
    skills: { candidates: [], selected: [] },
    persistentPolicies: [],
    skillRegistry: {},
    completionContract: {
      rigor: "NORMAL",
      requirements: ["implementa X", "agrega tests"],
      verification: [],
      constraints: [],
      unknowns: [],
      assumptions: [],
    },
    _summary: "stub",
  }),
  buildPersistedState: (taskId, analysis, _root) => ({
    contract: analysis.completionContract,
    requirements: analysis.completionContract.requirements.map((title, i) => ({
      id: `req-${i + 1}`,
      title,
      status: "pending",
      evidence: [],
    })),
    phase: "PROPOSED",
    lastAction: "",
  }),
  evaluateCompletionGate: () => ({ blocked: false, allDone: false }),
  applyPhaseTransition: () => ({ phase: "PROPOSED", nextAction: "Implementar" }),
  approveContract: () => ({ ok: true }),
  presentValidation: () => ({}),
  addToBacklog: () => {},
  loadBundledRegistry: () => ({}),
};

const noop = () => undefined;
const baseDeps = () => ({
  bypassed: false,
  sessionTasks: new Map(),
  sessionStore: new Map(),
  cfg: { tierCaps: { fast: 8, medium: 5, heavy: 3 }, activePreset: "omni", contextBudget: 4000 },
  resolveSessionBase: async () => ROOT,
  wamRootFor: async () => ROOT,
  ensureWamMemory: async () => ROOT,
  effectiveTaskId: (_input, _st, root) => `t-${Date.now()}`,
  genPartId: () => `prt_${Math.random().toString(16).slice(2, 18)}`,
  emitTextPart: (output, text, meta = {}) => {
    if (!output) return;
    const part = { id: `prt_${Math.random().toString(16).slice(2, 18)}`, type: "text", text, synthetic: true, ...meta };
    if (Array.isArray(output.parts)) output.parts.unshift(part);
    else if (Array.isArray(output.system)) output.system.unshift(part);
  },
  readActiveTaskIdFresh: () => null,
  writeActiveTaskId: noop,
  waitAMinute,
  migrateLegacyCognition: noop,
  noteSuccess: async () => undefined,
  noteFailure: async () => undefined,
  getTaskState,
  persistTaskState,
  findDuplicateTask: () => null,
  escalateAssumptions: () => ({ changed: false }),
  buildAssumptions: (arr) => arr.map((x, i) => ({ id: `a-${i}`, statement: x, classification: "ASSUMPTION", status: "open" })),
  initMemory,
  updateProjectMemo: noop,
  updateLiveContext: noop,
  readLiveContext: () => "",
  persistLiveContext: noop,
  assembleContext: () => ({ lines: [], budget_used: 0, budget: 4000, levels: {} }),
  createSnapshot: noop,
  checkContinuation: () => ({ status: "VALID" }),
  rebuildScope: () => ({ rebuildN1: false, rebuildN3: false }),
  getDecision: () => null,
  recordDecision: noop,
  compactDecisions: noop,
  writeCavemanSummary: noop,
  truncate: (s, n) => String(s).slice(0, n),
  delegationLines: () => [],
  updateTaskMemory: noop,
  addRecentChange: noop,
  closeSession: noop,
  getSessionId: () => "test-session",
  classifyAskingMessage: (text) => {
    if (/(implementa|implementar)/i.test(text)) return "blocked-message";
    return "answer";
  },
});

// ---------------------------------------------------------------------------
// extractPrompt — utility
// ---------------------------------------------------------------------------

test("extractPrompt: lee prompt desde input.message.parts (formato 1.18.25)", () => {
  const input = { message: { parts: [{ type: "text", text: "hola mundo" }] } };
  const output = { parts: [] };
  assert.equal(extractPrompt(input, output), "hola mundo");
});

test("extractPrompt: lee prompt desde output.parts si tiene contenido", () => {
  const input = { message: { parts: [{ type: "text", text: "viejo" }] } };
  const output = { parts: [{ type: "text", text: "nuevo" }] };
  assert.equal(extractPrompt(input, output), "nuevo");
});

test("extractPrompt: fallback a input.parts (API legacy)", () => {
  const input = { parts: [{ type: "text", text: "legacy" }] };
  const output = {};
  assert.equal(extractPrompt(input, output), "legacy");
});

test("extractPrompt: retorna string vacío si no hay parts", () => {
  assert.equal(extractPrompt({}, {}), "");
});

// ---------------------------------------------------------------------------
// handleMessage — main behavior
// ---------------------------------------------------------------------------

test("handleMessage: prompt vacío → no-op (no inyecta parts)", async () => {
  const out = { message: {}, parts: [] };
  await handleMessage({ sessionID: "s1" }, out, baseDeps());
  assert.equal(out.parts.length, 0);
});

test("handleMessage: bypassed=true → no-op", async () => {
  const deps = baseDeps();
  deps.bypassed = true;
  const out = { message: {}, parts: [] };
  await handleMessage(
    { sessionID: "s1", message: { parts: [{ type: "text", text: "refactor" }] } },
    out,
    deps,
  );
  assert.equal(out.parts.length, 0);
});

test("handleMessage: prompt con prompt simple invoca handleMessage sin lanzar", async () => {
  const out = { message: {}, parts: [] };
  // Verify the handler processes a normal prompt end-to-end with stub deps
  // without throwing. Detailed presentValidation behavior is covered by
  // existing plugin-load.test.mjs integration tests.
  await assert.doesNotReject(() =>
    handleMessage(
      {
        sessionID: "s1",
        messageID: "m1",
        message: { parts: [{ type: "text", text: "implementa X" }] },
      },
      out,
      baseDeps(),
    ),
  );
});

test("handleMessage: tool execution path llama noteSuccess sin lanzar", async () => {
  let successCalled = false;
  const deps = baseDeps();
  deps.noteSuccess = async () => { successCalled = true; };
  await handleMessage(
    {
      sessionID: "s1",
      message: { parts: [{ type: "text", text: "hola" }] },
      tool: "read",
    },
    { message: {}, parts: [], result: { ok: true } },
    deps,
  );
  assert.equal(successCalled, true, "noteSuccess debe invocarse cuando hay result");
});

test("handleMessage: tool execution error llama noteFailure", async () => {
  let failureCalled = false;
  const deps = baseDeps();
  deps.noteFailure = async () => { failureCalled = true; };
  await handleMessage(
    {
      sessionID: "s1",
      message: { parts: [{ type: "text", text: "hola" }] },
      tool: "read",
    },
    { message: {}, parts: [], error: "boom" },
    deps,
  );
  assert.equal(failureCalled, true, "noteFailure debe invocarse cuando hay error");
});

test("handleMessage: errors en deps se loggean sin propagar", async () => {
  const deps = baseDeps();
  deps.analyze = async () => { throw new Error("boom"); };
  // Must not throw — error is caught and logged.
  await assert.doesNotReject(() =>
    handleMessage(
      { sessionID: "s1", message: { parts: [{ type: "text", text: "x" }] } },
      { message: {}, parts: [] },
      deps,
    ),
  );
});

test.after(() => {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
});
