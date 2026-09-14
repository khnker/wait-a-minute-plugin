import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assembleContext } from "../assembly.js";
import { initMemory } from "../memory.js";
import { createCapsule, getSessionId, resetSessionCache } from "../context.js";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "wam-invariants-"));
initMemory(ROOT);

test("Invariante: Determinismo", () => {
  createCapsule({ purpose: "P1", content: "C1", importance: 5 }, ROOT);
  const prompt = "task prompt";
  const p1 = assembleContext({ prompt, projectPath: ROOT });
  const p2 = assembleContext({ prompt, projectPath: ROOT });
  
  assert.deepEqual(p1.lines, p2.lines, "El pack de contexto debe ser idéntico en ejecuciones consecutivas");
  assert.equal(p1.budget_used, p2.budget_used, "Uso de budget idéntico");
});

test("Invariante: Budget global", () => {
  const budget = 100;
  // N0 (policy) + N2 (task) deben caber.
  // Vamos a forzar un N2 grande para verificar que el N2 reserva presupuesto y N1/N3 no lo consumen.
  const p = assembleContext({ 
    prompt: "task", 
    taskId: "t-1", 
    budget, 
    projectPath: ROOT 
  });
  
  // Total pack <= budget (salvo overflow forzado de N0+N2)
  const tokens = p.lines.join(" ").length / 4;
  if (!p.budget_violation) {
    assert.ok(p.budget_used <= budget, `Budget utilizado (${p.budget_used}) no debe exceder ${budget}`);
  }
});

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
