import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMPLETION_KEYWORDS,
  interceptCompletionClaim,
  classifyClaim,
  validateCompletionClaim,
  validateContractNotReduced,
} from "./false-completion-prevention.js";

describe("COMPLETION_KEYWORDS", () => {
  it("contiene los 9 keywords esperados", () => {
    assert.deepEqual(COMPLETION_KEYWORDS, [
      "done", "fixed", "working", "solved", "completed",
      "implemented", "resolved", "ready", "complete"
    ]);
  });
});

describe("interceptCompletionClaim", () => {
  it("detecta claims de completitud en un mensaje", () => {
    const message = "I have completed the task and it is now working.";
    const claims = interceptCompletionClaim(message);

    assert.equal(claims.length, 2);
    // Order is by keyword iteration, not by position
    assert.equal(claims[0].keyword, "working");
    assert.equal(claims[1].keyword, "completed");
  });

  it("retorna array vacío si no hay keywords", () => {
    const claims = interceptCompletionClaim("This is a neutral message.");
    assert.equal(claims.length, 0);
  });

  it("captura el contexto alrededor del match", () => {
    const message = "The fix is done here.";
    const claims = interceptCompletionClaim(message);

    assert.ok(claims.length > 0);
    assert.equal(claims[0].keyword, "done");
    assert.ok(claims[0].context.includes("done"));
    assert.ok(claims[0].position >= 0);
  });

  it("detecta múltiples ocurrencias del mismo keyword", () => {
    const message = "done and then done again";
    const claims = interceptCompletionClaim(message);

    const doneClaims = claims.filter(c => c.keyword === "done");
    assert.equal(doneClaims.length, 2);
  });
});

describe("classifyClaim", () => {
  it("clasifica como FACT", () => {
    assert.equal(classifyClaim("The service exists and is available"), "FACT");
  });

  it("clasifica como HYPOTHESIS", () => {
    assert.equal(classifyClaim("I think it might work"), "HYPOTHESIS");
  });

  it("clasifica como OBSERVATION", () => {
    assert.equal(classifyClaim("I found a bug in the code"), "OBSERVATION");
  });

  it("clasifica como INTENT", () => {
    assert.equal(classifyClaim("I will fix this tomorrow"), "INTENT");
  });

  it("clasifica como CONCLUSION", () => {
    assert.equal(classifyClaim("Therefore we conclude it works"), "CONCLUSION");
  });

  it("clasifica como COMPLETION_CLAIM", () => {
    assert.equal(classifyClaim("This is now completed"), "COMPLETION_CLAIM");
  });

  it("clasifica como UNKNOWN si no coincide ningún patrón", () => {
    assert.equal(classifyClaim("random text without markers"), "UNKNOWN");
  });
});

describe("validateCompletionClaim", () => {
  it("retorna valid:false si no hay requirements", () => {
    const result = validateCompletionClaim("done", {});
    assert.equal(result.valid, false);
    assert.equal(result.reason, "No requirements defined");
  });

  it("retorna valid:false si hay mandatoryIncomplete", () => {
    const taskState = {
      requirements: [
        { id: "req-1", optional: false, status: "PENDING" }
      ],
      evidence: []
    };

    const result = validateCompletionClaim("done", taskState);

    assert.equal(result.valid, false);
    assert.deepEqual(result.incompleteRequirements, ["req-1"]);
    assert.equal(result.reason, "Evidence gaps remain");
  });

  it("retorna valid:false si hay evidence gaps", () => {
    const taskState = {
      requirements: [
        { id: "req-1", claim: "algo existe", critical: true }
      ],
      evidence: []
    };

    const result = validateCompletionClaim("done", taskState);

    assert.equal(result.valid, false);
    assert.ok(result.evidenceGaps.includes("req-1"));
    assert.equal(result.reason, "Evidence gaps remain");
  });

  it("retorna valid:true cuando todo está verificado", () => {
    const taskState = {
      requirements: [
        { id: "req-1", claim: "system launches", critical: true, optional: false, status: "VERIFIED" }
      ],
      evidence: [
        { requirementId: "req-1", source: "test", type: "DIRECT", observation: "obs", strength: "L3_DIRECT", supports: true }
      ]
    };

    const result = validateCompletionClaim("done", taskState);

    assert.equal(result.valid, true);
    assert.equal(result.reason, null);
    assert.deepEqual(result.incompleteRequirements, []);
    assert.deepEqual(result.evidenceGaps, []);
  });

  it("ignora optional requirements incompletas", () => {
    const taskState = {
      requirements: [
        { id: "req-1", claim: "system launches", critical: true, optional: false, status: "VERIFIED" },
        { id: "req-2", claim: "optional thing", critical: false, optional: true, status: "PENDING" }
      ],
      evidence: [
        { requirementId: "req-1", source: "test", type: "DIRECT", observation: "obs", strength: "L3_DIRECT", supports: true },
        { requirementId: "req-2", source: "test", type: "DIRECT", observation: "obs", strength: "L3_DIRECT", supports: true }
      ]
    };

    const result = validateCompletionClaim("done", taskState);
    assert.equal(result.valid, true);
  });
});

describe("validateContractNotReduced", () => {
  it("retorna valid:true cuando el contrato no se reduce", () => {
    const original = [
      { id: "req-1", claim: "original claim here", acceptanceCriteria: ["a", "b"] },
      { id: "req-2", claim: "another claim", acceptanceCriteria: ["x"] }
    ];
    const current = [
      { id: "req-1", claim: "original claim here", acceptanceCriteria: ["a", "b"] },
      { id: "req-2", claim: "another claim", acceptanceCriteria: ["x"] }
    ];

    const result = validateContractNotReduced(original, current);
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it("detecta requisitos REMOVED", () => {
    const original = [
      { id: "req-1", claim: "claim", acceptanceCriteria: ["a"] },
      { id: "req-2", claim: "claim2", acceptanceCriteria: ["b"] }
    ];
    const current = [
      { id: "req-1", claim: "claim", acceptanceCriteria: ["a"] }
    ];

    const result = validateContractNotReduced(original, current);
    assert.equal(result.valid, false);
    assert.deepEqual(result.violations, [
      { type: "REMOVED", requirementId: "req-2" }
    ]);
  });

  it("detecta acceptance criteria WEAKENED", () => {
    const original = [
      { id: "req-1", claim: "claim", acceptanceCriteria: ["a", "b", "c"] }
    ];
    const current = [
      { id: "req-1", claim: "claim", acceptanceCriteria: ["a"] }
    ];

    const result = validateContractNotReduced(original, current);
    assert.equal(result.valid, false);
    assert.deepEqual(result.violations, [
      { type: "WEAKENED", requirementId: "req-1", originalCount: 3, currentCount: 1 }
    ]);
  });

  it("no marca como WEAKENED si los criterios son iguales", () => {
    const original = [
      { id: "req-1", claim: "claim", acceptanceCriteria: ["a", "b"] }
    ];
    const current = [
      { id: "req-1", claim: "claim", acceptanceCriteria: ["a", "b"] }
    ];

    const result = validateContractNotReduced(original, current);
    assert.equal(result.valid, true);
  });

  it("detecta claim WEAKENED cuando se reduce más del 20%", () => {
    const original = [
      { id: "req-1", claim: "This is a long claim text here", acceptanceCriteria: ["a"] }
    ];
    // Current claim is significantly shorter (< 80% of original length)
    const current = [
      { id: "req-1", claim: "short", acceptanceCriteria: ["a"] }
    ];

    const result = validateContractNotReduced(original, current);
    assert.equal(result.valid, false);
    assert.deepEqual(result.violations, [
      { type: "WEAKENED_CLAIM", requirementId: "req-1" }
    ]);
  });

  it("no detecta WEAKENED_CLAIM si la reducción es <= 20%", () => {
    const original = [
      { id: "req-1", claim: "This is a long claim text here", acceptanceCriteria: ["a"] }
    ];
    // Current claim is ~90% of original length (33 vs 34 chars, > 80%)
    const current = [
      { id: "req-1", claim: "This is a long claim text her", acceptanceCriteria: ["a"] }
    ];

    const result = validateContractNotReduced(original, current);
    assert.equal(result.valid, true);
  });

  it("detecta múltiples violaciones en el mismo requisito", () => {
    const original = [
      { id: "req-1", claim: "original claim here", acceptanceCriteria: ["a", "b", "c"] }
    ];
    const current = [
      { id: "req-1", claim: "short", acceptanceCriteria: ["a"] }
    ];

    const result = validateContractNotReduced(original, current);
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 2);
    assert.ok(result.violations.some(v => v.type === "WEAKENED"));
    assert.ok(result.violations.some(v => v.type === "WEAKENED_CLAIM"));
  });

  it("funciona con arrays vacíos", () => {
    const result = validateContractNotReduced([], []);
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });
});
