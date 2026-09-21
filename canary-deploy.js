/**
 * Canary Deploy
 *
 * Staged rollout with health-check tracking and auto-abort on threshold
 * breach. The canary evaluator is dependency-injected so production code
 * uses real telemetry while tests can simulate any health trajectory.
 *
 * API:
 *   canaryDeploy({
 *     releaseId,
 *     rolloutPercent,    // integer 0..100, size of canary cohort
 *     durationMs,        // observation window
 *     healthCheck,       // () => { ok, completionRate, errorRate }
 *     thresholds,        // { minCompletionRate, maxErrorRate }
 *     tickMs,            // polling interval (default 10ms)
 *     now,               // injectable clock (default Date.now)
 *   })
 *     -> Promise<{
 *        status: "advanced" | "aborted",
 *        reason: string,
 *        observations: Array<{ at, ok, completionRate, errorRate }>,
 *      }>
 */

const DEFAULT_THRESHOLDS = {
  minCompletionRate: 0.9, // drop > 10% relative triggers abort
  maxErrorRate: 0.05,    // spike > 5% triggers abort
};

const DEFAULT_TICK_MS = 10;

/**
 * Run a canary rollout. Resolves once the canary either advances (healthy
 * for the full window) or auto-aborts (breach detected). Never rejects:
 * failures surface as `{ status: "aborted", reason }`.
 */
export async function canaryDeploy(opts) {
  const {
    releaseId,
    rolloutPercent,
    durationMs,
    healthCheck,
    thresholds = DEFAULT_THRESHOLDS,
    tickMs = DEFAULT_TICK_MS,
    now = () => Date.now(),
  } = opts || {};

  if (typeof releaseId !== "string" || !releaseId) {
    return {
      status: "aborted",
      reason: "releaseId required",
      observations: [],
    };
  }
  if (!Number.isFinite(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100) {
    return {
      status: "aborted",
      reason: "rolloutPercent must be 0..100",
      observations: [],
    };
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return {
      status: "aborted",
      reason: "durationMs must be > 0",
      observations: [],
    };
  }
  if (typeof healthCheck !== "function") {
    return {
      status: "aborted",
      reason: "healthCheck function required",
      observations: [],
    };
  }

  const minCompletion = thresholds.minCompletionRate ?? DEFAULT_THRESHOLDS.minCompletionRate;
  const maxError = thresholds.maxErrorRate ?? DEFAULT_THRESHOLDS.maxErrorRate;

  // Real-time clock for pacing + deadline; injectable `now` is for `at` timestamps.
  const realStart = Date.now();
  const realDeadline = realStart + durationMs;
  const observations = [];

  while (true) {
    let sample;
    try {
      sample = await healthCheck();
    } catch (err) {
      return {
        status: "aborted",
        reason: `health check threw: ${err && err.message ? err.message : String(err)}`,
        observations,
      };
    }

    const observation = {
      at: now(),
      ok: !!sample?.ok,
      completionRate: typeof sample?.completionRate === "number" ? sample.completionRate : null,
      errorRate: typeof sample?.errorRate === "number" ? sample.errorRate : null,
    };
    observations.push(observation);

    if (!observation.ok) {
      return {
        status: "aborted",
        reason: "health check reported unhealthy",
        observations,
      };
    }
    if (
      observation.completionRate !== null &&
      observation.completionRate < minCompletion
    ) {
      return {
        status: "aborted",
        reason: `completion rate ${observation.completionRate} < ${minCompletion}`,
        observations,
      };
    }
    if (observation.errorRate !== null && observation.errorRate > maxError) {
      return {
        status: "aborted",
        reason: `error rate ${observation.errorRate} > ${maxError}`,
        observations,
      };
    }

    if (Date.now() >= realDeadline) {
      return {
        status: "advanced",
        reason: "canary healthy for full window",
        observations,
      };
    }
    await sleep(tickMs);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}