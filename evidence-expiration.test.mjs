/**
 * Evidence volatility tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EVIDENCE_VOLATILITY,
  getEvidenceVolatility,
} from "./evidence.js";

describe("EVIDENCE_VOLATILITY", () => {
  it("exports all four levels", () => {
    assert.equal(EVIDENCE_VOLATILITY.STABLE, "stable");
    assert.equal(EVIDENCE_VOLATILITY.SEMI_STABLE, "semi-stable");
    assert.equal(EVIDENCE_VOLATILITY.VOLATILE, "volatile");
    assert.equal(EVIDENCE_VOLATILITY.HIGHLY_VOLATILE, "highly_volatile");
  });
});

describe("getEvidenceVolatility", () => {
  it("returns STABLE for file_exists", () => {
    assert.equal(getEvidenceVolatility("file_exists"), EVIDENCE_VOLATILITY.STABLE);
  });

  it("returns SEMI_STABLE for package_version", () => {
    assert.equal(getEvidenceVolatility("package_version"), EVIDENCE_VOLATILITY.SEMI_STABLE);
  });

  it("returns VOLATILE for process_running", () => {
    assert.equal(getEvidenceVolatility("process_running"), EVIDENCE_VOLATILITY.VOLATILE);
  });

  it("returns HIGHLY_VOLATILE for network_response", () => {
    assert.equal(getEvidenceVolatility("network_response"), EVIDENCE_VOLATILITY.HIGHLY_VOLATILE);
  });

  it("returns SEMI_STABLE for test_result", () => {
    assert.equal(getEvidenceVolatility("test_result"), EVIDENCE_VOLATILITY.SEMI_STABLE);
  });

  it("returns STABLE as default for unknown types", () => {
    assert.equal(getEvidenceVolatility("unknown_type"), EVIDENCE_VOLATILITY.STABLE);
  });

  it("returns STABLE for empty string", () => {
    assert.equal(getEvidenceVolatility(""), EVIDENCE_VOLATILITY.STABLE);
  });
});
