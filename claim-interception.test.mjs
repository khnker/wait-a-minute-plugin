import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  interceptAgentClaim,
  createClaim,
  validateClaim
} from "./claim-interception.js";

describe("interceptAgentClaim", () => {
  it("detecta claims FACT", () => {
    const claims = interceptAgentClaim("The system has the feature installed.");
    const factClaims = claims.filter(c => c.type === "FACT");
    assert.ok(factClaims.length > 0, "should detect FACT claims");
    assert.equal(factClaims[0].type, "FACT");
  });

  it("detecta claims HYPOTHESIS", () => {
    const claims = interceptAgentClaim("I think this could be the issue.");
    const hypClaims = claims.filter(c => c.type === "HYPOTHESIS");
    assert.ok(hypClaims.length > 0, "should detect HYPOTHESIS claims");
  });

  it("detecta claims OBSERVATION", () => {
    const claims = interceptAgentClaim("I found the root cause and observed the behavior.");
    const obsClaims = claims.filter(c => c.type === "OBSERVATION");
    assert.ok(obsClaims.length > 0, "should detect OBSERVATION claims");
  });

  it("detecta claims INTENT", () => {
    const claims = interceptAgentClaim("I will fix this and plan to deploy.");
    const intClaims = claims.filter(c => c.type === "INTENT");
    assert.ok(intClaims.length > 0, "should detect INTENT claims");
  });

  it("detecta claims CONCLUSION", () => {
    const claims = interceptAgentClaim("Therefore, we can conclude it works.");
    const conclClaims = claims.filter(c => c.type === "CONCLUSION");
    assert.ok(conclClaims.length > 0, "should detect CONCLUSION claims");
  });

  it("detecta claims COMPLETION", () => {
    const claims = interceptAgentClaim("Task is completed and ready.");
    const compClaims = claims.filter(c => c.type === "COMPLETION");
    assert.ok(compClaims.length > 0, "should detect COMPLETION claims");
  });

  it("retorna array vacío si no hay claims", () => {
    const claims = interceptAgentClaim("Greetings everyone, good morning.");
    assert.equal(claims.length, 0);
  });

  it("cada claim tiene estructura correcta", () => {
    const claims = interceptAgentClaim("Task is done.");
    const claim = claims[0];
    assert.ok(claim.type, "has type");
    assert.ok(claim.text, "has text");
    assert.equal(typeof claim.position, "number", "has position");
    assert.ok(claim.context, "has context");
    assert.ok(claim.position >= 0, "position is non-negative");
    assert.ok(claim.context.length > 0, "context is non-empty");
  });
});

describe("createClaim", () => {
  it("crea un claim con estructura correcta", () => {
    const claim = createClaim("Task is done", "COMPLETION");

    assert.ok(claim.id, "has id");
    assert.ok(claim.id.startsWith("claim-"), "id starts with claim-");
    assert.equal(claim.text, "Task is done");
    assert.equal(claim.type, "COMPLETION");
    assert.equal(claim.source, "agent");
    assert.equal(claim.validated, false);
    assert.ok(typeof claim.timestamp === "number");
    assert.ok(claim.timestamp > 0);
  });

  it("permite source personalizado", () => {
    const claim = createClaim("text", "FACT", "user");
    assert.equal(claim.source, "user");
  });

  it("genera ids con formato claim-*", () => {
    const claim = createClaim("test", "FACT");
    assert.ok(claim.id.startsWith("claim-"), "id starts with claim-");
    assert.ok(/^[a-z0-9]+$/.test(claim.id.slice(6)), "id suffix is base36");
  });
});

describe("validateClaim", () => {
  it("COMPLETION requiere verificación", () => {
    const claim = { id: "claim-1", type: "COMPLETION" };
    const result = validateClaim(claim);

    assert.equal(result.claimId, "claim-1");
    assert.equal(result.valid, false);
    assert.equal(result.requiresVerification, true);
    assert.equal(result.reason, "Completion claim requires verification");
  });

  it("HYPOTHESIS requiere validación", () => {
    const claim = { id: "claim-1", type: "HYPOTHESIS" };
    const result = validateClaim(claim);

    assert.equal(result.valid, false);
    assert.equal(result.reason, "Hypothesis requires validation");
  });

  it("FACT requiere verificación", () => {
    const claim = { id: "claim-1", type: "FACT" };
    const result = validateClaim(claim);

    assert.equal(result.requiresVerification, true);
    assert.equal(result.reason, "Fact claims should be verified");
  });

  it("OBSERVATION es válida sin verificación", () => {
    const claim = { id: "claim-1", type: "OBSERVATION" };
    const result = validateClaim(claim);

    assert.equal(result.valid, true);
    assert.equal(result.reason, "Observation or intent does not require verification");
  });

  it("INTENT es válida sin verificación", () => {
    const claim = { id: "claim-1", type: "INTENT" };
    const result = validateClaim(claim);

    assert.equal(result.valid, true);
  });

  it("incluye claimId en el resultado", () => {
    const claim = { id: "claim-abc", type: "FACT" };
    const result = validateClaim(claim);
    assert.equal(result.claimId, "claim-abc");
  });
});
