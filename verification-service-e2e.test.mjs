/**
 * Verification Engine — Service & E2E Checks Tests
 * Ejecutar: node --test verification-service-e2e.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { executeCheck, createEvidence } from "./verification.js";

test("service check con URL válida → PASS cuando responde 200", async () => {
  const check = { id: "svc-1", requirement_id: "R1", type: "service", url: "https://httpbin.org/status/200" };
  const result = await executeCheck(check, { timeout_ms: 10000 });
  assert.equal(result.status, "PASS", `Expected PASS but got ${result.status}: ${result.diagnostic}`);
  assert.equal(result.response_status, 200);
});

test("service check con URL que responde 404 → FAIL", async () => {
  const check = { id: "svc-2", requirement_id: "R1", type: "service", url: "https://httpbin.org/status/404" };
  const result = await executeCheck(check, { timeout_ms: 10000 });
  assert.equal(result.status, "FAIL");
  assert.equal(result.response_status, 404);
});

test("service check con URL inválida → ERROR", async () => {
  const check = { id: "svc-3", requirement_id: "R1", type: "service", url: "not-a-url" };
  const result = await executeCheck(check, { timeout_ms: 5000 });
  assert.equal(result.status, "ERROR");
});

test("e2e check genera resultado con selectors", async () => {
  const check = { 
    id: "e2e-1", 
    requirement_id: "R1", 
    type: "e2e", 
    url: "https://example.com",
    selectors: ["title", "h1"]
  };
  const result = await executeCheck(check, { timeout_ms: 15000 });
  assert.ok(result.e2e_results, "e2e_results presente");
  assert.ok(Array.isArray(result.e2e_results), "e2e_results es array");
});

test("validateCheck acepta service y e2e types", async () => {
  const { validateCheck } = await import("./verification.js");
  
  const serviceCheck = { type: "service", url: "https://example.com" };
  assert.equal(validateCheck(serviceCheck), null, "service check válido");
  
  const e2eCheck = { type: "e2e", url: "https://example.com", selectors: ["h1"] };
  assert.equal(validateCheck(e2eCheck), null, "e2e check válido");
  
  const invalidService = { type: "service", url: "not-a-url" };
  assert.ok(validateCheck(invalidService)?.includes("inválida"), "URL inválida detectada");
  
  const invalidE2e = { type: "e2e", url: "https://example.com", selectors: [] };
  assert.ok(validateCheck(invalidE2e)?.includes("selectors"), "selectors vacíos detectados");
});

test("createEvidence incluye campos específicos para cada tipo", async () => {
  const commandCheck = { type: "command", command: "echo test", cwd: process.cwd() };
  const commandResult = { check_id: "c1", requirement_id: "R1", status: "PASS", exit_code: 0 };
  const cmdEv = createEvidence(commandCheck, commandResult);
  assert.equal(cmdEv.type, "command");
  assert.equal(cmdEv.command, "echo test");
  
  const serviceCheck = { type: "service", url: "https://example.com" };
  const serviceResult = { check_id: "s1", requirement_id: "R1", status: "PASS", response_status: 200 };
  const svcEv = createEvidence(serviceCheck, serviceResult);
  assert.equal(svcEv.type, "service");
  assert.equal(svcEv.url, "https://example.com");
  assert.equal(svcEv.response_status, 200);
  
  const e2eCheck = { type: "e2e", url: "https://example.com", selectors: ["h1"] };
  const e2eResult = { check_id: "e1", requirement_id: "R1", status: "PASS", e2e_results: [{ selector: "h1", found: true }] };
  const e2eEv = createEvidence(e2eCheck, e2eResult);
  assert.equal(e2eEv.type, "e2e");
  assert.equal(e2eEv.url, "https://example.com");
  assert.deepEqual(e2eEv.selectors, ["h1"]);
});
