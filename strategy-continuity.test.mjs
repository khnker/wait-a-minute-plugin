import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import waitAMinute from "./index.js";

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "wam-test-"));

function setupTask(taskId, root) {
  fs.mkdirSync(path.join(root, ".wam", "tasks", taskId), { recursive: true });
  const state = {
    phase: "PROPOSED",
    contract: { status: "PROPOSED", objective: "Test goal", unknowns: [] },
    requirements: [],
    assumptions: [],
    nextAction: null,
  };
  fs.writeFileSync(
    path.join(root, ".wam", "tasks", taskId, "state.yaml"),
    JSON.stringify(state, null, 2)
  );
}

test("Strategy Continuity: approveContract persists approvedStrategy", () => {
  const root = path.join(tmpdir, "task-strat");
  const taskId = "task-strat";
  try {
    setupTask(taskId, root);

    const r = waitAMinute.approveContract(taskId, root);
    assert.equal(r.ok, true);

    const stateRaw = fs.readFileSync(
      path.join(root, ".wam", "tasks", taskId, "state.yaml"),
      "utf-8"
    );
    assert.ok(stateRaw.includes("approvedStrategy"), "approvedStrategy persisted");
    assert.ok(stateRaw.includes("ACTIVE"), "strategy status ACTIVE");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Evidence-Guided Recovery: classifyFailure in index.js prioriza bajo nivel", () => {
  const indexSrc = fs.readFileSync(path.resolve("./index.js"), "utf-8");
  const match = indexSrc.match(/function classifyFailure[\s\S]*?\n\}/);
  assert.ok(match, "classifyFailure debe existir");

  const classifyFailure = new Function(`${match[0]}; return classifyFailure;`)();

  const timing = classifyFailure(null, null, "timeout waiting for selector");
  assert.equal(timing.category, "TIMING");

  const antiBot = classifyFailure(null, null, "captcha challenge detected");
  assert.equal(antiBot.category, "ANTI_BOT");
  assert.ok(antiBot.priority > timing.priority);
});

test("Reference Evidence Priority: loadReferenceEvidence lee .wam/references.json", () => {
  const root = path.join(tmpdir, "task-ref");
  try {
    fs.mkdirSync(path.join(root, ".wam"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".wam", "references.json"),
      JSON.stringify({
        references: [
          {
            id: "lider-playwright",
            targets: ["lider", "playwright"],
            source: "MCP",
            status: "VERIFIED",
            evidence: ["46 products"],
          },
        ],
      })
    );

    const indexSrc = fs.readFileSync(path.resolve("./index.js"), "utf-8");
    const match = indexSrc.match(/function loadReferenceEvidence[\s\S]*?\n\}/);
    assert.ok(match);

    const loadReferenceEvidence = new Function("fs", "path", `${match[0]}; return loadReferenceEvidence;`)(fs, path);
    const refs = loadReferenceEvidence(root, { goal: "scrap lider con playwright" });
    assert.equal(refs.length, 1);
    assert.equal(refs[0].id, "lider-playwright");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
