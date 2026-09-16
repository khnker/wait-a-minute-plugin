/**
 * Governance Enforcement — Centralized policy check for tool execution.
 *
 * Determines whether a tool may execute given the current task state.
 * Throws WamPolicyBlock when governance is violated.
 */

import { WamPolicyBlock, MUTATING_TOOLS } from "./risk-engine.js";

/**
 * Enforce governance rules for a tool execution attempt.
 *
 * @param {string} tool - The tool name being invoked.
 * @param {object} state - The current task state.
 * @param {object} [state.contract] - Contract with `status` field.
 * @param {string} [state.phase] - Current phase (PROPOSED, IMPLEMENTING, VERIFYING, DONE, etc.)
 *
 * @throws {WamPolicyBlock} When a mutating tool is used without approved contract.
 */
export function enforceGovernance(tool, state) {
  const contractStatus = state?.contract?.status;
  const phase = state?.phase;

  if (MUTATING_TOOLS.has(tool) && contractStatus !== "APPROVED" && phase !== "DONE") {
    const reqs = (state?.requirements || []).filter((r) => r.status !== "done" && r.status !== "verified");
    const pendCount = reqs.length;
    const directive = `[wait-a-minute] GOVERNANCE BLOCK (${tool}): contrato no aprobado (fase ${phase}). ${pendCount} requisito(s) pendiente(s). Aprobar contrato primero: /wam contract approve o continuar con implementación legítima.`;
    throw new WamPolicyBlock(directive, {
      tool,
      reason: "contract not approved",
      level: "BLOCKED",
      source: "governance-enforcement",
    });
  }
}
