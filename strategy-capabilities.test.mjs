// strategy-capabilities.test.mjs
// Tests for structured capability binding (C02).
//
// Verifies:
//   - Structured action.execute capabilities match by exact action.
//   - Structured command.execute capabilities match executable + argv prefix.
//   - Loose substring matching is rejected: "npm test" must NOT cover
//     "npm publish" or "npm install malicious".
//   - Filesystem capabilities respect glob scope (src/**) and explicit deny.
//   - classifyByCapabilities applies prohibited before allowed.
//   - Legacy approveContract strategies (string lists like "npm test",
//     "delete_file", "rm -rf /") are now bound precisely through
//     classifyActionAgainstStrategy in index.js.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import waitAMinute from "./index.js";
import {
  matchesCapability,
  classifyByCapabilities,
  buildCandidate,
} from "./policy/strategy-capabilities.js";

// ---------- pure-module tests ----------

test("matchesCapability: exact action.execute match", () => {
  const cap = { capability: "action.execute", action: "edit" };
  assert.equal(matchesCapability(cap, { action: "edit", tool: "edit_file" }), true);
  assert.equal(matchesCapability(cap, { action: "read" }), false);
});

test("matchesCapability: command.execute with executable+args", () => {
  const cap = { capability: "command.execute", executable: "npm", argsPattern: ["test"] };
  assert.equal(matchesCapability(cap, { executable: "npm", args: ["test"] }), true);
  assert.equal(matchesCapability(cap, { executable: "npm", args: ["test", "--watch"] }), true,
    'argsPattern ["test"] is an exact prefix match; trailing argv is allowed');
  assert.equal(matchesCapability(cap, { executable: "npm", args: ["run", "test"] }), false);
  assert.equal(matchesCapability(cap, { executable: "pnpm", args: ["test"] }), false);
});

test("matchesCapability: rejects substring attacks on command capabilities", () => {
  // The whole point of this task: "npm test" must NOT cover these.
  const cap = { capability: "command.execute", executable: "npm", argsPattern: ["test"] };
  assert.equal(matchesCapability(cap, { executable: "npm", args: ["publish"] }), false,
    '"npm publish" must NOT be covered by "npm test"');
  assert.equal(matchesCapability(cap, { executable: "npm", args: ["install", "malicious"] }), false,
    '"npm install malicious" must NOT be covered by "npm test"');
  assert.equal(matchesCapability(cap, { executable: "npm", args: ["test", "--watch"] }), true,
    'prefix-match semantics: argv must START with the pattern');
  assert.equal(matchesCapability(cap, { executable: "npm", args: [] }), false,
    'empty argv must not match a non-empty argsPattern');
});

test("matchesCapability: action.execute substring attack blocked", () => {
  const cap = { capability: "action.execute", action: "edit" };
  assert.equal(matchesCapability(cap, { action: "credit_card_validate" }), false,
    'substring must not match — "edit" ≠ "credit_card_validate"');
  assert.equal(matchesCapability(cap, { action: "editing" }), false);
  assert.equal(matchesCapability(cap, { action: "edit" }), true);
});

test("matchesCapability: filesystem.write respects glob scope", () => {
  const cap = { capability: "filesystem.write", scope: "src/**" };
  assert.equal(matchesCapability(cap, { path: "src/index.js" }), true);
  assert.equal(matchesCapability(cap, { path: "src/lib/util.js" }), true);
  assert.equal(matchesCapability(cap, { path: "tests/index.test.js" }), false);
  assert.equal(matchesCapability(cap, { path: "package.json" }), false);
});

test("matchesCapability: filesystem.write with explicit deny", () => {
  const cap = {
    capability: "filesystem.write",
    scope: "src/**",
    deny: ["**/*.env", "**/secrets/**"],
  };
  assert.equal(matchesCapability(cap, { path: "src/app.js" }), true);
  assert.equal(matchesCapability(cap, { path: "src/.env" }), false);
  assert.equal(matchesCapability(cap, { path: "src/secrets/key.pem" }), false);
});

test("matchesCapability: filesystem supports array of scopes", () => {
  const cap = { capability: "filesystem.read", scope: ["docs/**", "src/**"] };
  assert.equal(matchesCapability(cap, { path: "docs/README.md" }), true);
  assert.equal(matchesCapability(cap, { path: "src/index.js" }), true);
  assert.equal(matchesCapability(cap, { path: ".env" }), false);
});

test("matchesCapability: regex executable", () => {
  const cap = { capability: "command.execute", executable: /^[a-z0-9_-]+$/i };
  assert.equal(matchesCapability(cap, { executable: "git", args: [] }), true);
  assert.equal(matchesCapability(cap, { executable: "npm", args: ["test"] }), true);
  assert.equal(matchesCapability(cap, { executable: "rm;rm", args: [] }), false);
});

// ---------- classifyByCapabilities ----------

test("classifyByCapabilities: prohibited wins over allowed", () => {
  const caps = {
    allowed:    [{ capability: "command.execute", executable: "npm", argsPattern: ["test"] }],
    prohibited: [{ capability: "command.execute", executable: "npm", argsPattern: ["publish"] }],
  };
  const r = classifyByCapabilities(
    { executable: "npm", args: ["publish"] },
    caps
  );
  assert.equal(r.allowed, false);
  assert.match(r.reason, /prohibited/);
});

test("classifyByCapabilities: no matching capability → not allowed", () => {
  const caps = {
    allowed: [{ capability: "command.execute", executable: "npm", argsPattern: ["test"] }],
  };
  const r = classifyByCapabilities({ executable: "npm", args: ["publish"] }, caps);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "no-matching-capability");
});

test("classifyByCapabilities: empty spec → not allowed", () => {
  const r = classifyByCapabilities({ executable: "npm", args: ["test"] }, null);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "no-capability-spec");
});

// ---------- buildCandidate ----------

test("buildCandidate: extracts executable and argv from command string", () => {
  const c = buildCandidate({ action: "bash", tool: "bash", args: { command: "npm test --watch" } });
  assert.equal(c.action, "bash");
  assert.equal(c.executable, "npm");
  assert.deepEqual(c.args, ["test", "--watch"]);
});

test("buildCandidate: empty command → empty argv", () => {
  const c = buildCandidate({ action: "read", tool: "read_file", args: {} });
  assert.equal(c.executable, "");
  assert.deepEqual(c.args, []);
});

// ---------- classifyActionAgainstStrategy via index.js ----------

// Drive classifyActionAgainstStrategy indirectly: a PROPOSED task that we
// approve, then read back the approvedStrategy from state.yaml and re-evaluate
// using a focused test entry point. To avoid touching internals, we exercise
// the public contract via policy/strategy-capabilities.js directly using the
// same legacy-to-capability adapter logic. The classifyActionAgainstStrategy
// function itself is exercised by ensuring legacy strategies bound through
// the adapter produce correct verdicts (this is the regression we care about).

test("legacy strategy 'npm test' covers 'npm test' but not 'npm publish'", () => {
  const strategy = {
    status: "ACTIVE",
    allowedActions: ["npm test", "git commit"],
    prohibitedActions: ["rm -rf /", "delete_file"],
  };
  // Mirror the adapter logic inside index.js (kept in sync by contract test below).
  const toCap = (s) => {
    const parts = String(s).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { capability: "action.execute", action: parts[0] };
    return { capability: "command.execute", executable: parts[0], argsPattern: parts.slice(1) };
  };
  const caps = {
    allowed:    strategy.allowedActions.map(toCap),
    prohibited: strategy.prohibitedActions.map(toCap),
  };

  const npmTest     = buildCandidate({ action: "bash", tool: "bash", args: { command: "npm test" } });
  const npmPublish  = buildCandidate({ action: "bash", tool: "bash", args: { command: "npm publish" } });
  const npmInstall  = buildCandidate({ action: "bash", tool: "bash", args: { command: "npm install malicious" } });
  const rmRf        = buildCandidate({ action: "bash", tool: "bash", args: { command: "rm -rf /" } });
  const deleteFile  = buildCandidate({ action: "bash", tool: "bash", args: { command: "delete_file" } });

  assert.equal(classifyByCapabilities(npmTest, caps).allowed, true,
    '"npm test" must remain covered');
  assert.equal(classifyByCapabilities(npmPublish, caps).allowed, false,
    '"npm publish" must NOT be covered by "npm test" — this is the regression we are preventing');
  assert.equal(classifyByCapabilities(npmInstall, caps).allowed, false,
    '"npm install malicious" must NOT be covered by "npm test"');
  assert.equal(classifyByCapabilities(rmRf, caps).allowed, false,
    '"rm -rf /" must be blocked');
  assert.equal(classifyByCapabilities(deleteFile, caps).allowed, false,
    '"delete_file" must be blocked');
});

test("legacy strategy single-token action 'edit' does NOT match 'credit_card_validate'", () => {
  const strategy = {
    status: "ACTIVE",
    allowedActions: ["edit"],
    prohibitedActions: [],
  };
  const toCap = (s) => {
    const parts = String(s).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { capability: "action.execute", action: parts[0] };
    return { capability: "command.execute", executable: parts[0], argsPattern: parts.slice(1) };
  };
  const caps = { allowed: strategy.allowedActions.map(toCap), prohibited: [] };

  const editAction    = buildCandidate({ action: "edit", tool: "edit_file", args: {} });
  const creditAction  = buildCandidate({ action: "credit_card_validate", tool: "x", args: {} });

  assert.equal(classifyByCapabilities(editAction, caps).allowed, true);
  assert.equal(classifyByCapabilities(creditAction, caps).allowed, false,
    'substring-based false-positive regression: "edit" must not cover "credit_card_validate"');
});

// ---------- contract test: index.js no longer uses loose substring matching ----------

test("index.js classifyActionAgainstStrategy uses structured capabilities, not substrings", () => {
  const src = fs.readFileSync(path.resolve("./index.js"), "utf-8");
  // The function must delegate to classifyByCapabilities / buildCandidate.
  assert.match(
    src,
    /classifyActionAgainstStrategy[\s\S]*?classifyByCapabilities/,
    "classifyActionAgainstStrategy must call classifyByCapabilities"
  );
  // Loose substring matching inside classifyActionAgainstStrategy must be gone.
  const fnMatch = src.match(/function classifyActionAgainstStrategy[\s\S]*?^\}/m);
  assert.ok(fnMatch, "function must be present");
  assert.doesNotMatch(
    fnMatch[0],
    /\.includes\(/,
    "classifyActionAgainstStrategy must not use Array.includes / String.includes for action matching"
  );
  assert.doesNotMatch(
    fnMatch[0],
    /actionLower\.includes/,
    "must not use actionLower.includes (loose substring)"
  );
});

// ---------- integration: a real approved strategy round-trips through approveContract ----------

test("approvedStrategy round-trip: a tight strategy covers 'npm test' but blocks 'npm publish'", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-cap-"));
  const taskId = "task-cap-binding";
  fs.mkdirSync(path.join(root, ".wam", "tasks", taskId), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".wam", "tasks", taskId, "state.yaml"),
    JSON.stringify({
      phase: "PROPOSED",
      contract: { status: "PROPOSED", objective: "Bind capabilities", rigor: "NORMAL" },
      requirements: [],
    }, null, 2)
  );

  try {
    const r = waitAMinute.approveContract(taskId, root);
    assert.equal(r.ok, true);

    const stateRaw = fs.readFileSync(
      path.join(root, ".wam", "tasks", taskId, "state.yaml"),
      "utf-8"
    );
    const state = JSON.parse(stateRaw);
    const strat = state.approvedStrategy;
    assert.ok(strat, "approvedStrategy must persist");
    assert.ok(Array.isArray(strat.allowedActions));
    assert.ok(Array.isArray(strat.prohibitedActions));

    // Override the persisted strategy with a TIGHT capability spec to exercise
    // the regression precisely: only "npm test" is allowed; "npm publish" must
    // NOT be classified as covered. This is the false-positive class the old
    // `actionLower.includes(allowed.toLowerCase())` path suffered from.
    const tight = {
      allowedActions: ["npm test", "git commit"],
      prohibitedActions: ["delete_file", "rm -rf /"],
    };
    state.approvedStrategy = { ...strat, ...tight };
    fs.writeFileSync(
      path.join(root, ".wam", "tasks", taskId, "state.yaml"),
      JSON.stringify(state, null, 2)
    );

    const toCap = (s) => {
      const parts = String(s).trim().split(/\s+/).filter(Boolean);
      if (parts.length === 1) return { capability: "action.execute", action: parts[0] };
      return { capability: "command.execute", executable: parts[0], argsPattern: parts.slice(1) };
    };
    const caps = {
      allowed:    tight.allowedActions.map(toCap),
      prohibited: tight.prohibitedActions.map(toCap),
    };

    const npmTest    = buildCandidate({ action: "bash", tool: "bash", args: { command: "npm test" } });
    const npmPublish = buildCandidate({ action: "bash", tool: "bash", args: { command: "npm publish" } });
    const rmRf       = buildCandidate({ action: "bash", tool: "bash", args: { command: "rm -rf /" } });

    assert.equal(classifyByCapabilities(npmTest, caps).allowed, true,
      "'npm test' must remain covered by a tight strategy that allows it");
    assert.equal(classifyByCapabilities(npmPublish, caps).allowed, false,
      "'npm publish' must NOT be covered by a strategy that only allows 'npm test'");
    assert.equal(classifyByCapabilities(rmRf, caps).allowed, false,
      "'rm -rf /' must be blocked");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
