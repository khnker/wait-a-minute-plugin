import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ContextDecisionTracer,
  auditDecision,
  inspectAudit,
  auditGate,
  resolveDecision,
} from "./context-decision-audit.js";

/* ------------------------------------------------------------------ */
/* Test helpers                                                       */
/* ------------------------------------------------------------------ */

function makeTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-audit-"));
  // mark as project root (logger needs a writable .wam directory; not strictly required
  // for our tests but matches the production layout)
  fs.mkdirSync(path.join(root, ".wam"), { recursive: true });
  return root;
}

function makeDecision(overrides = {}) {
  return {
    statement: "Use Postgres for primary store",
    reason: "Project N1 requires relational consistency",
    source: "N1_PROJECT",
    confidence: "high",
    status: "accepted",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* ContextDecisionTracer (existing tracer, smoke tests)               */
/* ------------------------------------------------------------------ */

test("ContextDecisionTracer persists log entries under .wam/traces/<traceId>.json", () => {
  const root = makeTempProject();
  const tracer = new ContextDecisionTracer("trace-test-1", root);
  tracer.logConceptExtraction("auth", { surface: "login" });

  const traceFile = path.join(root, ".wam", "traces", "trace-test-1.json");
  assert.ok(fs.existsSync(traceFile), "trace file should be created");
  const data = JSON.parse(fs.readFileSync(traceFile, "utf8"));
  assert.equal(data.traceId, "trace-test-1");
  assert.equal(data.entries.length, 1);
  assert.equal(data.entries[0].type, "CONCEPT_EXTRACTION");
  assert.equal(data.entries[0].concept, "auth");
  assert.ok(typeof data.entries[0].timestamp === "string");
});

test("ContextDecisionTracer logs technical decisions with alternatives and evidence", () => {
  const root = makeTempProject();
  const tracer = new ContextDecisionTracer("trace-tech", root);
  tracer.logTechnicalDecision(
    "new service X",
    "lower latency",
    [{ name: "monolith", pros: ["simple"], cons: ["slow"], whyRejected: "does not scale" }],
    [{ type: "benchmark", value: "12ms p95" }],
    { latencyMs: 12 },
  );
  const traceFile = path.join(root, ".wam", "traces", "trace-tech.json");
  const data = JSON.parse(fs.readFileSync(traceFile, "utf8"));
  assert.equal(data.entries[0].type, "TECHNICAL_DECISION");
  assert.equal(data.entries[0].decisionPoint, "new service X");
  assert.equal(data.entries[0].alternatives.length, 1);
  assert.equal(data.entries[0].evidence.length, 1);
});

test("ContextDecisionTracer does not throw on persist failure (graceful degrade)", () => {
  // pass an invalid project root that has no writable .wam path -> should not throw
  const tracer = new ContextDecisionTracer("trace-fail", "/dev/null/forbidden");
  // We expect no throw even when write fails (logger.error swallowed)
  assert.doesNotThrow(() => {
    tracer.logSelectionDecision("c1", "direct", "best match", { score: 0.9 });
  });
});

/* ------------------------------------------------------------------ */
/* auditDecision — contextDecisions contract                          */
/* ------------------------------------------------------------------ */

test("auditDecision appends entry to contract.contextDecisions", () => {
  const contract = {};
  const entry = auditDecision(contract, makeDecision());
  assert.equal(entry.id, "CD1");
  assert.ok(entry.date, "date should be ISO timestamp");
  assert.equal(entry.source, "N1_PROJECT");
  assert.equal(entry.statement, "Use Postgres for primary store");
  assert.equal(entry.reason, "Project N1 requires relational consistency");
  assert.equal(entry.confidence, "high");
  assert.equal(entry.status, "accepted");
  assert.equal(contract.contextDecisions.length, 1);
});

test("auditDecision increments id monotonically", () => {
  const contract = {};
  const a = auditDecision(contract, makeDecision({ statement: "a", reason: "r1" }));
  const b = auditDecision(contract, makeDecision({ statement: "b", reason: "r2" }));
  const c = auditDecision(contract, makeDecision({ statement: "c", reason: "r3" }));
  assert.equal(a.id, "CD1");
  assert.equal(b.id, "CD2");
  assert.equal(c.id, "CD3");
});

test("auditDecision preserves existing contextDecisions", () => {
  const contract = {
    contextDecisions: [
      { id: "CD1", date: "2026-01-01", source: "N0_POLICY", statement: "x", reason: "y", confidence: "high", status: "accepted" },
    ],
  };
  const entry = auditDecision(contract, makeDecision());
  assert.equal(entry.id, "CD2");
  assert.equal(contract.contextDecisions.length, 2);
});

test("auditDecision validates source", () => {
  const contract = {};
  assert.throws(() => auditDecision(contract, makeDecision({ source: "INVALID" })), /source/);
});

test("auditDecision validates confidence", () => {
  const contract = {};
  assert.throws(() => auditDecision(contract, makeDecision({ confidence: "maybe" })), /confidence/);
});

test("auditDecision validates status", () => {
  const contract = {};
  assert.throws(() => auditDecision(contract, makeDecision({ status: "weird" })), /status/);
});

test("auditDecision requires non-empty statement and reason", () => {
  const contract = {};
  assert.throws(() => auditDecision(contract, makeDecision({ statement: "" })), /statement/);
  assert.throws(() => auditDecision(contract, makeDecision({ reason: "" })), /reason/);
});

test("auditDecision rejects null contract", () => {
  assert.throws(() => auditDecision(null, makeDecision()), /contract/);
});

test("auditDecision rejects null decision", () => {
  assert.throws(() => auditDecision({}, null), /decision/);
});

/* ------------------------------------------------------------------ */
/* inspectAudit — list decisions                                      */
/* ------------------------------------------------------------------ */

test("inspectAudit returns contextDecisions array", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "s1", reason: "r1" }));
  auditDecision(contract, makeDecision({ statement: "s2", reason: "r2" }));
  const list = inspectAudit(contract);
  assert.equal(list.length, 2);
  assert.equal(list[0].statement, "s1");
});

test("inspectAudit returns empty array for contract without contextDecisions", () => {
  assert.deepEqual(inspectAudit({}), []);
});

test("inspectAudit tolerates null contract", () => {
  assert.deepEqual(inspectAudit(null), []);
});

/* ------------------------------------------------------------------ */
/* auditGate — completion protection                                  */
/* ------------------------------------------------------------------ */

test("auditGate allows completion when no decisions exist", () => {
  const result = auditGate({});
  assert.equal(result.allowed, true);
});

test("auditGate allows completion when all decisions are accepted with high/medium confidence", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "s1", reason: "r1", confidence: "high", status: "accepted" }));
  auditDecision(contract, makeDecision({ statement: "s2", reason: "r2", confidence: "medium", status: "accepted" }));
  assert.equal(auditGate(contract).allowed, true);
});

test("auditGate blocks completion on provisional decision", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "s1", reason: "r1", status: "provisional", confidence: "medium" }));
  const result = auditGate(contract);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /CD1/);
  assert.equal(result.blocking.length, 1);
});

test("auditGate blocks completion on accepted decision with low confidence", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "s1", reason: "r1", status: "accepted", confidence: "low" }));
  const result = auditGate(contract);
  assert.equal(result.allowed, false);
  assert.equal(result.blocking.length, 1);
});

test("auditGate does not block rejected decisions", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "s1", reason: "r1", status: "rejected" }));
  assert.equal(auditGate(contract).allowed, true);
});

test("auditGate unblocks after provisional decision is resolved to accepted/high", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "s1", reason: "r1", status: "provisional", confidence: "low" }));
  assert.equal(auditGate(contract).allowed, false);
  resolveDecision(contract, "CD1", { status: "accepted", confidence: "high" });
  assert.equal(auditGate(contract).allowed, true);
});

test("auditGate blocks when any of multiple decisions is unverified", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "s1", reason: "r1", status: "accepted", confidence: "high" }));
  auditDecision(contract, makeDecision({ statement: "s2", reason: "r2", status: "provisional", confidence: "medium" }));
  const result = auditGate(contract);
  assert.equal(result.allowed, false);
  assert.equal(result.blocking.length, 1);
  assert.equal(result.blocking[0].id, "CD2");
});

/* ------------------------------------------------------------------ */
/* resolveDecision                                                    */
/* ------------------------------------------------------------------ */

test("resolveDecision updates status and confidence by id", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "s1", reason: "r1", status: "provisional", confidence: "low" }));
  const updated = resolveDecision(contract, "CD1", { status: "accepted", confidence: "high" });
  assert.equal(updated.status, "accepted");
  assert.equal(updated.confidence, "high");
  // contract array should reflect the update
  assert.equal(contract.contextDecisions[0].status, "accepted");
  assert.equal(contract.contextDecisions[0].confidence, "high");
});

test("resolveDecision updates statement and reason", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "old", reason: "old-reason" }));
  resolveDecision(contract, "CD1", { statement: "new", reason: "new-reason" });
  assert.equal(contract.contextDecisions[0].statement, "new");
  assert.equal(contract.contextDecisions[0].reason, "new-reason");
});

test("resolveDecision throws on unknown id", () => {
  const contract = {};
  assert.throws(() => resolveDecision(contract, "CD999", { status: "accepted" }), /not found/);
});

test("resolveDecision validates updated status and confidence", () => {
  const contract = {};
  auditDecision(contract, makeDecision());
  assert.throws(() => resolveDecision(contract, "CD1", { status: "bogus" }), /status/);
  assert.throws(() => resolveDecision(contract, "CD1", { confidence: "maybe" }), /confidence/);
});

/* ------------------------------------------------------------------ */
/* End-to-end spec scenarios                                          */
/* ------------------------------------------------------------------ */

test("Scenario: Decision recorded when WAM applies a context-driven rule", () => {
  const contract = {};
  // simulate: WAM applies a rule from N1_PROJECT context
  auditDecision(contract, {
    statement: "Adopt TypeScript strict mode",
    reason: "Detected N1 project policy 'strict-types'",
    source: "N1_PROJECT",
    confidence: "high",
    status: "accepted",
  });
  assert.equal(contract.contextDecisions.length, 1);
  assert.equal(contract.contextDecisions[0].id, "CD1");
  assert.equal(contract.contextDecisions[0].source, "N1_PROJECT");
});

test("Scenario: Block completion on unverified provisional decision", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "use MongoDB", reason: "flexible schema", status: "provisional", confidence: "medium" }));
  // cannot claim DONE
  const gate = auditGate(contract);
  assert.equal(gate.allowed, false);
});

test("Scenario: /wam audit returns full trail", () => {
  const contract = {};
  auditDecision(contract, makeDecision({ statement: "a", reason: "ra" }));
  auditDecision(contract, makeDecision({ statement: "b", reason: "rb" }));
  auditDecision(contract, makeDecision({ statement: "c", reason: "rc" }));
  const trail = inspectAudit(contract);
  assert.equal(trail.length, 3);
  assert.equal(trail[0].id, "CD1");
  assert.equal(trail[2].id, "CD3");
});