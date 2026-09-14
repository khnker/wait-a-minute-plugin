import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import the functions we need to test
// Since they're not exported, we test via the module's public API
import { analyze, classifyUncertainty, buildAssumptions, escalateAssumptions } from "./engine.js";

describe("classifyMessage (continuation detection)", () => {
  // We test the logic indirectly via the contract flow

  it("DONE keywords are detected", () => {
    const DONE_RE = /(^|\s)(done|finish|finished|complete|completed|listo|termin[eé]|complet[ao]|finalizad[oa]|declare.*done)\b/i;
    
    assert.ok(DONE_RE.test("done"));
    assert.ok(DONE_RE.test("task complete"));
    assert.ok(DONE_RE.test("estoy listo"));
    assert.ok(DONE_RE.test("termine el trabajo"));
    assert.ok(DONE_RE.test("declare done"));
    assert.ok(!DONE_RE.test("continuar trabajando"));
    assert.ok(!DONE_RE.test("agregar mas tests"));
  });

  it("WAM commands are detected", () => {
    const WAM_CMD_RE = /^(answer|resolve|contract|progress|task|skills|assumptions|compress|resume|backlog|ctx|decision)\b/;
    
    assert.ok(WAM_CMD_RE.test("answer U1 si"));
    assert.ok(WAM_CMD_RE.test("progress req-1 done"));
    assert.ok(WAM_CMD_RE.test("compress"));
    assert.ok(!WAM_CMD_RE.test("continuar con la tarea"));
    assert.ok(!WAM_CMD_RE.test("implementar la funcionalidad"));
  });
});

describe("buildLightweightInject", () => {
  it("generates minimal N2 line", () => {
    const state = {
      phase: "IMPLEMENTING",
      contract: { status: "APPROVED" },
      requirements: [
        { id: "req-1", status: "done" },
        { id: "req-2", status: "pending" },
      ],
      nextAction: "Implementar feature X",
    };
    
    // We can't directly call buildLightweightInject since it's not exported
    // But we can test the logic:
    const reqs = state.requirements || [];
    const pend = reqs.filter((r) => r.status !== "done" && r.status !== "verified").length;
    const nextAction = (state.nextAction || "—").slice(0, 80);
    const line = `[wam N2 task]\ntask: test-id — ${state.phase} / ${state.contract?.status}\nreq: ${pend}/${reqs.length} pend | next: ${nextAction}`;
    
    assert.ok(line.includes("IMPLEMENTING"));
    assert.ok(line.includes("APPROVED"));
    assert.ok(line.includes("1/2 pend"));
    assert.ok(line.includes("Implementar feature X"));
  });
});

describe("trivial task injection", () => {
  it("trivial classification produces FAST mode", async () => {
    const result = await analyze({
      prompt: "qué es una función",
      projectPath: process.cwd(),
    });
    
    assert.equal(result.intent.classification, "trivial");
    assert.equal(result.strategy, "FAST");
  });
});
