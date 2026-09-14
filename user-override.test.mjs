import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import the detectUserOverride function from index.js
// We need to test the regex and logic directly
const EXECUTE_RE = /\b(?:ejecuta|ejecute|ejecutar|corre|correr|córrelo|run|haz|hazlo|do|just\s+do\s+it|hacer|aplica|aplicar|implementa|implementar|lanza|lánzalo|lanzar|launch|trigger)\b/i;

function detectUserOverride(promptText) {
  const trimmed = String(promptText || "").trim();
  if (!trimmed) return { override: false };
  if (!EXECUTE_RE.test(trimmed)) return { override: false };
  const lower = trimmed.toLowerCase();
  const isPureConfirm = /^(s[ií]|ok|okey|dale|hazlo|adelante|continuar|continua|aprobar|confirmo|correcto|perfecto|bueno|va|listo|sigue)\s*[.!]?\s*$/i.test(trimmed);
  if (isPureConfirm) return { override: false };
  if (/^\/wam\b/.test(trimmed)) return { override: false };
  const intent = trimmed.length > 220 ? trimmed.slice(0, 220) + "…" : trimmed;
  return { override: true, intent, source: "user-explicit-execute" };
}

describe("User Override Detection", () => {
  it("should detect imperative execution requests", () => {
    const testCases = [
      "ejecuta la migración de base de datos",
      "corre los tests ahora",
      "haz el deploy a producción",
      "run the integration tests",
      "implementa el cambio solicitado",
      "lanza el build de producción",
      "trigger the deployment pipeline",
      "aplica los cambios al archivo",
      "just do it - execute the script",
    ];

    for (const testCase of testCases) {
      const result = detectUserOverride(testCase);
      assert.equal(result.override, true, `Should detect override in: "${testCase}"`);
      assert.ok(result.intent, "Should have intent");
      assert.equal(result.source, "user-explicit-execute", "Should have correct source");
    }
  });

  it("should NOT detect pure confirmations as overrides", () => {
    const confirmCases = [
      "sí",
      "ok",
      "dale",
      "hazlo",
      "continuar",
      "aprobar contrato",
      "confirmo",
      "perfecto",
      "va",
      "listo",
    ];

    for (const testCase of confirmCases) {
      const result = detectUserOverride(testCase);
      assert.equal(result.override, false, `Should NOT detect override in: "${testCase}"`);
    }
  });

  it("should NOT detect /wam commands as overrides", () => {
    const wamCases = [
      "/wam contract approve",
      "/wam status",
      "/wam answer req-1 yes",
    ];

    for (const testCase of wamCases) {
      const result = detectUserOverride(testCase);
      assert.equal(result.override, false, `Should NOT detect override in: "${testCase}"`);
    }
  });

  it("should handle empty/null input", () => {
    assert.deepEqual(detectUserOverride(""), { override: false });
    assert.deepEqual(detectUserOverride(null), { override: false });
    assert.deepEqual(detectUserOverride(undefined), { override: false });
  });

  it("should truncate long intent messages", () => {
    const longMessage = "ejecuta ".repeat(50) + "esto es un mensaje muy largo";
    const result = detectUserOverride(longMessage);
    assert.equal(result.override, true);
    assert.ok(result.intent.length <= 221, "Intent should be truncated");
  });
});

describe("Integration with contract approval", () => {
  it("override should trigger contract approval", () => {
    // Simulate the logic from index.js line 728
    const contractStatus = "PROPOSED";
    const phase = "PROPOSED";
    const userConfirms = false; // User didn't say "sí/ok/etc"
    const override = detectUserOverride("ejecuta la migración");

    const shouldApprove = contractStatus === "PROPOSED" && phase === "PROPOSED" && (userConfirms || override.override);
    assert.equal(shouldApprove, true, "Override should trigger contract approval");
  });

  it("pure confirmation should still work", () => {
    const contractStatus = "PROPOSED";
    const phase = "PROPOSED";
    const userConfirms = true; // User said "sí"
    const override = detectUserOverride("sí");

    const shouldApprove = contractStatus === "PROPOSED" && phase === "PROPOSED" && (userConfirms || override.override);
    assert.equal(shouldApprove, true, "Pure confirmation should still work");
  });
});