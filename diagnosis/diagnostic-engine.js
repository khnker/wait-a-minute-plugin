/**
 * Diagnosis — Causal Loop (C05)
 *
 * Implements a closed diagnostic loop:
 *   observation → classify failure class → generate candidate causes →
 *   derive discriminating experiment → execute & observe → assess cause.
 *
 * The engine NEVER assumes stealth / anti-bot measures unless the evidence
 * supports it (Chromium golden test: an executable-missing error is not
 * labelled ANTI_BOT just because the agent feels like it).
 */

import {
  AssessmentResult,
} from "../assessment/assessment-rules.js";

// ─────────────────────────────────────────────────────────────────────────────
// Failure class taxonomy
// ─────────────────────────────────────────────────────────────────────────────

export const FailureClass = Object.freeze({
  BROWSER_RUNTIME: "BROWSER_RUNTIME",
  MISSING_EXECUTABLE: "MISSING_EXECUTABLE",
  ANTI_BOT: "ANTI_BOT",
  NETWORK_ERROR: "NETWORK_ERROR",
  AUTH: "AUTH",
  CONFIGURATION: "CONFIGURATION",
  RATE_LIMIT: "RATE_LIMIT",
  UNKNOWN: "UNKNOWN",
});

// ─────────────────────────────────────────────────────────────────────────────
// Classification rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ClassificationRule
 * @property {string} class
 * @property {RegExp[]} errorCodeMatchers
 * @property {RegExp[]} messageMatchers
 * @property {number[]} statusCodes
 */

/** @type {ClassificationRule[]} */
const CLASSIFICATION_RULES = [
  {
    class: FailureClass.MISSING_EXECUTABLE,
    errorCodeMatchers: [
      /executable.*not.*found/i,
      /no.*such.*file/i,
      /enoent/i,
      /browser.*not.*installed/i,
    ],
    messageMatchers: [
      /executable doesn't exist/i,
      /browser.*launch.*failed/i,
      /chromium.*not.*found/i,
      /playwright.*install/i,
    ],
    statusCodes: [],
  },
  {
    class: FailureClass.ANTI_BOT,
    errorCodeMatchers: [/captcha/i, /cloudflare/i, /waf/i, /forbidden/i, /access.denied/i],
    messageMatchers: [
      /captcha/i,
      /cloudflare/i,
      /forbidden/i,
      /403 forbidden/i,
      /access denied/i,
      /bot detected/i,
      /please verify/i,
    ],
    statusCodes: [403, 429],
  },
  {
    class: FailureClass.RATE_LIMIT,
    errorCodeMatchers: [/rate.?limit/i, /too.?many.?requests/i],
    messageMatchers: [/rate.?limit/i, /too.?many.?requests/i, /quota.?exceeded/i],
    statusCodes: [429],
  },
  {
    class: FailureClass.AUTH,
    errorCodeMatchers: [/unauthorized/i, /auth/i, /token/i],
    messageMatchers: [/unauthorized/i, /auth.*fail/i, /invalid.*token/i, /401/i],
    statusCodes: [401, 407],
  },
  {
    class: FailureClass.NETWORK_ERROR,
    errorCodeMatchers: [
      /econnrefused/i,
      /econnreset/i,
      /etimedout/i,
      /enotfound/i,
      /network/i,
      /dns/i,
    ],
    messageMatchers: [
      /connection.*refused/i,
      /connection.*reset/i,
      /timed.?out/i,
      /getaddrinfo/i,
      /network/i,
    ],
    statusCodes: [],
  },
  {
    class: FailureClass.BROWSER_RUNTIME,
    errorCodeMatchers: [
      /browser/i,
      /playwright/i,
      /puppeteer/i,
      /chromium/i,
      /navigation.?timeout/i,
      /page.?crash/i,
    ],
    messageMatchers: [
      /browser.*crash/i,
      /page.*crash/i,
      /navigation.*timeout/i,
      /context.*destroyed/i,
    ],
    statusCodes: [],
  },
  {
    class: FailureClass.CONFIGURATION,
    errorCodeMatchers: [/config/i, /option/i],
    messageMatchers: [/invalid.*config/i, /missing.*option/i, /bad.*parameter/i],
    statusCodes: [],
  },
];

/**
 * Classify a raw observation into a FailureClass.
 * Pure function: deterministic given the same input shape.
 *
 * @param {Object} observation - shape: { errorCode?, message?, statusCode?, name? }
 * @returns {string} FailureClass
 */
export function classifyObservation(observation) {
  if (!observation || typeof observation !== "object") {
    return FailureClass.UNKNOWN;
  }

  const errorCode = String(observation.errorCode ?? "");
  const message = String(observation.message ?? "");
  const name = String(observation.name ?? "");
  const statusCode =
    typeof observation.statusCode === "number" ? observation.statusCode : null;

  const haystack = `${errorCode}\n${message}\n${name}`;

  // Status-code-first: anti-bot 403 wins over a generic browser error
  if (statusCode !== null) {
    const statusHit = CLASSIFICATION_RULES.find(
      (r) => r.statusCodes.includes(statusCode),
    );
    if (statusHit) return statusHit.class;
  }

  // Pattern matchers — order matters (most specific first)
  for (const rule of CLASSIFICATION_RULES) {
    const codeHit = rule.errorCodeMatchers.some((rx) => rx.test(haystack));
    const msgHit = rule.messageMatchers.some((rx) => rx.test(haystack));
    if (codeHit || msgHit) return rule.class;
  }

  return FailureClass.UNKNOWN;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate cause generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CandidateCause
 * @property {string} id
 * @property {string} failureClass
 * @property {string} label
 * @property {string} description
 * @property {number} prior - base plausibility 0..1
 */

/**
 * Generate plausible candidate causes for a failure class.
 *
 * @param {string} failureClass
 * @param {Object} [observation]
 * @returns {CandidateCause[]}
 */
export function generateCandidateCauses(failureClass, observation = {}) {
  switch (failureClass) {
    case FailureClass.MISSING_EXECUTABLE:
      return [
        {
          id: "MISSING_EXECUTABLE",
          failureClass,
          label: "Browser executable not installed",
          description:
            "Playwright/Puppeteer binary is missing from the host (e.g. Chromium not downloaded).",
          prior: 0.9,
        },
        {
          id: "WRONG_EXECUTABLE_PATH",
          failureClass,
          label: "Browser executable path misconfigured",
          description: "The configured executablePath points to a non-existent binary.",
          prior: 0.2,
        },
      ];

    case FailureClass.BROWSER_RUNTIME:
      return [
        {
          id: "LAUNCH_FAILED",
          failureClass,
          label: "Browser launch failed",
          description: "Browser process failed to start (missing deps, sandboxing, etc.).",
          prior: 0.7,
        },
        {
          id: "PAGE_CRASH",
          failureClass,
          label: "Page crashed during operation",
          description: "The page or tab crashed mid-operation (OOM, renderer kill).",
          prior: 0.3,
        },
        {
          id: "NAVIGATION_TIMEOUT",
          failureClass,
          label: "Navigation timeout",
          description: "Page took too long to load (network or heavy SPA).",
          prior: 0.3,
        },
      ];

    case FailureClass.ANTI_BOT:
      return [
        {
          id: "WAF_BLOCK",
          failureClass,
          label: "WAF / Cloudflare block",
          description: "Edge WAF detected the request fingerprint and blocked it (403/captcha).",
          prior: 0.7,
        },
        {
          id: "GEO_BLOCK",
          failureClass,
          label: "Geo / IP block",
          description: "The site is restricting access based on IP geography.",
          prior: 0.2,
        },
      ];

    case FailureClass.NETWORK_ERROR:
      return [
        {
          id: "DNS_FAILURE",
          failureClass,
          label: "DNS resolution failure",
          description: "Hostname could not be resolved.",
          prior: 0.4,
        },
        {
          id: "CONNECTION_REFUSED",
          failureClass,
          label: "Connection refused by remote",
          description: "TCP connection actively refused (service down or filtered).",
          prior: 0.4,
        },
        {
          id: "TLS_ERROR",
          failureClass,
          label: "TLS / certificate error",
          description: "TLS handshake or certificate validation failed.",
          prior: 0.2,
        },
      ];

    case FailureClass.AUTH:
      return [
        {
          id: "INVALID_CREDENTIALS",
          failureClass,
          label: "Invalid credentials",
          description: "Provided credentials/token are rejected by the server.",
          prior: 0.8,
        },
        {
          id: "EXPIRED_TOKEN",
          failureClass,
          label: "Expired token",
          description: "Authentication token has expired and needs refresh.",
          prior: 0.4,
        },
      ];

    case FailureClass.RATE_LIMIT:
      return [
        {
          id: "REQUESTS_THROTTLED",
          failureClass,
          label: "Requests throttled",
          description: "Server is throttling requests; backoff is required.",
          prior: 0.9,
        },
      ];

    case FailureClass.CONFIGURATION:
      return [
        {
          id: "BAD_CONFIG",
          failureClass,
          label: "Invalid configuration value",
          description: "One or more required configuration values are invalid.",
          prior: 0.9,
        },
      ];

    case FailureClass.UNKNOWN:
    default:
      return [
        {
          id: "UNCLASSIFIED",
          failureClass,
          label: "Unclassified failure",
          description: "Failure does not match any known pattern; further investigation needed.",
          prior: 1.0,
        },
      ];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminating experiment derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Experiment
 * @property {string} kind        - "shell" | "http" | "browser-probe" | "fs-probe"
 * @property {string} candidateId
 * @property {string} command     - shell command / HTTP URL / probe path
 * @property {Object} expectedObservation - shape passed to assessCause
 * @property {string} description
 */

/**
 * Derive the MINIMAL experiment that would discriminate a candidate cause.
 * Experiments are deliberately side-effect-free probes.
 *
 * @param {CandidateCause} candidate
 * @returns {Experiment}
 */
export function deriveDiscriminatingExperiment(candidate) {
  switch (candidate.id) {
    case "MISSING_EXECUTABLE":
      return {
        kind: "shell",
        candidateId: candidate.id,
        command: "command -v chromium || command -v google-chrome || npx playwright --version",
        expectedObservation: {
          errorCode: "PRESENT",
          message: "browser executable resolvable",
          statusCode: 200,
        },
        description: "Verify a browser executable is reachable on PATH or installed via Playwright.",
      };

    case "WRONG_EXECUTABLE_PATH":
      return {
        kind: "fs-probe",
        candidateId: candidate.id,
        command: "stat -c '%F' ${EXECUTABLE_PATH:-/nonexistent}",
        expectedObservation: { errorCode: "ENOENT", message: "No such file" },
        description: "Stat the configured executablePath; expect ENOENT if misconfigured.",
      };

    case "LAUNCH_FAILED":
      return {
        kind: "shell",
        candidateId: candidate.id,
        command: "node -e \"require('playwright').chromium.launch().then(b=>b.close())\"",
        expectedObservation: { errorCode: "OK", message: "launch succeeded" },
        description: "Attempt a minimal headless launch to isolate the failure.",
      };

    case "PAGE_CRASH":
      return {
        kind: "browser-probe",
        candidateId: candidate.id,
        command: "goto about:blank",
        expectedObservation: { errorCode: "OK", message: "about:blank loaded" },
        description: "Load a trivial page; if it crashes here, browser itself is unstable.",
      };

    case "NAVIGATION_TIMEOUT":
      return {
        kind: "http",
        candidateId: candidate.id,
        command: "GET /",
        expectedObservation: { statusCode: 200, message: "ok" },
        description: "Hit the target URL via plain HTTP to confirm reachability independent of JS.",
      };

    case "WAF_BLOCK":
    case "GEO_BLOCK":
      return {
        kind: "http",
        candidateId: candidate.id,
        command: "GET / -H 'User-Agent: curl/8.0'",
        expectedObservation: { statusCode: 200, message: "ok" },
        description:
          "Probe with a neutral UA; if 200, the prior block was fingerprint-based.",
      };

    case "DNS_FAILURE":
      return {
        kind: "shell",
        candidateId: candidate.id,
        command: "getent hosts example.com",
        expectedObservation: { errorCode: "OK", message: "host resolves" },
        description: "Resolve DNS for the target hostname.",
      };

    case "CONNECTION_REFUSED":
      return {
        kind: "shell",
        candidateId: candidate.id,
        command: "nc -zv -w 2 example.com 443",
        expectedObservation: { errorCode: "OK", message: "open" },
        description: "TCP probe to verify the port is open from this host.",
      };

    case "TLS_ERROR":
      return {
        kind: "shell",
        candidateId: candidate.id,
        command: "openssl s_client -connect example.com:443 -servername example.com </dev/null",
        expectedObservation: { errorCode: "OK", message: "verify return:1" },
        description: "TLS handshake probe with certificate verification.",
      };

    case "INVALID_CREDENTIALS":
    case "EXPIRED_TOKEN":
      return {
        kind: "http",
        candidateId: candidate.id,
        command: "GET /api/me -H 'Authorization: Bearer ${TOKEN}'",
        expectedObservation: { statusCode: 200, message: "ok" },
        description: "Hit a known authenticated endpoint to validate the token.",
      };

    case "REQUESTS_THROTTLED":
      return {
        kind: "shell",
        candidateId: candidate.id,
        command: "sleep 30 && curl -sS -o /dev/null -w '%{http_code}' https://example.com/",
        expectedObservation: { statusCode: 200, message: "ok" },
        description: "Wait 30s and retry once; if it succeeds, throttling was the cause.",
      };

    case "BAD_CONFIG":
      return {
        kind: "fs-probe",
        candidateId: candidate.id,
        command: "cat ${CONFIG_PATH}",
        expectedObservation: { errorCode: "OK", message: "config loaded" },
        description: "Read and validate the configuration file.",
      };

    case "UNCLASSIFIED":
    default:
      return {
        kind: "shell",
        candidateId: candidate.id,
        command: "echo 'no discriminating experiment defined'",
        expectedObservation: { errorCode: "OK", message: "noop" },
        description: "No targeted experiment available; manual investigation required.",
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cause assessment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assess whether an observed experiment result supports, contradicts, or is
 * inconclusive with respect to a candidate cause.
 *
 * Decision logic:
 *   - If observation is missing/null                  → INCONCLUSIVE
 *   - If observation.errorCode / statusCode matches
 *     experiment.expectedObservation                 → SUPPORTED
 *   - If observation is the OPPOSITE of expected      → CONTRADICTED
 *   - Otherwise                                        → INCONCLUSIVE
 *
 * @param {CandidateCause} candidate
 * @param {Experiment} experiment
 * @param {Object|null} observationResult
 * @returns {{result: string, reason: string}}
 */
export function assessCause(candidate, experiment, observationResult) {
  if (observationResult === null || observationResult === undefined) {
    return {
      result: AssessmentResult.INCONCLUSIVE,
      reason: "no observation collected yet",
    };
  }

  const expected = experiment?.expectedObservation ?? {};
  const observed = observationResult ?? {};

  // Build two flat haystacks — one from expected, one from observed — and ask
  // whether they overlap. We deliberately keep this lightweight: a real system
  // would call createAssessment on the full object.
  const expSignals = collectSignals(expected);
  const obsSignals = collectSignals(observed);

  const overlap = expSignals.filter((s) => obsSignals.includes(s));
  const inverse = expSignals
    .map((s) => inverseSignal(s))
    .filter((s) => obsSignals.includes(s));

  if (overlap.length > 0) {
    return {
      result: AssessmentResult.SUPPORTED,
      reason: `observation matches expected signal(s): ${overlap.join(", ")}`,
    };
  }

  if (inverse.length > 0) {
    return {
      result: AssessmentResult.CONTRADICTED,
      reason: `observation contradicts expected signal(s): ${inverse.join(", ")}`,
    };
  }

  return {
    result: AssessmentResult.INCONCLUSIVE,
    reason: "observation has no overlapping or inverse signal with expectation",
  };
}

function collectSignals(obj) {
  const out = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === undefined || v === null) continue;
    out.push(`${k}:${String(v)}`);
  }
  return out;
}

function inverseSignal(signal) {
  const [k, v] = signal.split(":");
  if (k === "errorCode" && v === "ENOENT") return "errorCode:PRESENT";
  if (k === "errorCode" && v === "PRESENT") return "errorCode:ENOENT";
  if (k === "statusCode") {
    if (v === "200") return "statusCode:403";
    if (v === "403") return "statusCode:200";
    if (v === "401") return "statusCode:200";
  }
  return `__inverse_unknown__:${signal}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DiagnosisResult
 * @property {string} failureClass
 * @property {CandidateCause[]} candidates
 * @property {Experiment|null} recommendedExperiment
 * @property {string} summary
 */

/**
 * Run one iteration of the diagnostic causal loop.
 *
 * @param {Object} args
 * @param {Object} args.observation                - raw failure observation
 * @param {Object} [args.previousDiagnosis]        - prior diagnosis to reuse / refine
 * @returns {DiagnosisResult}
 */
export function diagnose({ observation, previousDiagnosis = null } = {}) {
  const failureClass = classifyObservation(observation);
  const candidates = generateCandidateCauses(failureClass, observation);

  // Re-rank candidates: prefer the most specific prior if available.
  const ranked = rankCandidates(candidates, previousDiagnosis);

  const recommendedExperiment = ranked.length > 0
    ? deriveDiscriminatingExperiment(ranked[0])
    : null;

  const summary =
    `failure=${failureClass} candidates=${ranked.length} top=${ranked[0]?.id ?? "none"}`;

  return {
    failureClass,
    candidates: ranked,
    recommendedExperiment,
    summary,
  };
}

function rankCandidates(candidates, previousDiagnosis) {
  if (!previousDiagnosis || !Array.isArray(previousDiagnosis.candidates)) {
    return [...candidates].sort((a, b) => b.prior - a.prior);
  }

  const priorById = new Map(
    previousDiagnosis.candidates.map((c) => [c.id, c.prior ?? 0]),
  );

  return [...candidates]
    .map((c) => ({
      ...c,
      prior: priorById.has(c.id)
        ? (c.prior ?? 0) + (priorById.get(c.id) ?? 0)
        : c.prior ?? 0,
    }))
    .sort((a, b) => b.prior - a.prior);
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience export: anti-bot heuristic guard (used by golden test)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine whether anti-bot / stealth measures are SUPPORTED for a given
 * diagnosis. The rule: ANTI_BOT is only supported when at least one candidate
 * has the WAF_BLOCK / GEO_BLOCK class AND the failure class itself is ANTI_BOT.
 *
 * If the failure class is BROWSER_RUNTIME / MISSING_EXECUTABLE, anti-bot is
 * explicitly NOT supported (the agent must NOT assume stealth).
 *
 * @param {DiagnosisResult} diagnosis
 * @returns {"SUPPORTED" | "NOT_SUPPORTED" | "INCONCLUSIVE"}
 */
export function antiBotSupport(diagnosis) {
  if (!diagnosis || typeof diagnosis !== "object") return "INCONCLUSIVE";

  if (diagnosis.failureClass === FailureClass.ANTI_BOT) {
    return "SUPPORTED";
  }

  // If the actual evidence is browser-runtime (e.g. missing executable), the
  // agent must NOT auto-assume stealth/anti-bot measures are needed.
  if (
    diagnosis.failureClass === FailureClass.BROWSER_RUNTIME ||
    diagnosis.failureClass === FailureClass.MISSING_EXECUTABLE
  ) {
    return "NOT_SUPPORTED";
  }

  return "INCONCLUSIVE";
}
