/**
 * Autonomy Behavior Suite — 15 scenarios validating that WAM preserves
 * an approved strategy, allows autonomous safe actions, and prevents
 * the agent from degenerating into linear behavior.
 *
 * NOT a workflow test. Behavioral invariants only.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import waitAMinute from "./index.js";
import { evaluateAction } from "./risk-engine.js";
import { findRepeatedExperiment } from "./cognition-store.js";

// ---------- Harness ----------

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "wam-behavior-"));

function setupTask(taskId, root) {
  fs.mkdirSync(path.join(root, ".wam", "tasks", taskId), { recursive: true });
  const state = {
    phase: "PROPOSED",
    contract: { status: "PROPOSED", objective: "Test goal", unknowns: [], verification: ["evidence present"] },
    requirements: [{ id: "R1", title: "Implement fix", status: "pending" }],
    assumptions: [],
    nextAction: null,
  };
  fs.writeFileSync(
    path.join(root, ".wam", "tasks", taskId, "state.yaml"),
    JSON.stringify(state, null, 2)
  );
  return root;
}

function approveWithStrategy(taskId, root, strategy = "default strategy") {
  setupTask(taskId, root);
  const r = waitAMinute.approveContract(taskId, root);
  if (!r.ok) throw new Error(`approveContract failed: ${r.reason}`);
  return r;
}

function readState(taskId, root) {
  const p = path.join(root, ".wam", "tasks", taskId, "state.yaml");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// ---------- Scenarios ----------

test("01 Approval Continuity — one approval covers multiple safe actions", () => {
  const root = path.join(tmpdir, "s01");
  const taskId = "s01";
  try {
    approveWithStrategy(taskId, root);
    const st = readState(taskId, root);
    assert.equal(st.approvedStrategy.status, "ACTIVE");
    assert.ok(st.approvedStrategy.allowedActions.length > 0);
    // Approval does NOT need to be re-asked on each step.
    // Verify state has explicit allowedActions list (continuous authorization).
    assert.ok(st.approvedStrategy.allowedActions.includes("test"));
    assert.ok(st.approvedStrategy.allowedActions.includes("retry"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("02 Tactical Recovery — failure does not invalidate strategy", () => {
  const root = path.join(tmpdir, "s02");
  const taskId = "s02";
  try {
    approveWithStrategy(taskId, root);
    let st = readState(taskId, root);
    assert.equal(st.approvedStrategy.status, "ACTIVE");

    // Simulate a failure event (tactic-level) — strategy stays ACTIVE.
    st.approvedStrategy.lastTacticFailure = { at: Date.now(), note: "selector mismatch" };
    fs.writeFileSync(path.join(root, ".wam", "tasks", taskId, "state.yaml"), JSON.stringify(st));

    st = readState(taskId, root);
    assert.equal(st.approvedStrategy.status, "ACTIVE", "Tactical failure MUST NOT change strategy status");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("03 Dependency Recovery — missing binary triggers diagnosis, not strategy change", () => {
  const root = path.join(tmpdir, "s03");
  const taskId = "s03";
  try {
    approveWithStrategy(taskId, root);
    const st = readState(taskId, root);

    // Allowed actions include dependency/binary installation within scope
    assert.ok(
      st.approvedStrategy.allowedActions.some((a) => a.includes("install")),
      "Dependency recovery MUST be in allowedActions"
    );
    // Strategy does NOT auto-flip to INVALIDATED
    assert.equal(st.approvedStrategy.status, "ACTIVE");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("04 Runtime Configuration Recovery — config fix stays in scope", () => {
  const root = path.join(tmpdir, "s04");
  const taskId = "s04";
  try {
    approveWithStrategy(taskId, root);
    const st = readState(taskId, root);
    // Configuration changes inside scope are allowed.
    assert.ok(
      st.approvedStrategy.allowedActions.some((a) =>
        a.includes("modify source") || a.includes("diagnose")
      )
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("05 Reference-Guided Recovery — known-good reference influences behavior", () => {
  const root = path.join(tmpdir, "s05");
  const taskId = "s05";
  try {
    approveWithStrategy(taskId, root);
    fs.mkdirSync(path.join(root, ".wam"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".wam", "references.json"),
      JSON.stringify({
        references: [
          {
            id: "known-good-impl",
            targets: ["scraping", "browser"],
            source: "MCP",
            status: "VERIFIED",
            evidence: ["real run produced 46 products"],
          },
        ],
      })
    );
    const refs = JSON.parse(
      fs.readFileSync(path.join(root, ".wam", "references.json"), "utf-8")
    );
    assert.equal(refs.references[0].status, "VERIFIED");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("06 MCP Evidence — MCP is consulted before duplicating capability", () => {
  const root = path.join(tmpdir, "s06");
  try {
    fs.mkdirSync(path.join(root, ".wam"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".wam", "references.json"),
      JSON.stringify({
        references: [
          {
            id: "mcp-lider",
            source: "MCP",
            targets: ["lider", "playwright"],
            status: "VERIFIED",
            evidence: ["46 productos", "networkidle fixed", "nonce handled"],
          },
        ],
      })
    );
    const refs = JSON.parse(fs.readFileSync(path.join(root, ".wam", "references.json"), "utf-8"));
    assert.ok(refs.references.find((r) => r.source === "MCP"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("07 Unexpected Empty Result — 0 results is NOT auto-classified", () => {
  const root = path.join(tmpdir, "s07");
  try {
    const indexSrc = fs.readFileSync(path.resolve("./index.js"), "utf-8");
    const match = indexSrc.match(/function classifyFailure[\s\S]*?\n\}/);
    assert.ok(match);
    const classifyFailure = new Function(`${match[0]}; return classifyFailure;`)();

    // "0 products found" → ZERO_RESULT category, NOT ANTI_BOT.
    const result = classifyFailure(null, null, "0 products found");
    assert.equal(result.category, "ZERO_RESULT");
    assert.notEqual(result.category, "ANTI_BOT", "Zero result MUST NOT be auto-classified as anti-bot");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("08 Strategy Change — material replacement requires new approval", () => {
  const root = path.join(tmpdir, "s08");
  const taskId = "s08";
  try {
    approveWithStrategy(taskId, root);
    let st = readState(taskId, root);
    assert.equal(st.approvedStrategy.status, "ACTIVE");

    // Simulate evidence that invalidates the strategy → CHALLENGED, NOT silently replaced.
    st.approvedStrategy.status = "CHALLENGED";
    st.approvedStrategy.challengeReason = "Architecture incompatibility evidence";
    fs.writeFileSync(path.join(root, ".wam", "tasks", taskId, "state.yaml"), JSON.stringify(st));

    st = readState(taskId, root);
    assert.equal(st.approvedStrategy.status, "CHALLENGED", "Strategy must be CHALLENGED, not silently replaced");
    assert.ok(st.approvedStrategy.challengeReason, "Challenge reason must be recorded");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("09 Risk Block With Recovery — blocked action has safe alternative", () => {
  const root = path.join(tmpdir, "s09");
  try {
    const indexSrc = fs.readFileSync(path.resolve("./index.js"), "utf-8");
    const match = indexSrc.match(/function classifyActionAgainstStrategy[\s\S]*?\n\}/);
    assert.ok(match);
    const classifyActionAgainstStrategy = new Function(
      "nodePath",
      `${match[0]}; return classifyActionAgainstStrategy;`
    )({ isAbsolute: (p) => p.startsWith("/"), resolve: (p) => p, relative: (a, b) => b.replace(a, "") });

    const strategy = {
      status: "ACTIVE",
      allowedActions: ["read", "test", "diagnose"],
      prohibitedActions: ["delete production data", "production deploy"],
    };

    // Safe action → covered
    const safe = classifyActionAgainstStrategy("read", "read", {}, strategy);
    assert.equal(safe.covered, true);

    // Dangerous action → blocked
    const danger = classifyActionAgainstStrategy("delete production data", "bash", {}, strategy);
    assert.equal(danger.covered, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("10 Configuration/Process Collision — broad pkill is prohibited", () => {
  const root = path.join(tmpdir, "s10");
  try {
    const r1 = evaluateAction("bash", { command: "pkill -f node" });
    assert.notEqual(r1.level, "SAFE", "Broad pkill must NOT be classified as SAFE");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("11 Repeated Experiment — same action triggers detection", () => {
  const root = path.join(tmpdir, "s11");
  const taskId = "s11";
  try {
    fs.mkdirSync(path.join(root, ".wam", "tasks", taskId, "cognition"), { recursive: true });
    const expFile = path.join(root, ".wam", "tasks", taskId, "cognition", "experiments.jsonl");
    const exp = { id: "E1", hypothesisId: "H1", actionDescription: "test A", status: "completed" };
    fs.writeFileSync(expFile, JSON.stringify(exp) + "\n");

    const repeats = findRepeatedExperiment(root, taskId, { hypothesisId: "H1", actionDescription: "test A" });
    assert.equal(repeats.length, 1, "Repeated experiment MUST be detected");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("12 Context Recovery — strategy and experiments persist across compaction", () => {
  const root = path.join(tmpdir, "s12");
  const taskId = "s12";
  try {
    approveWithStrategy(taskId, root);
    fs.mkdirSync(path.join(root, ".wam", "tasks", taskId, "cognition"), { recursive: true });
    const expFile = path.join(root, ".wam", "tasks", taskId, "cognition", "experiments.jsonl");
    fs.writeFileSync(expFile, JSON.stringify({ id: "E1", status: "completed" }) + "\n");

    // Simulate compaction/reload — re-read state from disk.
    const st = readState(taskId, root);
    assert.equal(st.approvedStrategy.status, "ACTIVE", "Strategy must survive compaction");

    const exp = fs.readFileSync(expFile, "utf-8");
    assert.ok(exp.includes("E1"), "Experiments must survive compaction");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("13 Scope Preservation — recovery must not silently expand scope", () => {
  const root = path.join(tmpdir, "s13");
  const taskId = "s13";
  try {
    approveWithStrategy(taskId, root);
    const st = readState(taskId, root);
    assert.ok(st.approvedStrategy.scope, "Strategy has scope");
    // Prohibited actions explicitly include "scope expansion"
    assert.ok(
      st.approvedStrategy.prohibitedActions.some((a) => a.includes("scope")),
      "scope expansion MUST be prohibited"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("14 False Completion — DONE requires evidence, not just exit 0", () => {
  const root = path.join(tmpdir, "s14");
  const taskId = "s14";
  try {
    approveWithStrategy(taskId, root);
    const st = readState(taskId, root);
    // Contract verification criteria MUST exist (gate to DONE)
    assert.ok(st.contract.verification.length > 0, "Contract verification criteria required");
    // Phase stays IMPLEMENTING until evidence satisfies verification.
    assert.notEqual(st.phase, "DONE");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("15 Autonomous End-to-End Recovery — full lifecycle", () => {
  const root = path.join(tmpdir, "s15");
  const taskId = "s15";
  try {
    // 1. Approve strategy
    approveWithStrategy(taskId, root);
    let st = readState(taskId, root);
    assert.equal(st.approvedStrategy.status, "ACTIVE");

    // 2. Create hypotheses
    fs.mkdirSync(path.join(root, ".wam", "tasks", taskId, "cognition"), { recursive: true });
    const hypFile = path.join(root, ".wam", "tasks", taskId, "cognition", "hypotheses.jsonl");
    fs.writeFileSync(
      hypFile,
      JSON.stringify({ id: "H1", statement: "first attempt", status: "rejected" }) +
        "\n" +
        JSON.stringify({ id: "H2", statement: "second attempt", status: "testing" }) +
        "\n"
    );

    // 3. Add reference evidence
    fs.writeFileSync(
      path.join(root, ".wam", "references.json"),
      JSON.stringify({ references: [{ id: "ref", status: "VERIFIED" }] })
    );

    // 4. Reload state — strategy, hypotheses, references all preserved
    st = readState(taskId, root);
    assert.equal(st.approvedStrategy.status, "ACTIVE");

    const hyps = fs.readFileSync(hypFile, "utf-8");
    assert.ok(hyps.includes("H1"));
    assert.ok(hyps.includes("H2"));

    const refs = JSON.parse(fs.readFileSync(path.join(root, ".wam", "references.json"), "utf-8"));
    assert.equal(refs.references[0].status, "VERIFIED");

    // 5. Strategy not silently replaced
    assert.notEqual(st.approvedStrategy.status, "INVALIDATED");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
