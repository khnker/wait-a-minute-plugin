import { assembleContext } from "./assembly.js";
import { buildContextQuery, CONTEXT_PURPOSE } from "./context-query-contract.js";
import { checkSufficiency, SufficiencyGate, SUFFICIENCY_LEVEL } from "./context-sufficiency-gate.js";

export const CONTEXT_ASSEMBLY_STATUS = Object.freeze({
  PROCEED: "PROCEED",
  BLOCK: "BLOCK",
});

export function assembleContextWithQuery(params = {}) {
  const query = params.query || buildContextQuery({
    taskId: params.taskId,
    purpose: params.purpose || CONTEXT_PURPOSE.PLANNING,
    requirementId: params.requirementId,
    hypothesisId: params.hypothesisId,
    experimentId: params.experimentId,
    executionId: params.executionId,
    taskType: params.taskType,
    phase: params.phase,
    activeFiles: params.activeFiles || [],
    activeTools: params.activeTools || [],
    knownFailures: params.knownFailures || [],
    unresolvedQuestions: params.unresolvedQuestions || [],
    budget: params.budget,
  });

  const sufficiency = checkSufficiency(params.items || [], query.purpose);
  const gate = new SufficiencyGate({
    purpose: query.purpose,
    minLevel: params.minLevel || SUFFICIENCY_LEVEL.SUFFICIENT,
    requireMandatory: params.requireMandatory || false,
  });
  const gateResult = gate.evaluate(params.items || []);
  const hasNoItems = !params.items || params.items.length === 0;
  const minLevel = params.minLevel || SUFFICIENCY_LEVEL.SUFFICIENT;
  const shouldBlock = !hasNoItems && (
    gateResult.sufficiency.level === SUFFICIENCY_LEVEL.INSUFFICIENT ||
    (params.minLevel && gateResult.sufficiency.level !== minLevel &&
     gateResult.decision !== "PROCEED")
  );

  if (shouldBlock) {
    return {
      status: CONTEXT_ASSEMBLY_STATUS.BLOCK,
      query,
      sufficiency: gateResult.sufficiency,
      gate: gateResult,
      context: null,
    };
  }

  const context = assembleContext({
    ...params,
    query,
    taskState: {
      ...(params.taskState || {}),
      query,
      unresolvedCriticalUnknowns: gateResult.sufficiency.unresolvedCriticalUnknowns,
    },
  });

  return {
    status: CONTEXT_ASSEMBLY_STATUS.PROCEED,
    query,
    sufficiency: gateResult.sufficiency,
    gate: gateResult,
    context,
  };
}

export { assembleContext };