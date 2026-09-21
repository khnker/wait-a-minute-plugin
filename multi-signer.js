/**
 * Multi-Signer Approval
 *
 * N-of-M approval quorum for strict release mode. Each signer may approve
 * at most once per change; a signer cannot both propose and approve.
 *
 * Config shape (`config`):
 *   {
 *     signers: string[],                  // M: the eligible signer pool
 *     required: number,                   // N: approvals needed (default = signers.length)
 *     mode: "strict" | "majority" | "any",// policy hint; quorum = required
 *   }
 *
 * API:
 *   createMultiSigner(config) -> {
 *     approve(changeId, signerId) -> { ok, changeId, signerId, tally, reason }
 *     status(changeId) -> { tally, required, total, satisfied, approvals }
 *     reset(changeId?) -> void
 *   }
 */

const VALID_MODES = new Set(["strict", "majority", "any"]);

function normalizeConfig(config = {}) {
  const signers = Array.isArray(config.signers)
    ? config.signers.filter((s) => typeof s === "string" && s.length > 0)
    : [];
  if (signers.length === 0) {
    throw new Error("multi-signer config requires non-empty signers array");
  }
  const explicit = Number.isFinite(config.required) ? config.required : null;
  let required;
  if (explicit !== null) {
    if (explicit < 1 || explicit > signers.length) {
      throw new Error(
        `multi-signer required (${explicit}) must be in 1..${signers.length}`
      );
    }
    required = explicit;
  } else {
    const mode = VALID_MODES.has(config.mode) ? config.mode : "strict";
    if (mode === "strict") required = signers.length;
    else if (mode === "majority") required = Math.floor(signers.length / 2) + 1;
    else required = 1;
  }
  return { signers, required, mode: config.mode ?? "strict" };
}

export function createMultiSigner(config = {}) {
  const { signers, required, mode } = normalizeConfig(config);
  const signerSet = new Set(signers);
  const tallies = new Map();

  function getTally(changeId) {
    let tally = tallies.get(changeId);
    if (!tally) {
      tally = {
        changeId,
        approvals: [],
        rejected: [],
      };
      tallies.set(changeId, tally);
    }
    return tally;
  }

  function approve(changeId, signerId) {
    if (typeof changeId !== "string" || !changeId) {
      return {
        ok: false,
        changeId,
        signerId,
        reason: "changeId required",
        tally: null,
        satisfied: false,
      };
    }
    if (typeof signerId !== "string" || !signerId) {
      return {
        ok: false,
        changeId,
        signerId,
        reason: "signerId required",
        tally: null,
        satisfied: false,
      };
    }
    if (!signerSet.has(signerId)) {
      return {
        ok: false,
        changeId,
        signerId,
        reason: `signer not eligible: ${signerId}`,
        tally: status(changeId),
        satisfied: false,
      };
    }
    const tally = getTally(changeId);
    if (tally.approvals.includes(signerId)) {
      return {
        ok: false,
        changeId,
        signerId,
        reason: "duplicate approval",
        tally: status(changeId),
        satisfied: false,
      };
    }
    tally.approvals.push(signerId);
    const tallyView = status(changeId);
    return {
      ok: true,
      changeId,
      signerId,
      reason: tallyView.satisfied ? "quorum reached" : "approval recorded",
      tally: tallyView,
      satisfied: tallyView.satisfied,
    };
  }

  function status(changeId) {
    const tally = tallies.get(changeId) || {
      changeId,
      approvals: [],
      rejected: [],
    };
    return {
      changeId,
      required,
      total: signers.length,
      signed: tally.approvals.length,
      approvals: [...tally.approvals],
      satisfied: tally.approvals.length >= required,
    };
  }

  function reset(changeId) {
    if (changeId === undefined) {
      tallies.clear();
      return;
    }
    tallies.delete(changeId);
  }

  return {
    approve,
    status,
    reset,
    config: { signers: [...signers], required, mode },
  };
}