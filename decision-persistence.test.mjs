import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordDecision, getDecision, initMemory } from "./memory.js";

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wam-decision-"));
}

test("Decision persistence: restart service decision is remembered", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);

  const actionId = "restart-nginx";
  recordDecision({
    id: actionId,
    decision: "Reiniciar servicio nginx",
    reason: "caída detectada en logs",
    source: "user-decided",
    confidence: "high",
  }, root);

  const d = getDecision(actionId, root);
  assert.ok(d, "decisión guardada");
  assert.equal(d.decision, "Reiniciar servicio nginx");
  assert.equal(d.source, "user-decided");
});

test("Decision persistence: kill process decision is remembered", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);

  const actionId = "kill-stuck-process";
  recordDecision({
    id: actionId,
    decision: "Matar proceso colgado",
    source: "user-decided",
    confidence: "high",
  }, root);

  const d = getDecision(actionId, root);
  assert.ok(d, "decisión de kill guardada");
  assert.equal(d.decision, "Matar proceso colgado");
});

test("Decision persistence: non-existent id returns undefined", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);

  const d = getDecision("nonexistent", root);
  assert.equal(d, undefined);
});

test("Decision persistence: multiple decisions coexist", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);

  recordDecision({ id: "restart-a", decision: "Restart A", source: "user-decided" }, root);
  recordDecision({ id: "restart-b", decision: "Restart B", source: "user-decided" }, root);
  recordDecision({ id: "kill-x", decision: "Kill X", source: "user-decided" }, root);

  assert.ok(getDecision("restart-a", root));
  assert.ok(getDecision("restart-b", root));
  assert.ok(getDecision("kill-x", root));
});
