/**
 * Context Recovery — Reconstruct minimum corrective context when agent drifts.
 *
 * Change 78: reconstructMinimumCorrectiveContext()
 *
 * When an agent action has drifted from the goal, this module
 * rebuilds the minimal context needed to get back on track.
 *
 * The recovery context includes:
 *   - The original goal/objective
 *   - What has already been accomplished (verified items)
 *   - The most recent relevant observations
 *   - Constraints that must be respected
 *   - Open questions that need resolution
 */

/**
 * @typedef {Object} RecoveryContext
 * @property {string} goal - The original goal
 * @property {Object[]} accomplished - Verified/accomplished items
 * @property {Object[]} recentObservations - Most recent relevant observations
 * @property {Object[]} constraints - Active constraints
 * @property {Object[]} openQuestions - Questions needing resolution
 * @property {string} driftReason - Why recovery was needed
 * @property {number} timestamp - When recovery context was built
 */

/**
 * @typedef {Object} DriftReport
 * @property {boolean} drifted - Whether drift was detected
 * @property {string} reason - Description of the drift
 * @property {number} confidence - 0-1 confidence of drift detection
 */

/**
 * Simple keyword check: does the content relate to the goal?
 * @param {string} content
 * @param {string} goal
 * @returns {boolean}
 */
function relatesToGoal(content, goal) {
  if (!content || !goal) return false;
  if (content === goal) return true;
  const contentLower = String(content).toLowerCase();
  const goalWords = String(goal).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (goalWords.length === 0) return true;
  const matches = goalWords.filter((w) => contentLower.includes(w));
  return matches.length >= Math.ceil(goalWords.length / 2);
}

/**
 * Change 78 — reconstructMinimumCorrectiveContext
 *
 * Builds a minimal context from available data when agent has drifted.
 *
 * @param {Object} params
 * @param {string} params.goal - The original goal/objective
 * @param {Object[]} [params.accomplished=[]] - Already completed/verified items
 * @param {Object[]} [params.observations=[]] - Recent observations
 * @param {Object[]} [params.constraints=[]] - Active constraints
 * @param {Object[]} [params.openQuestions=[]] - Unresolved questions
 * @param {Object[]} [params.recentActions=[]] - Recent actions taken
 * @param {string} params.driftReason - Why recovery is needed
 * @param {number} [params.maxObservations=5] - Max observations to include
 * @param {number} [params.maxAccomplished=10] - Max accomplished items
 * @returns {RecoveryContext}
 */
export function reconstructMinimumCorrectiveContext({
  goal,
  accomplished = [],
  observations = [],
  constraints = [],
  openQuestions = [],
  recentActions = [],
  driftReason,
  maxObservations = 5,
  maxAccomplished = 10,
}) {
  if (!goal || typeof goal !== "string") {
    throw new TypeError("goal must be a non-empty string");
  }
  if (!driftReason || typeof driftReason !== "string") {
    throw new TypeError("driftReason must be a non-empty string");
  }

  // Accomplished: verified items, most recent first
  const sortedAccomplished = [...accomplished]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, maxAccomplished);

  // Observations: filter for goal relevance, most recent first
  const relevantObservations = observations
    .filter((obs) => relatesToGoal(obs.content || "", goal))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, maxObservations);

  // If not enough goal-relevant observations, include recent actions as context
  if (relevantObservations.length < 2 && recentActions.length > 0) {
    const actionContext = recentActions
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, Math.max(1, maxObservations - relevantObservations.length));
    // Blend: alternate between observations and actions
    const blended = [];
    const maxLen = Math.max(relevantObservations.length, actionContext.length);
    for (let i = 0; i < maxLen; i++) {
      if (relevantObservations[i]) blended.push(relevantObservations[i]);
      if (actionContext[i]) blended.push(actionContext[i]);
    }
    return buildRecovery({
      goal,
      accomplished: sortedAccomplished,
      observations: blended.slice(0, maxObservations),
      constraints,
      openQuestions,
      driftReason,
    });
  }

  return buildRecovery({
    goal,
    accomplished: sortedAccomplished,
    observations: relevantObservations,
    constraints,
    openQuestions,
    driftReason,
  });
}

/**
 * @param {Object} parts
 * @returns {RecoveryContext}
 */
function buildRecovery({ goal, accomplished, observations, constraints, openQuestions, driftReason }) {
  return {
    goal,
    accomplished: accomplished || [],
    recentObservations: observations || [],
    constraints: constraints || [],
    openQuestions: openQuestions || [],
    driftReason,
    timestamp: Date.now(),
  };
}

/**
 * Quick check: does the agent action represent a drift from the goal?
 *
 * @param {Object} agentAction - The action taken by the agent
 * @param {string} goal - The original goal
 * @returns {DriftReport}
 */
export function detectActionDrift(agentAction, goal) {
  if (!agentAction || typeof agentAction !== "object") {
    return { drifted: false, reason: "No action provided", confidence: 0 };
  }
  if (!goal || typeof goal !== "string") {
    return { drifted: false, reason: "No goal provided", confidence: 0 };
  }

  const actionContent = String(agentAction.content || agentAction.description || "").toLowerCase();
  const actionType = String(agentAction.type || "").toLowerCase();

  // Direct match: action type or content explicitly references goal
  const directMatch = actionContent.includes(goal.toLowerCase()) ||
                      goal.toLowerCase().includes(actionContent) ||
                      actionContent === goal.toLowerCase();

  if (directMatch) {
    return { drifted: false, reason: "Action directly related to goal", confidence: 0.95 };
  }

  // Check for verb/topic overlap
  const goalWords = goal.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const contentWords = actionContent.split(/\s+/).filter((w) => w.length > 2);
  const overlap = goalWords.filter((w) => contentWords.includes(w)).length;
  const overlapRatio = goalWords.length > 0 ? overlap / goalWords.length : 0;

  if (overlapRatio >= 0.3) {
    return { drifted: false, reason: "Action has topic overlap with goal", confidence: 0.7 };
  }

  // Known drift indicators
  const driftIndicators = [
    "exploring", "wandering", "asking clarification", "need more info",
    "unclear", "confused", "redundant", "waiting", "idle",
  ];
  const isDrift = driftIndicators.some((ind) => actionContent.includes(ind));

  if (isDrift) {
    return {
      drifted: true,
      reason: `Action contains drift indicator: "${actionContent.substring(0, 60)}"`,
      confidence: 0.75,
      signals: [actionContent],
    };
  }

  // Low overlap, no drift indicators = likely drift but low confidence
  if (overlapRatio < 0.1 && actionContent.length > 0) {
    return {
      drifted: true,
      reason: `Low topic overlap (${Math.round(overlapRatio * 100)}%) between action and goal`,
      confidence: 0.5,
      signals: [`low_overlap:${Math.round(overlapRatio * 100)}%`],
    };
  }

  return { drifted: false, reason: "Action appears goal-aligned", confidence: 0.8 };
}
