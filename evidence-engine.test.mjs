import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  serializeEvidenceContent,
  buildEvidencePayload,
  createExecutionEvidence,
  linkEvidenceIfBound,
  produceExecutionEvidence,
  EVIDENCE_TYPE_TOOL_OUTPUT,
  EVIDENCE_SOURCE_EXECUTION,
} from "./evidence-engine.js";
import { getEvidence } from "./evidence-lineage.js";

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-evd-"));
  const taskId = "evd-task";
  return { root, taskId, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("serializeEvidenceContent: string passthrough", () => {
  assert.equal(serializeEvidenceContent("hello"), "hello");
});

test("serializeEvidenceContent: undefined/null → ok", () => {
  assert.equal(serializeEvidenceContent(undefined), "ok");
  assert.equal(serializeEvidenceContent(null), "ok");
});

test("serializeEvidenceContent: object → JSON string", () => {
  assert.equal(serializeEvidenceContent({ a: 1, b: [2, 3] }), '{"a":1,"b":[2,3]}');
});

test("serializeEvidenceContent: circular object → string fallback", () => {
  const obj = { name: "x" };
  obj.self = obj;
  const out = serializeEvidenceContent(obj);
  assert.ok(typeof out === "string" && out.length > 0);
});

test("buildEvidencePayload: defaults type and source", () => {
  const payload = buildEvidencePayload({
    requirementId: "req-1",
    result: "ok",
    hypothesisId: "hyp-1",
  });
  assert.equal(payload.type, EVIDENCE_TYPE_TOOL_OUTPUT);
  assert.equal(payload.source, EVIDENCE_SOURCE_EXECUTION);
  assert.equal(payload.requirementId, "req-1");
  assert.equal(payload.hypothesisId, "hyp-1");
  assert.equal(payload.content, "ok");
});

test("buildEvidencePayload: serializes object content", () => {
  const payload = buildEvidencePayload({
    result: { rows: 3 },
    hypothesisId: "hyp-1",
  });
  assert.equal(payload.content, '{"rows":3}');
});

test("createExecutionEvidence: persists record retrievable via getEvidence", () => {
  const { root, taskId, cleanup } = setup();
  try {
    const ev = createExecutionEvidence(
      taskId,
      {
        requirementId: "req-1",
        content: "ok",
        type: "TOOL_OUTPUT",
        source: "execution-engine",
        hypothesisId: "hyp-1",
      },
      root,
    );
    assert.ok(ev.id);
    const stored = getEvidence(taskId, ev.id, root);
    assert.equal(stored.id, ev.id);
    assert.equal(stored.content, "ok");
  } finally {
    cleanup();
  }
});

test("linkEvidenceIfBound: skips when observationId missing", () => {
  const out = linkEvidenceIfBound({
    evidenceId: "ev-1",
    requirementId: "req-1",
    hypothesisId: "hyp-1",
    experimentId: "exp-1",
    observationId: null,
    taskId: "t",
    taskRoot: "/tmp/nope",
  });
  assert.equal(out, false);
});

test("linkEvidenceIfBound: skips when requirementId missing", () => {
  const out = linkEvidenceIfBound({
    evidenceId: "ev-1",
    requirementId: null,
    hypothesisId: "hyp-1",
    experimentId: "exp-1",
    observationId: "obs-1",
    taskId: "t",
    taskRoot: "/tmp/nope",
  });
  assert.equal(out, false);
});

test("linkEvidenceIfBound: succeeds when both ids present", () => {
  const { root, taskId, cleanup } = setup();
  try {
    const ev = createExecutionEvidence(
      taskId,
      {
        requirementId: "req-1",
        content: "ok",
        type: "TOOL_OUTPUT",
        source: "execution-engine",
        hypothesisId: "hyp-1",
      },
      root,
    );
    const ok = linkEvidenceIfBound({
      evidenceId: ev.id,
      requirementId: "req-1",
      hypothesisId: "hyp-1",
      experimentId: "exp-1",
      observationId: "obs-1",
      taskId,
      taskRoot: root,
    });
    assert.equal(ok, true);
  } finally {
    cleanup();
  }
});

test("produceExecutionEvidence: returns evidence + payload", () => {
  const { root, taskId, cleanup } = setup();
  try {
    const { evidence, payload } = produceExecutionEvidence(taskId, root, {
      requirementId: "req-1",
      result: { ok: true },
      hypothesisId: "hyp-1",
    });
    assert.ok(evidence.id);
    assert.equal(payload.content, '{"ok":true}');
    assert.equal(payload.hypothesisId, "hyp-1");
  } finally {
    cleanup();
  }
});
