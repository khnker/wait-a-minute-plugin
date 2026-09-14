/**
 * Context Sufficiency Contract — task-derived conditions for safe execution.
 *
 * Replaces lexical keyword matching with structured conditions that
 * must be satisfied before autonomous execution is permitted.
 *
 * States: SATISFIED | MISSING | BLOCKED | UNKNOWN
 */

/**
 * @typedef {"SATISFIED" | "MISSING" | "BLOCKED" | "UNKNOWN"} ConditionStatus
 */

/**
 * @typedef {Object} SufficiencyCondition
 * @property {string} id
 * @property {string} type - Type of required knowledge
 * @property {string} description
 * @property {ConditionStatus} status
 * @property {string} source - What satisfied or blocked this condition
 * @property {"MANDATORY" | "CONDITIONAL"} severity
 */

/**
 * @typedef {Object} SufficiencyContract
 * @property {string} taskId
 * @property {SufficiencyCondition[]} conditions
 * @property {boolean} sufficient - True only when all MANDATORY conditions are SATISFIED
 * @property {string[]} missing - List of missing MANDATORY condition descriptions
 */

/** Condition types derived from task analysis */
const CONDITION_TYPES = {
  PROJECT_KNOWLEDGE: "project-knowledge",
  DECISION: "decision",
  CONSTRAINT: "constraint",
  DEPENDENCY: "dependency",
  VERIFICATION: "verification",
  UNKNOWN_RESOLUTION: "unknown-resolution",
};

/**
 * Patterns that indicate required context domains.
 * Each pattern maps to one or more condition types.
 */
const DOMAIN_PATTERNS = [
  {
    domain: "auth",
    patterns: /\b(auth|oauth|jwt|token|login|credential|password|session)\b/i,
    conditions: [
      { type: CONDITION_TYPES.DECISION, description: "Auth mechanism decision (OAuth, JWT, etc.)" },
      { type: CONDITION_TYPES.PROJECT_KNOWLEDGE, description: "Existing auth implementation" },
    ],
  },
  {
    domain: "migration",
    patterns: /\b(migrat|schema.*change|database.*change|column.*add|table.*rename)\b/i,
    conditions: [
      { type: CONDITION_TYPES.DECISION, description: "Migration strategy (forward, backward-compatible)" },
      { type: CONDITION_TYPES.CONSTRAINT, description: "Data integrity constraints" },
      { type: CONDITION_TYPES.DEPENDENCY, description: "Migration tool version" },
    ],
  },
  {
    domain: "security",
    patterns: /\b(security|vulnerability|cve|encrypt|hash|sanitiz|xss|csrf|injection)\b/i,
    conditions: [
      { type: CONDITION_TYPES.DECISION, description: "Security approach decision" },
      { type: CONDITION_TYPES.CONSTRAINT, description: "Security constraints and compliance requirements" },
    ],
  },
  {
    domain: "testing",
    patterns: /\b(test|spec|coverage|e2e|unit|integration)\b/i,
    conditions: [
      { type: CONDITION_TYPES.PROJECT_KNOWLEDGE, description: "Test framework and patterns" },
      { type: CONDITION_TYPES.VERIFICATION, description: "Verification criteria" },
    ],
  },
  {
    domain: "architecture",
    patterns: /\b(architect|refactor|restructur|monolith|microservice|modul)\b/i,
    conditions: [
      { type: CONDITION_TYPES.DECISION, description: "Architecture decision" },
      { type: CONDITION_TYPES.CONSTRAINT, description: "Architectural constraints" },
      { type: CONDITION_TYPES.PROJECT_KNOWLEDGE, description: "Current architecture state" },
    ],
  },
  {
    domain: "performance",
    patterns: /\b(performance|optim|cache|redis|latency|throughput|bottleneck)\b/i,
    conditions: [
      { type: CONDITION_TYPES.DECISION, description: "Performance optimization strategy" },
      { type: CONDITION_TYPES.PROJECT_KNOWLEDGE, description: "Current performance baseline" },
    ],
  },
  {
    domain: "scraping",
    patterns: /\b(scrap|crawl|puppeteer|playwright|selenium|parser)\b/i,
    conditions: [
      { type: CONDITION_TYPES.PROJECT_KNOWLEDGE, description: "Scraping framework and patterns" },
      { type: CONDITION_TYPES.DEPENDENCY, description: "Browser automation dependency" },
    ],
  },
];

/**
 * Generate a sufficiency contract from a task description.
 *
 * @param {string} taskDescription
 * @param {string} taskId
 * @returns {SufficiencyContract}
 */
export function generateContract(taskDescription, taskId) {
  const conditions = [];
  const seen = new Set();

  for (const domain of DOMAIN_PATTERNS) {
    if (domain.patterns.test(taskDescription)) {
      for (const cond of domain.conditions) {
        const key = `${cond.type}:${cond.description}`;
        if (!seen.has(key)) {
          seen.add(key);
          conditions.push({
            id: `SC-${conditions.length + 1}`,
            type: cond.type,
            description: cond.description,
            status: "MISSING",
            source: "",
            severity: "MANDATORY",
          });
        }
      }
    }
  }

  // Always require project knowledge as a baseline
  const projectKnowledgeKey = `${CONDITION_TYPES.PROJECT_KNOWLEDGE}:Project structure and dependencies`;
  if (!seen.has(projectKnowledgeKey)) {
    seen.add(projectKnowledgeKey);
    conditions.push({
      id: `SC-${conditions.length + 1}`,
      type: CONDITION_TYPES.PROJECT_KNOWLEDGE,
      description: "Project structure and dependencies",
      status: "MISSING",
      source: "",
      severity: "MANDATORY",
    });
  }

  const missing = conditions
    .filter((c) => c.status === "MISSING" && c.severity === "MANDATORY")
    .map((c) => c.description);

  return {
    taskId,
    conditions,
    sufficient: missing.length === 0,
    missing,
  };
}

/**
 * Evaluate a sufficiency contract against available context capsules.
 *
 * @param {SufficiencyContract} contract
 * @param {Array} capsules - Selected context capsules
 * @returns {SufficiencyContract} Updated contract with statuses
 */
export function evaluateContract(contract, capsules) {
  const capsuleText = capsules
    .map((c) => `${c.purpose || ""} ${c.scope || ""} ${c.content || ""}`)
    .join(" ")
    .toLowerCase();

  for (const condition of contract.conditions) {
    // Check if any capsule covers this condition
    const covered = capsules.some((c) => {
      const text = `${c.purpose || ""} ${c.scope || ""} ${c.content || ""}`.toLowerCase();
      return conditionMatchesText(condition, text);
    });

    if (covered) {
      condition.status = "SATISFIED";
      condition.source = "capsule";
    }
  }

  // Recalculate sufficiency
  contract.missing = contract.conditions
    .filter((c) => c.status === "MISSING" && c.severity === "MANDATORY")
    .map((c) => c.description);
  contract.sufficient = contract.missing.length === 0;

  return contract;
}

/**
 * Check if a condition is covered by text content.
 */
function conditionMatchesText(condition, text) {
  // Type-specific matching
  switch (condition.type) {
    case CONDITION_TYPES.PROJECT_KNOWLEDGE:
      return /\b(project|package\.json|dependenc|structure|architect)\b/i.test(text);
    case CONDITION_TYPES.DECISION:
      return /\b(decision|decid|chose|selected|approach|strategy)\b/i.test(text);
    case CONDITION_TYPES.CONSTRAINT:
      return /\b(constraint|requirement|must|shall|mandatory|compliance)\b/i.test(text);
    case CONDITION_TYPES.DEPENDENCY:
      return /\b(dependency|version|package|library|framework)\b/i.test(text);
    case CONDITION_TYPES.VERIFICATION:
      return /\b(verification|verify|test|pass|evidence|criteria)\b/i.test(text);
    case CONDITION_TYPES.UNKNOWN_RESOLUTION:
      return /\b(answer|resolved|clarified|confirmed)\b/i.test(text);
    default:
      return false;
  }
}

/**
 * Merge a sufficiency contract with assumptions from the analysis.
 * Assumptions with DECISION_CRITICAL classification become MANDATORY conditions.
 *
 * @param {SufficiencyContract} contract
 * @param {Array} assumptions - From analysis.assumptions
 * @returns {SufficiencyContract}
 */
export function mergeAssumptions(contract, assumptions) {
  for (const assumption of assumptions || []) {
    if (assumption.classification === "DECISION_CRITICAL" && assumption.status === "active") {
      const key = `${CONDITION_TYPES.UNKNOWN_RESOLUTION}:${assumption.statement}`;
      const exists = contract.conditions.some(
        (c) => c.type === CONDITION_TYPES.UNKNOWN_RESOLUTION && c.description === assumption.statement
      );
      if (!exists) {
        contract.conditions.push({
          id: `SC-${contract.conditions.length + 1}`,
          type: CONDITION_TYPES.UNKNOWN_RESOLUTION,
          description: assumption.statement,
          status: "BLOCKED",
          source: `assumption ${assumption.id}`,
          severity: "MANDATORY",
        });
      }
    }
  }

  // Recalculate
  contract.missing = contract.conditions
    .filter((c) => (c.status === "MISSING" || c.status === "BLOCKED") && c.severity === "MANDATORY")
    .map((c) => c.description);
  contract.sufficient = contract.missing.length === 0;

  return contract;
}

export { CONDITION_TYPES };
