export const EXECUTION_STATUS = Object.freeze({
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
});

export const OUTCOME_STATUS = Object.freeze({
  SATISFIED: "SATISFIED",
  NOT_SATISFIED: "NOT_SATISFIED",
  UNKNOWN: "UNKNOWN",
});

const RUNTIME_ERROR_PATTERNS = [
  /\bchromium\b.*\b(missing|not\s+found|not\s+installed|executable\s+missing)/i,
  /BROWSER_(EXECUTABLE_MISSING|NOT_FOUND|MISSING)/,
  /\b(failed|error|cannot|not\s+found|null|undefined)\b/i,
  /\bENOENT\b/,
  /\bexecutable\s+file\s+not\s+found/i,
];

function detectRuntimeError(actual, unexpected, output) {
  if (actual?.status === "failure" || actual?.status === "error") return true;
  const text = JSON.stringify({ actual, unexpected, output });
  return RUNTIME_ERROR_PATTERNS.some((re) => re.test(text));
}

export function classifyToolResult({ result, actual, unexpected, output, expected } = {}) {
  const hasOutput = result !== undefined && result !== null;
  const outputError = String(output?.error || "").toLowerCase();
  const executionFailed =
    outputError.length > 0 ||
    (result === undefined && !hasOutput);

  const execution = executionFailed ? EXECUTION_STATUS.FAILED : EXECUTION_STATUS.SUCCEEDED;

  const expectedIsSuccess = expected?.expected?.status === "success" && (expected?.expected?.exitCode === undefined || expected?.expected?.exitCode === 0);
  const actualSignalsSuccess =
    actual?.status === "success" ||
    (typeof result === "string" && !unexpected?.error);
  const actualSignalsFailure = detectRuntimeError(actual, unexpected, output);

  let outcome;
  if (!expectedIsSuccess) {
    outcome = OUTCOME_STATUS.UNKNOWN;
  } else if (actualSignalsFailure) {
    outcome = OUTCOME_STATUS.NOT_SATISFIED;
  } else if (actualSignalsSuccess) {
    outcome = OUTCOME_STATUS.SATISFIED;
  } else {
    outcome = OUTCOME_STATUS.UNKNOWN;
  }

  return { execution, outcome };
}

export function isSatisfied(result) {
  return result?.outcome === OUTCOME_STATUS.SATISFIED;
}

export function isRuntimeFailure(result) {
  return result?.execution === EXECUTION_STATUS.FAILED &&
    result?.outcome === OUTCOME_STATUS.NOT_SATISFIED;
}
