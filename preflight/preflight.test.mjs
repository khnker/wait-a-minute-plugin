import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRequest } from "../preflight/request-classifier.js";
import { detectStack, getPackageJson, getAgentsMd } from "../preflight/project-inspector.js";
import { classifyUncertainty, buildUncertainties, buildAssumptions } from "../preflight/uncertainty.js";
import { discoverSkills } from "../preflight/skill-routing.js";
import path from "node:path";

test("classifyRequest returns trivial for rename", () => {
  const r = classifyRequest("rename file x to y");
  assert.equal(r.type, "trivial");
  assert.equal(r.confidence, 95);
});

test("classifyRequest returns architectural for security", () => {
  const r = classifyRequest("Improve security of auth");
  assert.equal(r.type, "architectural");
  assert.equal(r.mode, "STRICT");
});

test("classifyRequest returns research for compare", () => {
  const r = classifyRequest("compare options A vs B");
  assert.equal(r.type, "research");
});

test("classifyRequest returns normal default", () => {
  const r = classifyRequest("Build a new feature");
  assert.equal(r.type, "normal");
});

test("detectStack returns unknown if no package.json", () => {
  const r = detectStack("/tmp/does-not-exist-12345");
  assert.equal(r.stack, "unknown");
  assert.deepEqual(r.languages, []);
});

test("detectStack detects typescript", () => {
  const dir = process.cwd();
  const r = detectStack(dir);
  assert.ok(Array.isArray(r.languages));
});

test("getPackageJson returns object or null", () => {
  const pkg = getPackageJson(process.cwd());
  if (pkg !== null) {
    assert.equal(typeof pkg, "object");
  }
});

test("getAgentsMd returns string", () => {
  const a = getAgentsMd(process.cwd());
  assert.equal(typeof a, "string");
});

test("classifyUncertainty maps security to DECISION_CRITICAL", () => {
  assert.equal(classifyUncertainty("rotate api key"), "DECISION_CRITICAL");
  assert.equal(classifyUncertainty("migration schema"), "DECISION_CRITICAL");
});

test("classifyUncertainty maps how-exists to RESOLVABLE", () => {
  assert.equal(classifyUncertainty("cómo se maneja el endpoint"), "RESOLVABLE");
});

test("classifyUncertainty maps generic to NON_BLOCKING", () => {
  assert.equal(classifyUncertainty("add new button color"), "NON_BLOCKING");
});

test("buildUncertainties dedupes and tags", () => {
  const u = buildUncertainties(["seguridad auth"], ["color hex"]);
  assert.equal(u.length, 2);
  assert.equal(u[0].classification, "DECISION_CRITICAL");
  assert.equal(u[1].classification, "NON_BLOCKING");
});

test("buildAssumptions creates id-prefixed entries", () => {
  const a = buildAssumptions(["use Postgres", "use Postgres"]);
  assert.equal(a.length, 1);
  assert.equal(a[0].id, "A1");
});

test("discoverSkills returns object", () => {
  const s = discoverSkills();
  assert.equal(typeof s, "object");
});
