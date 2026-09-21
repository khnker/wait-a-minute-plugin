/**
 * Secret Scanner — regex-based detection of common secret patterns.
 *
 * Detects: AWS keys, GitHub tokens, generic API keys, JWTs, private
 * keys, Slack tokens. Returns findings with line numbers. Production
 * hardening (M5-56).
 */

/**
 * @typedef {Object} Finding
 * @property {string} type
 * @property {number} line
 * @property {number} column
 * @property {string} match
 * @property {string} severity
 */

/**
 * @typedef {Object} ScanResult
 * @property {Finding[]} findings
 * @property {boolean} clean
 * @property {number} count
 */

/** @type {Array<{type: string, severity: string, regex: RegExp}>} */
const PATTERNS = [
  { type: "aws_access_key", severity: "high", regex: /AKIA[0-9A-Z]{16}/g },
  { type: "github_token", severity: "high", regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { type: "slack_token", severity: "high", regex: /xox[abprs]-[A-Za-z0-9-]{10,}/g },
  { type: "private_key", severity: "high", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { type: "jwt", severity: "medium", regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { type: "generic_api_key", severity: "medium", regex: /(?:api[_-]?key|apikey|secret)\s*[:=]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/gi },
  { type: "stripe_key", severity: "high", regex: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g },
];

/**
 * Scan text for secret patterns.
 * @param {string} text
 * @returns {ScanResult}
 */
export function scanSecrets(text) {
  if (typeof text !== "string") {
    throw new TypeError("text must be string");
  }
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const p of PATTERNS) {
      p.regex.lastIndex = 0;
      let m;
      while ((m = p.regex.exec(line)) !== null) {
        findings.push({
          type: p.type,
          severity: p.severity,
          line: i + 1,
          column: m.index + 1,
          match: m[0],
        });
      }
    }
  }
  return {
    findings,
    clean: findings.length === 0,
    count: findings.length,
  };
}
